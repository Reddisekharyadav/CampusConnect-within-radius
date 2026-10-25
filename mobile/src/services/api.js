import axios from "axios";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

const configBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl;

export const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  configBaseUrl ||
  "http://192.168.1.100:5000";

const TOKEN_KEY = "campusradius_session_token";

export const getSessionToken = async () => {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setSessionToken = async (token) => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private storage failure: calls will simply be unauthenticated.
  }
};

export const clearSessionToken = async () => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
};

// Client-side blur: snap coordinates to the same ~100 m grid the server
// uses, BEFORE upload, so an exact position never leaves the phone.
export const snapCoordinate = (value) => Math.round(value * 1000) / 1000;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json"
  }
});

// Bearer interceptor: every call carries the session token issued at
// register/login (see backend/lib/auth.js). Passwords are never stored.
api.interceptors.request.use(async (config) => {
  const token = await getSessionToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const registerAccount = async (username, password, bio) => {
  const response = await api.post("/auth/register", { username, password, bio });
  return response.data;
};

export const loginAccount = async (username, password) => {
  const response = await api.post("/auth/login", { username, password });
  return response.data;
};

export const logoutAccount = async () => {
  try {
    await api.post("/auth/logout", {});
  } finally {
    await clearSessionToken();
  }
};

export const deleteAccount = async () => {
  await api.delete("/auth/me", { data: { confirm: "DELETE" } });
  await clearSessionToken();
};

export const updateLocation = async (payload) => {
  const response = await api.post("/update-location", payload);
  return response.data;
};

export const fetchNearbyUsers = async (payload) => {
  const response = await api.post("/nearby", payload);
  return response.data;
};

export const sendChatMessage = async (payload) => {
  const response = await api.post("/chat", payload);
  return response.data;
};

export const blockUser = async (username) => {
  const response = await api.post("/blocks", { username });
  return response.data;
};

export const unblockUser = async (username) => {
  const response = await api.delete(`/blocks/${encodeURIComponent(username)}`);
  return response.data;
};

export const reportUser = async (username, reason) => {
  const response = await api.post("/reports", { username, reason });
  return response.data;
};

export const sendWave = async (username) => {
  const response = await api.post("/waves", { username });
  return response.data;
};

export const getMatches = async () => {
  const response = await api.get("/matches");
  return response.data.matches;
};

export const getWaves = async () => {
  const response = await api.get("/waves");
  return response.data.waves;
};

export const acceptWave = async (username) => {
  const response = await api.post(`/waves/${encodeURIComponent(username)}/accept`, {});
  return response.data;
};

export const declineWave = async (username) => {
  const response = await api.post(`/waves/${encodeURIComponent(username)}/decline`, {});
  return response.data;
};

export const sendPeerMessage = async (username, text) => {
  const response = await api.post("/messages", { username, text });
  return response.data;
};

export default api;
