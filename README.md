# ChatGPT Usage Meter

A browser extension that adds a **Usage** card to ChatGPT's left sidebar, showing:

- **Plan limits** — your ChatGPT/Codex rate-limit windows (e.g. 5-hour and weekly) as % used, with time until reset, plus any extra per-model windows (e.g. Codex Spark).
- **Credits** — your pay-as-you-go usage-credit balance, or "Unlimited".
- **Model & feature limits** — remaining messages/uses per model or feature (Deep Research, image generation…), captured whenever ChatGPT reports them.

The card refreshes on load, every 2 minutes while the tab is visible, shortly after you send a message, and when you click ↻. Click the header to collapse it (it then shows your highest % used); the ⇅ button moves it between the top and bottom of the sidebar. If the sidebar is closed, it floats in the bottom-left corner.

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

- These are **undocumented internal endpoints**. OpenAI can change or remove them at any time; if the card shows an error, click **raw** at the bottom to see what the extension received.
- ChatGPT doesn't publish a live counter for most per-model message caps. That section only fills in when ChatGPT itself sends the numbers (usually once you're close to a limit, or for metered features like Deep Research).
- The sidebar is located with heuristics (`#stage-slideover-sidebar nav`, then `nav[aria-label="Chat history"]`, then any tall left-hand `nav`). If a ChatGPT redesign breaks placement, adjust `findSidebarNav()` in `content.js`.
