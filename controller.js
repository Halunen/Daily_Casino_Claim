let sites = [];
let autoMode = false;
const AUTO_CHECK_INTERVAL = 30 * 1000;
let activeTabId = null;

function storeLastRun(url, logText = "✅ Auto run completed") {
  const now = Date.now();
  const timestamp = new Date(now).toLocaleTimeString();
  const origin = new URL(url).origin;
  const logKey = `${origin}_lastLog`;
  const entry = `[${timestamp}] ${logText}`;

  chrome.storage.local.set({ [url]: now });
  chrome.storage.local.get(logKey, data => {
    const previous = data[logKey] || "";
    const updated = `${previous}\n${entry}`.trim();
    chrome.storage.local.set({ [logKey]: updated });
  });
}

function logDebug(message) {
  const timestamp = new Date().toLocaleTimeString();
  chrome.storage.local.get({ debugLog: [] }, data => {
    const updated = [...data.debugLog.slice(-100), `[${timestamp}] ${message}`];
    chrome.storage.local.set({ debugLog: updated });
  });
}

function filterReadySites(siteList) {
  return new Promise(resolve => {
    chrome.storage.local.get(null, stored => {
      const now = Date.now();
      const readySites = Array.isArray(siteList)
        ? siteList.filter(site => {
            const lastRun = stored[site.url] || 0;
            return ((now - lastRun) / 60000) >= site.intervalMinutes;
          })
        : [];
      resolve(readySites);
    });
  });
}

function injectScripts(tabId, siteConfig) {
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: config => { window._siteConfig = config; },
    args: [siteConfig]
  }, () => {
    const loginSel = siteConfig.loginRequiredSelector;
    if (loginSel) {
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: sel => !!document.querySelector(sel),
        args: [loginSel]
      }, ([{ result: isLoggedOut }]) => {
        if (isLoggedOut) {
          console.log("🔐 Login required → injecting auth.js");
          chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            files: ["auth.js"]
          }, () => {
            const iv = setInterval(() => {
              chrome.scripting.executeScript({
                target: { tabId },
                world: 'MAIN',
                func: () => window.loginCompleted === true
              }, ([res]) => {
                if (res?.result) {
                  clearInterval(iv);
                  console.log("✅ Login complete → injecting runner + relay");
                  chrome.scripting.executeScript({
                    target: { tabId },
                    world: 'MAIN',
                    files: ["taskRelay.js", "runner.js"]
                  });
                }
              });
            }, 500);
          });
        } else {
          console.log("🔓 Login selector not found → injecting runner + relay");
          chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            files: ["taskRelay.js", "runner.js"]
          });
        }
      });
    } else {
      console.log("🔓 No login selector configured → injecting runner + relay");
      chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        files: ["taskRelay.js", "runner.js"]
      });
    }
  });
}

function runSite(site) {
  fetch(chrome.runtime.getURL("siteConfigs/" + site.config))
    .then(res => res.json())
    .then(siteConfig => {
      const launch = () => {
        chrome.tabs.update(activeTabId, { url: site.url }, tab => {
          setTimeout(() => {
            injectScripts(tab.id, siteConfig);
            storeLastRun(site.url, "✅ Manual or Auto run started");
          }, 5000);
        });
      };

      if (activeTabId === null) {
        chrome.tabs.create({ url: site.url, active: true }, tab => {
          activeTabId = tab.id;
          setTimeout(() => {
            injectScripts(tab.id, siteConfig);
            storeLastRun(site.url, "✅ Manual or Auto run started");
          }, 5000);
        });
      } else {
        launch();
      }
    })
    .catch(err => console.error("❌ Failed to load site config:", err));
}

function processNextSite() {
  if (!autoMode || !Array.isArray(sites) || sites.length === 0) {
    console.warn("⏹ No more sites to process or autoMode off.");
    return;
  }
  const site = sites.shift();
  if (!site || !site.url || !site.config) {
    console.error("❌ Invalid site config skipped:", site);
    processNextSite();
    return;
  }
  runSite(site);
}

function runDueSitesFromSchedule() {
  logDebug("[AUTO] Scheduler triggered");
  chrome.storage.local.get("autoRunEnabled", (data) => {
    if (!data.autoRunEnabled) {
      logDebug("[AUTO] Skipped — autoRunEnabled is false");
      return;
    }

    filterReadySites(sites).then(readySites => {
      if (!Array.isArray(readySites) || readySites.length === 0) {
        logDebug("[AUTO] No sites are due.");
        return;
      }

      logDebug(`[AUTO] ${readySites.length} site(s) due — starting run...`);
      autoMode = true;
      sites = readySites;
      processNextSite();
    }).catch(err => {
      logDebug(`❌ Error filtering ready sites: ${err.message}`);
    });
  });
}

// Handle tab closure (optional but safe)
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
  }
});

// Start background interval
setInterval(runDueSitesFromSchedule, AUTO_CHECK_INTERVAL);
console.log("⏱ Auto scheduler started.");

// Initial site list load
fetch(chrome.runtime.getURL("sites.json"))
  .then(res => res.json())
  .then(data => {
    if (!Array.isArray(data)) {
      console.error("❌ sites.json is not an array:", data);
      return;
    }
    sites = data;
    console.log("📦 Site list loaded, waiting for user or auto scheduler...");
  })
  .catch(err => console.error("❌ Failed to load sites.json:", err));

chrome.runtime.onInstalled.addListener(() => {
  console.log("🔁 Extension installed or updated.");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.command === "START_AUTO") {
    autoMode = true;
    chrome.storage.local.set({ autoRunEnabled: true }, () => {
      filterReadySites(sites).then(readySites => {
        if (!Array.isArray(readySites) || readySites.length === 0) {
          console.warn("❌ No ready sites to run.");
          return;
        }
        sites = readySites;
        processNextSite();
      }).catch(err => {
        console.error("❌ Error filtering sites:", err);
      });
    });
  }

  if (msg.command === "STOP_AUTO") {
    autoMode = false;
    chrome.storage.local.set({ autoRunEnabled: false });
  }

  if (msg.command === "RUN_SITE") {
    const site = sites.find(s => s.url === msg.url);
    if (site) runSite(site);
    else console.warn("⚠️ Site not found in list:", msg.url);
  }
});
