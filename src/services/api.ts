import axios from "axios";
import { UpdateLocationData, NearbyQueryData, NearbyUser } from "../types";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000",
});

export const updateLocation = async (data: UpdateLocationData) => {
  const response = await API.post("/update-location", data);
  return response.data;
};

export const fetchNearbyUsers = async (data: NearbyQueryData): Promise<NearbyUser[]> => {
  const response = await API.post<NearbyUser[]>("/nearby", data);
  return response.data;
};
