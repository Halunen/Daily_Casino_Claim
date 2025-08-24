(function () {
  const checkCompletion = setInterval(() => {
    if (window.runnerCompleted === true) {
      clearInterval(checkCompletion);

      // ✅ Notify background script of actual task finish
      chrome.runtime.sendMessage({
        command: "STORE_LAST_RUN",
        url: location.origin,
        message: "✅ Task finished"
      });
    }
  }, 1000);
})();
