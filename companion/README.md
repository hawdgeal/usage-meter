# Usage Meter Companion (Windows)

A small Windows app that shows your **Claude** and **ChatGPT / Codex** plan usage next to the desktop apps:

- **Tray icon:** a ring showing how much of your tightest limit is left, in Claude orange or ChatGPT green. It turns red at 10% or less. Hover it for a one-line summary. Click it (or **Show usage** in its menu) to bring up the cards: it turns them on if they were off and brings them above everything until you next switch to one of the apps. Its menu also has **Show cards**, **Refresh**, **Settings…**, an update when one is out, and **Quit**.
- **Cards:** a card for Claude and one for ChatGPT (each with its own tray icon), one card that follows the app in front, or both in one panel, stacked or side by side (Settings → Cards). Each card uses that site's settings.
- **Where each card sits:** one choice per card, from the button on the card, its right-click menu, or Settings → Cards:
  - **Floating:** a window of its own you drag anywhere. **Keep on top of other windows** keeps it above everything.
  - **On top of its app:** just above its own desktop app's window (Claude, ChatGPT; the ChatGPT card also covers Codex), never a browser or terminal window, and hidden while the app is minimized or closed. Windows in front of the app cover it too. This also works when the apps are grouped into tabs with Groupy, WindowTabs or TidyTabs. With **Move with its app**, the card keeps its place on the app's window (from its nearest corner) when you move or resize the window; drag the card to change its place.
  - **In its app's sidebar:** laid flat into the sidebar, as wide as it, at its bottom (in Claude just above your name; in ChatGPT over the "Getting started" box), in the sidebar's own colors with a divider on top. It follows the sidebar when you resize it or the window, and hides while the sidebar is closed or a menu or dialog opens over it. Not for two cards in one panel. The companion finds the sidebar by looking at the app's window, so an app redesign can throw it off.
  - **In Claude's session rail** (the Claude card only): the same, in the panel on the right of Claude's window, at its bottom. It hides while you hide the rail.

  When you click in the app right next to a card on its app, or on your name (Claude) or picture (ChatGPT) under a docked card, the card fades and lets clicks through so the menu can open over it.
- **Size:** drag a card's left or right edge for its width (240–720 px), and its bottom edge (top edge when docked) for its height; the content scrolls inside. **Reset size** in its right-click menu goes back to fitting the content and the browser panel's width. Two cards in one panel use the browser widths.
- **Dragging:** drag a card by any part that isn't a button or link (text isn't selectable, so dragging over text moves it; the mouse wheel still scrolls). Right-click it for more options. Hover-only controls follow the pointer, as in the browser.

**The panel is the extension's own**, drawn with your extension settings for that site: theme and preset, bar colors and gradients, spacing, compact mode, module order and visibility, hover options, update-time position, and the panel's floating width. Change them under **Customize** in the browser panel; the companion redraws within seconds. Collapsing the panel or a module in the companion only affects the companion. Controls that only make sense in the browser are hidden on the cards: drag-to-float, resize, Customize, and module reordering. Links such as **Usage** and **Manage** open in your browser.

**Own look:** the companion can keep its own copy instead (Settings → Look and layout → **Own look**). **Customize Claude…** / **Customize ChatGPT…** (also **Customize look…** in a card's right-click menu) open a window with that card and the extension's full Customize panel; changes there only affect the companion. Each app has its own row: **Import from browser** copies your browser's current look for that app over the companion's, and **Reset** drops the companion's look for that app so its card follows the browser again (resetting both goes back to "Same as the browser").

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

**Without the browser:** Settings → **Sign in here** opens claude.ai's or chatgpt.com's own sign-in page in a window of the companion. Once you're signed in there, the companion fetches your usage itself (the same requests the extension makes) whenever no browser reported it for a few minutes, so the browser doesn't need to be running. The login stays in the companion's data folder; **Sign out** forgets it. If that login expires, the card says so.

Nothing leaves your computer. The extension and the companion's own login only contact claude.ai and chatgpt.com. Apart from that, the companion only asks GitHub whether a newer version exists (see Updates).

## Updates

The companion checks the project's GitHub releases shortly after it starts and every few hours (Settings → Updates; you can turn that off). When a newer companion is out, Settings and the tray menu show **Update to x.y.z**: it downloads the release's companion zip, quits, copies the new files over the app's folder and starts again. Your settings stay. The browser extension is updated separately.

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
| Cards | Show them; a card per app, one that follows the app in front, or both in one panel. With one card: show usage for the app in front or always one app, and whether browser windows and terminals count (by title). |
| Where each card sits | Floating (kept on top or not), on top of its app (moving with it or not), or in its app's sidebar; opacity; move floating cards back to the corner. |
| Look | The browser's look or the companion's own, per app. |
| Where usage comes from | The browser connection, and signing in in the companion itself. |
| Updates | Check now, update and restart, and whether to check automatically. |
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
| `src/main.js` | App: tray, mini panels, settings window, following the app in front. |
| `src/bridge.js` | Named-pipe server that browser hosts connect to. |
| `src/host.js` | Native-messaging host: relays between the extension (stdin/stdout) and the app (pipe). Keeps the latest usage while the app isn't running. |
| `src/register.js` | Writes the host launcher and manifests, finds the extension's ID in browser profiles, and registers under `HKEY_CURRENT_USER`. |
| `src/direct.js` | The companion's own sign-in windows (one login per site, kept in its data folder) and its usage requests. |
| `src/updater.js` | Checks GitHub's latest release, downloads the companion zip and swaps the app's files. |
| `src/sidebar.js` | Finds an app's sidebar (edges, colors, footer) in a picture of its window, for docking. |
| `src/foreground.js` | Reads the window in front (executable and title) via Win32, through koffi. |
| `src/app-match.js` | Maps that window to Claude, ChatGPT or Codex. |
| `src/usage.js` | Turns usage into rows, headline and tooltip. Shared with the pages. |
| `src/icon.js` | Draws the tray ring. |
| `renderer/panel.html`, `embed.js`, `embed-after.js` | Mini panel: runs the extension's `content.js` in its embedded mode, feeds it settings and usage, and adds the pin. The packaged app ships `content.js` next to `app.asar`. |
| `renderer/both.*` | Both cards in one panel: one frame per card. |
| `renderer/settings.*` | The companion's Settings window. |
| `test/` | Unit tests, including an end-to-end host ↔ app test and the extension's background script with a mocked browser. |

## Caveats

- Claude's and ChatGPT's usage endpoints are undocumented and can change. The companion shows whatever the extension receives.
- Following the app in front relies on executable names (`claude.exe`, `ChatGPT.exe`, `Codex.exe`) and, for browsers and terminals, window titles. A ChatGPT browser tab titled after your conversation, without "ChatGPT" in it, isn't recognized; the panel keeps the last app instead.
- The extension's own background fetch picks your first Claude organization with chat access. With several organizations, an open claude.ai tab reports the one you're using.
