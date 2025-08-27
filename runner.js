(async function taskRunner() {
  console.log("🛠️ Task runner injected");

  function logStep(msg) {
    console.log(msg); // 👈 echo to console
    try {
      chrome.runtime.sendMessage({
        command: "LOG_STEP",
        url: location.origin,
        message: msg
      });
    } catch (err) {
      console.warn("⚠️ Failed to send LOG_STEP:", err, msg);
    }
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));

  function simulateClick(el) {
    if (!el) {
      logStep("❌ simulateClick called with null element");
      return;
    }
    el.scrollIntoView({ block: "center", inline: "center" });
    const overlay = document.querySelector(".page-overlay");
    if (overlay) overlay.style.pointerEvents = "none";

    ["pointerover","pointermove","pointerdown","pointerup","pointerout"]
      .forEach(type => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true })));

    ["mouseover","mousemove","mousedown","mouseup","click"]
      .forEach(type => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true })));

    logStep("✅ Simulated click executed");
  }

  // --- 1) Wait for login if configured ---
  const hasLoginConfig = !!(window._siteConfig?.login || window.siteConfig?.login);
  if (hasLoginConfig) {
    const loginSel = window._siteConfig?.loginRequiredSelector || window.siteConfig?.loginRequiredSelector;
    logStep("🔒 Waiting for loginCompleted…");
    if (loginSel && !document.querySelector(loginSel)) {
      logStep("ℹ️ loginRequiredSelector not found → skipping login wait");
      window.loginCompleted = true;
    }
    await new Promise(resolve => {
      if (window.loginCompleted) return resolve();
      const iv = setInterval(() => {
        if (window.loginCompleted) {
          clearInterval(iv);
          resolve();
        }
      }, 200);
    });
    logStep("✅ Detected loginCompleted, now running tasks");
  } else {
    logStep("ℹ️ No login config → skipping straight to tasks");
  }

  // --- 2) Load config ---
  let siteConfig = window._siteConfig || window.siteConfig;
  if (!siteConfig) {
    try {
      const resp = await fetch(chrome.runtime.getURL("sites.json"));
      const all = await resp.json();
      const normalize = host => host.replace(/^www\./, "");
      const match = all.find(s =>
        normalize(new URL(s.url).host) === normalize(location.host) &&
        location.pathname.startsWith(new URL(s.url).pathname)
      );
      if (!match) throw new Error("No matching site entry");

      siteConfig = typeof match.config === "string"
        ? await (await fetch(chrome.runtime.getURL("siteConfigs/" + match.config))).json()
        : match.config;

      logStep("✅ Loaded site config via fallback");
    } catch (e) {
      logStep(`❌ Failed to load config: ${e.message}`);
      return;
    }
  }

  if (!siteConfig) {
    logStep("❌ siteConfig is null/undefined after load");
    return;
  }

  logStep(`📦 Runner received siteConfig with ${siteConfig.tasks?.length || 0} tasks`);

  // --- 3) Run tasks ---
  const tasks = siteConfig.tasks || [];
  if (!tasks.length) {
    logStep("⚠️ No tasks defined for this site");
    return;
  }

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const {
      selector, clickType, delay: taskDelay = 0, timeout = 10000,
      textMatch, runIfSelector, runIfNotSelector
    } = task;

    console.group(`▶️ Task #${i + 1}`);

    if (runIfSelector && !document.querySelector(runIfSelector)) {
      logStep(`🔷 Skipping task #${i + 1}: missing runIfSelector`);
      console.groupEnd();
      continue;
    }
    if (runIfNotSelector && document.querySelector(runIfNotSelector)) {
      logStep(`🔷 Skipping task #${i + 1}: runIfNotSelector present`);
      console.groupEnd();
      continue;
    }

    logStep(`🔍 Task #${i + 1} started (selector="${selector}", clickType="${clickType || "default"}")`);

    try {
      const el = await new Promise((resolve, reject) => {
        const start = Date.now();
        (function poll() {
          const nodes = Array.from(document.querySelectorAll(selector));
          let node;
          if (textMatch) {
            node = nodes.find(n => n.textContent.trim().toLowerCase() === textMatch.toLowerCase());
          } else {
            node = nodes[0];
          }
          if (node) return resolve(node);
          if (Date.now() - start > timeout) return reject(new Error(`Timeout waiting for "${selector}"`));
          requestAnimationFrame(poll);
        })();
      });

      logStep(`✅ Task #${i + 1}: element found`);

      try {
        switch (clickType) {
          case "simulate":
            simulateClick(el);
            break;
          case "simulate-parent-svg": {
            const svgParent = el.closest("svg, svg *");
            if (svgParent) simulateClick(svgParent);
            else logStep("❌ No SVG parent found for simulate-parent-svg");
            break;
          }
          case "form-submit":
            el.closest("form")?.submit();
            logStep("✅ Form submitted");
            break;
          case "keyboard":
            el.focus();
            el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, composed: true }));
            el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, composed: true }));
            logStep("✅ Enter key simulated");
            break;
          case "spacebar":
            el.focus();
            el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", keyCode: 32, which: 32, bubbles: true, composed: true }));
            el.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", keyCode: 32, which: 32, bubbles: true, composed: true }));
            logStep("✅ Spacebar key simulated");
            break;
          case "canvasCenter": {
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const opts = { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: "mouse" };
            el.dispatchEvent(new PointerEvent("pointerdown", opts));
            el.dispatchEvent(new PointerEvent("pointerup", opts));
            el.dispatchEvent(new MouseEvent("click", opts));
            logStep(`✅ canvasCenter click at ${x},${y}`);
            break;
          }
          default:
            el.click();
            logStep("✅ Default click executed");
        }
      } catch (clickErr) {
        logStep(`❌ Task #${i + 1} click failed: ${clickErr.message}`);
      }

      if (taskDelay > 0) {
        logStep(`⏳ Waiting ${taskDelay}ms before next task`);
        await delay(taskDelay);
      }

      logStep(`🏁 Task #${i + 1} completed`);
    } catch (err) {
      logStep(`❌ Task #${i + 1} failed: ${err.message}`);
    }

    console.groupEnd();
  }

  logStep("🏁 All tasks complete");
  window.runnerCompleted = true;

  // ✅ Final run-completion log
  try {
    chrome.runtime.sendMessage({
      command: "STORE_LAST_RUN",
      url: location.origin,
      message: "✅ All tasks completed"
    });
  } catch (err) {
    logStep(`⚠️ Logging error in runner.js: ${err.message}`);
  }
})();
