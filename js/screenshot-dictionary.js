// The "screenshot dictionary": when the old system can no longer be opened,
// pictures of its screens are often all that is left. This reads the field
// labels off those pictures with the AI service the user has set up, so a
// person can review them and add them to the old system's field list.
//
// Everything here is plain logic with no page access, so it can be tested in
// Node. The one network call is askAI(); tests pass a fake fetch to it.
//
// Rules this module keeps:
// - Images are never stored. Only the text that comes back is kept.
// - The AI only suggests labels. Nothing is added until a person ticks it,
//   and no pass or fail decision anywhere uses AI.
// - A label on a screen is not a table or field name, so every field added
//   from here is marked as "from a screenshot, label only".

// Words shown on screen. Kept here so the reading-level test can check them.
export const SHOT_TEXT = {
  title: 'Only have pictures of the old system?',
  lead: 'Add pictures of its screens. The AI will read the names of the boxes on each screen. You check each one before it is added.',
  warning: 'Take care. The pictures are sent to the AI service you chose in the AI settings. If a picture shows a real person, their details go too. Use a blank screen or a test record where you can.',
  agree: 'I have checked the pictures. They show no real person, or I am allowed to send them.',
  noKey: 'There is no AI key yet. Add your own key in the AI settings, then come back here. If you run Ollama on this computer, you do not need a key. Just set the address.',
  cloudModel: 'This model runs in Ollama\'s cloud, not on this computer. The pictures will leave this computer. Pick a model without :cloud in its name to keep them here.',
  notStored: 'The pictures are made smaller in this browser and are not saved. Only the names that come back are kept.',
  labelOnly: 'From a screenshot, label only. This is the name shown on the screen. It is not the real name of the field.',
  reviewHelp: 'Tick each name you want to keep. You can fix a name, its kind or the screen name first. Make sure no real person is named. Nothing is added until you press Add.',
  removedNote: 'Some words looked like a real person\'s details, so MapBridge took them out. Check the rest by eye.',
  nextStep: 'Add the new system list if it is not in yet. Then match these names to it on the Match screen.',
};

export const KINDS = ['text', 'date', 'number', 'yes/no', 'pick-list'];
export const MAX_EDGE = 1500;
export const MAX_FILES = 30;
export const SCREEN_PREFIX = 'Screen: ';

export const PROMPT = `You are looking at a screenshot of one screen from an old business system.
List the fields on the screen where a person types or picks a value.

Reply with JSON only. No other text. Use this shape:
{"screen": "name of the screen", "fields": [{"label": "label as shown", "kind": "text", "options": [], "required": false}]}

Rules:
- "screen" is the kind of screen, for example "Pupil details" or "Supplier record". Never put a person's name, a record number or any other value from the record in it. Use "" if you are not sure.
- "label" is the text next to the field, copied exactly as shown.
- "kind" is one of: "text", "date", "number", "yes/no", "pick-list". A tick box is "yes/no".
- "options" lists the choices of a pick-list only when they can be seen. Otherwise [].
- "required" is true only if the screen marks the field as required, for example with * or the word required.
- Do not list buttons, menus, tabs, headings or links.
- Never copy the values typed into fields. Never copy names, addresses, dates of birth or other personal details.
- If a label or a pick-list choice is a person's name, leave it out.`;

// ---------- keeping people's details out ----------
// The AI is told not to copy personal details, but it can still slip. This
// plain clean-up runs on every reply, with no AI involved. It cannot spot every
// name, so the person reviewing is asked to check too.
const PERSONAL = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,                                         // email
  /(?:\+44\s?|\b0)\d(?:[\s-]?\d){8,10}\b/g,                              // UK phone
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,                                // date 01/02/2010
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{2,4}\b/gi, // 1 Feb 2010
  /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g,                             // postcode
  /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,          // NI number
  /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr|Prof|Sir|Dame)\.?\s+[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,2}/g, // title and name
  /\b\d{5,}\b/g,                                                       // long ID or number
];

/** Take out anything that looks like personal details. */
export function scrubPersonal(text) {
  let out = String(text ?? '');
  let removed = false;
  for (const re of PERSONAL) {
    out = out.replace(re, () => { removed = true; return ' '; });
  }
  if (removed) out = out.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s,;:|/–—-]+|[\s,;:|/–—-]+$/g, '').trim();
  return { text: out, removed };
}

/**
 * The kind of screen, without the record it was showing. Titles such as
 * "Pupil details - Jane Smith" or "Supplier (Acme Ltd)" usually name the
 * record after a dash, colon, bar or bracket, or after "for", so that part
 * is dropped.
 */
export function cleanScreenName(title) {
  let s = String(title ?? '').replace(/\s+/g, ' ').trim();
  const before = s;
  s = s.split(/\s+[-–—|:]\s+|\s*[|:]\s+|\s+for\s+(?=[A-Z])/)[0];
  s = s.replace(/\s*[(\[][^)\]]*[)\]]?/g, '');
  const scrubbed = scrubPersonal(s);
  const text = scrubbed.text.replace(/[\s,;:|/–—-]+$/, '').trim().slice(0, 80);
  return { text, removed: scrubbed.removed || text !== before };
}


