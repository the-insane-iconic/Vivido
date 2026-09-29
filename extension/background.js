// Vivido Background Service Worker (Manifest V3)
chrome.runtime.onInstalled.addListener(() => {
  // Context Menu for right-clicking any PDF link
  chrome.contextMenus.create({
    id: "open-in-vivido",
    title: "Read in Vivido with Visual Companion",
    contexts: ["link", "page"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const targetUrl = info.linkUrl || info.pageUrl || tab?.url;
  const storage = await chrome.storage.sync.get(["vividoBaseUrl"]);
  const baseUrl = storage.vividoBaseUrl || "http://localhost:5173";

  if (targetUrl) {
    const launchUrl = `${baseUrl}/?pdf=${encodeURIComponent(targetUrl)}`;
    chrome.tabs.create({ url: launchUrl });
  } else {
    chrome.tabs.create({ url: baseUrl });
  }
});
