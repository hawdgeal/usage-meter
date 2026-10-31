# Usage Meter for ChatGPT & Claude

One browser extension that adds a **Usage** card to the left sidebar of **ChatGPT** (chatgpt.com) and **Claude** (claude.ai, including Claude Code on the web). Each site keeps its own settings, and the **Sync** tab copies settings between them in either direction.

## What's new in 0.4.0

- **Claude support.** Shows plan limits (5-hour, weekly and per-model weekly), **Extra usage** (amount left of your monthly limit) and your plan (Free, Pro, Max 5x/20x, Team, Enterprise). Data comes from claude.ai's own usage endpoint, using your existing login.
- **Settings → Sync.** Choose groups (Layout, Modules, Theme, Bars, Spacing), then **Apply these settings to (other site)** or **Apply (other site) settings here**. Open tabs of the other site update right away. Copying here can be undone with Undo in the title bar; copying to the other site shows its own **Undo** link. These are never copied: banked/paid reset buttons, the full credit balance / fallback limit (different units), individual feature counters, and the settings window itself. The site-colored theme preset ("ChatGPT" / "Claude") maps to the other site's equivalent.
- **Import settings…** sits next to Export settings. It accepts files from this version and files exported by ChatGPT Usage Meter 0.3.34. A file from the same site restores everything, including site-specific choices. A file from the other site applies the shared groups only. Import can be undone.
- **Exports** now record which site they came from (`"format": "usage-meter-settings"`, `"site": "chatgpt"` or `"claude"`) and are named `ChatGPT-Usage-Meter-settings-YYYY-MM-DD.json` or `Claude-Usage-Meter-settings-YYYY-MM-DD.json`.
- **Toolbar icon** is green on ChatGPT tabs and orange on Claude tabs. Elsewhere it shows the split icon.
- **Menus no longer hide the panel.** Right-click and other menus mark the rest of the page as hidden to screen readers, and the panel used to take that as "sidebar closed". It now keeps its sidebar while the sidebar stays on screen.

## Claude specifics

- Usage settings open inside the panel's dialog showing only the usage content. Claude's own Settings window and sidebars are hidden there. If that page changes and the content can't be isolated, the full page shows after a few seconds. **Open in tab** always works.
- **Credits** is called **Extra usage**. Its bar uses Claude's reported monthly limit as 100%. **Fallback limit** is used only when Claude reports none.
- **Match Claude** reads Claude's page colors, so bars default to Claude's orange.
- On pages without a sidebar (for example full-width Claude Code pages), the panel floats instead of hiding.
- Defaults differ slightly from ChatGPT: update time in the header after Refresh, and the extra usage bar on.
- **Details** shows Claude's raw response (`claude`) next to the converted data (`usage`), which helps if Anthropic changes the endpoint.

## Install or upgrade

