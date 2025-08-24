let sites = [];

function loadSites() {
  fetch(chrome.runtime.getURL("sites.json"))
    .then(res => {
      if (!res.ok) throw new Error("Failed to fetch sites.json");
      return res.json();
    })
    .then(data => {
      sites = data;

      const selector = document.getElementById("siteSelector");
      selector.innerHTML = "";
      data.forEach(site => {
        const option = document.createElement("option");
        option.value = site.url;
        option.textContent = site.url;
        selector.appendChild(option);
      });

      chrome.storage.local.get(null, stored => {
        const now = Date.now();
        const statusDiv = document.getElementById("status");
        statusDiv.innerHTML = data.map(site => {
          const last = stored[site.url] || 0;
          const minsAgo = last ? ((now - last) / 60000).toFixed(1) : "Never";
          const lastFormatted = last ? new Date(last).toLocaleString() : "Never";

          const logKey = `${new URL(site.url).origin}_lastLog`;
          const log = stored[logKey] || "(no log)";

          const interval = site.intervalMinutes || 1440;
          const nextRun = last + interval * 60 * 1000;
          const timeUntilNext = nextRun - now;
          const due = timeUntilNext <= 0;
          const nextRunDisplay = due
            ? "<span style='color:red'>Now</span>"
            : `in ${Math.ceil(timeUntilNext / 60000)} min`;

          return `
            <div class="site-status">
              <strong>${site.url}</strong><br>
              Last completed: ${minsAgo} min ago<br>
              Last run time: ${lastFormatted}<br>
              Next run: ${nextRunDisplay}<br>
              <pre style="background:#eee;padding:5px;border-radius:4px;overflow-x:auto;">${log}</pre>
            </div>
          `;
        }).join("");
      });

      // Load debug log
      chrome.storage.local.get("debugLog", (data) => {
        const log = data.debugLog || [];
        const debugDiv = document.getElementById("debugLog");
        if (debugDiv) {
          debugDiv.innerHTML = log.slice().reverse().map(line => `<div>${line}</div>`).join("");
        }
      });
    })
    .catch(err => {
      console.error("❌ Failed to load or parse sites.json:", err);
      const statusDiv = document.getElementById("status");
      if (statusDiv) statusDiv.textContent = "⚠ Failed to load site list.";
    });
}

document.getElementById("runSelected").addEventListener("click", () => {
  const url = document.getElementById("siteSelector").value;
  if (url) {
    chrome.runtime.sendMessage({ command: "RUN_SITE", url });
  } else {
    alert("Please select a site.");
  }
});

document.getElementById("toggleAuto").addEventListener("click", () => {
  chrome.storage.local.get("autoRunEnabled", (data) => {
    const enabled = data.autoRunEnabled;
    const newState = !enabled;

    chrome.storage.local.set({ autoRunEnabled: newState }, () => {
      document.getElementById("toggleAuto").textContent = newState
        ? "⏹ Stop Auto Mode"
        : "▶ Start Auto Mode";
    });
  });
});

chrome.storage.local.get("autoRunEnabled", (data) => {
  const enabled = data.autoRunEnabled;
  document.getElementById("toggleAuto").textContent = enabled
    ? "⏹ Stop Auto Mode"
    : "▶ Start Auto Mode";
});

document.getElementById("downloadLog").addEventListener("click", () => {
  chrome.storage.local.get("log", (data) => {
    const log = data.log || "";
    const blob = new Blob([log], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: "task-log.txt", saveAs: true });
  });
});

document.getElementById("resetTimestamps").addEventListener("click", () => {
  chrome.storage.local.clear(() => {
    alert("Timestamps and log reset.");
    loadSites();
  });
});

document.getElementById("clearDebugLog").addEventListener("click", () => {
  chrome.storage.local.set({ debugLog: [] }, () => {
    document.getElementById("debugLog").innerHTML = "";
  });
});

// ✅ Fix: Log to the currently selected site
document.getElementById("testLogger").addEventListener("click", () => {
  const selector = document.getElementById("siteSelector");
  const selectedUrl = selector.options[selector.selectedIndex]?.value;
  if (!selectedUrl) return alert("Select a site first");

  const now = Date.now();
  const timestamp = new Date(now).toLocaleTimeString();
  const origin = new URL(selectedUrl).origin;
  const logKey = `${origin}_lastLog`;
  const newLog = `[${timestamp}] ✅ Manual test run`;

  chrome.storage.local.set({ [selectedUrl]: now });

  chrome.storage.local.get(logKey, data => {
    const previous = data[logKey] || "";
    const updated = `${previous}\n${newLog}`.trim();
    chrome.storage.local.set({ [logKey]: updated }, () => {
      loadSites();
    });
  });
});

loadSites();
