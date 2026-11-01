# Usage Meter Companion (Windows)

A small Windows app that shows your **Claude** and **ChatGPT / Codex** plan usage next to the desktop apps:

- **Tray icon:** a ring showing how much of your tightest limit is left, in Claude orange or ChatGPT green. It turns red at 10% or less. Hover it for a one-line summary.
- **Popup:** click the tray icon. It shows every limit with its reset time, extra usage or credits, and a switch to look at the other app.
- **Mini panel:** an optional always-on-top panel you can drag anywhere. Right-click it for options.

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
| Bars show | What's left (default) or what's used. Also applies to the tray ring. |
| Per-model limits | Show limits such as Opus weekly. |
| Mini panel | Show it, keep it on top, show it only while Claude, ChatGPT or Codex is in front, opacity, and move it back to the corner. |
| Start with Windows | Starts in the tray at sign-in. |
| Theme | Match Windows, light or dark. |

Settings and the last usage received are stored in `%APPDATA%\Usage Meter Companion`.

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
| `renderer/` | Popup / mini panel page and the settings page. |
| `test/` | Unit tests, including an end-to-end host ↔ app test and the extension's background script with a mocked browser. |

## Caveats

- Claude's and ChatGPT's usage endpoints are undocumented and can change. The companion shows whatever the extension receives.
- Following the app in front relies on executable names (`claude.exe`, `ChatGPT.exe`, `Codex.exe`) and, for browsers and terminals, window titles. A ChatGPT browser tab titled after your conversation, without "ChatGPT" in it, isn't recognized; the panel keeps the last app instead.
- The extension's own background fetch picks your first Claude organization with chat access. With several organizations, an open claude.ai tab reports the one you're using.
