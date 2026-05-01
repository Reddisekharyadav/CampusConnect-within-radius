import axios from "axios";
import Constants from "expo-constants";

const configBaseUrl = Constants.expoConfig?.extra?.apiBaseUrl;

export const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  configBaseUrl ||
  "http://192.168.1.100:5000";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json"
  }
});

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

export default api;
