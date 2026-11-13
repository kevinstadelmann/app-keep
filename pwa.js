(() => {
  const status = document.querySelector('#offline-status');
  const install = document.querySelector('#install-app');
  const help = document.querySelector('#install-help');
  let promptEvent;
  let ready = false;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function updateInstall() {
    install.hidden = !ready || !promptEvent || standalone();
    const apple = /iPhone|iPad|iPod/.test(navigator.userAgent);
    help.textContent = standalone() ? 'Keep is installed on this device.' : apple ? 'In Safari, tap the Share button, then “Add to Home Screen”.' : 'In Android Chrome, use the menu → Add to Home screen → Install. If you only see a shortcut, wait for “Offline ready” and try again.';
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event; updateInstall();
  });
  install.addEventListener('click', async () => {
    if (!promptEvent) return;
    const pending = promptEvent;
    promptEvent = null; updateInstall();
    try { await pending.prompt(); await pending.userChoice; } catch { /* Chrome menu remains available. */ }
  });
  window.addEventListener('appinstalled', () => {promptEvent = null; updateInstall();});
  updateInstall();
  // Inside the Android APK every file is bundled, so there is nothing to install or cache.
  const native = !!window.KeepAndroid;
  if (native) {
    status.textContent = 'Offline ready · Your data stays on this device';
    help.textContent = 'Keep is installed as an Android app and needs no connection.';
  } else if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    status.textContent = 'Offline installation needs HTTPS or localhost.';
    help.textContent = 'An ordinary Wi-Fi IP address cannot enable offline installation. Use the USB localhost setup in INSTALL.md, or an HTTPS host.';
    return;
  }
  if (!native) (async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      const checkReady = async () => {
        if (!registration.active || !navigator.serviceWorker.controller) return;
        ready = true;
        status.textContent = 'Offline ready · Your data stays on this device';
        updateInstall();
      };
      navigator.serviceWorker.addEventListener('controllerchange', checkReady);
      await checkReady();
      const watch = () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant' && !ready) status.textContent = 'Offline setup failed. Reconnect and reopen Keep to retry.';
          if (worker.state === 'installed' && registration.waiting) status.textContent = 'Update ready · Close all Keep windows and reopen';
        });
      };
      registration.addEventListener('updatefound', watch); watch();
      if (registration.waiting) status.textContent = 'Update ready · Close all Keep windows and reopen';
    } catch {
      status.textContent = 'Offline setup failed. Reconnect and reopen Keep to retry.';
    }
  })();
  document.querySelector('#protect-data').addEventListener('click', async () => {
    const message = document.querySelector('#storage-status');
    try {
      const granted = await navigator.storage?.persist?.();
      message.textContent = granted ? 'Storage protection enabled. Clearing app or browser data still removes your entries.' : 'Your browser manages storage protection. Keep a backup of entries you want to preserve.';
    } catch {message.textContent = 'Storage protection is unavailable. You can still export a backup.';}
  });
})();
