# Usage Meter Companion (Windows)

A small Windows app that shows your **Claude** and **ChatGPT / Codex** plan usage next to the desktop apps:

- **Tray icon:** a ring showing how much of your tightest limit is left, in Claude orange or ChatGPT green. It turns red at 10% or less. Hover it for a one-line summary.
- **Popup:** click the tray icon. It shows the usage panel, with a switch for Claude, ChatGPT, Codex or Both.
- **Both cards:** choose **Show Claude and ChatGPT** (tray menu, mini panel menu or Settings) to see both at once, stacked or side by side. Each card uses that site's settings.
- **Mini panel:** an optional panel you can drag anywhere by its header. The **pin** button in its header turns always on top on or off. Right-click it for more options.

**The panel is the extension's own**, drawn with your extension settings for that site: theme and preset, bar colors and gradients, spacing, compact mode, module order and visibility, hover options, update-time position, and the panel's floating width. Change them under **Customize** in the browser panel; the companion redraws within seconds. Collapsing the panel or a module in the companion only affects the companion. Controls that only make sense in the browser are hidden: drag-to-float, resize, Customize, and module reordering. Links such as **Usage** and **Manage** open in your browser.

It **follows the app in front**: Claude desktop, ChatGPT desktop, Codex, and (optionally) browser windows and terminals whose title shows Claude, ChatGPT or Codex, such as Claude Code. You can pin one app instead in Settings or from the tray menu.

## How it gets your usage

The companion has no login of its own. Usage comes from the **Usage Meter browser extension** (0.5.0 or later), using your existing browser sign-in:

```
claude.ai / chatgpt.com ──▶ extension (browser) ──native messaging──▶ host ──named pipe──▶ companion
```

- When a Claude or ChatGPT tab is open, the extension forwards each update the sidebar panel receives.
- When a site has no open tab, the extension fetches that site's usage itself every few minutes while the companion is running. Your browser needs to be running, but the tabs don't.
- **Refresh** in the companion asks the extension to fetch right away.
- The *host* is a small relay that the browser starts. It is the companion's own executable running in Node mode, so there is nothing extra to install.

Nothing leaves your computer. The extension only contacts claude.ai and chatgpt.com, and the companion makes no network requests.

## Install

1. Update the browser extension to 0.5.0 (it adds the `nativeMessaging` permission) and reload it.
2. Install the companion:
   - **Installer:** run `Usage-Meter-Companion-Setup-<version>.exe`. It installs for your user only, with no admin rights.
   - **Zip:** unzip `Usage-Meter-Companion-<version>-win-x64.zip` anywhere and run `UsageMeterCompanion.exe`.
3. On first start, Settings opens. The companion connects itself to Chrome, Edge, Brave, Chromium, Vivaldi, Opera and Firefox. It finds your copy of the extension in each browser profile automatically.
4. **Reload the extension** (or restart the browser). Within a minute, Settings shows "Connected: Chrome" (or your browser) and usage appears.

If the extension isn't found (Settings says so), open your browser's extensions page, turn on Developer mode, copy the extension's ID and add it under **Extension not found?**. Firefox needs no ID.

The connection is registered again every time the companion starts, so moving the app or the extension folder only needs a restart of both.

## Settings

| Setting | What it does |
| --- | --- |
| Show usage for | Follow the app in front (default), or always Claude, ChatGPT or Codex. Codex and ChatGPT share the same account limits. |
| Also follow browser windows / terminals | Match those windows by title. Turn off if, for example, a document called "Claude notes" switches the panel. |
| Cards | One app, or both Claude and ChatGPT, stacked or side by side. Applies to the mini panel and the popup. The tray tooltip then lists both. |
| Mini panel | Show it, keep it on top (also the pin button and the tray menu), show it only while Claude, ChatGPT or Codex is in front, opacity, and move it back to the corner. |
| Start with Windows | Starts in the tray at sign-in. |

The look comes from the extension, as above. The tray ring follows the extension's **Show remaining plan allowance** setting. "Match site" themes follow Windows' light or dark mode.

Settings, the last usage and extension settings received, and the companion's panel state are stored in `%APPDATA%\Usage Meter Companion`.

## Uninstall

Uninstall from Windows Settings → Apps. That also removes the browser registrations. For the zip version, delete the folder, then remove the `fr.alencar.usage_meter` keys under `HKEY_CURRENT_USER\Software\…\NativeMessagingHosts` (Google\Chrome, Microsoft\Edge, BraveSoftware\Brave-Browser, Chromium, Mozilla) if you want to clean up.

## Build

Requires Node.js 22 or later.

```bash
cd companion
npm install
npm start          # run from source (Windows)
npm test           # unit tests, run on any OS
npm run dist       # on Windows: installer + zip in dist/
```

On Linux or macOS, `npm run dist:cross` builds the zip. The installer needs Windows (or Wine).

## Files

| File | Role |
| --- | --- |
| `src/main.js` | App: tray, popup, mini panel, settings window, following the app in front. |
| `src/bridge.js` | Named-pipe server that browser hosts connect to. |
| `src/host.js` | Native-messaging host: relays between the extension (stdin/stdout) and the app (pipe). Keeps the latest usage while the app isn't running. |
| `src/register.js` | Writes the host launcher and manifests, finds the extension's ID in browser profiles, and registers under `HKEY_CURRENT_USER`. |
| `src/foreground.js` | Reads the window in front (executable and title) via Win32, through koffi. |
| `src/app-match.js` | Maps that window to Claude, ChatGPT or Codex. |
| `src/usage.js` | Turns usage into rows, headline and tooltip. Shared with the pages. |
| `src/icon.js` | Draws the tray ring. |
| `renderer/panel.html`, `embed.js`, `embed-after.js` | Popup and mini panel: run the extension's `content.js` in its embedded mode, feed it settings and usage, and add the pin and the app switch. The packaged app ships `content.js` next to `app.asar`. |
| `renderer/both.*`, `bar.js` | Both cards: one frame per card. The popup's app switch. |
| `renderer/settings.*` | The companion's Settings window. |
| `test/` | Unit tests, including an end-to-end host ↔ app test and the extension's background script with a mocked browser. |

## Caveats

- Claude's and ChatGPT's usage endpoints are undocumented and can change. The companion shows whatever the extension receives.
- Following the app in front relies on executable names (`claude.exe`, `ChatGPT.exe`, `Codex.exe`) and, for browsers and terminals, window titles. A ChatGPT browser tab titled after your conversation, without "ChatGPT" in it, isn't recognized; the panel keeps the last app instead.
- The extension's own background fetch picks your first Claude organization with chat access. With several organizations, an open claude.ai tab reports the one you're using.
