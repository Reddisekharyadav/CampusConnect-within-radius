import { useEffect, useRef } from "react";
import type { ChatMessage, Coordinates, NearbyUser } from "../types";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// ─── Detect browser for permission guidance ────────────────────────────────
function getBrowserName(): string {
  const ua = navigator.userAgent;
  if (/firefox/i.test(ua)) return "Firefox";
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\//i.test(ua)) return "Opera";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/chrome/i.test(ua)) return "Chrome";
  return "your browser";
}

function getBrowserLocationHint(): string {
  const browser = getBrowserName();
  const hints: Record<string, string> = {
    Chrome: 'Click the lock icon 🔒 in the address bar → "Location" → Allow',
    Firefox: 'Click the shield icon in the address bar → Permissions → Allow Location',
    Safari: 'Go to Safari → Settings → Websites → Location → Allow',
    Edge: 'Click the lock icon in the address bar → Permissions → Location → Allow',
    Opera: 'Click the lock icon in the address bar → Location → Allow',
  };
  return hints[browser] ?? `Allow location access in ${browser} settings.`;
}

export function PermissionScreen({
  onContinue,
  onDemo,
  permissionMessage,
}: Readonly<{
  onContinue: () => void;
  onDemo: () => void;
  permissionMessage: string;
}>) {
  return (
    <main className="page">
      <section className="panel">
        <h1>CampusRadius</h1>
        <p>We use your location only to show nearby users. No history is stored.</p>
        <button className="primary" onClick={onContinue}>
          Continue with my location
        </button>
        <button className="secondary" onClick={onDemo} style={{ marginTop: 10 }}>
          Use demo location for testing
        </button>
        {permissionMessage ? (
          <>
            <p className="error">{permissionMessage}</p>
            <div className="browserHint">
              💡 <strong>How to enable in {getBrowserName()}:</strong>{" "}
              {getBrowserLocationHint()}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

export function ProfileScreen({
  username,
  bio,
  setUsername,
  setBio,
  onSave,
  error,
}: Readonly<{
  username: string;
  bio: string;
  setUsername: (value: string) => void;
  setBio: (value: string) => void;
  onSave: () => void;
  error: string;
}>) {
  // Update document title on screen change
  useEffect(() => {
    document.title = "Profile Setup — CampusRadius";
    return () => {
      document.title = "CampusRadius — Nearby Campus Discovery";
    };
  }, []);

  return (
    <main className="page">
      <section className="panel">
        <h1>Profile Setup</h1>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="your name"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
        />

        <label htmlFor="bio">Bio</label>
        <textarea
          id="bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          placeholder="Short intro"
        />

        <button className="primary" onClick={onSave}>
          Save & Continue
        </button>
        {error ? <p className="error">{error}</p> : null}
      </section>
    </main>
  );
}

export function MainScreen({
  username,
  isVisible,
  setIsVisible,
  radius,
  setRadius,
  coords,
  nearbyUsers,
  loading,
  refreshing,
  error,
  viewMode,
  setViewMode,
  chatOpen,
  setChatOpen,
  chatMessages,
  chatInput,
  setChatInput,
  chatLoading,
  onRefresh,
  onSendChat,
}: Readonly<{
  username: string;
  isVisible: boolean;
  setIsVisible: (value: boolean) => void;
  radius: number;
  setRadius: (value: number) => void;
  coords: Coordinates | null;
  nearbyUsers: NearbyUser[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  viewMode: "list" | "map";
  setViewMode: (value: "list" | "map") => void;
  chatOpen: boolean;
  setChatOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (value: string) => void;
  chatLoading: boolean;
  onRefresh: () => void;
  onSendChat: () => void;
}>) {
  // Auto-scroll chat log to bottom on new messages
  const chatLogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Update document title on main screen
  useEffect(() => {
    document.title = `CampusRadius — ${username || "Nearby"}`;
  }, [username]);

  // Handle Enter to send (Shift+Enter = newline) — works across all browsers
  const handleChatKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!chatLoading && chatInput.trim()) {
        onSendChat();
      }
    }
  };

  return (
    <main className="page">
      <section className="panel wide">
        <div className="row">
          <div>
            <h1>CampusRadius Web</h1>
            <p className="muted">Nearby users, map view, and AI help in one place.</p>
          </div>
          <div className="actionRow">
            <button
              className="secondary"
              onClick={() => setViewMode(viewMode === "list" ? "map" : "list")}
              aria-label={viewMode === "list" ? "Switch to map view" : "Switch to list view"}
            >
              {viewMode === "list" ? "🗺 Map" : "📋 List"}
            </button>
            <button
              className="secondary"
              onClick={() => setChatOpen((current) => !current)}
              aria-label={chatOpen ? "Close AI chat" : "Open AI chat"}
              aria-expanded={chatOpen}
            >
              {chatOpen ? "✕ AI" : "🤖 AI"}
            </button>
            <button className="secondary" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? "⟳ …" : "⟳ Refresh"}
            </button>
          </div>
        </div>

        <p className="muted">Signed in as <strong>{username}</strong></p>
        {coords ? (
          <p className="muted small">
            📍 {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
          </p>
        ) : null}

        <div className="controls">
          <label className="switchRow" htmlFor="visible">
            <span>Visible to nearby users</span>
            <input
              id="visible"
              type="checkbox"
              checked={isVisible}
              onChange={(event) => setIsVisible(event.target.checked)}
            />
          </label>

          <label htmlFor="radius">Radius: <strong>{radius}m</strong></label>
          <input
            id="radius"
            type="range"
            min={10}
            max={500}
            step={10}
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
            aria-valuenow={radius}
            aria-valuemin={10}
            aria-valuemax={500}
          />
        </div>

        {loading ? <p className="muted">Loading nearby users…</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}

        {viewMode === "map" && coords ? (
          <div className="mapCard">
            {GOOGLE_MAPS_API_KEY ? (
              <iframe
                title="CampusRadius map"
                className="mapFrame"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_API_KEY}&center=${coords.latitude},${coords.longitude}&zoom=16&maptype=roadmap`}
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="mapPlaceholder">
                Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to show the embedded Google map.
              </div>
            )}
          </div>
        ) : null}

        {chatOpen ? (
          <div className="chatPanel">
            <div className="chatHeader">
              <h2>Campus AI</h2>
              <p className="muted small">Powered by OpenRouter</p>
            </div>
            <div className="chatLog" ref={chatLogRef} role="log" aria-live="polite">
              {chatMessages.map((entry, index) => (
                <div key={`${entry.role}-${index}`} className={`chatBubble ${entry.role}`}>
                  {entry.content}
                </div>
              ))}
            </div>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={handleChatKeyDown}
              placeholder="Ask about nearby users… (Enter to send, Shift+Enter for newline)"
              rows={3}
              aria-label="Chat message"
              disabled={chatLoading}
            />
            <button
              className="primary"
              onClick={onSendChat}
              disabled={chatLoading || !chatInput.trim()}
              aria-busy={chatLoading}
            >
              {chatLoading ? "Thinking…" : "Send"}
            </button>
          </div>
        ) : null}

        <h2>Nearby Users</h2>
        {nearbyUsers.length === 0 ? (
          <p className="muted">No users nearby</p>
        ) : (
          <ul className="userList" aria-label="Nearby users">
            {nearbyUsers.map((user) => (
              <li key={user.username} className="userCard">
                <div className="profileTopline">
                  <div>
                    <strong>{user.fullName || user.username}</strong>
                    <p className="muted small">@{user.username}</p>
                  </div>
                  <span>{user.distance} m away</span>
                </div>
                <p>{user.bio || "No bio"}</p>
                {user.course ? <p className="profileMeta">{user.course}</p> : null}
                {user.interests?.length ? (
                  <div className="tagRow">
                    {user.interests.map((interest) => (
                      <span key={interest} className="tag">
                        {interest}
                      </span>
                    ))}
                  </div>
                ) : null}
                {user.instagram || user.facebook ? (
                  <div className="socialRow">
                    {user.instagram ? (
                      <a
                        href={`https://instagram.com/${user.instagram.replace(/^@/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Instagram {user.instagram}
                      </a>
                    ) : null}
                    {user.facebook ? (
                      <a href={user.facebook} target="_blank" rel="noopener noreferrer">
                        Facebook
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