- **Chrome / Edge / Brave / Arc / Opera.** To keep your ChatGPT settings, replace the files in your existing `chatgpt-usage-meter` folder with these, then click **Reload** on `chrome://extensions`. Chrome ties stored settings to the folder you loaded. A new install: turn on Developer mode, then **Load unpacked** and pick the `usage-meter` folder. You can also import an earlier export.
- **Firefox 128+.** `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `manifest.json`. The same folder works in Chrome and Firefox. Chrome shows a harmless warning about `background.scripts`, a line only Firefox uses. The add-on ID is unchanged (`chatgpt-usage-meter@alencar.fr`). In `about:addons` → Permissions, allow chatgpt.com and claude.ai.
- If you installed the separate Claude Usage Meter, remove it so two panels don't appear on claude.ai.

## Files

| File | Role |
| --- | --- |
| `page-hook-chatgpt.js` | ChatGPT data: session token, `/backend-api/wham/usage`, resets, passive limit scan. |
| `page-hook-claude.js` | Claude data: organization, `/api/organizations/{org}/usage`, converted to the same shape; refreshes after each reply. |
| `content.js` | The panel for both sites (picks the site from the hostname), settings, Sync, Export/Import. |
| `background.js` | Sets the per-site toolbar icon. |

Privacy: the extension only contacts chatgpt.com and claude.ai, using your existing login. Settings and the last usage snapshot stay in the extension's local storage.

## ChatGPT feature notes (from 0.3.34)

A browser extension that adds a **Usage** card to ChatGPT's left sidebar, showing:

- **Plan limits** — your ChatGPT/Codex rate-limit windows (e.g. 5-hour and weekly) as % used, with time until reset, plus any extra per-model windows (e.g. Codex Spark).
- **Credits** — your pay-as-you-go usage-credit balance, or "Unlimited".
- **Model & feature limits** — remaining messages/uses per model or feature (Deep Research, image generation…), captured whenever ChatGPT reports them.

### Panel controls

- The settings window has a lower-right resize handle. Its size is saved separately from the Usage panel; resizing fixes its current position. Double-click the handle or press Home while it is focused to restore automatic sizing.

- **Show remaining plan allowance** also controls the credits meter. Enabled shows remaining credits; disabled shows used credits relative to the saved full-balance reference. The numeric available balance remains unchanged.

- **Layout → Hover behavior** independently controls hover-only visibility for the frame, drag-to-float, Refresh, Customize, collapse arrows, reorder handles, update time, Details, resize handle, and Usage scrollbar. Turn a switch off to keep its element visible. Keyboard focus reveals controls, and touch devices keep them accessible. Existing hover behavior is the default.
- **Layout → Visibility → Hide frame completely** suppresses the Usage panel’s outer border and floating shadow even while hovered or focused. Content, its background, and keyboard focus indicators remain available. This overrides Frame on hover only.

- Drag the settings title bar or its move handle to reposition the window. The position is saved and clamped to the viewport. Double-click the title to reattach it beside Customize; arrow keys move the focused handle and Home resets its position.

- **Bars → Color source** now has just Match theme or Custom. Match theme uses the current theme accent for every bar. Custom offers one solid color, or Color by percentage: the entire fill takes one interpolated color for its displayed percentage, using editable 0%/100% endpoints and up to eight middle color ranges. Each middle color has From/To percentages: it stays constant within that interval and blends in the gaps on either side. Equal From/To values keep a single point. Blend before/after independently control transition widths in percentage points: lower values sharpen the transition, zero makes a hard edge, and blank (Auto) fills the surrounding gap. Between two middle colors the requested widths share that gap. Existing ranges default to Auto, preserving their previous appearance. A live 0–100% color-scale preview in settings shows the full gradient and constant-color ranges regardless of the selected meter display. Adjacent ranges cannot overlap; old point settings migrate with both edges at the saved percentage. **Show gradient across meters** optionally paints the scale across the fills, anchored to the full meter width. It defaults off, preserving one solid color based on percentage. This choice persists independently of theme/custom mode. Choices persist across reloads and theme changes; prior custom endpoint and middle-stop settings migrate.
- **Modules → Plan limits → Show paid reset button** adds a Paid reset shortcut (off by default). It opens the official Usage page in the centered frame, where eligible accounts can review the native paid offer and checkout. It does not purchase anything automatically or assume a checkout URL. Availability and price are determined by ChatGPT.
- Embedded-page loading messages are centered horizontally and vertically within the content area, without a divider.

- **Theme preset, Mode, Accent color, and Contrast** default to following ChatGPT and update with native theme changes. The theme picker contains ChatGPT and 27 Codex theme families, with their available light/dark variants. Manual controls also include System/Light/Dark mode, Default/Blue/Green/Yellow/Pink/Orange/Purple/Black–White accents, and System/Medium/Increased contrast. Preset palettes are adapted from Codex Palette; native application-shell colors can differ. Choices are saved independently. Native matching uses the page’s rendered sidebar and available color tokens, with a blue fallback when no accent is exposed. See THIRD-PARTY-NOTICES.txt for palette licensing.
- **Spacing → Panel & header → Frame margins (outside)** controls the gap around the visible frame, including the gap above your profile. Bottom defaults to zero; Inside frame controls content padding separately. Explicit saved margins are preserved.

- **Spacing** has separate normal/compact profiles and independent top/right/bottom/left controls for the outside and inside frame, Usage header, status row, collapsed summary, each module, headings, content, items, balance, credits actions, bars, captions, and expanded Details. Changes are saved and applied live; each profile can reset independently. Existing frame margins migrate automatically.
- **Show available balance** in Modules → Credits can hide the numeric balance and caption while the remaining bar is enabled. When the larger balance display is hidden, the available amount appears beside the meter percentage. The choice is saved; turning the bar off always restores the larger balance. In compact mode, Add credits sits beside the remaining meter.
- **Show credit balance bar** in Modules → Credits adds a blue remaining-balance bar with a percentage. **Full balance** defines 100%; it initially captures your current balance when enabled and is editable. The reference is saved and does not reset as credits are spent or added. Balances above the reference show more than 100%, with a full bar.
- Embedded Usage and credits frames stay concealed behind a themed loading state until their load-time preparation completes, preventing an initial flash of native navigation. Close and Open in tab remain available while loading. Embedded Usage and credits frames hide ChatGPT’s navigation sidebar inside the dialog, are created only when opened, and are removed when closed. Open in tab keeps the normal page layout.
- **Add credits button** in settings shows or hides the action in expanded Credits. It opens the [ChatGPT credits purchase page](https://chatgpt.com/pricing/credits) in a centered dialog, with the return path set to the current chat when clicked. Close it with ✕, Escape, or a click outside. **Open in tab** is available if the checkout cannot be embedded. Buying credits happens on the official page. Returning to the original chat in the frame closes the dialog and refreshes usage.
- **Show remaining plan allowance** switches plan percentages, bars, tooltips and the collapsed summary to remaining allowance, matching the original usage page. Full blue bars mean 100% left; empty bars mean 0% left. Feature counters are unaffected.
- **Plan limit tooltips** in settings enables or disables the compact limit detail popups. Short reset captions remain visible.
- **Models & features to show** in settings lets you toggle individual counters (Deep Research, File uploads, Paste text to file, Image generation, and reported models). These choices are saved separately from the whole module switch. Hiding a counter keeps its cached data and does not affect your account limits. Counters still require data reported by ChatGPT.
- **Show update time** and **Show Details button** in Layout → Update time & Details independently control visibility. Turning both off removes the status row and its spacing.

- **Layout → Update time & Details → Status position** offers **Next to Usage** (between the title and Refresh), **Above modules** (default), and **Below modules**. Header placement shows only the short timestamp (for example, “just now”); Details is omitted. The header stays on one line, truncating the timestamp before moving action buttons. Header spacing has its own control in Spacing → Update time & summary.
- The Usage panel scrollbar appears on hover or keyboard focus, with its space reserved to avoid text shifting. Settings retain a normal scrollbar.
- Drag, refresh, customize, reorder, collapse arrows, update time, and Details appear on panel hover or keyboard focus. Touch devices keep controls visible. Hover-hidden header controls and the header timestamp release their space; module rows retain theirs.
- Compact plan limits use responsive columns with short reset captions. Hover or focus a limit for its full status and reset time. Narrow panels stack them automatically.
- **Compact mode** in settings uses tighter spacing, smaller icons and a shorter credit display while retaining readable text. The Usage heading uses the same sidebar-sized text and usage icon in both modes, aligned with the sidebar margin. It fits the content automatically instead of retaining an oversized panel height, and remembers your preference. Turn it off to restore your previous size.
- Bottom mode removes footer-sized padding or margins from the history scroll area to avoid leaving unused space above Usage. Those page styles are restored in other placements.
- The panel border and resize handle appear on hover or keyboard focus; touch devices keep the handle accessible.
- Settings open as a separate popover without shifting the panel. Click outside or press Escape to dismiss it. Choosing a placement closes the popover.
- Sidebar bottom inserts the panel into the sidebar layout directly above the account footer, located using the visible Open profile menu button in the active Chat history navigation. Hidden controls in the collapsed sidebar rail are ignored. It does not use floating or fixed positioning. When the account footer is absolutely positioned, bottom mode reserves its measured height, including through display:contents wrappers.
- **Hide collapsed Usage until hover** in settings controls whether the collapsed label and summary stay visible. It defaults to keeping the collapsed label visible and remembers your choice. Other controls still reveal on hover or keyboard navigation.
- The hidden drag handle releases its horizontal space, aligning Usage further left until the handle is revealed.
- Drag the bottom-right corner to resize the height in the sidebar, or both width and height when floating. Focus that handle and use arrow keys for keyboard resizing. Double-click it to reset the size. Your dimensions are saved locally.
- Dark mode uses a true black background.
- Automatically follows ChatGPT's light or dark theme, with explicit readable colors. Use **Customize panel → Appearance** to override it.
- Click the **Usage icon or title** to open `https://chatgpt.com/settings/usage?tab=overview` in a centered dialog. The separate arrow beside the heading collapses or expands the panel. Both actions support keyboard navigation, and the dialog offers an Open in tab fallback.
- Collapse **Plan limits**, **Credits**, and **Models & features** independently. Collapsed Credits shows its current balance beside the title, including in compact mode.
- Drag the dotted handle beside a section to reorder it. Focus the handle and press **↑ / ↓** to reorder with a keyboard.
- Drag the dotted handle beside **Usage** to detach and move the panel anywhere in the viewport. During a drag, the sidebar shows **Dock at top** and **Dock at bottom** targets; release over the desired half of the sidebar to dock there, or outside the sidebar to keep floating. Arrow keys move it by 10 pixels (Shift for 30). Press **Escape** on that handle to dock it at the top of the sidebar.
- **Customize panel → Placement** offers Sidebar top, Sidebar bottom, and Floating. The same menu has **Visible modules** switches to show or hide Plan limits, Credits, and Models & features independently of their collapsed state, plus a layout reset.
- Preferences and the floating position are saved locally. Docked Usage hides with the sidebar by default and returns to its saved top or bottom dock when reopened. Turn off **Hide docked panel with sidebar** in Layout → Visibility to float temporarily while navigation is hidden. Explicit Floating placement stays visible.
- **Refresh usage** updates the data; **Details** shows the raw response for troubleshooting.

