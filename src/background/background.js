function openSettingsPage() {
  chrome.tabs.create({
    url: chrome.runtime.getURL("src/options/options.html")
  });
}


chrome.action.onClicked.addListener(() => {
  openSettingsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return false;
  }

  if (message.type === "OPEN_OPTIONS") {
    openSettingsPage();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
