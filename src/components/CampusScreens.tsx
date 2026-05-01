import type { ChatMessage, Coordinates, NearbyUser } from "../types";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

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
        <p>We use your location only to show nearby users.</p>
        <button className="primary" onClick={onContinue}>
          Continue
        </button>
        <button className="secondary" onClick={onDemo}>
          Use demo location for testing
        </button>
        {permissionMessage ? <p className="error">{permissionMessage}</p> : null}
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
  return (
    <main className="page">
      <section className="panel">
        <h1>Profile Setup</h1>
        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="your name"
        />

        <label htmlFor="bio">Bio</label>
        <textarea
          id="bio"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          placeholder="Short intro"
        />

        <button className="primary" onClick={onSave}>
          Save
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
  return (
    <main className="page">
      <section className="panel wide">
        <div className="row">
          <div>
            <h1>CampusRadius Web</h1>
            <p className="muted">Nearby users, map view, and AI help in one place.</p>
          </div>
          <div className="actionRow">
            <button className="secondary" onClick={() => setViewMode(viewMode === "list" ? "map" : "list")}>
              {viewMode === "list" ? "Map view" : "List view"}
            </button>
            <button className="secondary" onClick={() => setChatOpen((current) => !current)}>
              {chatOpen ? "Close AI" : "Ask AI"}
            </button>
            <button className="secondary" onClick={onRefresh}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <p className="muted">Signed in as {username}</p>
        {coords ? (
          <p className="muted small">
            Location: {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
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

          <label htmlFor="radius">Radius: {radius}m</label>
          <input
            id="radius"
            type="range"
            min={10}
            max={500}
            step={10}
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
          />
        </div>

        {loading ? <p className="muted">Loading nearby users...</p> : null}
        {error ? <p className="error">{error}</p> : null}

        {viewMode === "map" && coords ? (
          <div className="mapCard">
            {GOOGLE_MAPS_API_KEY ? (
              <iframe
                title="CampusRadius map"
                className="mapFrame"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps/embed/v1/view?key=${GOOGLE_MAPS_API_KEY}&center=${coords.latitude},${coords.longitude}&zoom=16&maptype=roadmap`}
              />
            ) : (
              <div className="mapPlaceholder">
                Add VITE_GOOGLE_MAPS_API_KEY to show the embedded Google map.
              </div>
            )}
          </div>
        ) : null}

        {chatOpen ? (
          <div className="chatPanel">
            <div className="chatHeader">
              <h2>Campus AI</h2>
              <p className="muted small">Powered by OpenRouter free models</p>
            </div>
            <div className="chatLog">
              {chatMessages.map((entry, index) => (
                <div key={`${entry.role}-${index}`} className={`chatBubble ${entry.role}`}>
                  {entry.content}
                </div>
              ))}
            </div>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask about nearby users, privacy, or how to use the app"
            />
            <button className="primary" onClick={onSendChat} disabled={chatLoading}>
              {chatLoading ? "Thinking..." : "Send"}
            </button>
          </div>
        ) : null}

        <h2>Nearby Users</h2>
        {nearbyUsers.length === 0 ? (
          <p className="muted">No users nearby</p>
        ) : (
          <ul className="userList">
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
                      <a href={`https://instagram.com/${user.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
                        Instagram {user.instagram}
                      </a>
                    ) : null}
                    {user.facebook ? (
                      <a href={user.facebook} target="_blank" rel="noreferrer">
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