The panel refreshes on load, every two minutes while visible, shortly after a message, and on demand. Reset countdowns are estimates based on the last response. Credits are displayed to at most two decimal places. Plan percentages are **used**, while feature counters show **remaining** where available.

## Update an existing installation

Replace the files in your existing extension folder with this version. On `chrome://extensions`, click the extension's **Reload** button, then reload your ChatGPT tabs. Keeping the same extension folder preserves its stored settings. For Firefox temporary add-ons, reload from `about:debugging`.

## Install (Chrome, Edge, Brave, Arc, Opera)

1. Unzip the folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped `chatgpt-usage-meter` folder.
4. Open or reload https://chatgpt.com.

## Install (Firefox 128+)

1. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** and pick `manifest.json`.
2. Firefox treats host access as optional: in `about:addons` → the extension → **Permissions**, allow access to chatgpt.com.
   For a permanent install, package and sign it via addons.mozilla.org.

## How it works

| File | Role |
| --- | --- |
| `page-hook.js` | Runs in the page's own context. Reads your session token from `/api/auth/session`, calls `/backend-api/wham/usage`, and watches ChatGPT's own JSON responses for `limits_progress`-style fields. |
| `content.js` | Draws the card (inside a Shadow DOM, so ChatGPT's styles can't break it) and keeps it attached to the sidebar as ChatGPT re-renders. |

