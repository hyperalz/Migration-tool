// System profiles: ready field lists for common systems.
//
// A profile holds field names, types, whether a field is needed, and notes
// written in our own words. Never data, never a supplier's own files or help
// text. Every profile says where it came from and when it was checked, so a
// council can trace each field definition and we can remove a profile quickly
// if its owner asks.
//
// Pure functions and plain data, so they can be tested.

export const SOURCE_KIND = {
  standard: { label: 'Public standard', note: 'Published by government for anyone to use.' },
  docs: { label: 'Public documentation', note: "Field names taken from the supplier's public documentation. Not checked by the supplier." },
  supplier: { label: 'Checked by supplier', note: 'Sent to us and checked by the supplier.' },
};

export const PROFILE_TEXT = {
  routeTitle: 'Use a ready field list',
  routeBest: 'When MapBridge already holds a list for this system.',
  routeGives: 'A starting list of the main fields, with where it came from. Add your own fields to it afterwards.',
  pick: 'Choose a field list',
  use: 'Use this list',
  none: 'MapBridge does not hold a ready list for this system yet. Use one of the other ways in.',
  starter: 'A starting point, not the whole system. Your own setup will have more fields.',
  checked: when => `Checked ${when}`,
};

export const PROFILES = [
  {
    id: 'dfe-cbds-pupil-starter',
    system: 'Schools: pupil records (England)',
    area: 'Schools',
    version: 'Starter set',
    checked: 'November 2026',
    added: '2026-11-23',
    source: {
      kind: 'standard',
      label: 'DfE common basic data set (CBDS)',
      url: 'https://www.gov.uk/government/publications/common-basic-data-set-cbds-database',
    },
    note: 'Common pupil, address and contact fields that school systems in England must support. Written in our own words from the DfE common basic data set. It is a starter set: it leaves out most items and does not give the DfE item numbers, so check details against the current CBDS workbook. For schools in Wales, use the Wales list, which follows the Welsh Government census.',
    tables: [
      {
        name: 'Pupil',
        columns: [
          { name: 'Unique pupil number', type: 'string', required: true, values: '13 characters, starting with a check letter', description: 'The number that follows a pupil between schools in England.' },
          { name: 'Former unique pupil number', type: 'string', required: false, values: '13 characters', description: 'An earlier number, if the pupil had one.' },
          { name: 'Unique learner number', type: 'string', required: false, values: '10 digits', description: 'The number used for qualifications, usually from age 14.' },
          { name: 'Legal surname', type: 'string', required: true, description: 'Surname as it appears on legal documents.' },
          { name: 'Legal forename', type: 'string', required: true, description: 'First name as it appears on legal documents.' },
          { name: 'Middle names', type: 'string', required: false, description: 'Any other names.' },
          { name: 'Preferred surname', type: 'string', required: false, description: 'The surname the pupil is known by, if different.' },
          { name: 'Preferred forename', type: 'string', required: false, description: 'The first name the pupil is known by, if different.' },
          { name: 'Date of birth', type: 'date', required: true, description: 'The pupil\'s date of birth.' },
          { name: 'Sex', type: 'code', required: true, values: 'CBDS code set', description: 'Recorded using the code set in the CBDS.' },
          { name: 'Ethnicity', type: 'code', required: false, values: 'CBDS ethnicity code set', description: 'Recorded using the CBDS ethnicity codes, including refused and not obtained.' },
          { name: 'First language', type: 'code', required: false, values: 'CBDS language code set', description: 'The language the pupil was first exposed to.' },
          { name: 'Enrolment status', type: 'code', required: true, values: 'CBDS code set', description: 'Whether the pupil is on roll here only, or also at another school.' },
          { name: 'Entry date', type: 'date', required: true, description: 'The date the pupil joined this school.' },
          { name: 'National curriculum year group', type: 'code', required: true, values: 'CBDS code set', description: 'The year group the pupil is taught in.' },
          { name: 'Free school meal eligibility start date', type: 'date', required: false, description: 'When a period of eligibility began. A pupil can have several periods.' },
          { name: 'Free school meal eligibility end date', type: 'date', required: false, description: 'When that period ended. Blank if it has not ended.' },
          { name: 'Special educational needs provision', type: 'code', required: false, values: 'CBDS code set', description: 'The type of special educational needs support, if any.' },
        ],
      },
      {
        name: 'Pupil address',
        columns: [
          { name: 'House name or number', type: 'string', required: false, description: 'The building the pupil lives in.' },
          { name: 'Street', type: 'string', required: false, description: 'Street name.' },
          { name: 'Town', type: 'string', required: false, description: 'Town or city.' },
          { name: 'Postcode', type: 'string', required: true, values: 'UK postcode', description: 'Used for funding and local authority returns.' },
        ],
      },
      {
        name: 'Contact',
        columns: [
          { name: 'Contact surname', type: 'string', required: true, description: 'Surname of a parent, carer or other contact.' },
          { name: 'Contact forename', type: 'string', required: true, description: 'First name of the contact.' },
          { name: 'Relationship to pupil', type: 'code', required: true, values: 'CBDS code set', description: 'For example, mother, father or carer.' },
          { name: 'Parental responsibility', type: 'boolean', required: false, values: 'Yes or No', description: 'Whether the contact has parental responsibility.' },
          { name: 'Contact priority', type: 'number', required: false, values: '1 is first', description: 'The order in which to contact people.' },
          { name: 'Telephone number', type: 'string', required: false, description: 'A number the school can call.' },
          { name: 'Email address', type: 'string', required: false, description: 'An address the school can write to.' },
        ],
      },
    ],
  },
  {
    id: 'wg-plasc-pupil-2026',
    system: 'Schools: pupil records (Wales)',
    area: 'Schools',
    version: 'PLASC January 2026',
    checked: 'November 2026',
    added: '2026-11-23',
    source: {
      kind: 'standard',
      label: 'Welsh Government PLASC technical completion notes, January 2026',
      url: 'https://www.gov.wales/sites/default/files/publications/2026-01/technical-completion-notes-pupil-annual-school-census-jan-2026.pdf',
    },
    note: 'The pupil fields schools in Wales send in the Pupil Level Annual School Census (PLASC), with the formats and codes it sets out. Notes are in our own words. Some fields only apply to some types of school, and some may be blank for children under 5. Codes for ethnicity and first language are in the annexes of the notes. Wales also has its own version of the common basic data set, held on DEWi for software suppliers.',
    tables: [
      {
        name: 'Pupil',
        columns: [
          { name: 'Unique Pupil Number (UPN)', type: 'string', required: true, values: '13 letters or numbers', description: 'The number that follows a pupil between schools.' },
          { name: 'Former UPN', type: 'string', required: false, values: '13 letters or numbers', description: 'A temporary or earlier number the pupil held while at the school.' },
          { name: 'Unique Learner Number (ULN)', type: 'string', required: false, values: '10 letters or numbers', description: 'Needed for secondary and middle schools only.' },
          { name: 'Surname', type: 'string', required: true, values: 'Up to 35 characters', description: 'The pupil\'s surname.' },
          { name: 'Forename', type: 'string', required: true, values: 'Up to 35 characters', description: 'Full first name, not a shortened form.' },
          { name: 'Middle name(s)', type: 'string', required: false, values: 'Up to 35 characters', description: 'Full middle names, not shortened.' },
          { name: 'Date of birth', type: 'date', required: true, values: 'CCYY-MM-DD', description: 'The pupil\'s date of birth.' },
          { name: 'Sex', type: 'code', required: true, values: 'M or F', description: 'As recognised in law.' },
          { name: 'Enrolment status', type: 'code', required: true, values: 'C single registration, M main dual, S subsidiary dual, G guest', description: 'Only C and M pupils count towards funding.' },
          { name: 'Date of entry to current school', type: 'date', required: true, values: 'CCYY-MM-DD', description: 'When the pupil joined this school.' },
          { name: 'Part time indicator', type: 'boolean', required: true, values: 'True or False', description: 'Part time means fewer than 10 sessions a week.' },
          { name: 'Boarder indicator', type: 'code', required: false, values: 'B, 6, 7 or N', description: 'Special schools only.' },
          { name: 'NC year group', type: 'code', required: true, values: 'N1, N2, R, 1 to 13, or 14', description: 'The year group the pupil is taught in for most of their time.' },
          { name: 'Class name', type: 'string', required: false, values: 'Up to 30 characters', description: 'Primary and middle schools only. Must match a class in the classes section.' },
          { name: 'Home postcode', type: 'string', required: true, values: 'Up to 8 characters, with one space in the middle', description: 'Blank only when the postcode is genuinely not known.' },
        ],
      },
      {
        name: 'Pupil characteristics',
        columns: [
          { name: 'National identity', type: 'code', required: true, values: 'WAL, ENG, SCO, IRE, BRI, OTH, REF or NOS', description: 'Different codes from England, so it does not carry across directly.' },
          { name: 'Ethnicity', type: 'code', required: true, values: '4 characters, from the annex to the notes', description: 'The pupil\'s ethnic background.' },
          { name: 'Source of ethnicity', type: 'code', required: true, values: 'C, P, S, T or O', description: 'Who gave the ethnicity: child, parent, this school, previous school, or other.' },
          { name: 'Pupil Free School Meal eligibility', type: 'boolean', required: true, values: '1 or 0', description: 'Whether the pupil is eligible for free school meals.' },
          { name: 'Pupil free school meal transitional protection', type: 'boolean', required: true, values: '1 or 0', description: 'Kept separate from eligibility.' },
          { name: 'English as an additional language', type: 'code', required: false, values: 'A, B, C, D, E or O', description: 'Stage of learning English, from new to fluent, or not applicable.' },
          { name: 'Language type', type: 'code', required: false, values: 'F, M, H, T, S or C', description: 'Which kind of language the first language code describes.' },
          { name: 'First language code', type: 'code', required: false, values: '4 characters, from the annex to the notes', description: 'The pupil\'s first language.' },
          { name: 'Language source', type: 'code', required: false, values: 'C, P, S, T or O', description: 'Who gave the language information.' },
        ],
      },
      {
        name: 'Welsh language',
        columns: [
          { name: 'Fluency in Welsh', type: 'code', required: false, values: '1, 2, 3 or 4', description: 'Fluent, can speak but not fluently, cannot speak, or refused. Primary, secondary and middle schools.' },
          { name: 'Speaking Welsh in the home', type: 'code', required: false, values: '0, 1 or 2', description: 'No, yes, or not applicable. Primary, secondary and middle schools.' },
          { name: 'Welsh source', type: 'code', required: false, values: 'See the notes', description: 'Who gave the Welsh language information.' },
          { name: 'Study of Welsh', type: 'code', required: false, values: 'One character, see the notes', description: 'How the pupil studies Welsh. Primary, secondary and middle schools.' },
          { name: 'Welsh medium education', type: 'boolean', required: false, values: 'True or False', description: 'Secondary and middle schools only.' },
        ],
      },
      {
        name: 'Additional learning needs',
        columns: [
          { name: 'Pupil ALN provision', type: 'code', required: true, values: 'N, C or L', description: 'No additional learning need, a plan kept by the school, or a plan kept by the local authority. Replaces the old SEN fields.' },
          { name: 'Additional needs', type: 'code', required: true, values: 'Up to 4 characters, from a fixed list, or DNA', description: 'The type of need, such as dyslexia or autism. DNA means does not apply.' },
        ],
      },
      {
        name: 'Exclusions',
        columns: [
          { name: 'Start date of exclusion', type: 'date', required: true, values: 'CCYY-MM-DD', description: 'For exclusions in the previous school year.' },
          { name: 'Exclusion reason', type: 'code', required: true, values: '2 characters, see the notes', description: 'Why the pupil was excluded.' },
          { name: 'Exclusion category', type: 'code', required: true, values: '4 characters, see the notes', description: 'The kind of exclusion.' },
          { name: 'Number of sessions missed', type: 'number', required: true, values: 'Up to 3 digits', description: 'Sessions the pupil missed because of the exclusion.' },
        ],
      },
    ],
  },
];