// Size to draw an image at so its long edge is at most maxEdge.
export function fitSize(width, height, maxEdge = MAX_EDGE) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

// Keep the first of each set of exact copies. items: [{ hash, ... }]
export function dropDuplicates(items, alreadySeen = new Set()) {
  const seen = new Set(alreadySeen);
  const keep = [];
  const duplicates = [];
  for (const item of items) {
    if (seen.has(item.hash)) { duplicates.push(item); continue; }
    seen.add(item.hash);
    keep.push(item);
  }
  return { keep, duplicates };
}

// True when the AI address is on this computer (for example Ollama), so
// the pictures never leave it and no key is needed.
export function isLocalAddress(baseURL) {
  try {
    const host = new URL(String(baseURL || '')).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host);
  } catch {
    return false;
  }
}

export function missingKey(settings) {
  return !isLocalAddress(settings?.baseURL) && !String(settings?.apiKey || '').trim();
}

// Ollama names models that run on its own servers "...:cloud" or "...-cloud".
export function isCloudModel(model) {
  return /[:-]cloud$/i.test(String(model || '').trim());
}

// Ollama on this computer speaks plain http. An https address fails with a
// connection error that looks like Ollama being down, so say what to change.
export function wrongLocalScheme(baseURL) {
  try {
    const u = new URL(String(baseURL || ''));
    return isLocalAddress(u.href) && u.protocol === 'https:' ? `http://${u.host}${u.pathname.replace(/\/+$/, '')}` : '';
  } catch {
    return '';
  }
}

// When the AI on this computer cannot be reached. A browser cannot tell a
// stopped Ollama from one that blocks this website, so both are named.
export function localUnreachable(origin) {
  return `Could not reach the AI on this computer. Check that Ollama is running. Ollama must also allow this website. Set OLLAMA_ORIGINS to ${origin || 'this website'} and restart Ollama.`;
}

// The body sent to an OpenAI-compatible chat endpoint for one image.
export function buildRequest(dataUrl, settings) {
  // For an AI on this computer (Ollama): turn off "thinking", which makes a
  // local model many times slower, and ask for JSON directly. Not sent to
  // other services, some of which reject these settings.
  const local = isLocalAddress(settings.baseURL)
    ? { reasoning_effort: 'none', response_format: { type: 'json_object' } } : {};
  return {
    model: settings.model || 'gpt-4o-mini',
    temperature: 0,
    ...local,
    messages: [
      { role: 'system', content: 'You read screenshots of business software and return only valid JSON.' },
      { role: 'user', content: [
        { type: 'text', text: PROMPT },
        // "high" so small labels stay readable; the image is already shrunk to keep the cost down.
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
      ] },
    ],
  };
}

// A short, plain reason when the AI service says no.
export function explainError(status) {
  if (status === 401 || status === 403) return 'The AI service did not accept your key. Check it in the AI settings.';
  if (status === 404) return 'The AI service could not find that address or model. Check the AI settings.';
  if (status === 413) return 'The picture was too big for the AI service.';
  if (status === 429) return 'The AI service is busy or your account is out of credit. Wait a little, then try again.';
  if (status >= 500) return 'The AI service had a problem. Try again later.';
  return `The AI service said no (code ${status}).`;
}

/**
 * The one call to the AI service. Sends one shrunk image, returns the reply text.
 * @param {string} dataUrl  the shrunk image as a data: URL (never stored)
 * @param {{baseURL:string, model:string, apiKey:string}} settings
 * @param {typeof fetch} [fetchImpl]
 */
export async function askAI(dataUrl, settings, fetchImpl = globalThis.fetch, origin = globalThis.location?.origin) {
  if (missingKey(settings)) throw new Error(SHOT_TEXT.noKey);
  const base = String(settings.baseURL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const key = String(settings.apiKey || '').trim();
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  let response;
  try {
    response = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildRequest(dataUrl, settings)),
    });
  } catch {
    const fixed = wrongLocalScheme(base);
    if (fixed) throw new Error(`Ollama uses http, not https. In the AI settings, change the address to ${fixed} and try again.`);
    throw new Error(isLocalAddress(base) ? localUnreachable(origin)
      : 'Could not reach the AI service. Check your connection and the address in the AI settings.');
  }
  if (!response.ok) throw new Error(explainError(response.status));
  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map(p => p?.text || '').join('') : content;
  if (!text) throw new Error('The AI service sent back nothing.');
  return text;
}

const tidy = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/[:*]+$/, '').trim().slice(0, max);

export function normaliseKind(kind) {
  const k = String(kind || '').toLowerCase().replace(/[\s_]+/g, '-');
  if (KINDS.includes(k)) return k;
  if (/^(yes-?no|y-?n|bool(ean)?|check-?box|tick(-?box)?|flag|toggle)$/.test(k)) return 'yes/no';
  if (/^(pick-?list|drop-?down|select|list|choice|combo(-?box)?|enum|lookup|radio)$/.test(k)) return 'pick-list';
  if (/date|time/.test(k)) return 'date';
  if (/^(number|numeric|integer|int|decimal|amount|money|currency)$/.test(k)) return 'number';
  return 'text';
}

