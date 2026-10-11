let deferredInstallPrompt = null;

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function showInstallMessage(message) {
  const messageElement = document.getElementById("installAppMessage");
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.hidden = false;
}

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const installButton = document.getElementById("installAppBtn");
  if (installButton) installButton.hidden = true;
  showInstallMessage("Billionaire Mindset Events has been installed on this device.");
});

document.addEventListener("DOMContentLoaded", () => {
  const installButton = document.getElementById("installAppBtn");
  if (!installButton) return;

  if (isAppInstalled()) {
    installButton.hidden = true;
    return;
  }

  installButton.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (choice.outcome === "accepted") {
        installButton.hidden = true;
        showInstallMessage("Installing Billionaire Mindset Events…");
      } else {
        showInstallMessage("You can install the app any time from your browser menu.");
      }
      return;
    }

    const isIphoneOrIpad = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIphoneOrIpad) {
      showInstallMessage("On your iPhone or iPad, open this page in Safari, tap Share, choose Add to Home Screen, turn on Open as Web App, then tap Add.");
    } else {
      showInstallMessage("If your browser supports installation, open its menu and choose Install app or Add to Home screen.");
    }
  });
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
      .catch(error => console.error("App installation support could not be prepared.", error));
  });
}
