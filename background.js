// Colors the toolbar icon for the site in each tab: green on ChatGPT, orange on Claude.
// Other tabs keep the default split icon. Chrome resets per-tab icons on navigation, and
// content.js reports its site again on every page load.
const api = globalThis.browser ?? chrome;
const icon = (site) => ({ 16: `icons/${site}-16.png`, 48: `icons/${site}-48.png`, 128: `icons/${site}-128.png` });
const ICONS = { chatgpt: icon("chatgpt"), claude: icon("claude") };
const TITLES = { chatgpt: "Usage Meter · ChatGPT", claude: "Usage Meter · Claude" };

api.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab && sender.tab.id;
  if (!message || message.type !== "usage-meter-site" || tabId == null || !ICONS[message.site]) return;
  try {
    api.action.setIcon({ tabId, path: ICONS[message.site] })?.catch?.(() => {});
    api.action.setTitle({ tabId, title: TITLES[message.site] })?.catch?.(() => {});
  } catch (_) { /* tab closed */ }
});
