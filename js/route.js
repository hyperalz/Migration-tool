// The start questions. A few plain answers decide which tools Field lists
// shows, so people see the route that fits their move instead of every
// tool at once. "Not sure" (or no answer, as in older projects) shows
// everything. Nothing someone has already added is ever hidden.

import { screenTables } from './trace.js';

export const QUESTIONS = [
  { key: 'oldSystemOpen', text: 'Can you still open the old system?',
    yes: 'You can add its field list from a file.', no: 'You can make a field list from pictures of its screens.',
    saidYes: 'The old system still opens.', saidNo: 'The old system cannot be opened.' },
  { key: 'oldDatabase', text: 'Can you still reach the old system\'s database?',
    yes: 'You can link screen names to the real fields in it.', no: 'Screen names stay as names only. You match them by hand.',
    saidYes: 'You can reach its database.', saidNo: 'You cannot reach its database.' },
  { key: 'supplierSheet', text: 'Do you have the supplier\'s mapping spreadsheet?',
    yes: 'Start with it. It brings the new system\'s fields, the areas and any matches.', no: 'Add the new system\'s field list yourself.',
    saidYes: 'You have the supplier\'s mapping spreadsheet.', saidNo: 'You do not have the supplier\'s mapping spreadsheet.' },
];

export const ROUTE_TEXT = {
  lead: 'Three questions decide which tools you see. You can change the answers at any time.',
  notSure: 'Not sure',
  summary: 'What you have',
  unanswered: 'Answer three questions to see only the tools you need.',
  oldFromScreens: 'You said the old system cannot be opened. Its field list comes from pictures of its screens, above.',
};

// Stored answers are true, false or null (not answered or not sure).
export function readAnswer(value) {
  if (value === true || value === 'yes') return true;
  if (value === false || value === 'no') return false;
  return null;
}

export function routeFromForm(get) {
  return Object.fromEntries(QUESTIONS.map(q => [q.key, readAnswer(get(q.key))]));
}

/**
 * Which boxes Field lists shows, and in what order.
 * @returns {{ order: string[], oldUpload: boolean, answered: boolean }}
 */
export function fieldListsPlan(project) {
  const r = project?.route || {};
  const has = {
    template: Boolean(project?.templateImport),
    screens: screenTables(project?.sourceSchema).length > 0 || Boolean(project?.screenshotImport),
    trace: (project?.traceRuns || []).length > 0 || Boolean(project?.traceResult),
    oldList: (project?.sourceSchema?.tables || []).some(t => t.origin !== 'screenshot' && !String(t.name).startsWith('Screen: ')),
  };
  const show = {
    template: r.supplierSheet !== false || has.template,
    screenshots: r.oldSystemOpen !== true || has.screens,
    trace: (r.oldSystemOpen !== true && r.oldDatabase !== false) || has.trace,
  };
  // The supplier's spreadsheet comes first when the user has one.
  const order = r.supplierSheet === false
    ? ['screenshots', 'trace', 'template']
    : ['template', 'screenshots', 'trace'];
  return {
    order: order.filter(k => show[k]),
    oldUpload: r.oldSystemOpen !== false || has.oldList,
    answered: QUESTIONS.some(q => readAnswer(r[q.key]) !== null),
  };
}

/** The answers in plain words, for the summary line. */
export function routeSummary(project) {
  const r = project?.route || {};
  return QUESTIONS.map(q => {
    const a = readAnswer(r[q.key]);
    return a === null ? null : (a ? q.saidYes : q.saidNo);
  }).filter(Boolean);
}

/** Each question with its answer, for a "check your answers" list. */
export function routeAnswerRows(project) {
  const r = project?.route || {};
  return QUESTIONS.map(q => {
    const a = readAnswer(r[q.key]);
    return { key: q.text, value: a === null ? ROUTE_TEXT.notSure : (a ? 'Yes' : 'No') };
  });
}

/** The questions as radio buttons. Pure HTML, so it can be tested. */
export function routeQuestionsHtml(route, esc, prefix = 'rq') {
  const r = route || {};
  return QUESTIONS.map(q => {
    const a = readAnswer(r[q.key]);
    const opt = (value, label, on) => `<label class="route-opt"><input type="radio" name="${q.key}" value="${value}" ${on ? 'checked' : ''}> ${label}</label>`;
    return `
      <fieldset class="route-q" id="${prefix}-${q.key}">
        <legend>${esc(q.text)}</legend>
        ${opt('yes', 'Yes', a === true)}${opt('no', 'No', a === false)}${opt('', esc(ROUTE_TEXT.notSure), a === null)}
        <p class="route-hint">Yes: ${esc(q.yes)} No: ${esc(q.no)}</p>
      </fieldset>`;
  }).join('');
}

/** The box to open first, from the answers: the next thing to do on this route. */
export function firstBox(project) {
  const r = project?.route || {};
  if (r.supplierSheet === true && !project?.templateImport) return 'template';
  if (r.oldSystemOpen === false && !screenTables(project?.sourceSchema).length) return 'screenshots';
  return null;
}
