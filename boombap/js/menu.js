// Menüleiste mit Dropdowns (Maus, Touch, Tastatur) und einfacher Dialog.
// Menüs werden bei jedem Öffnen neu aus getMenus() gebaut, damit Häkchen und Sperren aktuell sind.
import { el } from './util.js';

let openState = null; // { idx, btn, panel }

function closeMenu(focusButton = false) {
  if (!openState) return;
  const { btn, panel } = openState;
  panel.remove();
  btn.setAttribute('aria-expanded', 'false');
  btn.classList.remove('open');
  if (focusButton) btn.focus();
  openState = null;
}

export function isMenuOpen() { return !!openState; }

export function buildMenubar(bar, getMenus) {
  bar.setAttribute('role', 'menubar');
  bar.replaceChildren();
  const buttons = [];
  const menus = getMenus();
  menus.forEach((m, idx) => {
    const b = el('button', { type: 'button', class: 'mb-btn', role: 'menuitem', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': m.label, id: 'mb-' + m.id },
      el('span', { class: 'mb-long', text: m.label }), el('span', { class: 'mb-short', 'aria-hidden': 'true', text: m.short || m.label }));
    b.addEventListener('click', () => {
      if (openState && openState.idx === idx) closeMenu();
      else open(idx);
    });
    b.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse' && openState && openState.idx !== idx) open(idx);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(idx, true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); buttons[(idx + 1) % buttons.length].focus(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); buttons[(idx - 1 + buttons.length) % buttons.length].focus(); }
    });
    buttons.push(b);
    bar.append(b);
  });

  function open(idx, focusFirst = false) {
    closeMenu();
    const menu = getMenus()[idx];
    const btn = buttons[idx];
    const panel = el('div', { class: 'mb-menu', role: 'menu', 'aria-labelledby': btn.id });
    const items = [];
    for (const it of menu.items) {
      if (it === '-') { panel.append(el('div', { class: 'mb-sep', role: 'separator' })); continue; }
      if (it.header) { panel.append(el('div', { class: 'mb-head', text: it.label })); continue; }
      const role = it.checked === undefined ? 'menuitem' : (it.radio ? 'menuitemradio' : 'menuitemcheckbox');
      const disabled = typeof it.disabled === 'function' ? it.disabled() : !!it.disabled;
      const checked = typeof it.checked === 'function' ? it.checked() : it.checked;
      const item = el('button', {
        type: 'button', class: 'mb-item' + (checked ? ' checked' : ''), role, tabindex: '-1', disabled,
        'aria-checked': it.checked === undefined ? null : String(!!checked),
      },
      el('span', { class: 'mb-check', 'aria-hidden': 'true', text: it.checked === undefined ? '' : (checked ? (it.radio ? '●' : '✓') : '') }),
      el('span', { class: 'mb-label', text: it.label }),
      it.kbd ? el('kbd', { text: it.kbd }) : el('span'));
      item.addEventListener('click', () => {
        closeMenu();
        try { it.act && it.act(); } catch (err) { console.error(err); }
      });
      items.push(item);
      panel.append(item);
    }
    panel.addEventListener('keydown', (e) => {
      const live = items.filter((x) => !x.disabled);
      const i = live.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (live[(i + 1) % live.length] || live[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (live[(i - 1 + live.length) % live.length] || live[0]).focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); open((idx + 1) % buttons.length, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); open((idx - 1 + buttons.length) % buttons.length, true); }
      else if (e.key === 'Tab') { closeMenu(); }
    });
    document.body.append(panel);
    const r = btn.getBoundingClientRect();
    const w = panel.offsetWidth;
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    panel.style.top = r.bottom + 4 + 'px';
    panel.style.maxHeight = Math.max(160, window.innerHeight - r.bottom - 16) + 'px';
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('open');
    openState = { idx, btn, panel };
    if (focusFirst) { const f = items.find((x) => !x.disabled); if (f) f.focus(); }
  }

  if (!bar._bound) {
    bar._bound = true;
    document.addEventListener('pointerdown', (e) => {
      if (!openState) return;
      if (openState.panel.contains(e.target) || openState.btn.contains(e.target)) return;
      closeMenu();
    }, true);
    window.addEventListener('resize', () => closeMenu());
    bar.addEventListener('scroll', () => closeMenu());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openState) closeMenu(true); });
  }
}

export function openDialog(title, body) {
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const prev = document.activeElement;
  const x = el('button', { type: 'button', class: 'btn', 'aria-label': 'Schließen', text: '✕' });
  x.addEventListener('click', close);
  const box = el('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'dlg-head' }, el('h2', { text: title }), x), body);
  const wrap = el('div', { class: 'dlg-wrap' }, box);
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  x.focus();
  return close;
}
