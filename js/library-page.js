// The route library page on the website. Every number and list here is
// worked out from the library itself (system-profiles.js), so the page can
// never claim more than MapBridge holds.

import { PROFILES, SOURCE_KIND, LIST_TYPE, CORE_TEXT, isCoreList, listTypeOf, AREA_STATUS, libraryBoard, libraryStats, libraryLog, profileFieldCount } from './system-profiles.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const day = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const plural = (n, one, many) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

export function statsHtml(s) {
  const n = x => x.toLocaleString('en-GB');
  const stat = (num, label, note = '') => `
    <div class="lib-stat">
      <span class="lib-stat-number">${esc(num)}</span>
      <span class="lib-stat-label">${esc(label)}</span>
      ${note ? `<span class="lib-stat-note">${esc(note)}</span>` : ''}
    </div>`;
  return `
    ${stat(n(s.systems), s.systems === 1 ? 'system list' : 'system lists', s.systems ? '' : 'Planned: finance first')}
    ${stat(n(s.statutory), s.statutory === 1 ? 'statutory return list' : 'statutory return lists')}
    ${stat(n(s.fields), 'fields described', s.coreFields ? `${n(s.coreFields)} are core fields of system lists` : '')}
    ${stat(`${s.areasWithAny} of ${s.areas}`, 'service areas with a list')}
    ${stat(n(s.bySupplier), 'checked by suppliers', s.bySupplier ? '' : 'Be the first')}`;
}

export function boardHtml(board) {
  const cell = (items, empty) => items.length ? items.map(esc).join('<br>') : `<span class="lib-muted">${esc(empty)}</span>`;
  return board.map(a => `
    <tr>
      <th scope="row">${esc(a.name)}</th>
      <td><span class="lib-status lib-status-${a.status}">${esc(AREA_STATUS[a.status])}</span></td>
      <td>${cell(a.systems, a.planned.length ? `Next: ${a.planned.join(', ')}` : a.statutory.length ? 'None yet' : 'Tell us if you need this')}${a.systems.length && a.planned.length ? `<br><span class="lib-muted">Next: ${a.planned.map(esc).join(', ')}</span>` : ''}</td>
      <td>${cell(a.statutory, 'None yet')}</td>
    </tr>`).join('');
}

export function listsHtml(profiles, type) {
  const lists = profiles.filter(p => listTypeOf(p) === type);
  if (!lists.length) {
    return `<p class="lib-empty">${type === 'system'
      ? 'No system lists yet. The first are planned for finance: Oracle Fusion, SAP S/4HANA and Microsoft Dynamics 365. Suppliers can register their own.'
      : 'No statutory return lists yet.'}</p>`;
  }
  return `<div class="lib-cards">${lists.map(p => `
    <article class="lib-card">
      <h3>${esc(p.system)}</h3>
      <p class="lib-card-meta"><span class="lib-type lib-type-${type}">${esc(LIST_TYPE[type].label)}</span><span class="lib-badge lib-badge-${esc(p.source.kind)}">${esc(SOURCE_KIND[p.source.kind]?.label || '')}</span>
        ${esc(isCoreList(p) ? CORE_TEXT.count(profileFieldCount(p)) : plural(profileFieldCount(p), 'field', 'fields'))} in ${esc(plural(p.tables.length, 'table', 'tables'))} · ${esc(p.version)}</p>
      <p>${esc(p.note)}</p>
      ${isCoreList(p) ? `<p class="lib-core"><strong>${esc(CORE_TEXT.label)}.</strong> ${esc(p.fullRecord || CORE_TEXT.more)}</p>` : ''}
      <p class="lib-card-meta">From <a href="${esc(p.source.url)}" rel="noopener">${esc(p.source.label)}</a>. Checked ${esc(p.checked)}.</p>
    </article>`).join('')}</div>`;
}

export function logHtml(log) {
  return log.map(e => `<li><time datetime="${esc(e.date)}">${esc(day(e.date))}</time> <span>${esc(e.text)}</span></li>`).join('');
}

function render() {
  const put = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  put('lib-stats', statsHtml(libraryStats()));
  put('lib-board', boardHtml(libraryBoard()));
  put('lib-lists-system', listsHtml(PROFILES, 'system'));
  put('lib-lists-statutory', listsHtml(PROFILES, 'statutory'));
  put('lib-log', logHtml(libraryLog()));
}

if (typeof document !== 'undefined') render();