/**
 * Turn the AI's reply into a clean screen result. Throws if it is not usable.
 * @returns {{screen:string, fields:{label:string, kind:string, options:string[], required:boolean}[]}}
 */
export function parseScreenReply(text) {
  let raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    try { data = m ? JSON.parse(m[0]) : null; } catch { data = null; }
  }
  if (!data || typeof data !== 'object') throw new Error('The AI reply was not in the right form. Try this picture again.');
  const list = Array.isArray(data) ? data : Array.isArray(data.fields) ? data.fields : null;
  if (!list) throw new Error('The AI reply had no list of fields. Try this picture again.');

  const fields = [];
  const seen = new Set();
  let removed = 0;
  for (const f of list) {
    // A label holding personal details is a value, not a label: drop it.
    const raw = tidy(typeof f === 'string' ? f : f?.label);
    const check = scrubPersonal(raw);
    if (check.removed) { removed++; continue; }
    const label = raw;
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = normaliseKind(f?.kind ?? f?.type);
    let options = [];
    if (kind === 'pick-list' && Array.isArray(f?.options)) {
      for (const o of f.options) {
        const t = tidy(o, 60);
        if (!t) continue;
        if (scrubPersonal(t).removed) { removed++; continue; }
        if (!options.includes(t)) options.push(t);
      }
      options = options.slice(0, 50);
    }
    fields.push({ label, kind, options, required: f?.required === true || f?.required === 'true' });
  }
  const screen = cleanScreenName(tidy(Array.isArray(data) ? '' : data.screen));
  if (screen.removed) removed++;
  return { screen: screen.text, fields, removed };
}

// The picture's file name is never used: it can hold a person's name.
export function screenName(result, n = 1) {
  return SCREEN_PREFIX + (cleanScreenName(result.screen).text || `Unnamed screen ${n}`);
}

// Rows for the review table. Labels already in the old system list are marked.
export function reviewRows(results, sourceSchema) {
  const have = new Set((sourceSchema?.tables || []).flatMap(t => (t.columns || []).map(c => `${t.name}␟${c.name}`.toLowerCase())));
  const rows = [];
  results.forEach((r, i) => {
    const table = screenName(r, i + 1);
    r.fields.forEach((f, j) => rows.push({
      id: `${i}-${j}`, table, screenKey: `s${i}`, ...f,
      already: have.has(`${table}␟${f.label}`.toLowerCase()),
      ticked: false,
    }));
  });
  return rows;
}

// The ticked rows as a field list grouped by screen, ready for mergeSchema.
export function screenshotSchema(rows) {
  const tables = new Map();
  for (const r of rows) {
    if (!r.ticked || r.already) continue;
    const label = tidy(r.label);
    if (!label) continue;
    if (!tables.has(r.table)) tables.set(r.table, { name: r.table, origin: 'screenshot', columns: [] });
    const t = tables.get(r.table);
    if (t.columns.some(c => c.name.toLowerCase() === label.toLowerCase())) continue;
    const kind = normaliseKind(r.kind);
    t.columns.push({
      name: label,
      type: kind,
      required: r.required === true,
      description: SHOT_TEXT.labelOnly,
      values: kind === 'pick-list' && r.options?.length ? r.options.join(', ') : '',
      origin: 'screenshot',
    });
  }
  return { system: '', tables: [...tables.values()] };
}

const num = n => Number(n).toLocaleString('en-GB');
const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/**
 * What one confirmed batch did, in plain words.
 * counts: { pictures, duplicates, failed, found, added, already, leftOut, screens }
 */
export function shotSummary(c) {
  const lines = [];
  lines.push(c.added
    ? `Added ${num(c.added)} ${plural(c.added, 'name')} from ${num(c.screens)} ${plural(c.screens, 'screen')} to the old system list.`
    : 'Nothing was added.');
  const read = `The AI read ${num(c.pictures)} ${plural(c.pictures, 'picture')} and found ${num(c.found)} ${plural(c.found, 'name')}.`;
  lines.push(read);
  const left = [];
  if (c.leftOut) left.push(`${num(c.leftOut)} ${plural(c.leftOut, 'name was', 'names were')} not ticked, so ${plural(c.leftOut, 'it was', 'they were')} left out.`);
  if (c.already) left.push(`${num(c.already)} ${plural(c.already, 'name was', 'names were')} in the list already.`);
  if (c.duplicates) left.push(`${num(c.duplicates)} ${plural(c.duplicates, 'picture was a copy', 'pictures were copies')}, so ${plural(c.duplicates, 'it was', 'they were')} not sent.`);
  if (c.removed) left.push(`${num(c.removed)} ${plural(c.removed, 'bit', 'bits')} that looked like a real person's details ${plural(c.removed, 'was', 'were')} taken out.`);
  if (c.failed) left.push(`${num(c.failed)} ${plural(c.failed, 'picture', 'pictures')} could not be read. Try ${plural(c.failed, 'it', 'them')} again.`);
  return { title: lines[0], detail: [lines[1], ...left], next: SHOT_TEXT.nextStep };
}
