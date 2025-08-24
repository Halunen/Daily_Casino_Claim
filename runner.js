(async function taskRunner() {
  console.log("🛠️ Task runner injected");

  const delay = ms => new Promise(r => setTimeout(r, ms));

  function simulateClick(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const overlay = document.querySelector('.page-overlay');
    if (overlay) overlay.style.pointerEvents = 'none';
    ['pointerover','pointermove','pointerdown','pointerup','pointerout'].forEach(type =>
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true }))
    );
    ['mouseover','mousemove','mousedown','mouseup','click'].forEach(type =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true }))
    );
  }

  // 1) Wait for login if configured
  const hasLoginConfig = !!(window._siteConfig?.login || window.siteConfig?.login);
  if (hasLoginConfig) {
    const loginSel = window._siteConfig?.loginRequiredSelector || window.siteConfig?.loginRequiredSelector;
    console.log("🔒 Waiting for loginCompleted…");
    if (loginSel && !document.querySelector(loginSel)) {
      console.log("ℹ️ loginRequiredSelector not found → skipping login wait");
      window.loginCompleted = true;
    }
    await new Promise(resolve => {
      if (window.loginCompleted) return resolve();
      const iv = setInterval(() => {
        if (window.loginCompleted) { clearInterval(iv); resolve(); }
      }, 200);
    });
    console.log("✅ Detected loginCompleted, now running tasks");
  } else {
    console.log("ℹ️ No login config → skipping straight to tasks");
  }

  // 2) Load config
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
      siteConfig = typeof match.config === 'string'
        ? await (await fetch(chrome.runtime.getURL(match.config))).json()
        : match.config;
    } catch (e) {
      console.error("❌ Failed to load config:", e);
      return;
    }
  }

  // 3) Run tasks
  const tasks = siteConfig.tasks || [];
  if (!tasks.length) {
    console.warn("⚠️ No tasks defined for this site.");
    return;
  }

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const {
      selector, clickType, delay: taskDelay = 0, timeout = 10000,
      textMatch, runIfSelector, runIfNotSelector
    } = task;

    if (runIfSelector && !document.querySelector(runIfSelector)) {
      console.log(`🔷 Skipping task #${i + 1}: "${selector}" (missing runIfSelector)`);
      continue;
    }
    if (runIfNotSelector && document.querySelector(runIfNotSelector)) {
      console.log(`🔷 Skipping task #${i + 1}: "${selector}" (present runIfNotSelector)`);
      continue;
    }

    console.group(`🔍 Task #${i + 1}: selector="${selector}" clickType="${clickType || 'default'}" textMatch="${textMatch || ''}"`);
    console.time(`⏱️ Task #${i + 1} total`);

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

      console.log('   - Element found:', el);
      console.log(`   - Attempting clickType='${clickType || 'default'}'`);

      try {
        switch (clickType) {
          case 'simulate':
            simulateClick(el);
            break;
          case 'simulate-parent-svg': {
            const svgParent = el.closest('svg, svg *');
            if (svgParent) simulateClick(svgParent);
            break;
          }
          case 'form-submit':
            el.closest('form')?.submit();
            break;
          case 'keyboard':
            el.focus();
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, composed: true }));
            break;
          case 'canvasCenter': {
            const rect = el.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const opts = { view: window, bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType: 'mouse' };
            console.log(`🎯 canvasCenter dispatch at ${x},${y}`);
            el.dispatchEvent(new PointerEvent('pointerdown', opts));
            el.dispatchEvent(new PointerEvent('pointerup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
            break;
          }
          default:
            el.click();
        }
        console.log('   ✅ Click succeeded');
      } catch (clickErr) {
        console.error('   ❌ Click failed:', clickErr);
      }

      if (taskDelay > 0) {
        console.log(`   - Waiting ${taskDelay}ms before next task`);
        await delay(taskDelay);
      }

      console.timeEnd(`⏱️ Task #${i + 1} total`);
    } catch (err) {
      console.error(`   ❌ Task #${i + 1} failed:`, err);
      console.timeEnd(`⏱️ Task #${i + 1} total`);
    }

    console.groupEnd();
  }

  console.log('🏁 All tasks complete');

  // ✅ Final run-completion log
  try {
    const origin = location.origin;
    const message = "✅ All tasks completed";
    if (typeof window.storeLastRun === "function") {
      await window.storeLastRun(origin, message);
    } else {
      chrome.runtime.sendMessage({ command: "STORE_LAST_RUN", url: origin, message });
    }
  } catch (err) {
    console.error("⚠️ Logging error in runner.js:", err);
  }

})();
