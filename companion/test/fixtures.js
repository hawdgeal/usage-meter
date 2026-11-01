// Sample payloads in the shapes the extension forwards.
"use strict";
const now = Date.UTC(2026, 10, 1, 12, 0, 0);
module.exports = {
  now,
  claude: {
    plan_type: "Max 5x", source: "claude.ai",
    rate_limit: {
      primary_window: { used_percent: 42, limit_window_seconds: 18000, reset_at: Math.round(now / 1000) + 2 * 3600 + 14 * 60 },
      secondary_window: { used_percent: 81, limit_window_seconds: 604800, reset_at: Math.round(now / 1000) + 3 * 86400 },
    },
    additional_rate_limits: [{ limit_name: "Opus", rate_limit: { primary_window: { used_percent: 95, limit_window_seconds: 604800 } } }],
    credits: { enabled: true, limit: 50, used: 12.5, balance: 37.5, unlimited: false, currency: "EUR" },
  },
  chatgpt: {
    plan_type: "plus",
    rate_limit: {
      allowed: true, limit_reached: false,
      primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_after_seconds: 3600 },
      secondary_window: { used_percent: 30, limit_window_seconds: 604800, reset_after_seconds: 86400 * 4 },
    },
    credits: { has_credits: true, unlimited: false, balance: "12.5" },
  },
};
