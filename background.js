// drop a tab's cached sizes when the tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove("tab-" + tabId);
});
