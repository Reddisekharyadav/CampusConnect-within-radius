// CampusRadius Extension — popup.js
// External script (required by MV3 CSP — no inline scripts allowed).
// popup.html loads the React app directly via dist/assets/index.js.

// Ping the background service worker to keep it alive while popup is open
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
  try {
    chrome.runtime.sendMessage({ type: 'ping' });
  } catch {
    // Ignore if background worker is not ready yet
  }
}
