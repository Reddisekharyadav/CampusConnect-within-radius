const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const User = require("./models/User");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI;

let useMemoryStore = !MONGODB_URI;
const memoryUsers = [];

const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
};

const upsertMemoryUser = (user) => {
  const index = memoryUsers.findIndex((entry) => entry.usernameKey === user.usernameKey);
  if (index >= 0) {
    memoryUsers[index] = user;
  } else {
    memoryUsers.push(user);
  }
};

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "CampusRadius API" });
});

app.post("/update-location", async (req, res) => {
  try {
    const { username, bio, latitude, longitude, radius, isVisible } = req.body;

    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "username is required" });
    }

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      return res.status(400).json({ error: "Valid latitude and longitude are required" });
    }

    const safeRadius =
      typeof radius === "number" && radius >= 10 && radius <= 500 ? radius : 100;

    const trimmedUsername = username.trim();
    const usernameKey = trimmedUsername.toLowerCase();

    const userPayload = {
      username: trimmedUsername,
      usernameKey,
      bio: typeof bio === "string" ? bio.trim() : "",
      isVisible: Boolean(isVisible),
      radius: safeRadius,
      location: {
        type: "Point",
        coordinates: [longitude, latitude]
      },
      lastActive: new Date()
    };

    if (useMemoryStore) {
      upsertMemoryUser(userPayload);
    } else {
      await User.findOneAndUpdate(
        { usernameKey },
        userPayload,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("update-location error", error);
    return res.status(500).json({ error: "Failed to update location" });
  }
});

app.post("/nearby", async (req, res) => {
  try {
    const { latitude, longitude, radius, username } = req.body;

    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      return res.status(400).json({ error: "Valid latitude and longitude are required" });
    }

    const safeRadius =
      typeof radius === "number" && radius >= 10 && radius <= 500 ? radius : 100;

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const currentUsername = typeof username === "string" ? username.trim() : "";

    const nearbyUsers = useMemoryStore
      ? memoryUsers
          .filter((u) => u.isVisible && u.lastActive >= fiveMinutesAgo)
          .filter((u) => u.username !== currentUsername)
          .map((u) => {
            const userLon = u.location.coordinates[0];
            const userLat = u.location.coordinates[1];
            return {
              username: u.username,
              bio: u.bio,
              distance: haversineDistanceMeters(latitude, longitude, userLat, userLon)
            };
          })
          .filter((u) => u.distance <= safeRadius)
          .sort((a, b) => a.distance - b.distance)
      : (await User.find({
          isVisible: true,
          lastActive: { $gte: fiveMinutesAgo },
          location: {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: [longitude, latitude]
              },
              $maxDistance: safeRadius
            }
          }
        }).select("username bio location").lean())
          .filter((u) => u.username !== currentUsername)
          .map((u) => {
            const userLon = u.location.coordinates[0];
            const userLat = u.location.coordinates[1];
            return {
              username: u.username,
              bio: u.bio,
              distance: haversineDistanceMeters(latitude, longitude, userLat, userLon)
            };
          })
          .filter((u) => u.distance <= safeRadius)
          .sort((a, b) => a.distance - b.distance);

    return res.json(nearbyUsers);
  } catch (error) {
    console.error("nearby error", error);
    return res.status(500).json({ error: "Failed to fetch nearby users" });
  }
});

const start = async () => {
  try {
    if (!MONGODB_URI) {
      console.log("CampusRadius backend running in preview mode with in-memory storage.");
      useMemoryStore = true;
      app.listen(PORT, () => {
        console.log(`CampusRadius backend listening on port ${PORT}`);
      });
      return;
    }

    await mongoose.connect(MONGODB_URI);
    useMemoryStore = false;
    app.listen(PORT, () => {
      console.log(`CampusRadius backend listening on port ${PORT}`);
    });
  } catch (error) {
    console.warn("MongoDB connection failed, falling back to in-memory preview mode.", error.message);
    useMemoryStore = true;
    app.listen(PORT, () => {
      console.log(`CampusRadius backend listening on port ${PORT}`);
    });
  }
};

start();
