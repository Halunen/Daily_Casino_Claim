let sites = [];
let autoMode = false;
const AUTO_CHECK_INTERVAL = 30 * 1000;
let activeTabId = null;

function logSiteStep(url, message) {
  const now = Date.now();
  const timestamp = new Date(now).toLocaleTimeString();
  const origin = new URL(url).origin;
  const logKey = `${origin}_lastLog`;
  const newEntry = `[${timestamp}] ${message}`;

  chrome.storage.local.get(logKey, data => {
    const previous = data[logKey] || "";
    const updated = `${previous}\n${newEntry}`.trim();
    chrome.storage.local.set({ [logKey]: updated });
  });
}

function storeLastRun(url, logText = "✅ Auto run completed") {
  const now = Date.now();
  chrome.storage.local.set({ [url]: now });
  logSiteStep(url, logText);
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
  // Guarantee config injection before runner loads
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (config) => {
      window._siteConfig = config;
      console.log("📦 Config set in window._siteConfig:", config);
    },
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
          logSiteStep(siteConfig.url, "🔐 Login required, injecting auth.js");
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
                  logSiteStep(siteConfig.url, "✅ Login complete, injecting runner + relay");
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
          logSiteStep(siteConfig.url, "🔓 Already logged in, injecting runner + relay");
          chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            files: ["taskRelay.js", "runner.js"]
          });
        }
      });
    } else {
      logSiteStep(siteConfig.url, "🔓 No login selector configured, injecting runner + relay");
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
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(siteConfig => {
      siteConfig.url = site.url;
      const launch = () => {
        chrome.tabs.update(activeTabId, { url: site.url }, tab => {
          setTimeout(() => {
            logSiteStep(site.url, "▶ Navigated to site");
            injectScripts(tab.id, siteConfig);
            storeLastRun(site.url, "▶ Run started");
          }, 5000);
        });
      };

      if (activeTabId === null) {
        chrome.tabs.create({ url: site.url, active: true }, tab => {
          activeTabId = tab.id;
          setTimeout(() => {
            logSiteStep(site.url, "▶ Opened site in new tab");
            injectScripts(tab.id, siteConfig);
            storeLastRun(site.url, "▶ Run started");
          }, 5000);
        });
      } else {
        launch();
      }
    })
    .catch(err => {
      logSiteStep(site.url, `❌ Config load error: ${err.message}`);
      console.error("❌ Failed to load site config:", err);
    });
}

function processNextSite() {
  if (!autoMode || !Array.isArray(sites) || sites.length === 0) {
    console.warn("⏹ No more sites to process or autoMode off.");
    return;
  }
  const site = sites.shift();
  if (!site || !site.url || !site.config) {
    logSiteStep(site?.url || "unknown", "❌ Invalid site config skipped");
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

// Handle tab closure
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
  }
});

// Interval (while service worker is active)
setInterval(runDueSitesFromSchedule, AUTO_CHECK_INTERVAL);

// Alarm-based scheduling
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("autoRunnerAlarm", { periodInMinutes: 30 });
  console.log("⏰ Auto Runner alarm created (every 30 minutes)");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "autoRunnerAlarm") {
    runDueSitesFromSchedule();
  }
});

// Initial site list
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.command === "START_AUTO") {
    autoMode = true;
    chrome.storage.local.set({ autoRunEnabled: true }, () => {
      filterReadySites(sites).then(readySites => {
        if (!Array.isArray(readySites) || readySites.length === 0) {
          logSiteStep("global", "❌ No ready sites to run.");
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
    else logSiteStep(msg.url, "⚠️ Site not found in list");
  }

  if (msg.command === "LOG_STEP" && msg.url && msg.message) {
    logSiteStep(msg.url, msg.message);
  }
});
