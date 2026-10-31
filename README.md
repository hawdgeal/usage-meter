# Claude Usage Meter

A browser extension that adds a **Usage** card to the left sidebar of [claude.ai](https://claude.ai) and Claude Code on the web (`claude.ai/code`). It shows:

- **Plan limits**: your 5-hour session and weekly limits as % left (or used), with time until reset, plus any per-model weekly limits Claude reports (Opus, Sonnet…).
- **Extra usage**: how much of your monthly extra-usage spend limit is left, with a bar. It shows "turned off" when extra usage is disabled.
- **Plan badge**: Free, Pro, Max 5x, Max 20x, Team or Enterprise, read from your organization.

This is a port of ChatGPT Usage Meter 0.3.31, so the panel has the same customization: docking at the top or bottom, floating, compact mode, themes, bar colors, spacing, hover behavior, undo/redo and more. Open it with the **Customize** button on the panel.

## Install (Chrome, Edge, Brave, Arc, Opera)

1. Unzip the folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `claude-usage-meter` folder.
4. Open or reload https://claude.ai.

## Install (Firefox 128+)

1. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `manifest.json`.
2. In `about:addons`, open the extension, then **Permissions**, and allow access to claude.ai.

## How it works

| File | Role |
| --- | --- |
| `page-hook.js` | Runs in the page. Finds your organization (`lastActiveOrg` cookie or `/api/organizations`), calls `/api/organizations/{org}/usage`, and converts the result into the panel's generic format. It also refreshes usage after a reply finishes streaming. |
| `content.js` | Draws the card inside a Shadow DOM so Claude's styles can't break it, and keeps it attached to the sidebar as the page re-renders. |

Mapping from Claude's response:

| Claude field | Panel row |
| --- | --- |
| `five_hour` | 5-hour |
| `seven_day` | Weekly |
| `seven_day_<model>` / `five_hour_<model>` | `<Model> · Weekly` / `<Model> · 5-hour` |
| `extra_usage` (`monthly_limit`, `used_credits`, in cents) | Extra usage: amount left, % bar, "X used of Y monthly limit" |

Privacy: the only requests go to claude.ai, using your existing login. Nothing is sent anywhere else. The last snapshot is cached in the extension's local storage.

## Differences from the ChatGPT version

- Banked and paid usage resets are removed. Claude has no equivalent.
- "Credits" becomes **Extra usage**. The 100% reference comes from Claude's reported monthly limit. The "Fallback limit" setting is used only when Claude reports no limit.
- **Manage** and the Usage title open `claude.ai/settings/usage` in a dialog, with an **Open in tab** fallback.
- **Match Claude** reads Claude's page colors (`data-mode`, `--accent-brand`, `--text-300`), so bars use Claude's orange by default.
- If no sidebar is found (for example a full-width Claude Code page), the panel floats instead of hiding. It still hides when you collapse a sidebar it was docked in, if **Hide docked panel with sidebar** is on.
- **Models & features** is hidden by default. Claude rarely sends per-feature counters, but the passive scanner is kept in case it does.

## Caveats

- These are **undocumented internal endpoints**. Anthropic can change them at any time. If the card shows an error or odd numbers, click **Details** to see the raw Claude response (`claude`) and the converted data (`usage`).
- Sidebar detection starts from the account button (`[data-testid="user-menu-button"]`) and climbs to the sidebar column, then falls back to `nav[aria-label="Sidebar"]` or any tall left-hand `nav`. If a redesign breaks placement, adjust `claudeSidebar()` / `findSidebarNav()` in `content.js`.
- Extra-usage amounts are shown in your currency only when Claude reports one. Otherwise they appear as plain numbers.

See THIRD-PARTY-NOTICES.txt for palette preset licensing.
