import axios from "axios";
import { UpdateLocationData, NearbyQueryData, NearbyUser } from "../types";

const API = axios.create({
  baseURL: "/api",
});

export const updateLocation = async (data: UpdateLocationData) => {
  return API.post("/update-location", data);
};

export const fetchNearby = async (data: NearbyQueryData): Promise<NearbyUser[]> => {
  const response = await API.post<NearbyUser[]>("/nearby", data);
  return response.data;
};
