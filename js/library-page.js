// The route library page on the website. Every number and list here is
// worked out from the library itself (system-profiles.js), so the page can
// never claim more than MapBridge holds.

import { PROFILES, SOURCE_KIND, AREA_STATUS, libraryBoard, libraryStats, libraryLog, profileFieldCount } from './system-profiles.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const day = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, one, many) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export function statsHtml(s) {
  const stat = (n, label, note = '') => `
    <div class="lib-stat">
      <span class="lib-stat-number">${esc(n)}</span>
      <span class="lib-stat-label">${esc(label)}</span>
      ${note ? `<span class="lib-stat-note">${esc(note)}</span>` : ''}
    </div>`;
  return `
    ${stat(s.lists.toLocaleString('en-GB'), s.lists === 1 ? 'field list held' : 'field lists held')}
    ${stat(s.fields.toLocaleString('en-GB'), 'fields described')}
    ${stat(`${s.areasReady} of ${s.areas}`, 'service areas covered')}
    ${stat(s.bySupplier.toLocaleString('en-GB'), 'checked by suppliers', s.bySupplier ? '' : 'Be the first')}`;
}

export function boardHtml(board) {
  return board.map(a => `
    <tr>
      <th scope="row">${esc(a.name)}</th>
      <td><span class="lib-status lib-status-${a.status}">${esc(AREA_STATUS[a.status])}</span></td>
      <td>${a.held.length ? a.held.map(esc).join('<br>') : a.planned.length ? `<span class="lib-muted">Next: ${a.planned.map(esc).join(', ')}</span>` : '<span class="lib-muted">Tell us if you need this</span>'}</td>
    </tr>`).join('');
}

export function listsHtml(profiles) {
  return profiles.map(p => `
    <article class="lib-card">
      <h3>${esc(p.system)}</h3>
      <p class="lib-card-meta"><span class="lib-badge lib-badge-${esc(p.source.kind)}">${esc(SOURCE_KIND[p.source.kind]?.label || '')}</span>
        ${esc(plural(profileFieldCount(p), 'field', 'fields'))} in ${esc(plural(p.tables.length, 'table', 'tables'))} · ${esc(p.version)}</p>
      <p>${esc(p.note)}</p>
      <p class="lib-card-meta">From <a href="${esc(p.source.url)}" rel="noopener">${esc(p.source.label)}</a>. Checked ${esc(p.checked)}.</p>
    </article>`).join('');
}

export function logHtml(log) {
  return log.map(e => `<li><time datetime="${esc(e.date)}">${esc(day(e.date))}</time> <span>${esc(e.text)}</span></li>`).join('');
}

function render() {
  const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  put('lib-stats', statsHtml(libraryStats()));
  put('lib-board', boardHtml(libraryBoard()));
  put('lib-lists', listsHtml(PROFILES));
  put('lib-log', logHtml(libraryLog()));
}

if (typeof document !== 'undefined') render();
