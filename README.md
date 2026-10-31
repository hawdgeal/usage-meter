# ChatGPT Usage Meter

Browser extension for Chrome, Edge, Brave and Firefox that adds an independently customizable usage panel to ChatGPT's sidebar.

## What's new in 0.2

- **Matching dark and light themes:** automatically follows ChatGPT's current theme, with readable text, consistent spacing, subdued surfaces, vector icons, and contrast-safe progress bars.
- **Four independent sections:** Plan limits, Credits, Models & features, and Diagnostics. Each can be expanded or collapsed, reordered, or hidden separately.
- **Movable panel:** drag the six-dot grip in the header to move the entire panel. Drop it over the sidebar to dock it, or leave it anywhere else as a floating panel. The dock button also switches between the top and bottom of the sidebar.
- **Layout customization:** select the sliders icon to show or hide sections, drag them into a preferred order, move them using keyboard-accessible arrows, enable compact spacing, or restore defaults.
- **Saved preferences:** collapse state, visible sections, ordering, spacing, panel position, and cached usage survive page reloads.
- **More accurate data presentation:** an exhausted weekly window no longer incorrectly labels a separate 0%-used five-hour window as exhausted; credit balances are displayed to two decimal places while preserving full-precision raw data.
- **Reduced clutter:** diagnostics are collapsed by default, model lists initially show up to six entries, and the entire panel can be minimized to one line.

The panel continues to show usage windows, reset estimates, credit balances, and per-model limits whenever ChatGPT reports them. A refresh runs on page load, every two minutes while the tab is visible, following relevant activity, and when you click Refresh.

## Install or upgrade — Chrome / Edge / Brave

1. Extract the ZIP into a permanent folder (for example, `Documents/ChatGPT Usage Meter`).
2. Open `chrome://extensions` (Chrome/Brave) or `edge://extensions` (Edge).
3. Enable **Developer mode**.
4. **First install:** select **Load unpacked** and choose the extracted `chatgpt-usage-meter` folder containing `manifest.json`.
5. **Already installed:** replace your previous extension's files in the *same existing folder*, then select **Reload** on its extension card. Alternatively, remove the old unpacked extension and load this folder; doing so can reset locally saved preferences.
6. Reload the open `https://chatgpt.com` tab.

## Firefox 128+

1. Visit `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…**, and select `manifest.json` in the extracted folder.
2. In `about:addons`, allow access to chatgpt.com when prompted.
3. Reload ChatGPT. Temporary add-ons are removed when Firefox exits; a permanent Firefox installation requires signing.

## Controls

| Control | Action |
| --- | --- |
| Chevron beside **Usage** | Minimize / expand the whole panel |
| Chevron beside a section | Minimize / expand that section |
| Six-dot grip in panel header | Drag the panel anywhere; drop over sidebar to dock |
| Dock / move button | Return to sidebar, or switch top / bottom position |
| Sliders icon | Customize section order, visibility, and compact spacing |
| Six-dot grip beside a section | Drag that section above or below another (when customizing) |
| Up / down buttons beside a section | Move a section using keyboard or mouse |
| Refresh | Recheck current plan data |
| Diagnostics | Show / copy the received API response for troubleshooting |
| Reset layout | Restore section order, visibility, spacing, and panel position |

## Architecture and privacy

| File | Role |
| --- | --- |
| `manifest.json` | Browser configuration and host access |
| `page-hook.js` | Reads ChatGPT's own usage API and observes model-limit data reported in responses |
| `content.js` | UI, normalization, local preferences, interaction, and sidebar placement |
| `meter.css` | Isolated dark/light design tokens and component styles |
| `icons/` | Browser extension icons |

No external font, analytics, or styling service is used. Usage API requests are made only to chatgpt.com with the browser's existing sign-in. Preferences and the last usage snapshot are stored locally in the extension's storage.

**Note:** The APIs used for usage information are internal and undocumented. They may change or be unavailable; use the Diagnostics section if data stops appearing. ChatGPT does not always expose remaining-message counts for each model. Moving the widget depends on ChatGPT's sidebar DOM, which can also change between site updates.
