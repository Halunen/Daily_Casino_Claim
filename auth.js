(async function () {
  console.log("🔐 auth.js injected");

  const config = window._siteConfig || window.siteConfig;
  if (!config || !config.login) {
    console.warn("⚠️ No login config found");
    window.loginCompleted = true;
    return;
  }

  const {
    buttonSelector,
    usernameSelector,
    passwordSelector,
    submitSelector
  } = config.login;

  const ANTICAPTCHA_KEY = "8c0ef38af3bcd57d3bb8fc8f37137586";
  const PROXY_CONFIG = {
    proxyType: "http",
    proxyAddress: "137.184.88.111",
    proxyPort: 49213,
    proxyLogin: "blueberryrobot",
    proxyPassword: "IcanGetin55"
  };

  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

  const delay = ms => new Promise(res => setTimeout(res, ms));

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start > timeout) return reject(`Timeout waiting for: ${selector}`);
        requestAnimationFrame(check);
      };
      check();
    });
  }

  async function waitForRecaptchaIframe(timeout = 15000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const iframe = Array.from(document.querySelectorAll("iframe"))
          .find(el => el.src.includes("recaptcha") && el.src.includes("k="));
        if (iframe) return resolve(iframe);
        if (Date.now() - start > timeout) return reject("Timed out waiting for reCAPTCHA iframe");
        setTimeout(check, 500);
      };
      check();
    });
  }

  function simulateReactInput(el, value) {
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(el.__proto__, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function simulateClick(el) {
    ["pointerdown", "mousedown", "mouseup", "click"].forEach(type => {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    });
  }

  async function solveCaptchaIfNeeded() {
    try {
      const iframe = await waitForRecaptchaIframe();
      const sitekey = new URL(iframe.src).searchParams.get("k");
      const pageUrl = window.location.href;

      const taskPayload = {
        clientKey: ANTICAPTCHA_KEY,
        task: {
          type: "NoCaptchaTask",
          websiteURL: pageUrl,
          websiteKey: sitekey,
          ...PROXY_CONFIG,
          userAgent: USER_AGENT
        }
      };

      const taskRes = await fetch("https://api.anti-captcha.com/createTask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskPayload)
      });
      const taskJson = await taskRes.json();
      if (!taskJson.taskId) throw new Error(`createTask failed: ${taskJson.errorCode}`);

      const taskId = taskJson.taskId;
      let token = null;
      for (let i = 0; i < 50; i++) {
        await delay(5000);
        const resultRes = await fetch("https://api.anti-captcha.com/getTaskResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientKey: ANTICAPTCHA_KEY, taskId })
        });
        const result = await resultRes.json();
        if (result.status === "ready") {
          token = result.solution.gRecaptchaResponse;
          break;
        }
      }
      if (!token) throw new Error("CAPTCHA token not received");

      const textarea = document.querySelector('textarea[name="g-recaptcha-response"]') || (() => {
        const t = document.createElement("textarea");
        t.name = "g-recaptcha-response";
        t.style.display = "none";
        document.body.appendChild(t);
        return t;
      })();
      textarea.value = token;
      ["input","change","blur"].forEach(type => textarea.dispatchEvent(new Event(type, { bubbles: true })));
      textarea.dispatchEvent(new Event("DOMSubtreeModified", { bubbles: true }));

      // Wait a little before trying to resume
      await delay(3000);

      let resumeFound = null;
      if (window.___grecaptcha_cfg?.clients) {
        Object.values(window.___grecaptcha_cfg.clients).forEach(client => {
          Object.values(client || {}).forEach(obj => {
            Object.values(obj || {}).forEach(prop => {
              if (prop && typeof prop.callback === "function") resumeFound = prop.callback;
            });
          });
        });
      }
      if (typeof resumeFound === "function") {
        resumeFound(textarea.value);
        console.log("✅ CAPTCHA callback executed");
      } else {
        console.warn("❌ No CAPTCHA callback found");
      }

      const submitBtn = document.querySelector(submitSelector) || document.querySelector("button[type='submit']");
      if (submitBtn) {
        simulateClick(submitBtn);
        console.log("🚀 Submit clicked after CAPTCHA");
      } else {
        console.warn("⚠️ Submit button not found after CAPTCHA");
      }

    } catch (err) {
      console.error("❌ CAPTCHA solve error:", err.message || err);
    }
  }

  try {
    if (buttonSelector) {
      const trigger = document.querySelector(buttonSelector);
      if (trigger) {
        simulateClick(trigger);
        console.log(`🟡 Clicked login trigger: ${buttonSelector}`);
        await delay(1000);
      }
    }

    const usernameEl = await waitForElement(usernameSelector);
    const passwordEl = await waitForElement(passwordSelector);
    const submitEl = await waitForElement(submitSelector);

    simulateReactInput(usernameEl, config.username || "");
    await delay(300);
    simulateReactInput(passwordEl, config.password || "");
    await delay(300);
    console.log("✏️ Credentials filled");

    await solveCaptchaIfNeeded();

    if (submitEl && !submitEl.disabled) {
      simulateClick(submitEl);
      console.log("🚀 Login button clicked");
    } else {
      const form = submitEl?.closest("form");
      if (form) {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        console.log("📤 Form submitted manually");
      } else {
        console.error("❌ No form found to submit");
      }
    }

    window.loginCompleted = true;
    console.log("✅ Login process finished");

  } catch (err) {
    console.error("❌ Login script failed:", err);
    window.loginCompleted = false;
  }
})();
