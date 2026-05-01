# CampusRadius

CampusRadius is a privacy-first, opt-in nearby people app.

This repository now contains:

- Web app in the root folder (React + Vite)
- Mobile app in `mobile` (React Native + Expo)
- Backend API in `backend` (Node.js + Express + MongoDB)

## Privacy Rules Implemented

- User visibility is opt-in with `isVisible` toggle
- No background tracking (location updates only while app is open)
- No location history (single latest location per user)
- Auto-hide inactive users by filtering `lastActive` older than 5 minutes
- No duplicate profiles: backend enforces case-insensitive unique usernames
- Web map view uses Google Maps Embed API when `VITE_GOOGLE_MAPS_API_KEY` is set
- Web and mobile chat use OpenRouter free models through the backend `/chat` proxy

## 1. Web Setup (Vite)

### Web Files

- `src/App.tsx`
- `src/services/api.ts`
- `src/types.ts`
- `src/index.css`

### Run web locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example` and set backend URL:

   ```env
   VITE_API_BASE_URL=http://localhost:5000
   ```

3. Start web app:

   ```bash
   npm run dev:web
   ```

## 2. Backend Setup (Express + MongoDB Atlas)

### Backend Files

- `backend/server.js`
- `backend/models/User.js`
- `backend/.env.example`

### Run locally

1. Go to backend folder:

   ```bash
   cd backend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env` from `.env.example` and set your Atlas URI:

   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_atlas_uri
   ```

4. Start backend:

   ```bash
   npm run dev
   ```

5. Verify health endpoint:

   ```http
   GET http://localhost:5000/health
   ```

### API Endpoints

- `POST /update-location`

  Body:

  ```json
  {
    "username": "alex",
    "bio": "CS student",
    "latitude": 17.385,
    "longitude": 78.4867,
    "radius": 100,
    "isVisible": true
  }
  ```

- `POST /nearby`

  Body:

  ```json
  {
    "username": "alex",
    "latitude": 17.385,
    "longitude": 78.4867,
    "radius": 100
  }
  ```

## 3. Mobile Setup (Expo)

### Mobile Files

- `mobile/App.js`
- `mobile/src/services/api.js`
- `mobile/app.json`
- `mobile/eas.json`

### Run locally with Expo Go

1. Go to mobile folder:

   ```bash
   cd mobile
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure API base URL to your backend machine IP:

   Create `.env` in `mobile`:

   ```env
   EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:5000
   ```

   For chat replies, set `OPENROUTER_API_KEY` in `backend/.env` and optionally choose `OPENROUTER_MODEL`.

   Both phone and backend must be on the same network.

4. Start app:

   ```bash
   npm start
   ```

5. Open in Expo Go by scanning the QR code.

## 4. Build APK (EAS)

From `mobile` folder:

1. Install EAS CLI:

   ```bash
   npm install -g eas-cli
   ```

2. Login:

   ```bash
   eas login
   ```

3. Configure project (if prompted):

   ```bash
   eas build:configure
   ```

4. Build APK:

   ```bash
   eas build -p android --profile preview
   ```

5. Download APK from the generated EAS link and share with users.

## 5. Deploy on Google Cloud Run (Backend + Web)

### Prerequisites

1. Install Google Cloud CLI.
2. Run `gcloud auth login`.
3. Set project:

   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

4. Enable APIs:

   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```

### Backend deployment (Cloud Run)

Deploy from `backend` using Dockerfile:

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/campusradius-backend ./backend
gcloud run deploy campusradius-backend \
  --image gcr.io/YOUR_PROJECT_ID/campusradius-backend \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars MONGODB_URI="YOUR_MONGODB_URI"
```

### Web deployment (Cloud Run)

Build and deploy from root using `Dockerfile.web`:

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/campusradius-web -f Dockerfile.web .
gcloud run deploy campusradius-web \
  --image gcr.io/YOUR_PROJECT_ID/campusradius-web \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated
```

Before deploying web for production, set root `.env` with backend URL:

```env
VITE_API_BASE_URL=https://campusradius-backend-xxxxx.a.run.app
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_embed_api_key
```

Rebuild and redeploy web after updating this value.

### Mobile production URL

In `mobile/.env`, set:

```env
EXPO_PUBLIC_API_BASE_URL=https://campusradius-backend-xxxxx.a.run.app
```

### Backend environment

In `backend/.env`, set:

```env
MONGODB_URI=your_mongodb_atlas_uri
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openrouter/free
```

## 6. MongoDB Atlas Notes

1. Create free cluster.
2. Add database user.
3. Add network access (for quick testing, allow `0.0.0.0/0`; tighten later).
4. Use connection string in backend `.env`.

## 7. Test Checklist

- Permission screen appears on first launch
- Profile setup saves username and bio
- Main screen supports visible/invisible toggle
- Radius slider works from 10m to 500m
- Refresh button and pull-to-refresh both work
- Nearby list shows username, bio, distance
- Empty state shows `No users nearby`
- Inactive users disappear after 5 minutes

## 8. Helpful Scripts

Web:

```bash
npm run dev:web
npm run build:web
npm run preview:web
```

Backend:

```bash
cd backend
npm run dev
```
