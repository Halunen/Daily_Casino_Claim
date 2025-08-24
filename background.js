const AUTO_CHECK_INTERVAL = 60 * 1000; // Every 1 minute

function logDebug(message) {
  const timestamp = new Date().toLocaleTimeString();
  chrome.storage.local.get({ debugLog: [] }, (data) => {
    const updated = [...data.debugLog.slice(-100), `[${timestamp}] ${message}`];
    chrome.storage.local.set({ debugLog: updated });
  });
}

function isDue(lastRun, intervalMinutes) {
  const now = Date.now();
  return now - lastRun >= intervalMinutes * 60 * 1000;
}

function runDueSites() {
  logDebug("[AUTO] Scheduler triggered");

  chrome.storage.local.get(["autoRunEnabled"], (storedToggle) => {
    const enabled = storedToggle.autoRunEnabled;
    logDebug(`[AUTO] Auto-run enabled? ${enabled}`);

    if (!enabled) return;

    fetch(chrome.runtime.getURL("sites.json"))
      .then(res => res.json())
      .then(sites => {
        chrome.storage.local.get(null, (stored) => {
          const now = Date.now();
          let ranAtLeastOne = false;

          sites.forEach(site => {
            if (!site.url) {
              logDebug("[AUTO] Skipping invalid site entry");
              return;
            }

            const lastRun = stored[site.url] || 0;
            const interval = site.intervalMinutes || 1440;

            if (isDue(lastRun, interval)) {
              logDebug(`[AUTO] Due — running ${site.url}`);
              ranAtLeastOne = true;
              chrome.runtime.sendMessage({ command: "RUN_SITE", url: site.url });
            } else {
              logDebug(`[AUTO] Not due: ${site.url}`);
            }
          });

          if (!ranAtLeastOne) {
            logDebug("[AUTO] No sites were due at this check.");
          }
        });
      })
      .catch(err => {
        logDebug("❌ Failed to fetch sites.json in auto scheduler");
      });
  });
}

setInterval(runDueSites, AUTO_CHECK_INTERVAL);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "RUN_SITE" && message.url) {
    logDebug(`[BG] Launching site: ${message.url}`);

    chrome.tabs.create({ url: message.url }, (tab) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["controller.js"]
      });
    });
  }
});
