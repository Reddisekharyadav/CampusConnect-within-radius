import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptWave,
  blockUser,
  declineWave,
  deleteAccount,
  fetchNearbyUsers,
  getBlocks,
  getMatches,
  getMyReports,
  getPeerMessages,
  getSessionToken,
  getWaves,
  loginAccount,
  logoutAccount,
  registerAccount,
  reportUser,
  sendChatMessage,
  sendPeerMessage,
  sendWave,
  setSessionToken,
  snapCoordinate,
  unblockUser,
  updateLocation,
} from "../services/api";
import type { MyReport, PeerMessage, Wave } from "../services/api";
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

// ─── localStorage safety wrapper (Safari private mode throws) ──────────────
function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Silently fail in Safari private mode
  }
}

type SavedProfile = { username: string; bio: string; isVisible?: boolean; radius?: number };
function loadSavedProfile(): SavedProfile | null {
  const savedProfile = safeLocalStorageGet(PROFILE_KEY);
  if (!savedProfile) return null;
  try {
    const parsed = JSON.parse(savedProfile) as SavedProfile;
    if (typeof parsed.username !== "string") return null;
    return parsed;
  } catch {
    // Previously an unguarded JSON.parse here could throw out of the callback.
    return null;
  }
}

function applySavedProfile(profile: SavedProfile, setUsername: (v: string) => void, setBio: (v: string) => void, setIsVisible: (v: boolean) => void, setRadius: (v: number) => void): boolean {
  setUsername(profile.username || "");
  setBio(profile.bio || "");
  if (typeof profile.isVisible === "boolean") setIsVisible(profile.isVisible);
  if (typeof profile.radius === "number" && profile.radius >= 10 && profile.radius <= 500) setRadius(profile.radius);
  return Boolean(profile.username);
}

// ─── Geolocation error helper ─────────────────────────────────────────────
function geolocationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Location permission denied. Please allow location access in your browser settings.";
    case error.POSITION_UNAVAILABLE:
      return "Location unavailable. Your device could not determine your position.";
    case error.TIMEOUT:
      return "Location request timed out. Please check your connection and try again.";
    default:
      return "Unable to access location. Please try again.";
  }
}

