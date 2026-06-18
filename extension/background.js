// CampusRadius — MV3 Service Worker
// Minimal service worker required by Manifest V3.
// No chrome.storage used — the popup uses localStorage directly.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("CampusRadius extension installed. Open the popup to get started.");
  }
});

// Respond to ping messages from the popup to confirm the service worker is alive.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ type: "pong" });
  }
  return true;
});
