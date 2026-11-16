// The page side of govuk.js: show and clear errors on a form or dialog.

import { errorSummaryHtml, errorMessageHtml } from './govuk.js';

export function clearErrors(root) {
  if (!root) return;
  root.querySelectorAll('.error-summary, .error-message').forEach(el => el.remove());
  root.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
  root.querySelectorAll('[aria-invalid]').forEach(el => {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  });
}

// Shows the error summary at the top of root and a message by each box.
// Returns true when there were errors, so callers can write
// `if (showErrors(form, errors)) return;`.
export function showErrors(root, errors, { focus = true } = {}) {
  clearErrors(root);
  if (!root || !errors?.length) return false;
  root.insertAdjacentHTML('afterbegin', errorSummaryHtml(errors));
  for (const e of errors) {
    const target = root.querySelector(`#${CSS.escape(e.id)}`);
    if (!target) continue;
    const holder = target.closest('.field, fieldset, .team-add-form') || target.parentElement;
    holder?.classList.add('has-error');
    const msg = errorMessageHtml(e.id, e.text);
    if (target.tagName === 'FIELDSET') target.querySelector('legend')?.insertAdjacentHTML('afterend', msg);
    else target.insertAdjacentHTML('beforebegin', msg);
    const input = target.matches('input, textarea, select') ? target : null;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${e.id}-error`);
    }
  }
  const summary = root.querySelector('.error-summary');
  summary.querySelectorAll('a[data-error-for]').forEach(a => a.addEventListener('click', ev => {
    ev.preventDefault();
    const t = root.querySelector(`#${CSS.escape(a.dataset.errorFor)}`);
    const box = t?.matches('input, textarea, select') ? t : t?.querySelector('input, textarea, select');
    box?.focus();
  }));
  if (focus) summary.focus();
  return true;
}
