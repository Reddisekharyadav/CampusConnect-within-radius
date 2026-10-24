import axios from "axios";
import type {
  UpdateLocationData,
  NearbyQueryData,
  NearbyUser,
  ChatRequestData,
  ChatResponseData,
} from "../types";

// ─── Base URL helpers ──────────────────────────────────────────────────────

function getDefaultBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";
}

/**
 * In the extension context, the options page saves the backend URL to
 * localStorage (key: "campusradius_api_url"). All extension pages share
 * the same chrome-extension:// origin so localStorage is shared between
 * popup.html, options.html, and the built React app.
 *
 * Falls back to the VITE_API_BASE_URL env var (from .env at build time)
 * or hardcoded localhost for local development.
 */
function getApiBaseUrl(): string {
  // Extension build: check localStorage for user-configured backend URL
  if (import.meta.env.VITE_IS_EXTENSION === "true") {
    try {
      const stored = localStorage.getItem("campusradius_api_url");
      if (stored) return stored;
    } catch {
      // localStorage unavailable (e.g., incognito without permission) — use default
    }
  }
  return getDefaultBaseUrl();
}

// ─── Session token ───────────────────────────────────────────────────────
// The backend issues an opaque random token at register/login (see
// backend/lib/auth.js). It is stored in localStorage — not a cookie —
// because this app is a static frontend talking to a separate API origin.
// The token is sent as `Authorization: Bearer <token>` on every call.
// It is never a password: passwords are only sent once, to /auth/register
// or /auth/login, over HTTPS in production.
const TOKEN_KEY = "campusradius_session_token";

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private-mode storage failure: calls will simply be unauthenticated.
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

// ─── Axios instance ────────────────────────────────────────────────────────
// Base URL is resolved at call time so options-page changes apply immediately.

const API = axios.create({
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

API.interceptors.request.use((config) => {
  const token = getSessionToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface AuthResponse {
  username: string;
  token: string;
}

export const registerAccount = async (username: string, password: string, bio: string): Promise<AuthResponse> => {
  const response = await API.post<AuthResponse>("/auth/register", { username, password, bio }, { baseURL: getApiBaseUrl() });
  return response.data;
};

export const loginAccount = async (username: string, password: string): Promise<AuthResponse> => {
  const response = await API.post<AuthResponse>("/auth/login", { username, password }, { baseURL: getApiBaseUrl() });
  return response.data;
};

export const logoutAccount = async (): Promise<void> => {
  try {
    await API.post("/auth/logout", {}, { baseURL: getApiBaseUrl() });
  } finally {
    clearSessionToken();
  }
};

export const deleteAccount = async (): Promise<void> => {
  await API.delete("/auth/me", { baseURL: getApiBaseUrl(), data: { confirm: "DELETE" } });
  clearSessionToken();
};

export const blockUser = async (username: string): Promise<void> => {
  await API.post("/blocks", { username }, { baseURL: getApiBaseUrl() });
};

export const getBlocks = async (): Promise<string[]> => {
  const response = await API.get<{ blocked: string[] }>("/blocks", { baseURL: getApiBaseUrl() });
  return response.data.blocked;
};

export const unblockUser = async (username: string): Promise<void> => {
  await API.delete(`/blocks/${encodeURIComponent(username)}`, { baseURL: getApiBaseUrl() });
};

export interface MyReport {
  reportedUsername: string;
  reason: string;
  createdAt: string;
  status: string;
}

export const getMyReports = async (): Promise<MyReport[]> => {
  const response = await API.get<{ reports: MyReport[] }>("/reports/mine", { baseURL: getApiBaseUrl() });
  return response.data.reports;
};

export interface Wave {
  fromUsername: string;
  toUsername: string;
  status: string;
  createdAt: string;
}

export const getWaves = async (): Promise<Wave[]> => {
  const response = await API.get<{ waves: Wave[] }>("/waves", { baseURL: getApiBaseUrl() });
  return response.data.waves;
};

export const sendWave = async (username: string): Promise<void> => {
  await API.post("/waves", { username }, { baseURL: getApiBaseUrl() });
};

export const acceptWave = async (username: string): Promise<void> => {
  await API.post(`/waves/${encodeURIComponent(username)}/accept`, {}, { baseURL: getApiBaseUrl() });
};

export const declineWave = async (username: string): Promise<void> => {
  await API.post(`/waves/${encodeURIComponent(username)}/decline`, {}, { baseURL: getApiBaseUrl() });
};

export const getMatches = async (): Promise<string[]> => {
  const response = await API.get<{ matches: string[] }>("/matches", { baseURL: getApiBaseUrl() });
  return response.data.matches;
};

export interface PeerMessage {
  fromUsername: string;
  toUsername: string;
  text: string;
  createdAt: string;
}

export const sendPeerMessage = async (username: string, text: string): Promise<void> => {
  await API.post("/messages", { username, text }, { baseURL: getApiBaseUrl() });
};

export const getPeerMessages = async (username: string): Promise<PeerMessage[]> => {
  const response = await API.get<{ messages: PeerMessage[] }>(`/messages/${encodeURIComponent(username)}`, { baseURL: getApiBaseUrl() });
  return response.data.messages;
};

// Client-side blur: snap coordinates to the same ~100 m grid the server
// uses, BEFORE upload, so an exact position never leaves the browser.
export function snapCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export const reportUser = async (username: string, reason: string): Promise<void> => {
  await API.post("/reports", { username, reason }, { baseURL: getApiBaseUrl() });
};

export const updateLocation = async (data: UpdateLocationData) => {
  const response = await API.post("/update-location", data, {
    baseURL: getApiBaseUrl(),
  });
  return response.data;
};

export const fetchNearbyUsers = async (data: NearbyQueryData): Promise<NearbyUser[]> => {
  const response = await API.post<NearbyUser[]>("/nearby", data, {
    baseURL: getApiBaseUrl(),
  });
  return response.data;
};

export const sendChatMessage = async (
  data: ChatRequestData
): Promise<ChatResponseData> => {
  const response = await API.post<ChatResponseData>("/chat", data, {
    baseURL: getApiBaseUrl(),
  });
  return response.data;
};
