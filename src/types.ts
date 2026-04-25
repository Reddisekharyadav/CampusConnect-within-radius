export interface SocialLinks {
  instagram?: string;
  linkedin?: string;
  github?: string;
  facebook?: string;
  twitter?: string;
  phone?: string;
}

export interface User {
  username: string;
  bio: string;
  socialLinks: SocialLinks;
  isVisible: boolean;
  radius: number;
  location: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
  lastActive: Date;
}

export interface NearbyUser {
  username: string;
  bio: string;
  socialLinks: SocialLinks;
  distance: number;
  location: {
    type: "Point";
    coordinates: [number, number];
  };
}

export interface Message {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: Date;
}

export interface UpdateLocationData {
  username: string;
  bio: string;
  socialLinks: SocialLinks;
  latitude: number;
  longitude: number;
  radius: number;
  isVisible: boolean;
}

export interface NearbyQueryData {
  latitude: number;
  longitude: number;
  radius: number;
}