// ---- The library in public: what is held, what is next ----

/**
 * The areas councils and schools move systems in. An area is "Ready" when
 * the library holds a list for it, "Planned" when lists are lined up from
 * public sources, and "Not started" otherwise. Only list what is really
 * planned: this is shown on the website as progress.
 */
export const LIBRARY_AREAS = [
  { name: 'Schools', planned: [] },
  { name: 'Finance', planned: ['Oracle Fusion: suppliers', 'SAP S/4HANA: finance', 'Microsoft Dynamics 365 Finance'] },
  { name: 'HR and payroll', planned: [] },
  { name: 'Housing', planned: [] },
  { name: 'Revenues and benefits', planned: [] },
  { name: 'Social care', planned: [] },
];

export const AREA_STATUS = { ready: 'Ready', planned: 'Planned', none: 'Not started' };

/** Each area with its status and the lists held for it. */
export function libraryBoard(profiles = PROFILES, areas = LIBRARY_AREAS) {
  return areas.map(a => {
    const held = profiles.filter(p => p.area === a.name);
    const status = held.length ? 'ready' : a.planned.length ? 'planned' : 'none';
    return { name: a.name, status, held: held.map(p => p.system), planned: a.planned };
  });
}

/** The headline numbers. Worked out from the library, so they are always true. */
export function libraryStats(profiles = PROFILES, areas = LIBRARY_AREAS) {
  const board = libraryBoard(profiles, areas);
  return {
    lists: profiles.length,
    fields: profiles.reduce((n, p) => n + profileFieldCount(p), 0),
    areasReady: board.filter(a => a.status === 'ready').length,
    areas: areas.length,
    bySupplier: profiles.filter(p => p.source?.kind === 'supplier').length,
  };
}

