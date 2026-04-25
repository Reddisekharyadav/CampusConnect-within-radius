import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "socket.io";
import http from "http";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  }
});

const PORT = 3000;

app.use(cors());
app.use(express.json());

// MongoDB Setup
const MONGODB_URI = process.env.MONGODB_URI;
const isPlaceholder = MONGODB_URI?.includes("<username>");

if (!MONGODB_URI || isPlaceholder) {
  console.log("------------------------------------------------------------------");
  console.log("🚀 STATUS: CampusRadius is running in PREVIEW MODE (In-Memory).");
  console.log("📝 NOTE: Data will not persist across restarts.");
  console.log("💡 TIP: To use Cloud Persistence, update MONGODB_URI in secrets.");
  console.log("------------------------------------------------------------------");
} else {
  // Add serverSelectionTimeoutMS to fail faster if IP is not whitelisted
  mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 3000, 
  })
    .then(() => console.log("✅ CONNECTED: MongoDB Atlas Cloud Storage active."))
    .catch(err => {
      console.log("------------------------------------------------------------------");
      console.log("⚠️  NOTICE: Could not connect to your MongoDB Atlas cluster.");
      console.log(`❌ ERROR: ${err.message}`);
      console.log("\n🛠️  FIX: Most likely yours or this app's IP is not whitelisted.");
      console.log("👉 Go to Atlas Console > Network Access > Whitelist 0.0.0.0/0");
      console.log("\n⏩ CONTINUING: App is now in SAFE PREVIEW MODE (In-Memory).");
      console.log("------------------------------------------------------------------");
    });
}

// User Schema
interface IUser extends mongoose.Document {
  username: string;
  bio: string;
  socialLinks: {
    instagram?: string;
    linkedin?: string;
    github?: string;
    facebook?: string;
    twitter?: string;
    phone?: string;
  };
  isVisible: boolean;
  radius: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
  lastActive: Date;
}

const userSchema = new mongoose.Schema<IUser>({
  username: { type: String, required: true, unique: true },
  bio: String,
  socialLinks: {
    instagram: String,
    linkedin: String,
    github: String,
    facebook: String,
    twitter: String,
    phone: String
  },
  isVisible: { type: Boolean, default: true },
  radius: { type: Number, default: 100 },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  lastActive: { type: Date, default: Date.now }
});

userSchema.index({ location: '2dsphere' });

const UserModel = mongoose.models.User || mongoose.model<IUser>("User", userSchema);

// Message Schema
interface IMessage extends mongoose.Document {
  from: string;
  to: string;
  text: string;
  timestamp: Date;
}