Privacy: the only requests made go to chatgpt.com using your existing login. Nothing is sent anywhere else; the last snapshot is cached in the extension's local storage.

## Caveats

- These are **undocumented internal endpoints**. OpenAI can change or remove them at any time; if the card shows an error, click **Details** at the bottom to see what the extension received.
- ChatGPT doesn't publish a live counter for most per-model message caps. That section only fills in when ChatGPT itself sends the numbers (usually once you're close to a limit, or for metered features like Deep Research).
- The sidebar is located with heuristics (`#stage-slideover-sidebar nav`, then `nav[aria-label="Chat history"]`, then any tall left-hand `nav`). If a ChatGPT redesign breaks placement, adjust `findSidebarNav()` in `content.js`.

## Default settings

New installations use Match ChatGPT, Sidebar bottom, normal density, visible collapsed Usage, Add credits enabled, tooltips disabled, and remaining allowance percentages. Plan limits and Credits are visible (Credits starts collapsed); Models & features starts hidden, with Image generation selected and Deep Research, File uploads, and Paste text to file unselected.

Saved choices take precedence on upgrades and reloads. Settings have four tabs: **General** (Layout; Visibility; Update time & Details), **Modules** (Plan limits; Credits; Models & features), **Appearance** (Theme & mode; Accent & contrast), and **Spacing** (region-specific spacing). ChatGPT and Codex presets occupy separate groups in the theme picker. Each module owns its master switch and related display options. The selected tab is saved. Each group can collapse independently, and its open/closed state is remembered. **Reset all settings** applies the pictured defaults to an existing installation.

