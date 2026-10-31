# ChatGPT Usage Meter

A browser extension that adds a **Usage** card to ChatGPT's left sidebar, showing:

- **Plan limits** — your ChatGPT/Codex rate-limit windows (e.g. 5-hour and weekly) as % used, with time until reset, plus any extra per-model windows (e.g. Codex Spark).
- **Credits** — your pay-as-you-go usage-credit balance, or "Unlimited".
- **Model & feature limits** — remaining messages/uses per model or feature (Deep Research, image generation…), captured whenever ChatGPT reports them.

## Panel controls (0.3.12)

- **Add credits button** in settings shows or hides the action in expanded Credits. It opens the [Codex usage dashboard](https://chatgpt.com/codex/settings/usage) in a new tab; buying credits happens there.
- **Show remaining plan allowance** switches plan percentages, bars, tooltips and the collapsed summary to remaining allowance, matching the original usage page. Full neutral bars mean 100% left; empty bars mean 0% left. Feature counters are unaffected.
- **Plan limit tooltips** in settings enables or disables the compact limit detail popups. Short reset captions remain visible.
- **Models & features to show** in settings lets you toggle individual counters (Deep Research, File uploads, Paste text to file, Image generation, and reported models). These choices are saved separately from the whole module switch. Hiding a counter keeps its cached data and does not affect your account limits. Counters still require data reported by ChatGPT.
- The Usage panel scrollbar appears on hover or keyboard focus, with its space reserved to avoid text shifting. Settings retain a normal scrollbar.
- Drag, refresh, customize, reorder, collapse arrows, update time, and Details appear on panel hover or keyboard focus. Touch devices keep controls visible. Hidden controls retain their space so rows do not jump.
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
- Click **Usage** to collapse the panel into a one-line summary.
- Collapse **Plan limits**, **Credits**, and **Models & features** independently. Collapsed Credits shows its current balance beside the title, including in compact mode.
- Drag the dotted handle beside a section to reorder it. Focus the handle and press **↑ / ↓** to reorder with a keyboard.
- Drag the dotted handle beside **Usage** to detach and move the panel anywhere in the viewport. Arrow keys move it by 10 pixels (Shift for 30). Press **Escape** on that handle to dock it at the top of the sidebar.
- **Customize panel → Placement** offers Sidebar top, Sidebar bottom, and Floating. The same menu has **Visible modules** switches to show or hide Plan limits, Credits, and Models & features independently of their collapsed state, plus a layout reset.
- Preferences and the floating position are saved locally. If the sidebar disappears, the panel temporarily floats and returns when the sidebar reappears, unless Floating was selected.
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

New installations use Match ChatGPT, Sidebar bottom, normal density, visible collapsed Usage, Add credits enabled, tooltips disabled, and used percentages. Plan limits and Credits are visible (Credits starts collapsed); Models & features starts hidden, with Image generation selected and Deep Research, File uploads, and Paste text to file unselected.

Saved choices take precedence on upgrades and reloads. Settings have two tabs: **Panel** (Appearance; Placement & visibility) and **Modules** (Plan limits; Credits; Models & features). Each module owns its master switch and related display options. The selected tab is saved. Each group can collapse independently, and its open/closed state is remembered. **Reset settings** applies the pictured defaults to an existing installation.
