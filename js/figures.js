// Figures stand out when they are not buried in a sentence. These pull the
// leading number out of a line such as "2 fields failed testing in test. Fix
// the match or the data, then send again." into the number, what it counts,
// and what to do about it.

const LEAD = /^(\d[\d,]*)\s+([^.]+)\.\s*(.*)$/s;

/** { n, what, action } when the text starts with a number, otherwise null. */
export function leadFigure(text) {
  const m = LEAD.exec(String(text || '').trim());
  return m ? { n: m[1], what: m[2].trim(), action: m[3].trim() } : null;
}

/** Red for failures and serious problems, green for passes, otherwise plain. */
export function figureTone(id = '', what = '') {
  if (/^(failed|live-failed|serious)-/.test(id) || /\bfailed\b|\bserious\b/.test(what)) return 'bad';
  if (/^to-live-/.test(id) || /\bpassed\b/.test(what)) return 'good';
  return '';
}

/** "2 failed" becomes "<strong>2</strong> failed" so the number is seen first. */
export function boldLeadNumber(text, esc) {
  const m = /^(\d[\d,]*)(\s.*)?$/s.exec(String(text || ''));
  return m ? `<strong class="fig-inline">${esc(m[1])}</strong>${esc(m[2] || '')}` : esc(text);
}

/** One to-do row: the figure in its own column, then what it counts, then what to do. */
export function todoRowHtml(t, { esc, href, chip = '' }) {
  const f = leadFigure(t.text);
  const tone = f ? figureTone(t.id, f.what) || 'plain' : 'none';
  const body = f
    ? `<span class="home-todo-what">${esc(f.what)}</span>${f.action ? `<span class="home-todo-action">${esc(f.action)}</span>` : ''}`
    : esc(t.text);
  return `<li>
      <span class="fig fig-${tone}">${f ? esc(f.n) : ''}</span>
      <span class="home-todo-text">${body}</span>
      ${chip}
      <a class="btn btn-ghost btn-sm" href="${href}">Open</a></li>`;
}

/** Board and step cells: failures in red, anything else waiting in amber. */
export function cellTone(state, text) {
  return state === 'open' && /\bfailed\b/.test(String(text)) ? 'failed' : state;
}
