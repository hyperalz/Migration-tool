// Small pieces borrowed from the GOV.UK Design System, drawn with
// MapBridge's own styles. Pure functions that return HTML, so they can be
// tested without a browser. See govuk-view.js for the parts that touch the page.
//
// Patterns used:
// - Error summary: a box at the top of the form that lists every problem,
//   each one a link to the box that needs fixing.
// - Error message: the same words again, right above the box.
// - Panel: a coloured box that confirms something important is done.
// - Summary list: questions and answers, each with a Change link.
// - Radios with a conditional reveal: an extra box shows only for one answer.

export const GOVUK_TEXT = {
  summaryTitle: 'There is a problem',
  errorPrefix: 'Error:',
  skip: 'Skip to main content',
  passQuestion: 'Did it pass?',
  passYes: 'Yes, it passed',
  passNo: 'No, it failed',
  failLabel: 'What went wrong?',
  failHint: 'Say what you saw, so it can be fixed.',
  choosePass: 'Choose if it passed or failed',
  sayWhatWentWrong: 'Say what went wrong',
  pickName: 'Pick or type at least one name',
  sayWhy: 'Say why you are recording it as passed',
  enterName: 'Enter your name',
  enterEmail: 'Enter your email address',
  enterPassword: 'Enter your password',
  enterArea: 'Enter the name of the area',
  areaThere: 'That area is already in the list',
  enterPerson: 'Enter the person’s full name',
  personThere: 'That name is already in the list',
  signedTitle: 'Area signed off',
  notSignedTitle: 'Recorded as not signed off',
};

const plainEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// errors: [{ id, text }] where id is the id of the box to fix.
export function errorSummaryHtml(errors, esc = plainEsc) {
  if (!errors?.length) return '';
  return `
    <div class="error-summary" role="alert" tabindex="-1" aria-labelledby="error-summary-title">
      <h2 class="error-summary-title" id="error-summary-title">${esc(GOVUK_TEXT.summaryTitle)}</h2>
      <ul class="error-summary-list">${errors.map(e => `<li><a href="#${esc(e.id)}" data-error-for="${esc(e.id)}">${esc(e.text)}</a></li>`).join('')}</ul>
    </div>`;
}

export function errorMessageHtml(id, text, esc = plainEsc) {
  return `<p class="error-message" id="${esc(id)}-error"><span class="visually-hidden">${esc(GOVUK_TEXT.errorPrefix)} </span>${esc(text)}</p>`;
}

// A confirmation panel. body is plain text.
export function panelHtml(title, body, esc = plainEsc) {
  return `
    <div class="confirm-panel" role="status">
      <h2 class="confirm-panel-title">${esc(title)}</h2>
      ${body ? `<div class="confirm-panel-body">${esc(body)}</div>` : ''}
    </div>`;
}

// rows: [{ key, value, href?, change? }]. The Change link names what it changes
// for screen readers.
export function summaryListHtml(rows, esc = plainEsc) {
  return `<dl class="summary-list">${rows.map(r => `
    <div class="summary-list-row">
      <dt class="summary-list-key">${esc(r.key)}</dt>
      <dd class="summary-list-value">${esc(r.value)}</dd>
      ${r.href ? `<dd class="summary-list-actions"><a href="${esc(r.href)}">${esc(r.change || 'Change')}<span class="visually-hidden"> ${esc(r.key.toLowerCase())}</span></a></dd>` : ''}
    </div>`).join('')}</dl>`;
}

// The "Did it pass?" question used when recording a check step.
export function passQuestionHtml(esc = plainEsc) {
  return `
    <fieldset class="route-q pass-q" id="pass-answer">
      <legend>${esc(GOVUK_TEXT.passQuestion)}</legend>
      <label class="route-opt"><input type="radio" name="pass" value="yes"> ${esc(GOVUK_TEXT.passYes)}</label>
      <label class="route-opt"><input type="radio" name="pass" value="no" aria-controls="pass-fail-reveal"> ${esc(GOVUK_TEXT.passNo)}</label>
      <div class="radio-reveal" id="pass-fail-reveal" hidden>
        <label for="pass-note">${esc(GOVUK_TEXT.failLabel)}</label>
        <p class="route-hint">${esc(GOVUK_TEXT.failHint)}</p>
        <textarea id="pass-note" rows="3"></textarea>
      </div>
    </fieldset>`;
}

// Checks the answer to the pass question. Returns { pass, note, errors }.
export function readPassAnswer(choice, note) {
  const n = String(note ?? '').trim();
  if (choice !== 'yes' && choice !== 'no') return { pass: null, note: n, errors: [{ id: 'pass-answer', text: GOVUK_TEXT.choosePass }] };
  if (choice === 'no' && !n) return { pass: false, note: n, errors: [{ id: 'pass-note', text: GOVUK_TEXT.sayWhatWentWrong }] };
  return { pass: choice === 'yes', note: choice === 'yes' ? '' : n, errors: [] };
}

// Turns required boxes into errors. fields: [{ id, value, text }].
export function requiredErrors(fields) {
  return fields.filter(f => !String(f.value ?? '').trim()).map(f => ({ id: f.id, text: f.text }));
}
