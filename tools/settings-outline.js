// Prints the layout of Claude's settings page so the usage dialog can be fixed against the real
// structure. Read-only. It records element types, sizes, roles and test ids, not text or links.
// Use: open https://claude.ai/settings/usage in a normal tab, open DevTools (F12) → Console,
// paste this whole file, press Enter. The outline is copied to the clipboard.
(() => {
  const dialogs = [...document.querySelectorAll('[role="dialog"],dialog')]
    .filter((d) => { const r = d.getBoundingClientRect(); return r.width > 300 && r.height > 200; });
  const root = dialogs[0] || document.body;
  const CLICKABLE = 'a[href],button,[role="link"],[role="button"],[role="tab"],[role="menuitem"],[role="option"]';
  const lines = [`viewport ${innerWidth}x${innerHeight} · dialogs ${dialogs.length} · root ${root.tagName.toLowerCase()}${root.getAttribute('role') ? '[' + root.getAttribute('role') + ']' : ''}`];
  const label = (el) => {
    let s = el.tagName.toLowerCase();
    for (const a of ['role', 'data-testid', 'aria-label', 'aria-current', 'aria-selected', 'data-state']) {
      const v = el.getAttribute(a);
      if (v && a !== 'aria-label') s += `[${a}=${v.slice(0, 40)}]`;
      else if (v) s += '[aria-label]';
    }
    if (el.matches('a[href]')) s += `[href=${(el.getAttribute('href') || '').split(/[?#]/)[0].replace(/[0-9a-f-]{36}/g, '…').slice(0, 60)}]`;
    const st = getComputedStyle(el);
    if (st.display === 'flex' || st.display === 'grid') s += ` ${st.display}${st.display === 'flex' ? ':' + st.flexDirection : ''}`;
    if (/(auto|scroll)/.test(st.overflowY)) s += ' scroll';
    return s;
  };
  const walk = (el, depth) => {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 16 || depth > 14) return;
    const kids = [...el.children].filter((k) => { const b = k.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
    lines.push(`${'  '.repeat(depth)}${label(el)} @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} kids=${kids.length} clickables=${el.querySelectorAll(CLICKABLE).length}`);
    if (el.matches(CLICKABLE)) return;
    kids.forEach((k) => walk(k, depth + 1));
  };
  walk(root, 0);
  const out = lines.join('\n');
  try { copy(out); console.log(`Copied ${lines.length} lines to the clipboard.`); } catch (_) { console.log(out); }
  return out.length;
})();
