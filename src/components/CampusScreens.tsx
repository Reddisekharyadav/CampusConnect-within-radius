import { useEffect, useRef } from "react";
import type { ChatMessage, Coordinates, NearbyUser } from "../types";
import type { MyReport, PeerMessage, Wave } from "../services/api";

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
        <p>We use your location only while this screen is open to find nearby users. Stored locations are coarse (about 100 m), and no location is stored while you are hidden. Demo users are labelled “Demo”.</p>
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
  password,
  setPassword,
  bio,
  setUsername,
  setBio,
  onSave,
  error,
}: Readonly<{
  username: string;
  password: string;
  setPassword: (value: string) => void;
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

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          autoComplete="current-password"
        />
        <p className="muted small">
          New username? This creates your account. Existing username? This password signs you in.
          Passwords are hashed on the server and never stored in your browser.
        </p>

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
  locationMode,
  onEditProfile,
  onSignOut,
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
  onBlockUser,
  onReportUser,
  onSendChat,
  blocks,
  myReports,
  waves,
  matches,
  peerMessages,
  selectedMatch,
  peerInput,
  setPeerInput,
  onWaveUser,
  onAcceptWave,
  onDeclineWave,
  onUnblockUser,
  onSelectMatch,
  onSendPeerMessage,
  onDeleteAccount,
}: Readonly<{
  username: string;
  locationMode: "real" | "demo";
  onEditProfile: () => void;
  onSignOut: () => void;
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
  onBlockUser: (username: string) => void;
  onReportUser: (username: string, reason: string) => void;
  onSendChat: () => void;
  blocks: string[];
  myReports: MyReport[];
  waves: Wave[];
  matches: string[];
  peerMessages: PeerMessage[];
  selectedMatch: string;
  peerInput: string;
  setPeerInput: (value: string) => void;
  onWaveUser: (username: string) => void;
  onAcceptWave: (username: string) => void;
  onDeclineWave: (username: string) => void;
  onUnblockUser: (username: string) => void;
  onSelectMatch: (username: string) => void;
  onSendPeerMessage: () => void;
  onDeleteAccount: () => void;
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
    document.title = "CampusRadius — Nearby";
  }, []);

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
        {locationMode === "demo" ? (
          <p className="error" role="status">Demo location (Hyderabad) — not your real location. Nearby demo users are labelled “Demo”.</p>
        ) : null}
        <div className="actionRow">
          <button className="secondary" onClick={onEditProfile}>✏️ Edit profile</button>
          <button className="secondary" onClick={onSignOut}>Sign out</button>
          <button
            className="secondary"
            onClick={() => {
              if (window.confirm("Delete your account permanently? This removes your profile, location, blocks, waves, messages, and reports, and cannot be undone.")) {
                onDeleteAccount();
              }
            }}
          >
            Delete account
          </button>
        </div>
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
            aria-valuetext={`${radius} metres`}
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
                Map is not configured for this build. The list view still works.
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
        {!isVisible ? (
          <p className="muted">You are hidden — turn on “Visible to nearby users” to appear to others.</p>
        ) : error ? (
          <p className="error" role="alert">{error} <button className="secondary" onClick={onRefresh}>Retry</button></p>
        ) : nearbyUsers.length === 0 && !loading ? (
          <p className="muted">Nobody within {radius} m — try widening your radius.</p>
        ) : nearbyUsers.length > 0 ? (
          <p className="muted">{nearbyUsers.length} nearby within {radius} m</p>
        ) : null}
        {nearbyUsers.length === 0 ? null : (
          <ul className="userList" aria-label="Nearby users">
            {nearbyUsers.map((user) => (
              <li key={user.username} className="userCard">
                <div className="profileTopline">
                  <div>
                    <strong>{user.fullName || user.username}</strong>
                    <p className="muted small">@{user.username}</p>
                  </div>
                  <span>{user.isDemo ? "Demo • " : ""}{user.distance} m away</span>
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
                <div className="socialRow">
                  {matches.includes(user.username) ? (
                    <span className="tag">Matched ✓ — you can message each other</span>
                  ) : (
                    <button
                      className="secondary"
                      onClick={() => onWaveUser(user.username)}
                      aria-label={`Wave at ${user.username}`}
                    >
                      👋 Wave
                    </button>
                  )}
                  <button
                    className="secondary"
                    onClick={() => onBlockUser(user.username)}
                    aria-label={`Block ${user.username}`}
                  >
                    Block
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      const reason = window.prompt(`Report @${user.username} — why? (at least 10 characters)`);
                      if (reason && reason.trim().length >= 10) onReportUser(user.username, reason.trim());
                    }}
                    aria-label={`Report ${user.username}`}
                  >
                    Report
                  </button>
                </div>
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

        <h2>Safety &amp; Privacy</h2>
        <details open>
          <summary>How your data is handled — and how to stay in control</summary>
          <p className="muted small">
            What is stored: your username, bio, and a coarse location snapped to about 100 m — never your
            exact position. Your browser snaps the coordinates before upload, and the server snaps them again.
            How long: a location is discoverable for 5 minutes after your last activity, then it expires;
            nothing is stored at all while you are hidden. Distances shown to others are banded to the nearest
            10 m. Passwords are hashed on the server; only a session-token hash is stored, never the token itself.
          </p>
          <p className="muted small">
            How to act: wave at someone nearby — they must accept before you match, and only matched users can
            message each other. Block hides you from each other in both directions. Report is private, one per
            person, and never published. The Delete account button above permanently removes your profile,
            location, blocks, waves, messages, and reports. Demo users are labelled “Demo” and are never
            seeded in production (seeding requires an explicit override there).
          </p>
        </details>

        <h3>Waves waiting for you</h3>
        {waves.filter((w) => w.toUsername === username && w.status === "pending").length === 0 ? (
          <p className="muted small">No incoming waves right now.</p>
        ) : (
          <ul className="userList">
            {waves
              .filter((w) => w.toUsername === username && w.status === "pending")
              .map((w) => (
                <li key={w.fromUsername} className="userCard">
                  <strong>@{w.fromUsername}</strong> waved at you.
                  <div className="socialRow">
                    <button className="secondary" onClick={() => onAcceptWave(w.fromUsername)}>Accept — match</button>
                    <button className="secondary" onClick={() => onDeclineWave(w.fromUsername)}>Decline</button>
                  </div>
                </li>
              ))}
          </ul>
        )}

        <h3>Your matches &amp; messages</h3>
        {matches.length === 0 ? (
          <p className="muted small">No matches yet. Wave at someone nearby and wait for them to accept.</p>
        ) : (
          <>
            <div className="socialRow">
              {matches.map((m) => (
                <button key={m} className="secondary" onClick={() => onSelectMatch(m)}>
                  @{m}
                </button>
              ))}
            </div>
            {selectedMatch ? (
              <>
                <p className="muted small">Messages with @{selectedMatch} (matched users only):</p>
                <div className="chatLog" role="log">
                  {peerMessages.map((entry, index) => (
                    <div key={`${entry.createdAt}-${index}`} className={`chatBubble ${entry.fromUsername === username ? "user" : "assistant"}`}>
                      <strong>@{entry.fromUsername}:</strong> {entry.text}
                    </div>
                  ))}
                </div>
                <textarea
                  value={peerInput}
                  onChange={(event) => setPeerInput(event.target.value)}
                  placeholder={`Message @${selectedMatch}…`}
                  rows={2}
                  aria-label="Peer message"
                />
                <button className="primary" onClick={onSendPeerMessage} disabled={!peerInput.trim()}>
                  Send
                </button>
              </>
            ) : null}
          </>
        )}

        <h3>Blocked users</h3>
        {blocks.length === 0 ? (
          <p className="muted small">Nobody blocked.</p>
        ) : (
          <ul className="userList">
            {blocks.map((b) => (
              <li key={b} className="userCard">
                @{b}
                <div className="socialRow">
                  <button className="secondary" onClick={() => onUnblockUser(b)}>Unblock</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3>Your reports</h3>
        {myReports.length === 0 ? (
          <p className="muted small">You have not reported anyone. Reports are private and never published.</p>
        ) : (
          <ul className="userList">
            {myReports.map((r, index) => (
              <li key={`${r.reportedUsername}-${index}`} className="userCard">
                @{r.reportedUsername} — {r.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
