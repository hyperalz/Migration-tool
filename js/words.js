// The names people see for the two systems. A project keeps the names the
// user gave (for example Synergy and Impulse), so every screen can use them.
// "the old system" and "the new system" are used only when no name was given.

const NO_NAME = /^(|other|generic|other \/ generic|none|n\/a)$/i;

function clean(name) {
  const n = String(name ?? '').trim();
  return NO_NAME.test(n) ? '' : n;
}

/** The old system's own name, or "the old system". */
export function oldName(project) {
  return clean(project?.sourceSystem) || 'the old system';
}

/** The new system's own name, or "the new system". */
export function newName(project) {
  return clean(project?.targetSystem) || 'the new system';
}

/** For headings: "Synergy (old system)", or just "Old system". */
export function oldLabel(project) {
  const n = clean(project?.sourceSystem);
  return n ? `${n} (old system)` : 'Old system';
}

export function newLabel(project) {
  const n = clean(project?.targetSystem);
  return n ? `${n} (new system)` : 'New system';
}
