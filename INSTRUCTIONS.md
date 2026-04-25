# CampusRadius Build Instructions

This project is a full-stack nearby social application. This preview environment runs the **Responsive Web Version** using React + Vite + Express + MongoDB.

## 1. Local Development (React Native / Expo)

To run the mobile version of CampusRadius on your phone:

1. **Extract Code:** Download the project files.
2. **Setup Frontend:**
   - Install Expo CLI: `npm install -g expo-cli`
   - Create a new expo project or use the existing `App.tsx` logic.
   - Install dependencies: `expo install expo-location axios lucide-react motion`
3. **Configure API:**
   - In `api.ts`, change `baseURL` to your local IP (e.g., `http://192.168.1.10:3000/api`).
4. **Run:** `npx expo start` and scan the QR code with Expo Go.

## 2. Backend Setup (MongoDB Atlas)

The backend is already configured to use MongoDB Atlas.

1. Create a free cluster at [mongodb.com](https://www.mongodb.com/cloud/atlas).
2. Get your **Connection String**.
3. In this environment: Add it to the **Secrets** panel as `MONGODB_URI`.
4. Locally: Add it to your `.env` file.

### Troubleshooting: "Could not connect to any servers" / IP Whitelist Error
If you see a `MongooseServerSelectionError` in the logs:
1. Log in to your **MongoDB Atlas Dashboard**.
2. Go to **Network Access** (under Security in the sidebar).
3. Click **Add IP Address**.
4. Select **Allow Access From Anywhere** (which adds `0.0.0.0/0`) or find your current IP.
5. Click **Confirm**. 
6. Wait 1-2 minutes for the changes to deploy, then the app will automatically switch from "Preview Mode" to "Cloud Mode".

## 3. APK Generation

1. Install EAS CLI: `npm install -g eas-cli`
2. Login: `eas login`
3. Configure project: `eas build:configure`
4. Build for Android: `eas build -p android --profile preview` (select APK).
5. Download the resulting `.apk` from the Expo dashboard.

## 4. Privacy Features implemented
- **Opt-in Only:** Users must toggle "Visible" to be seen.
- **Ephemeral:** Users are automatically hidden if inactive for >5 minutes.
- **Radius-Limited:** Queries strictly respect the user's chosen radius.
- **No History:** Location history is never stored; only the current buffer.
