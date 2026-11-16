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
  notStored: 'The pictures are made smaller in this browser and are not saved. Only the names that come back are kept.',
  labelOnly: 'From a screenshot, label only. This is the name shown on the screen. It is not the real name of the field.',
  reviewHelp: 'Tick each name you want to keep. You can fix a name or its kind first. Nothing is added until you press Add.',
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
- "screen" is the screen's title as shown. Use "" if there is none.
- "label" is the text next to the field, copied exactly as shown.
- "kind" is one of: "text", "date", "number", "yes/no", "pick-list". A tick box is "yes/no".
- "options" lists the choices of a pick-list only when they can be seen. Otherwise [].
- "required" is true only if the screen marks the field as required, for example with * or the word required.
- Do not list buttons, menus, tabs, headings or links.
- Never copy the values typed into fields. Never copy names, addresses, dates of birth or other personal details.`;

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

// When the AI on this computer cannot be reached. A browser cannot tell a
// stopped Ollama from one that blocks this website, so both are named.
export function localUnreachable(origin) {
  return `Could not reach the AI on this computer. Check that Ollama is running. Ollama must also allow this website. Set OLLAMA_ORIGINS to ${origin || 'this website'} and restart Ollama.`;
}

// The body sent to an OpenAI-compatible chat endpoint for one image.
export function buildRequest(dataUrl, settings) {
  return {
    model: settings.model || 'gpt-4o-mini',
    temperature: 0,
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
  for (const f of list) {
    const label = tidy(typeof f === 'string' ? f : f?.label);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = normaliseKind(f?.kind ?? f?.type);
    const options = kind === 'pick-list' && Array.isArray(f?.options)
      ? [...new Set(f.options.map(o => tidy(o, 60)).filter(Boolean))].slice(0, 50) : [];
    fields.push({ label, kind, options, required: f?.required === true || f?.required === 'true' });
  }
  return { screen: tidy(Array.isArray(data) ? '' : data.screen), fields };
}

export function screenName(result) {
  const name = result.screen || String(result.file || '').replace(/\.[a-z0-9]+$/i, '') || 'Unnamed screen';
  return SCREEN_PREFIX + name;
}

// Rows for the review table. Labels already in the old system list are marked.
export function reviewRows(results, sourceSchema) {
  const have = new Set((sourceSchema?.tables || []).flatMap(t => (t.columns || []).map(c => `${t.name}␟${c.name}`.toLowerCase())));
  const rows = [];
  results.forEach((r, i) => {
    const table = screenName(r);
    r.fields.forEach((f, j) => rows.push({
      id: `${i}-${j}`, table, ...f,
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
  if (c.failed) left.push(`${num(c.failed)} ${plural(c.failed, 'picture', 'pictures')} could not be read. Try ${plural(c.failed, 'it', 'them')} again.`);
  return { title: lines[0], detail: [lines[1], ...left], next: SHOT_TEXT.nextStep };
}