export function useCampusRadiusController() {
  const [screen, setScreen] = useState<Screen>("permission");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
  // Safety / moderation / waves state (loaded on demand from the API).
  const [blocks, setBlocks] = useState<string[]>([]);
  const [myReports, setMyReports] = useState<MyReport[]>([]);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [matches, setMatches] = useState<string[]>([]);
  const [peerMessages, setPeerMessages] = useState<PeerMessage[]>([]);
  const [selectedMatch, setSelectedMatch] = useState("");
  const [peerInput, setPeerInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi, I can help you find nearby users, explain visibility, and summarize the list on the map.",
    },
  ]);
  // Track document visibility state reactively
  const [isTabVisible, setIsTabVisible] = useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true
  );

  const intervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const locationModeRef = useRef<LocationMode>("real");
  const [locationMode, setLocationMode] = useState<LocationMode>("real");

  // ─── Reactively track tab visibility (fixes Safari sync issue) ─────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const canSync = useMemo(() => {
    return screen === "main" && isTabVisible && Boolean(username.trim());
  }, [screen, isTabVisible, username]);

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
        (geoError) => reject(new Error(geolocationErrorMessage(geoError))),
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

        const rawPosition = await getCurrentPosition();
        // Client-side blur: snap to the ~100 m grid BEFORE upload, so an
        // exact position never leaves the browser (the server snaps again).
        const position = {
          latitude: snapCoordinate(rawPosition.latitude),
          longitude: snapCoordinate(rawPosition.longitude),
        };
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
        setError(
          syncError instanceof Error
            ? syncError.message
            : "Could not load nearby users. Check backend URL and network."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bio, getCurrentPosition, isVisible, radius, username]
  );

  const requestPermission = useCallback(async () => {
    if (!navigator.geolocation) {
      setPermissionMessage(
        "Geolocation is not supported by this browser. Try Chrome, Firefox, or Safari."
      );
      return;
    }

    try {
      locationModeRef.current = "real";
      setLocationMode("real");
      const current = await getCurrentPosition();
      setCoords(current);

      const savedProfile = loadSavedProfile();
      if (savedProfile) {
        setScreen(applySavedProfile(savedProfile, setUsername, setBio, setIsVisible, setRadius) ? "main" : "profile");
      } else {
        setScreen("profile");
      }
    } catch (permissionError) {
      console.error(permissionError);
      setPermissionMessage(
        permissionError instanceof Error
          ? permissionError.message
          : "Location permission denied. Please allow location access."
      );
    }
  }, [getCurrentPosition]);

  const continueWithDemoLocation = useCallback(async () => {
    locationModeRef.current = "demo";
    setLocationMode("demo");
    setCoords(DEMO_COORDS);

    const savedProfile = loadSavedProfile();
    if (savedProfile) {
      setScreen(applySavedProfile(savedProfile, setUsername, setBio, setIsVisible, setRadius) ? "main" : "profile");
      return;
    }

    setScreen("profile");
  }, []);

  // Sign-in: if there is no session token yet, register; if that username
  // already exists (409), fall back to login with the same password. A
  // wrong password therefore stays on this screen with an error instead of
  // silently creating a second, unauthenticated profile. Passwords are
  // never stored in localStorage — only the session token is (see api.ts).
  const saveProfile = useCallback(async () => {
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError("Username is required.");
      return;
    }
    if (!getSessionToken()) {
      if (password.length < 8) {
        setError("Choose a password of at least 8 characters.");
        return;
      }
      try {
        const auth = await registerAccount(cleanUsername, password, bio.trim());
        setSessionToken(auth.token);
      } catch (registerError) {
        const status = (registerError as { response?: { status?: number } })?.response?.status;
        if (status === 409) {
          try {
            const auth = await loginAccount(cleanUsername, password);
            setSessionToken(auth.token);
          } catch {
            setError("That username already exists and the password did not match. Try again.");
            return;
          }
        } else {
          setError("Could not sign in. Check the backend URL and try again.");
          return;
        }
      }
    }

    safeLocalStorageSet(
      PROFILE_KEY,
      JSON.stringify({ username: cleanUsername, bio: bio.trim(), isVisible, radius })
    );

    setUsername(cleanUsername);
    setBio(bio.trim());
    setPassword("");
    setScreen("main");
  }, [bio, isVisible, password, radius, username]);

  // Persist visibility/radius changes too — previously a returning user
  // silently re-appeared invisible with radius reset to 100 m.
  useEffect(() => {
    if (screen !== "main" || !username.trim()) return;
    safeLocalStorageSet(
      PROFILE_KEY,
      JSON.stringify({ username: username.trim(), bio: bio.trim(), isVisible, radius })
    );
  }, [screen, username, bio, isVisible, radius]);

  const editProfile = useCallback(() => {
    setScreen("profile");
  }, []);

  const deleteMyAccount = useCallback(async () => {
    try {
      await deleteAccount();
    } catch {
      // Local cleanup still runs: the server requires the exact confirm
      // string, which deleteAccount sends, so a failure here is a network
      // or auth error — surface it and stay signed in.
      setError("Could not delete your account. Try again.");
      return;
    }
    try { localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
    setUsername("");
    setPassword("");
    setBio("");
    setIsVisible(false);
    setRadius(100);
    setNearbyUsers([]);
    setScreen("permission");
  }, []);

  const signOut = useCallback(async () => {
    // Server-side logout (clears the stored token hash) first; local
    // cleanup happens even if the backend is unreachable.
    try { await logoutAccount(); } catch { /* local cleanup still runs */ }
    try { localStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
    setUsername("");
    setPassword("");
    setBio("");
    setIsVisible(false);
    setRadius(100);
    setNearbyUsers([]);
    setScreen("permission");
  }, []);

  const handleBlockUser = useCallback(async (targetUsername: string) => {
    try {
      await blockUser(targetUsername);
      setNearbyUsers((current) => current.filter((u) => u.username !== targetUsername));
    } catch {
      setError(`Could not block @${targetUsername}. Try again.`);
    }
  }, []);

  const loadSafety = useCallback(async () => {
    try {
      const [b, r, w, m] = await Promise.all([getBlocks(), getMyReports(), getWaves(), getMatches()]);
      setBlocks(b);
      setMyReports(r);
      setWaves(w);
      setMatches(m);
    } catch {
      // Safety panels are best-effort; the nearby list still works.
    }
  }, []);

  const handleReportUser = useCallback(async (targetUsername: string, reason: string) => {
    try {
      await reportUser(targetUsername, reason);
      await loadSafety();
    } catch {
      setError(`Could not report @${targetUsername}. Try again.`);
    }
  }, []);

  const handleWaveUser = useCallback(async (targetUsername: string) => {
    try {
      await sendWave(targetUsername);
      await loadSafety();
    } catch {
      setError(`Could not wave at @${targetUsername}. They may have already waved at you — check Safety below.`);
    }
  }, [loadSafety]);

  const handleAcceptWave = useCallback(async (fromUsername: string) => {
    try {
      await acceptWave(fromUsername);
      await loadSafety();
    } catch {
      setError(`Could not accept the wave from @${fromUsername}. Try again.`);
    }
  }, [loadSafety]);

  const handleDeclineWave = useCallback(async (fromUsername: string) => {
    try {
      await declineWave(fromUsername);
      await loadSafety();
    } catch {
      setError(`Could not decline the wave from @${fromUsername}. Try again.`);
    }
  }, [loadSafety]);

  const handleUnblockUser = useCallback(async (targetUsername: string) => {
    try {
      await unblockUser(targetUsername);
      await loadSafety();
    } catch {
      setError(`Could not unblock @${targetUsername}. Try again.`);
    }
  }, [loadSafety]);

  const loadPeerMessages = useCallback(async (matchUsername: string) => {
    setSelectedMatch(matchUsername);
    try {
      setPeerMessages(await getPeerMessages(matchUsername));
    } catch {
      setError(`Could not load messages with @${matchUsername}.`);
    }
  }, []);

  const handleSendPeerMessage = useCallback(async () => {
    const text = peerInput.trim();
    if (!text || !selectedMatch) return;
    try {
      await sendPeerMessage(selectedMatch, text);
      setPeerInput("");
      setPeerMessages(await getPeerMessages(selectedMatch));
    } catch {
      setError(`Could not send that message. You can only message matched users.`);
    }
  }, [peerInput, selectedMatch]);

  const sendChat = useCallback(async () => {
    const prompt = chatInput.trim();
    if (!prompt) {
      return;
    }

    setChatMessages((current) => [...current, { role: "user", content: prompt }]);
    setChatInput("");
    setChatLoading(true);

    try {
      // Nearby users' bios are deliberately NOT sent to the LLM provider.
      const response = await sendChatMessage({
        message: prompt,
        username: username.trim(),
        bio: bio.trim(),
        nearbyUsers: [],
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
  }, [bio, chatInput, username]);

  // Load safety data (blocks, reports, waves, matches) when entering main.
  useEffect(() => {
    if (screen === "main") void loadSafety();
  }, [screen, loadSafety]);

  // ─── Auto-sync interval ───────────────────────────────────────────────
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
      // isTabVisible is guaranteed true here via canSync gate
      syncAndFetch(false);
    }, UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [canSync, syncAndFetch]);

  // Radius changes are debounced (600 ms) so dragging the slider does not
  // fire a location + nearby request on every step. Visibility/screen
  // changes still sync immediately via the ref below.
  const syncRef = useRef(syncAndFetch);
  syncRef.current = syncAndFetch;
  const prevRadiusRef = useRef(radius);
  useEffect(() => {
    if (screen !== "main") return;
    if (prevRadiusRef.current !== radius) {
      prevRadiusRef.current = radius;
      const timer = globalThis.setTimeout(() => { void syncRef.current(false); }, 600);
      return () => globalThis.clearTimeout(timer);
    }
    void syncRef.current(false);
    return undefined;
  }, [isVisible, radius, screen]);

  return {
    screen,
    username,
    setUsername,
    password,
    setPassword,
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
    editProfile,
    signOut,
    deleteMyAccount,
    onBlockUser: handleBlockUser,
    onReportUser: handleReportUser,
    blocks,
    myReports,
    waves,
    matches,
    peerMessages,
    selectedMatch,
    peerInput,
    setPeerInput,
    loadSafety,
    onWaveUser: handleWaveUser,
    onAcceptWave: handleAcceptWave,
    onDeclineWave: handleDeclineWave,
    onUnblockUser: handleUnblockUser,
    onSelectMatch: loadPeerMessages,
    onSendPeerMessage: handleSendPeerMessage,
    locationMode,
    syncAndFetch,
    sendChat,
  };
}
