import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchNearbyUsers, updateLocation } from "./services/api";
import type { Coordinates, NearbyUser } from "./types";

type Screen = "permission" | "profile" | "main";
type LocationMode = "real" | "demo";

const PROFILE_KEY = "campusradius_web_profile";
const UPDATE_INTERVAL_MS = 15000;
const DEMO_COORDS = {
  latitude: 17.385,
  longitude: 78.4867,
};

function App() {
  const [screen, setScreen] = useState<Screen>("permission");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [radius, setRadius] = useState(100);
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [permissionMessage, setPermissionMessage] = useState("");
  const intervalRef = useRef<number | null>(null);
  const locationModeRef = useRef<LocationMode>("real");

  const canSync = useMemo(() => {
    return (
      screen === "main" &&
      document.visibilityState === "visible" &&
      Boolean(username.trim())
    );
  }, [screen, username]);

  const getCurrentPosition = useCallback(async (): Promise<Coordinates> => {
    if (locationModeRef.current === "demo") {
      return DEMO_COORDS;
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => reject(new Error("Unable to access location")),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);

  const syncAndFetch = useCallback(
    async (manual = false) => {
      if (!username.trim()) return;

      try {
        setError("");
        if (manual) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const position = await getCurrentPosition();
        setCoords(position);

        await updateLocation({
          username: username.trim(),
          bio: bio.trim(),
          latitude: position.latitude,
          longitude: position.longitude,
          radius,
          isVisible,
        });

        const users = await fetchNearbyUsers({
          username: username.trim(),
          latitude: position.latitude,
          longitude: position.longitude,
          radius,
        });

        setNearbyUsers(users);
      } catch (syncError) {
        console.error(syncError);
        setError("Could not load nearby users. Check backend URL and network.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bio, getCurrentPosition, isVisible, radius, username]
  );

  const requestPermission = useCallback(async () => {
    if (!navigator.geolocation) {
      setPermissionMessage("Geolocation is not available in this browser.");
      return;
    }

    try {
      locationModeRef.current = "real";
      const current = await getCurrentPosition();
      setCoords(current);

      const savedProfile = localStorage.getItem(PROFILE_KEY);
      if (savedProfile) {
        const parsed = JSON.parse(savedProfile) as { username: string; bio: string };
        setUsername(parsed.username || "");
        setBio(parsed.bio || "");
        setScreen(parsed.username ? "main" : "profile");
      } else {
        setScreen("profile");
      }
    } catch (permissionError) {
      console.error(permissionError);
      setPermissionMessage("Location permission denied. Please allow location access.");
    }
  }, [getCurrentPosition]);

  const continueWithDemoLocation = useCallback(async () => {
    locationModeRef.current = "demo";
    setCoords(DEMO_COORDS);

    const savedProfile = localStorage.getItem(PROFILE_KEY);
    if (savedProfile) {
      const parsed = JSON.parse(savedProfile) as { username: string; bio: string };
      setUsername(parsed.username || "");
      setBio(parsed.bio || "");
      setScreen(parsed.username ? "main" : "profile");
      return;
    }

    setScreen("profile");
  }, []);

  const saveProfile = useCallback(() => {
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError("Username is required.");
      return;
    }

    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ username: cleanUsername, bio: bio.trim() })
    );

    setUsername(cleanUsername);
    setBio(bio.trim());
    setScreen("main");
  }, [bio, username]);

  useEffect(() => {
    if (!canSync) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    syncAndFetch(false);

    intervalRef.current = globalThis.setInterval(() => {
      if (document.visibilityState === "visible") {
        syncAndFetch(false);
      }
    }, UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [canSync, syncAndFetch]);

  useEffect(() => {
    if (screen === "main") {
      syncAndFetch(false);
    }
  }, [isVisible, radius, screen, syncAndFetch]);

  if (screen === "permission") {
    return (
      <main className="page">
        <section className="panel">
          <h1>CampusRadius</h1>
          <p>We use your location only to show nearby users.</p>
          <button className="primary" onClick={requestPermission}>Continue</button>
          <button className="secondary" onClick={continueWithDemoLocation}>
            Use demo location for testing
          </button>
          {permissionMessage ? <p className="error">{permissionMessage}</p> : null}
        </section>
      </main>
    );
  }

  if (screen === "profile") {
    return (
      <main className="page">
        <section className="panel">
          <h1>Profile Setup</h1>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="your name"
          />

          <label htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Short intro"
          />

          <button className="primary" onClick={saveProfile}>Save</button>
          {error ? <p className="error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="panel wide">
        <div className="row">
          <h1>CampusRadius Web</h1>
          <button className="secondary" onClick={() => syncAndFetch(true)}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <p className="muted">Signed in as {username}</p>
        {coords ? (
          <p className="muted small">
            Location: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          </p>
        ) : null}

        <div className="controls">
          <label className="switchRow" htmlFor="visible">
            <span>Visible to nearby users</span>
            <input
              id="visible"
              type="checkbox"
              checked={isVisible}
              onChange={(event) => setIsVisible(event.target.checked)}
            />
          </label>

          <label htmlFor="radius">Radius: {radius}m</label>
          <input
            id="radius"
            type="range"
            min={10}
            max={500}
            step={10}
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
          />
        </div>

        {loading ? <p className="muted">Loading nearby users...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <h2>Nearby Users</h2>
        {nearbyUsers.length === 0 ? (
          <p className="muted">No users nearby</p>
        ) : (
          <ul className="userList">
            {nearbyUsers.map((user) => (
              <li key={user.username} className="userCard">
                <strong>{user.username}</strong>
                <p>{user.bio || "No bio"}</p>
                <span>{user.distance} m away</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;
