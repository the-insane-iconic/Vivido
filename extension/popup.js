document.addEventListener("DOMContentLoaded", async () => {
  const urlInput = document.getElementById("base-url-input");
  const saveMsg = document.getElementById("save-msg");
  const openTabBtn = document.getElementById("open-tab-btn");
  const launchAppBtn = document.getElementById("launch-app-btn");

  const storage = await chrome.storage.sync.get(["vividoBaseUrl"]);
  const defaultUrl = storage.vividoBaseUrl || "http://localhost:5173";
  urlInput.value = defaultUrl;

  urlInput.addEventListener("change", () => {
    const val = urlInput.value.trim().replace(/\/$/, "");
    chrome.storage.sync.set({ vividoBaseUrl: val }, () => {
      saveMsg.style.display = "block";
      setTimeout(() => (saveMsg.style.display = "none"), 1800);
    });
  });

  launchAppBtn.addEventListener("click", () => {
    const baseUrl = urlInput.value.trim().replace(/\/$/, "") || "http://localhost:5173";
    chrome.tabs.create({ url: baseUrl });
  });

  openTabBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const baseUrl = urlInput.value.trim().replace(/\/$/, "") || "http://localhost:5173";

    if (tab?.url) {
      chrome.tabs.create({ url: `${baseUrl}/?pdf=${encodeURIComponent(tab.url)}` });
    } else {
      chrome.tabs.create({ url: baseUrl });
    }
  });
});
