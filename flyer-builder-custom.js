(function () {
  var bootLog = window.__PT_LOG_BOOT || function () {};
  bootLog("CUSTOM BOOTSTRAP SCRIPT START");
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for (var i = 0; i < registrations.length; i++) {
        registrations[i].unregister();
      }
    });
  }

  function start() {
    bootLog("CUSTOM BOOTSTRAP START");
    if (!window.PromotionTool || typeof window.PromotionTool.createFlyerBuilder !== "function") {
      window.__PT_RENDER_BOOT_ERROR("CUSTOM BOOTSTRAP FAILED", new Error("PromotionTool global is missing."));
      return;
    }
    try {
      window.__PROMOTION_TOOL_APP = window.PromotionTool.createFlyerBuilder({
        mode: "custom",
        allowPresetSave: true,
        allowPresetLoad: true
      });
      bootLog("CUSTOM BUILDER STARTED");
    } catch (error) {
      window.__PT_RENDER_BOOT_ERROR("CUSTOM INIT FAILED", error);
      throw error;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
