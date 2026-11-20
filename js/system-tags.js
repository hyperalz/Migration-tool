// One fixed look for each system, used on every page: the old system in warm
// grey with a clock, the new system in teal with an arrow into a box. Each
// always carries words too, so colour is never the only signal.

const ICON = {
  old: '<svg class="sys-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M12 8v4l2 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  new: '<svg class="sys-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3v11m-4-4 4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export const SYSTEM_WORD = { old: 'Old system', new: 'New system' };

const side = s => (s === 'source' || s === 'old' ? 'old' : 'new');

/** The "Old system" or "New system" tag. */
export function systemTag(s, esc, text = '') {
  const k = side(s);
  return `<span class="sys-tag sys-${k}">${ICON[k]}${esc(text || SYSTEM_WORD[k])}</span>`;
}

/** A field name shown in its system's colour, such as supplier.sort_code. */
export function fieldTag(s, name, esc) {
  const k = side(s);
  return `<span class="sys-field sys-${k}" title="${SYSTEM_WORD[k]}">${ICON[k]}<code>${esc(name)}</code></span>`;
}

/** old.field → new.field, each half in its own colour. */
export function fieldPairHtml(m, esc) {
  return `<span class="sys-pair">${fieldTag('old', `${m.sourceTable}.${m.sourceColumn}`, esc)}<span class="sys-arrow" aria-label="goes to">→</span>${fieldTag('new', `${m.targetTable}.${m.targetColumn}`, esc)}</span>`;
}
