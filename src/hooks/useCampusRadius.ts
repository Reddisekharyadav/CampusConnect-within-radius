import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchNearbyUsers, sendChatMessage, updateLocation } from "../services/api";
import type { ChatMessage, Coordinates, NearbyUser } from "../types";

type Screen = "permission" | "profile" | "main";
type LocationMode = "real" | "demo";
type ViewMode = "list" | "map";

const PROFILE_KEY = "campusradius_web_profile";
const UPDATE_INTERVAL_MS = 15000;
const DEMO_COORDS = {
  latitude: 17.385,
  longitude: 78.4867,
};

export function useCampusRadiusController() {
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
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi, I can help you find nearby users, explain visibility, and summarize the list on the map.",
    },
  ]);
  const intervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
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

  const sendChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt) {
      return;
    }

    setChatMessages((current) => [...current, { role: "user", content: prompt }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const response = await sendChatMessage({
        message: prompt,
        username: username.trim(),
        bio: bio.trim(),
        nearbyUsers,
      });

      setChatMessages((current) => [
        ...current,
        { role: "assistant", content: response.reply },
      ]);
    } catch (chatError) {
      console.error(chatError);
      setChatMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: "The chatbot is unavailable right now. Check OPENROUTER_API_KEY and try again.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [bio, chatInput, nearbyUsers, username]);

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

  return {
    screen,
    username,
    setUsername,
    bio,
    setBio,
    isVisible,
    setIsVisible,
    radius,
    setRadius,
    coords,
    nearbyUsers,
    loading,
    refreshing,
    error,
    permissionMessage,
    viewMode,
    setViewMode,
    chatOpen,
    setChatOpen,
    chatInput,
    setChatInput,
    chatLoading,
    chatMessages,
    requestPermission,
    continueWithDemoLocation,
    saveProfile,
    syncAndFetch,
    sendChat,
  };
}
