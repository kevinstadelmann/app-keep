# Install Keep on Android, without publishing it

Keep is a local-first progressive web app. After one successful setup, its screens, icons, goal, entries, history, undo, and backup tools work without internet or a running PC. There are no external fonts, analytics, API calls, accounts, or cloud storage.

## One-time USB setup

An ordinary `http://192.168…` Wi-Fi URL can preview the design but cannot install the offline worker. Android Chrome requires HTTPS or localhost. Use Chrome's USB port forwarding to make your PC's localhost available on your phone:

1. Open PowerShell in `C:\Users\Kevin\Documents\ChatGPT\not-spending-app` and run `python -m http.server 5174 --bind 127.0.0.1`. If the existing preview is still running on port 5174, use it.
2. On Android, enable Developer options and USB debugging. Connect your phone by USB and approve your own PC's debugging prompt.
3. On the PC, open Chrome and enter `chrome://inspect/#devices`. Enable **Discover USB devices**. Select **Port forwarding**, map device port `5174` to `localhost:5174`, and enable forwarding.
4. On the phone, open Chrome (not an incognito tab) and visit `http://localhost:5174`.
5. In Keep, select **My goal** and wait for **Offline ready**. Select **Install Keep** if offered, or Chrome's menu → **Add to Home screen** → **Install**. If Chrome offers only a shortcut, keep the page open briefly and check again.
6. Launch Keep from the home screen. Disconnect USB, enable airplane mode, close and reopen Keep, and add a small test entry. Your goal and entries should still work. You can stop the PC server and disable USB debugging after setup.

If Android platform-tools are already installed, `adb reverse tcp:5174 tcp:5174` is an alternative to Chrome's port-forwarding dialog.

Chrome's documented USB setup: https://developer.chrome.com/docs/devtools/remote-debugging/local-server
Installation requirements: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable

## Storage and backups

- Goal and entries live in this device's browser storage (`localStorage`, key `keep-design-v1`). The service worker's Cache Storage holds app files only.
- New devices start with no demo transactions. Existing preview data on the same address is preserved, including any earlier demo entries.
- Different hosts, ports, devices, or browser profiles have separate data. Keep using the installation address. Export a backup before changing addresses.
- Under **My goal**, use **Export backup** to save a JSON file on your phone and **Restore backup** to import it offline. Restore explicitly asks before replacing existing entries.
- **Protect device storage** requests persistent storage when the browser supports it. The browser decides whether to grant it. It cannot prevent deliberate deletion of browser/app data. Export backups for anything you want to preserve.
- No data is uploaded. Exported files follow the storage location you choose; choose local Downloads if you do not want cloud backups.

## Updates

To receive a later version, reconnect through the same localhost port and reopen Keep while the server is running. If it says **Update ready**, close all Keep browser tabs and app windows, then reopen. Updates replace app files and preserve your entries. Developers must bump the cache version in `sw.js` for every release that changes bundled files.

The app can also be installed from a stable HTTPS host. That is optional and is not configured by this local setup. Your entries still stay on your device.

## Verification

`node --check app.js`, `node --check pwa.js`, and `node --check sw.js` check syntax. Install the dev dependency with `npm install`, then run `npm test` with desktop Chrome available. The browser test uses an isolated temporary profile, verifies Chrome installability, stops its server, restarts the browser offline, and exercises persistence, edits, backup/restore, and storage failure. Test files live in ignored `test-results/`. A physical Android installation still needs the one-time steps above.