const messageSchema = new mongoose.Schema<IMessage>({
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const MessageModel = mongoose.models.Message || mongoose.model<IMessage>("Message", messageSchema);

// In-memory fallback
let inMemoryUsers: any[] = [];
let inMemoryMessages: any[] = [];

// Helper for distance calc
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // meters
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Real-time tracking
const connectedUsers = new Map<string, { 
  username: string, 
  lat: number, 
  lng: number, 
  radius: number, 
  isVisible: boolean 
}>();

const notifyNearby = (updatedUser: any) => {
  connectedUsers.forEach((data, socketId) => {
    // Don't notify the user who just updated (client handles local state)
    if (data.username === updatedUser.username) return;

    const dist = getDistance(
      data.lat, data.lng, 
      updatedUser.location.coordinates[1], updatedUser.location.coordinates[0]
    );

    // If the updated user is within the observer's radius
    if (dist <= data.radius) {
      io.to(socketId).emit("nearby_change", {
        type: "update",
        user: {
          username: updatedUser.username,
          bio: updatedUser.bio,
          isVisible: updatedUser.isVisible,
          distance: Math.round(dist)
        }
      });
    }
  });
};

// API Endpoints
app.post("/api/update-location", async (req, res) => {
  const { username, bio, socialLinks, latitude, longitude, radius, isVisible } = req.body;

  try {
    const userData = {
      username,
      bio,
      socialLinks,
      isVisible,
      radius,
      location: {
        type: "Point" as const,
        coordinates: [longitude, latitude]
      },
      lastActive: new Date()
    };

    let updatedDoc;
    const isMongoConnected = mongoose.connection.readyState === 1;

    if (MONGODB_URI && isMongoConnected) {
      updatedDoc = await UserModel.findOneAndUpdate(
        { username },
        userData,
        { upsert: true, new: true }
      );
    } else {
      const existingIdx = inMemoryUsers.findIndex(u => u.username === username);
      if (existingIdx >= 0) {
        inMemoryUsers[existingIdx] = userData;
      } else {
        inMemoryUsers.push(userData);
      }
      updatedDoc = userData;
    }

    notifyNearby(updatedDoc);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/nearby", async (req, res) => {
  const { latitude, longitude, radius } = req.body;

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const isMongoConnected = mongoose.connection.readyState === 1;

    if (MONGODB_URI && isMongoConnected) {
      const geoResults = await UserModel.aggregate([
        {
          $geoNear: {
            near: { type: "Point", coordinates: [longitude, latitude] },
            distanceField: "distance",
            maxDistance: radius,
            query: { isVisible: true, lastActive: { $gte: fiveMinutesAgo } },
            spherical: true
          }
        }
      ]);

      res.json(geoResults.map(u => ({
        username: u.username,
        bio: u.bio,
        socialLinks: u.socialLinks,
        distance: Math.round(u.distance),
        location: u.location
      })));
    } else {
      const nearby = inMemoryUsers
        .filter(u => u.isVisible && u.lastActive >= fiveMinutesAgo)
        .map(u => ({
          username: u.username,
          bio: u.bio,
          socialLinks: u.socialLinks,
          distance: Math.round(getDistance(latitude, longitude, u.location.coordinates[1], u.location.coordinates[0])),
          location: u.location
        }))
        .filter(u => u.distance <= radius);

      res.json(nearby);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/messages/:to/:from", async (req, res) => {
  const { to, from } = req.params;
  const isMongoConnected = mongoose.connection.readyState === 1;

  try {
    if (MONGODB_URI && isMongoConnected) {
      const messages = await MessageModel.find({
        $or: [
          { from, to },
          { from: to, to: from }
        ]
      }).sort({ timestamp: 1 });
      res.json(messages);
    } else {
      const messages = inMemoryMessages.filter(m => 
        (m.from === from && m.to === to) || (m.from === to && m.to === from)
      );
      res.json(messages);
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/db-status", (req, res) => {
  res.json({
    connected: mongoose.connection.readyState === 1,
    mode: mongoose.connection.readyState === 1 ? "cloud" : "preview"
  });
});

// Socket Handler
io.on("connection", (socket) => {
  socket.on("register", (data: { username: string, lat: number, lng: number, radius: number, isVisible: boolean }) => {
    socket.join(`user:${data.username}`);
    connectedUsers.set(socket.id, data);
  });

  socket.on("update_location", (data: { username: string, lat: number, lng: number, radius: number, isVisible: boolean }) => {
    connectedUsers.set(socket.id, data);
  });

  socket.on("send_message", async (data: { from: string, to: string, text: string }) => {
    const isMongoConnected = mongoose.connection.readyState === 1;
    const msg = {
      ...data,
      timestamp: new Date()
    };

    if (MONGODB_URI && isMongoConnected) {
      const savedMsg = await MessageModel.create(msg);
      io.to(`user:${data.to}`).emit("new_message", savedMsg);
      io.to(`user:${data.from}`).emit("new_message", savedMsg);
    } else {
      const inMemMsg = { ...msg, id: Math.random().toString(36).substr(2, 9) };
      inMemoryMessages.push(inMemMsg);
      io.to(`user:${data.to}`).emit("new_message", inMemMsg);
      io.to(`user:${data.from}`).emit("new_message", inMemMsg);
    }
  });

  socket.on("disconnect", () => {
    connectedUsers.delete(socket.id);
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static files
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
