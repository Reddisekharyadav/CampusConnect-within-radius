export interface NearbyUser {
  username: string;
  bio: string;
  distance: number;
  fullName?: string;
  instagram?: string;
  facebook?: string;
  course?: string;
  interests?: string[];
  /** True for seeded demo users — the UI must label these as Demo. */
  isDemo?: boolean;
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

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}


export interface ChatRequestData {
  message: string;
  username?: string;
  bio?: string;
  nearbyUsers?: NearbyUser[];
}

export interface ChatResponseData {
  reply: string;
}