/** What was added and when, newest first. */
export function libraryLog(profiles = PROFILES) {
  return profiles
    .filter(p => p.added)
    .map(p => ({ date: p.added, text: `Added ${p.system}, ${profileFieldCount(p)} fields`, source: p.source.label }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.text.localeCompare(b.text));
}

export function getProfile(id, profiles = PROFILES) {
  return profiles.find(p => p.id === id) || null;
}

export function profileFieldCount(profile) {
  return (profile?.tables || []).reduce((n, t) => n + (t.columns?.length || 0), 0);
}

/** Where a profile came from, in one line. */
export function profileSourceLine(profile) {
  const kind = SOURCE_KIND[profile?.source?.kind];
  if (!kind) return '';
  return `${kind.label}: ${profile.source.label}. ${PROFILE_TEXT.checked(profile.checked)}.`;
}

/**
 * A profile as a field list MapBridge can use. Each field keeps a note of
 * where its definition came from, so the trail survives matching and sign-off.
 */
export function profileToSchema(profile) {
  return {
    system: profile.system,
    tables: profile.tables.map(t => ({
      name: t.name,
      columns: t.columns.map(c => ({
        name: c.name,
        type: c.type || 'string',
        required: Boolean(c.required),
        description: c.description || '',
        values: c.values || '',
      })),
    })),
  };
}

/** What to record on the project, so the sign-off pack can name the source. */
export function profileRecord(profile) {
  return {
    id: profile.id,
    system: profile.system,
    version: profile.version,
    source: profileSourceLine(profile),
    url: profile.source?.url || '',
  };
}

// ---- The supplier template and its check ----

export const TEMPLATE_COLUMNS = ['Table', 'Field', 'Type', 'Required', 'Description', 'Values', 'Release'];
const ALLOWED_TYPES = ['text', 'number', 'decimal', 'date', 'date and time', 'yes or no', 'code'];
const TYPE_ALIASES = {
  string: 'text', varchar: 'text', char: 'text', nvarchar: 'text',
  int: 'number', integer: 'number', bigint: 'number',
  float: 'decimal', double: 'decimal', numeric: 'decimal', money: 'decimal',
  datetime: 'date and time', timestamp: 'date and time',
  boolean: 'yes or no', bool: 'yes or no', 'yes/no': 'yes or no', flag: 'yes or no',
  'code list': 'code', lookup: 'code', enum: 'code',
};

/** The blank template, as CSV text, with one example row. */
export function templateCSV() {
  const rows = [
    TEMPLATE_COLUMNS,
    ['Supplier', 'Supplier number', 'text', 'No', 'Leave blank if the system numbers suppliers itself.', 'Up to 30 characters', '26D'],
  ];
  return rows.map(r => r.map(cell => /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell).join(',')).join('\n') + '\n';
}

const norm = s => String(s ?? '').trim();
const key = s => norm(s).toLowerCase();

/**
 * Check a filled-in template. `rows` is an array of arrays, heading row first.
 * Returns problems that stop the file being used (`errors`), things worth a
 * second look (`warnings`), and a summary when it can be read.
 */
export function checkTemplate(rows) {
  const errors = [];
  const warnings = [];
  const clean = (rows || []).filter(r => (r || []).some(c => norm(c)));
  if (!clean.length) return { errors: ['The file is empty.'], warnings, summary: null };

  const head = clean[0].map(key);
  const col = name => head.indexOf(name.toLowerCase());
  const missing = ['Table', 'Field', 'Type', 'Required'].filter(n => col(n) < 0);
  if (missing.length) {
    errors.push(`The first row needs these headings: ${missing.join(', ')}. Use the template so the columns match.`);
    return { errors, warnings, summary: null };
  }
  if (col('Description') < 0) warnings.push('There is no Description column. A short note on each field helps councils match it.');

  const seen = new Set();
  const tables = new Map();
  const releases = new Set();
  let noDescription = 0;
  clean.slice(1).forEach((r, i) => {
    const line = i + 2;
    const at = n => norm(r[col(n)]);
    const table = at('Table');
    const field = at('Field');
    if (!field) { errors.push(`Row ${line}: the Field is blank.`); return; }
    if (!table) { errors.push(`Row ${line}: the Table is blank for "${field}".`); return; }
    const id = `${table.toLowerCase()}␟${field.toLowerCase()}`;
    if (seen.has(id)) errors.push(`Row ${line}: "${table}: ${field}" appears more than once.`);
    seen.add(id);

    const rawType = key(at('Type'));
    const type = TYPE_ALIASES[rawType] || rawType;
    if (!rawType) errors.push(`Row ${line}: the Type is blank for "${field}".`);
    else if (!ALLOWED_TYPES.includes(type)) warnings.push(`Row ${line}: "${at('Type')}" is not a type we recognise for "${field}". Use one of: ${ALLOWED_TYPES.join(', ')}.`);

    const req = key(at('Required'));
    if (!['yes', 'no', 'y', 'n', 'true', 'false'].includes(req)) errors.push(`Row ${line}: Required should be Yes or No for "${field}".`);

    if (col('Description') >= 0 && !at('Description')) noDescription++;
    if (col('Release') >= 0 && at('Release')) releases.add(at('Release'));
    tables.set(table, (tables.get(table) || 0) + 1);
  });

  if (!tables.size && !errors.length) errors.push('There are no fields under the heading row.');
  if (noDescription) warnings.push(`${noDescription} ${noDescription === 1 ? 'field has' : 'fields have'} no description.`);
  if (releases.size > 1) warnings.push(`The file mixes releases: ${[...releases].join(', ')}. Send one release per file.`);
  if (col('Release') >= 0 && !releases.size) warnings.push('No release is given. Add the release the fields belong to.');

  const fields = [...tables.values()].reduce((a, b) => a + b, 0);
  return {
    errors,
    warnings,
    summary: tables.size ? { tables: tables.size, fields, release: [...releases][0] || '' } : null,
  };
}
