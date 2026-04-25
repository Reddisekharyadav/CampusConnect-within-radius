import { useState, useEffect, useCallback, useRef } from "react";
import { 
  MapPin, 
  User, 
  Settings, 
  RefreshCcw, 
  Radio, 
  UserCircle,
  ChevronRight,
  Wifi,
  WifiOff,
  Moon,
  Sun,
  Instagram,
  Linkedin,
  Github,
  MessageSquare,
  Send,
  X,
  Facebook,
  Twitter,
  Phone,
  List,
  Map as MapIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { io, Socket } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

import { updateLocation, fetchNearby } from "./services/api";
import { NearbyUser, Message, SocialLinks } from "./types";

// Leaflet marker icons fix
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom user icon
const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const selfIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

type Screen = "permission" | "profile" | "main";
type ViewMode = "list" | "map";

export default function App() {
  const [screen, setScreen] = useState<Screen>("permission");
  const [username, setUsername] = useState(() => localStorage.getItem("cr_username") || "");
  const [bio, setBio] = useState(() => localStorage.getItem("cr_bio") || "");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(() => {
    try {
      return JSON.parse(localStorage.getItem("cr_social") || "{}");
    } catch {
      return {};
    }
  });
  const [isVisible, setIsVisible] = useState(true);
  const [radius, setRadius] = useState(100);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [dbStatus, setDbStatus] = useState<{ connected: boolean; mode: string }>({ connected: false, mode: "preview" });
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("cr_theme") as "light" | "dark") || "light");

  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [chattingWith, setChattingWith] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const socketRef = useRef<Socket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // DB Status check
  useEffect(() => {
    const checkDb = async () => {
      try {
        const res = await fetch("/api/db-status");
        const data = await res.json();
        setDbStatus(data);
      } catch (e) {
        console.error("Failed to check DB status", e);
      }
    };
    checkDb();
    const interval = setInterval(checkDb, 10000);
    return () => clearInterval(interval);
  }, []);

  // Persistence
  useEffect(() => {
    if (username) localStorage.setItem("cr_username", username);
    if (bio) localStorage.setItem("cr_bio", bio);
    localStorage.setItem("cr_social", JSON.stringify(socialLinks));
    localStorage.setItem("cr_theme", theme);
  }, [username, bio, socialLinks, theme]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Socket Connection
  useEffect(() => {
    if (screen !== "main") return;

    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      if (coords) {
        socket.emit("register", {
          username,
          lat: coords.lat,
          lng: coords.lng,
          radius,
          isVisible
        });
      }
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("nearby_change", () => {
      // Trigger a re-fetch when someone nearby changes
      refreshNearby();
    });

    socket.on("new_message", (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, [screen]);

  // Update socket profile when data changes
  useEffect(() => {
    if (socketRef.current && isConnected && coords) {
      socketRef.current.emit("update_location", {
        username,
        lat: coords.lat,
        lng: coords.lng,
        radius,
        isVisible
      });
    }
  }, [username, coords, radius, isVisible, isConnected]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setScreen(username ? "main" : "profile");
      },
      (err) => {
        setError("Location permission denied. This app requires location to work.");
      }
    );
  };

  const syncLocation = useCallback(async () => {
    if (!coords || !username) return;

    try {
      await updateLocation({
        username,
        bio,
        socialLinks,
        latitude: coords.lat,
        longitude: coords.lng,
        radius,
        isVisible
      });
    } catch (e) {
      console.error("Failed to sync location", e);
    }
  }, [coords, username, bio, socialLinks, radius, isVisible]);

  const sendMessage = () => {
    if (!newMessage.trim() || !chattingWith || !socketRef.current) return;
    socketRef.current.emit("send_message", {
      from: username,
      to: chattingWith,
      text: newMessage
    });
    setNewMessage("");
  };

  const openChat = async (target: string) => {
    setChattingWith(target);
    try {
      const res = await fetch(`/api/messages/${target}/${username}`);
      const data = await res.json();
      setMessages(data);
    } catch (e) {
      console.error("Failed to fetch messages", e);
    }
  };

  const refreshNearby = useCallback(async (showLoading = false) => {
    if (!coords) return;
    if (showLoading) setLoading(true);
    try {
      const users = await fetchNearby({
        latitude: coords.lat,
        longitude: coords.lng,
        radius
      });
      // Filter out self
      setNearbyUsers(users.filter(u => u.username !== username));
    } catch (e) {
      setError("Failed to fetch nearby users");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [coords, radius, username]);

  // Polling logic (15 seconds) - Kept as fallback but augmented by socket
  useEffect(() => {
    if (screen !== "main" || !isVisible) return;

    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition((pos) => {
        const newCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(newCoords);
        syncLocation();
      });
    }, 15000);

    // Initial load
    syncLocation();
    refreshNearby(true);

    return () => clearInterval(interval);
  }, [screen, isVisible, syncLocation, refreshNearby]);

  if (screen === "permission") {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 font-sans transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className={`max-w-sm w-full rounded-3xl shadow-xl p-8 text-center space-y-6 transition-colors ${theme === 'dark' ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}>
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto transition-colors ${theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
            <MapPin className="text-blue-600 w-10 h-10" />
          </div>
          <h1 className={`text-2xl font-bold transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Enable Location</h1>
          <p className={`transition-colors ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
            CampusRadius uses your location to show you people nearby. 
            We never store your location history.
          </p>
          <div className="space-y-4 pt-4">
            <button 
              onClick={requestLocation}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl transition-all shadow-lg active:scale-95"
            >
              Continue
            </button>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "profile") {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 font-sans transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className={`max-w-md w-full rounded-3xl shadow-xl p-8 space-y-6 transition-colors ${theme === 'dark' ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}>
          <h1 className={`text-2xl font-bold transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{username ? "Edit Profile" : "Set up Profile"}</h1>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Username</label>
              <input 
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="RocketMan99"
                className={`w-full border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all ${theme === 'dark' ? 'bg-slate-800 text-white placeholder:text-slate-600' : 'bg-slate-100'}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Bio</label>
              <textarea 
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="CS Major @ State. Love hiking and coffee."
                rows={3}
                className={`w-full border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none ${theme === 'dark' ? 'bg-slate-800 text-white placeholder:text-slate-600' : 'bg-slate-100'}`}
              />
            </div>
            
            <div className="pt-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1 mb-2 block">Social Links</label>
              <div className="space-y-3">
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <Instagram size={18} className="text-pink-500" />
                  <input 
                    placeholder="Instagram Username"
                    value={socialLinks.instagram || ""}
                    onChange={e => setSocialLinks({...socialLinks, instagram: e.target.value})}
                    className="bg-transparent border-none outline-none text-sm w-full dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <Facebook size={18} className="text-blue-500" />
                  <input 
                    placeholder="Facebook Profile"
                    value={socialLinks.facebook || ""}
                    onChange={e => setSocialLinks({...socialLinks, facebook: e.target.value})}
                    className="bg-transparent border-none outline-none text-sm w-full dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <Twitter size={18} className="text-sky-500" />
                  <input 
                    placeholder="X / Twitter Handle"
                    value={socialLinks.twitter || ""}
                    onChange={e => setSocialLinks({...socialLinks, twitter: e.target.value})}
                    className="bg-transparent border-none outline-none text-sm w-full dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <Linkedin size={18} className="text-blue-600" />
                  <input 
                    placeholder="LinkedIn Username"
                    value={socialLinks.linkedin || ""}
                    onChange={e => setSocialLinks({...socialLinks, linkedin: e.target.value})}
                    className="bg-transparent border-none outline-none text-sm w-full dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <Github size={18} className={theme === 'dark' ? 'text-white' : 'text-slate-900'} />
                  <input 
                    placeholder="GitHub Username"
                    value={socialLinks.github || ""}
                    onChange={e => setSocialLinks({...socialLinks, github: e.target.value})}
                    className="bg-transparent border-none outline-none text-sm w-full dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <Phone size={18} className="text-green-500" />
                  <input 
                    placeholder="Phone Number"
                    value={socialLinks.phone || ""}
                    onChange={e => setSocialLinks({...socialLinks, phone: e.target.value})}
                    className="bg-transparent border-none outline-none text-sm w-full dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="pt-2">
            <button 
              disabled={!username}
              onClick={() => {
                setScreen("main");
                syncLocation();
              }}
              className={`w-full font-semibold py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${theme === 'dark' ? 'bg-white text-slate-900 hover:bg-slate-200' : 'bg-slate-900 text-white hover:bg-slate-800'} disabled:bg-slate-300`}
            >
              Save Profile <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans flex justify-center transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className={`max-w-md w-full min-h-screen flex flex-col shadow-2xl relative transition-colors ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
        <div className={`px-6 py-8 space-y-4 sticky top-0 z-10 border-b transition-colors ${theme === 'dark' ? 'bg-slate-900/80 backdrop-blur-md border-slate-800' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center relative transition-colors ${theme === 'dark' ? 'bg-white' : 'bg-slate-900'}`}>
                <Radio className={`${theme === 'dark' ? 'text-slate-900' : 'text-white'} w-6 h-6`} />
                <div className="absolute -bottom-1 -right-1">
                  {isConnected ? (
                    <div className="bg-green-500 w-3 h-3 rounded-full border-2 border-white" />
                  ) : (
                    <div className="bg-slate-300 w-3 h-3 rounded-full border-2 border-white" />
                  )}
                </div>
              </div>
              <div>
                <h1 className={`text-xl font-bold transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>CampusRadius</h1>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    {isConnected ? (
                      <span className="text-[8px] font-black text-green-500 uppercase flex items-center gap-1"><Wifi size={8} /> Live Updates On</span>
                    ) : (
                      <span className="text-[8px] font-black text-slate-400 uppercase flex items-center gap-1"><WifiOff size={8} /> Connecting...</span>
                    )}
                  </div>
                  {!dbStatus.connected && (
                    <span className="text-[7px] font-black text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-sm uppercase w-fit flex items-center gap-1">
                      <span className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" />
                      In-Memory Preview Mode
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
                title={viewMode === 'list' ? 'Switch to Map View' : 'Switch to List View'}
                className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'bg-slate-800 text-blue-400 hover:bg-slate-700' : 'bg-slate-100 text-blue-600 hover:bg-slate-200'}`}
              >
                {viewMode === 'list' ? <MapIcon size={20} /> : <List size={20} />}
              </button>
              <button 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'bg-slate-800 text-amber-400 hover:bg-slate-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>
              <button 
                onClick={() => setScreen("profile")}
                className={`p-2 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <Settings size={22} />
              </button>
            </div>
          </div>

          <div className={`p-4 rounded-2xl flex items-center justify-between transition-colors ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'}`}>
            <div className="flex flex-col">
              <span className={`text-sm font-bold transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{isVisible ? "Visible" : "Hidden"}</span>
              <span className="text-xs text-slate-500">Nearby folks can find you</span>
            </div>
            <button 
              onClick={() => setIsVisible(!isVisible)}
              className={`w-14 h-8 rounded-full transition-all relative ${isVisible ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${isVisible ? 'right-1' : 'left-1 shadow-sm'}`} />
            </button>
          </div>

          <div className="space-y-2 px-2">
            <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest">
              <span>Radius</span>
              <span className="text-blue-600">{radius}m</span>
            </div>
            <input 
              type="range"
              min="10"
              max="500"
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value))}
              className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-600 transition-colors ${theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'}`}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Nearby Users</h2>
            <button 
              onClick={() => refreshNearby(true)}
              className={`p-2 rounded-full transition-all ${theme === 'dark' ? 'hover:bg-slate-800 text-slate-500' : 'hover:bg-slate-100 text-slate-500'} ${loading ? 'animate-spin text-blue-600' : ''}`}
            >
              <RefreshCcw size={16} />
            </button>
          </div>

          {viewMode === 'list' ? (
            <AnimatePresence mode="popLayout">
              {nearbyUsers.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center py-20 text-center space-y-4"
                >
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <UserCircle className={`${theme === 'dark' ? 'text-slate-700' : 'text-slate-300'} w-8 h-8`} />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-lg transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>No one nearby</h3>
                    <p className="text-slate-500 text-sm mb-4">Wander around campus to find others!</p>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-4 pb-20">
                  {nearbyUsers.map((user) => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      key={user.username}
                      onClick={() => setSelectedUser(user)}
                      className={`p-5 rounded-3xl shadow-sm hover:shadow-md transition-all flex items-start gap-4 cursor-pointer ${theme === 'dark' ? 'bg-slate-800/50 border border-slate-800' : 'bg-white border border-slate-100'}`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
                        <User className="text-blue-600 w-6 h-6" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <h3 className={`font-bold transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{user.username}</h3>
                          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase">{user.distance}m</span>
                        </div>
                        <p className={`text-sm line-clamp-2 mb-2 transition-colors ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>{user.bio}</p>
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex gap-2">
                            {user.socialLinks?.instagram && <Instagram size={14} className="text-pink-500" />}
                            {user.socialLinks?.facebook && <Facebook size={14} className="text-blue-500" />}
                            {user.socialLinks?.twitter && <Twitter size={14} className="text-sky-500" />}
                            {user.socialLinks?.linkedin && <Linkedin size={14} className="text-blue-600" />}
                            {user.socialLinks?.github && <Github size={14} className={theme === 'dark' ? 'text-white' : 'text-slate-900'} />}
                            {user.socialLinks?.phone && <Phone size={14} className="text-green-500" />}
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              openChat(user.username);
                            }}
                            className="text-[11px] font-black uppercase tracking-widest text-white bg-blue-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm hover:bg-blue-700 transition-colors"
                          >
                            <MessageSquare size={12} /> Chat
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          ) : (
            <div className="h-[450px] w-full relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl mb-4">
              {coords ? (
                <MapContainer 
                  center={[coords.lat, coords.lng]} 
                  zoom={16} 
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <RecenterMap center={[coords.lat, coords.lng]} />
                  <Marker position={[coords.lat, coords.lng]} icon={selfIcon}>
                    <Popup>
                      <div className="text-center">
                        <p className="font-bold">You are here</p>
                        <p className="text-[10px] text-slate-500">Visible to others in {radius}m</p>
                      </div>
                    </Popup>
                  </Marker>
                  {nearbyUsers.map(user => (
                    <Marker 
                      key={user.username} 
                      position={[user.location.coordinates[1], user.location.coordinates[0]]}
                      icon={userIcon}
                    >
                      <Popup>
                        <div className="p-1 min-w-[120px]">
                          <h4 className="font-bold text-blue-600">{user.username}</h4>
                          <p className="text-xs text-slate-600 line-clamp-2 mb-2">{user.bio}</p>
                          <button 
                            onClick={() => setSelectedUser(user)}
                            className="text-[10px] font-bold uppercase text-white bg-blue-600 px-3 py-1.5 rounded-lg w-full shadow-sm"
                          >
                            View Profile
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full bg-slate-50 dark:bg-slate-800 space-y-4">
                  <RefreshCcw className="animate-spin text-blue-600" size={32} />
                  <span className="text-slate-400 font-medium">Pinpointing your locaton...</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`p-6 text-center text-[10px] uppercase tracking-widest font-bold border-t transition-colors ${theme === 'dark' ? 'text-slate-600 border-slate-800' : 'text-slate-300 border-slate-50'}`}>
          Safe • Local • Ephemeral
        </div>
      </div>

      {/* User Details Modal */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setSelectedUser(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={`max-w-sm w-full rounded-3xl p-8 shadow-2xl relative ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setSelectedUser(null)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
              
              <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 rounded-3xl flex items-center justify-center mb-6">
                <User className="text-blue-600 w-10 h-10" />
              </div>
              
              <div className="space-y-6">
                <div>
                  <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{selectedUser.username}</h2>
                  <p className="text-blue-600 font-bold text-sm">{selectedUser.distance}m away</p>
                </div>
                
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">About</h4>
                  <p className={`${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>{selectedUser.bio}</p>
                </div>
                
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Connect</h4>
                  <div className="flex gap-4">
                    {selectedUser.socialLinks?.instagram && (
                      <a href={`https://instagram.com/${selectedUser.socialLinks.instagram}`} target="_blank" rel="noreferrer" className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-2xl text-pink-500 hover:scale-110 transition-transform">
                        <Instagram size={24} />
                      </a>
                    )}
                    {selectedUser.socialLinks?.facebook && (
                      <a href={`https://facebook.com/${selectedUser.socialLinks.facebook}`} target="_blank" rel="noreferrer" className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl text-blue-500 hover:scale-110 transition-transform">
                        <Facebook size={24} />
                      </a>
                    )}
                    {selectedUser.socialLinks?.twitter && (
                      <a href={`https://twitter.com/${selectedUser.socialLinks.twitter}`} target="_blank" rel="noreferrer" className="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-2xl text-sky-500 hover:scale-110 transition-transform">
                        <Twitter size={24} />
                      </a>
                    )}
                    {selectedUser.socialLinks?.linkedin && (
                      <a href={`https://linkedin.com/in/${selectedUser.socialLinks.linkedin}`} target="_blank" rel="noreferrer" className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-2xl text-blue-600 hover:scale-110 transition-transform">
                        <Linkedin size={24} />
                      </a>
                    )}
                    {selectedUser.socialLinks?.github && (
                      <a href={`https://github.com/${selectedUser.socialLinks.github}`} target="_blank" rel="noreferrer" className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-900 dark:text-white hover:scale-110 transition-transform">
                        <Github size={24} />
                      </a>
                    )}
                    {selectedUser.socialLinks?.phone && (
                      <a href={`tel:${selectedUser.socialLinks.phone}`} className="p-3 bg-green-50 dark:bg-green-900/20 rounded-2xl text-green-500 hover:scale-110 transition-transform">
                        <Phone size={24} />
                      </a>
                    )}
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    openChat(selectedUser.username);
                    setSelectedUser(null);
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                >
                  <MessageSquare size={20} /> Start Chatting
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Interface */}
      <AnimatePresence>
        {chattingWith && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className={`fixed inset-0 z-[60] flex flex-col ${theme === 'dark' ? 'bg-slate-950' : 'bg-white'}`}
          >
            {/* Chat Header */}
            <div className={`px-6 py-6 border-b flex items-center justify-between ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setChattingWith(null)}
                  className={`p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors ${theme === 'dark' ? 'text-white' : 'text-slate-600'}`}
                >
                  <ChevronRight className="rotate-180" size={24} />
                </button>
                <div>
                  <h3 className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{chattingWith}</h3>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Active Now</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-4 custom-scrollbar">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.from === username ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                    msg.from === username 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : (theme === 'dark' ? 'bg-slate-800 text-white rounded-tl-none' : 'bg-slate-100 text-slate-900 rounded-tl-none')
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className={`p-6 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2">
                <input 
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className={`flex-1 border-none rounded-2xl px-5 py-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-slate-100'}`}
                />
                <button 
                  onClick={sendMessage}
                  className="p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors shadow-lg active:scale-95"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
