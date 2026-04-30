export interface NearbyUser {
  username: string;
  bio: string;
  distance: number;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface UpdateLocationData {
  username: string;
  bio: string;
  latitude: number;
  longitude: number;
  radius: number;
  isVisible: boolean;
}

export interface NearbyQueryData {
  username?: string;
  latitude: number;
  longitude: number;
  radius: number;
}
