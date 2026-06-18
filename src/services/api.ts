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

// ─── Axios instance ────────────────────────────────────────────────────────
// Base URL is resolved at call time so options-page changes apply immediately.

const API = axios.create({
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

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