Banked usage limit resets appear beside Plan limits when reported by ChatGPT (including a zero balance). Use opens a review of available, unexpired resets with their titles and expiration times. Use this reset consumes the selected reset after confirmation; the server decides eligibility. This does not purchase resets or add credits. Each submission uses a unique redemption request ID, blocks duplicate clicks and is never automatically retried. Usage and reset balance refresh afterward; uncertain outcomes ask you to check Usage before retrying. Open Usage remains available as a native fallback. Counts unavailable from the server are omitted rather than assumed to be zero.

Reset request/response fields were checked against the [official Codex backend client](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client/rate_limit_resets.rs) and its tests. See [How resets work in Codex](https://help.openai.com/en/articles/20001498-how-resets-work-in-codex) for account eligibility and behavior. Redemption checks use mocked responses during development; real account behavior remains subject to the server.

Settings are organized into Layout (docking, visibility, hover and status), Modules (plan/credit/feature behavior), Theme (preset, mode, accent and contrast), Bars (color source, preview, meter display, endpoints and middle transitions), and Spacing. Each group collapses independently and remembers its state. Advanced meter display options are separated from color editing.

Undo and Redo buttons in the settings title bar restore up to 100 extension preference/layout changes during the current page session. Consecutive edits to one field coalesce briefly. Settings navigation and group expansion, usage refreshes, account purchases and reset redemption are excluded. Undo/redo persists the resulting preferences; refreshing the page starts a new history. Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl/Cmd+Y work while focus is on extension controls, leaving editable fields to their native text undo. A new change after Undo clears Redo.

Modules → Plan limits → Show banked reset count & button independently toggles banked-reset controls (on by default). Show paid reset button remains separate. Bars → Reset bar colors restores only the bar color source, custom colors, ranges/blend widths and gradient display defaults; it is undoable and preserves theme, module and spacing choices.

Modules → Credits → Balance beside Credits title moves the available amount from beside the percentage into the section heading when the bar is enabled and the large available-balance display is hidden. It defaults off, persists independently and is undoable. The percentage remains in the meter; no duplicate amount appears there. Collapsed Credits continues showing its balance as before.

Layout → Docking & size → Drag handle position selects Before Usage or After settings (default). The actual control order follows this choice for both pointer and keyboard use. Hover-only visibility, drag/docking and resizing remain available. The setting persists and supports Undo/Redo.

Layout → Update time & Details → Status position now offers Header: before refresh and Header: after refresh, in addition to above/below modules. Both header choices use the short relative timestamp, omit Details, and retain hover visibility. After refresh places the timestamp between Refresh and Customize. The setting persists and supports Undo/Redo.

Export settings at the bottom of settings downloads a versioned JSON file containing preferences and layout, including custom bar colors and configured full-credit reference. Live usage payloads, current credit/reset balances, reported model data, account/session information and undo history are excluded. Export does not change preferences. The file is a settings backup; an import interface is not included in this release.
