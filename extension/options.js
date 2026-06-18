// CampusRadius Extension — Options page logic
// Reads/writes backend API URL from localStorage.
// All extension pages (popup, options) share the same chrome-extension:// origin,
// so localStorage is shared between them without needing chrome.storage.

const DEFAULT_API_URL = "http://localhost:5000";
const STORAGE_KEY = "campusradius_api_url";

const apiUrlInput = document.getElementById("api-url");
const saveBtn = document.getElementById("save-btn");
const resetBtn = document.getElementById("reset-btn");
const statusEl = document.getElementById("status");

function showStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = type; // 'success' | 'error'
  setTimeout(() => {
    statusEl.className = "";
    statusEl.textContent = "";
  }, 3000);
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// Load saved URL on page open
document.addEventListener("DOMContentLoaded", () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  apiUrlInput.value = saved || DEFAULT_API_URL;
});

// Save button
saveBtn.addEventListener("click", () => {
  const value = apiUrlInput.value.trim().replace(/\/$/, ""); // strip trailing slash
  if (!value || !isValidUrl(value)) {
    showStatus("❌ Please enter a valid URL (http:// or https://)", "error");
    apiUrlInput.focus();
    return;
  }
  localStorage.setItem(STORAGE_KEY, value);
  showStatus("✅ Saved! Close and reopen the popup to apply.", "success");
});

// Reset button
resetBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  apiUrlInput.value = DEFAULT_API_URL;
  showStatus("✅ Reset to default.", "success");
});

// Preset chips
document.querySelectorAll(".preset").forEach((chip) => {
  chip.addEventListener("click", () => {
    apiUrlInput.value = chip.dataset.url;
  });
});

// Save on Enter key
apiUrlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    saveBtn.click();
  }
});
