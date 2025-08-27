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
    submitSelector,
    delays = {},
    solveCaptcha = true   // 👈 new: toggle (default true)
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
    console.log(`🔎 Waiting for element: ${selector} (timeout ${timeout}ms)`);
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const el = document.querySelector(selector);
        if (el) {
          console.log(`✅ Found element: ${selector}`);
          return resolve(el);
        }
        if (Date.now() - start > timeout) {
          console.error(`⏱ Timeout waiting for: ${selector}`);
          return reject(`Timeout waiting for: ${selector}`);
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  async function waitForRecaptchaIframe(timeout = 15000) {
    console.log("🔎 Waiting for reCAPTCHA iframe...");
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const iframe = Array.from(document.querySelectorAll("iframe"))
          .find(el => el.src.includes("recaptcha") && el.src.includes("k="));
        if (iframe) {
          console.log("✅ Found reCAPTCHA iframe");
          return resolve(iframe);
        }
        if (Date.now() - start > timeout) {
          console.error("⏱ Timed out waiting for reCAPTCHA iframe");
          return reject("Timed out waiting for reCAPTCHA iframe");
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  function simulateReactInput(el, value) {
    console.log(`⌨️ Simulating input on ${el.tagName}[type=${el.type}] with value: ${value}`);
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(el.__proto__, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    console.log("✅ Input simulated");
  }

  function simulateClick(el) {
    console.log(`🖱 Simulating click on ${el.tagName}${el.type ? `[type=${el.type}]` : ""}`);
    ["pointerdown", "mousedown", "mouseup", "click"].forEach(type => {
      el.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    });
    console.log("✅ Click simulated");
  }

  async function solveCaptchaIfNeeded() {
    try {
      const iframe = await waitForRecaptchaIframe();
      const sitekey = new URL(iframe.src).searchParams.get("k");
      console.log(`🤖 Solving CAPTCHA with sitekey: ${sitekey}`);
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
      console.log(`🟡 CAPTCHA task created, id: ${taskId}`);

      let token = null;
      for (let i = 0; i < 50; i++) {
        console.log(`⏳ Polling for CAPTCHA result... attempt ${i + 1}`);
        await delay(5000);
        const resultRes = await fetch("https://api.anti-captcha.com/getTaskResult", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientKey: ANTICAPTCHA_KEY, taskId })
        });
        const result = await resultRes.json();
        if (result.status === "ready") {
          token = result.solution.gRecaptchaResponse;
          console.log("✅ CAPTCHA token received");
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
      console.log("✅ CAPTCHA token injected");

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
      console.log(`🔎 Looking for login trigger: ${buttonSelector}`);
      const trigger = document.querySelector(buttonSelector);
      if (trigger) {
        simulateClick(trigger);
        console.log(`🟡 Clicked login trigger: ${buttonSelector}`);
        await delay(delays.afterClick || 1000);
        console.log(`⏳ Delay after click: ${delays.afterClick || 1000}ms`);
      } else {
        console.warn(`⚠️ Login trigger not found: ${buttonSelector}`);
      }
    }

    const usernameEl = await waitForElement(usernameSelector);
    const passwordEl = await waitForElement(passwordSelector);
    const submitEl   = await waitForElement(submitSelector);

    simulateReactInput(usernameEl, config.username || "");
    await delay(delays.afterUsername || 300);
    console.log(`⏳ Delay after username: ${delays.afterUsername || 300}ms`);

    simulateReactInput(passwordEl, config.password || "");
    await delay(delays.afterPassword || 300);
    console.log(`⏳ Delay after password: ${delays.afterPassword || 300}ms`);
    console.log("✏️ Credentials filled");

    if (solveCaptcha) {
      console.log("🤖 CAPTCHA solving is ENABLED");
      await solveCaptchaIfNeeded();
    } else {
      console.log("⏩ CAPTCHA solving is DISABLED, skipping...");
    }

    console.log("🖱 Attempting to click Sign In button...");
    if (submitEl && !submitEl.disabled) {
      simulateClick(submitEl);
      console.log("🚀 Login button clicked");
    } else {
      console.warn("⚠️ Submit button disabled, trying form submit fallback");
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
