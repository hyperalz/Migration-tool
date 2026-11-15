// A finance-system demo: schemas, mappings and two trial loads with planted
// faults, so the reconciliation checks and readiness report can be tried
// without real data. Every supplier, person and figure here is invented.

export const FINANCE_DEMO = 'finance';

export const legacyFinanceSchema = {
  system: 'Legacy finance system',
  tables: [
    {
      name: 'supplier',
      columns: [
        { name: 'supplier_id', type: 'int', required: true, description: 'Supplier number', values: 'Numeric ID' },
        { name: 'supplier_name', type: 'varchar(60)', required: true, description: 'Trading name of the supplier', values: 'Free text' },
        { name: 'status', type: 'char(1)', required: true, description: 'Supplier status', values: 'A = active, I = inactive, H = on hold' },
        { name: 'payment_terms', type: 'int', required: true, description: 'Days allowed for payment', values: 'Whole number of days' },
        { name: 'vat_code', type: 'char(1)', required: true, description: 'Default VAT treatment', values: 'S = standard, Z = zero, E = exempt' },
        { name: 'sort_code', type: 'varchar(8)', required: false, description: 'Bank sort code for payments', values: 'NN-NN-NN' },
        { name: 'contact_name', type: 'varchar(60)', required: false, description: 'Named contact at the supplier', values: 'Free text' },
        { name: 'last_payment_date', type: 'date', required: false, description: 'Date of the most recent payment', values: 'YYYY-MM-DD or blank' },
        { name: 'balance_outstanding', type: 'decimal(12,2)', required: true, description: 'Unpaid balance owed to the supplier', values: 'Pounds and pence' },
      ],
    },
    {
      name: 'gl_balance',
      columns: [
        { name: 'cost_centre', type: 'varchar(6)', required: true, description: 'Cost centre', values: 'Cost centre code' },
        { name: 'account_code', type: 'varchar(6)', required: true, description: 'Ledger account', values: 'Account code' },
        { name: 'period', type: 'varchar(10)', required: true, description: 'Accounting period', values: 'YYYY-PNN' },
        { name: 'balance', type: 'decimal(14,2)', required: true, description: 'Closing balance for the period', values: 'Pounds and pence, credits negative' },
      ],
    },
  ],
};

export const newFinanceSchema = {
  system: 'New finance system',
  tables: [
    {
      name: 'Supplier_Load',
      columns: [
        { name: 'SUPPLIER_REF', type: 'string', required: true, description: 'Supplier reference', values: 'Carried over from old supplier number' },
        { name: 'SUPPLIER_NAME', type: 'string(40)', required: true, description: 'Supplier trading name', values: 'Free text, 40 characters' },
        { name: 'STATUS', type: 'code', required: true, description: 'Supplier status', values: 'Active, Inactive, On hold' },
        { name: 'TERMS_DAYS', type: 'integer', required: true, description: 'Payment terms in days', values: 'Whole number' },
        { name: 'TAX_CODE', type: 'code', required: true, description: 'Default tax code', values: 'STD, ZERO, EXEMPT' },
        { name: 'BANK_SORT_CODE', type: 'string', required: false, description: 'Bank sort code', values: 'NN-NN-NN' },
        { name: 'CONTACT', type: 'string', required: false, description: 'Supplier contact name', values: 'Free text' },
        { name: 'LAST_PAID', type: 'date', required: false, description: 'Last payment date', values: 'DD/MM/YYYY' },
        { name: 'OPEN_BALANCE', type: 'decimal', required: true, description: 'Opening balance owed', values: 'Pounds and pence' },
      ],
    },
    {
      name: 'GL_Opening_Balance',
      columns: [
        { name: 'COST_CENTRE', type: 'string', required: true, description: 'Cost centre', values: 'Cost centre code' },
        { name: 'ACCOUNT', type: 'string', required: true, description: 'Ledger account', values: 'Account code' },
        { name: 'PERIOD', type: 'string', required: true, description: 'Accounting period', values: 'YYYY-PNN' },
        { name: 'AMOUNT', type: 'decimal', required: true, description: 'Opening balance', values: 'Pounds and pence, credits negative' },
      ],
    },
  ],
};

const AP = 'Accounts payable';
const GL = 'General ledger';

export const financeMappings = [
  { sourceTable: 'supplier', sourceColumn: 'supplier_id', targetTable: 'Supplier_Load', targetColumn: 'SUPPLIER_REF', serviceArea: AP },
  { sourceTable: 'supplier', sourceColumn: 'supplier_name', targetTable: 'Supplier_Load', targetColumn: 'SUPPLIER_NAME', serviceArea: AP },
  { sourceTable: 'supplier', sourceColumn: 'status', targetTable: 'Supplier_Load', targetColumn: 'STATUS', serviceArea: AP, lookupRule: 'A -> Active, I -> Inactive, H -> On hold' },
  { sourceTable: 'supplier', sourceColumn: 'payment_terms', targetTable: 'Supplier_Load', targetColumn: 'TERMS_DAYS', serviceArea: AP },
  { sourceTable: 'supplier', sourceColumn: 'vat_code', targetTable: 'Supplier_Load', targetColumn: 'TAX_CODE', serviceArea: AP, lookupRule: 'S -> STD, Z -> ZERO, E -> EXEMPT' },
  { sourceTable: 'supplier', sourceColumn: 'sort_code', targetTable: 'Supplier_Load', targetColumn: 'BANK_SORT_CODE', serviceArea: AP },
  { sourceTable: 'supplier', sourceColumn: 'contact_name', targetTable: 'Supplier_Load', targetColumn: 'CONTACT', serviceArea: AP },
  { sourceTable: 'supplier', sourceColumn: 'last_payment_date', targetTable: 'Supplier_Load', targetColumn: 'LAST_PAID', serviceArea: AP },
  { sourceTable: 'supplier', sourceColumn: 'balance_outstanding', targetTable: 'Supplier_Load', targetColumn: 'OPEN_BALANCE', serviceArea: AP },
  { sourceTable: 'gl_balance', sourceColumn: 'cost_centre', targetTable: 'GL_Opening_Balance', targetColumn: 'COST_CENTRE', serviceArea: GL },
  { sourceTable: 'gl_balance', sourceColumn: 'account_code', targetTable: 'GL_Opening_Balance', targetColumn: 'ACCOUNT', serviceArea: GL },
  { sourceTable: 'gl_balance', sourceColumn: 'period', targetTable: 'GL_Opening_Balance', targetColumn: 'PERIOD', serviceArea: GL },
  { sourceTable: 'gl_balance', sourceColumn: 'balance', targetTable: 'GL_Opening_Balance', targetColumn: 'AMOUNT', serviceArea: GL },
];

// Which mapped fields identify a record in each table pair.
export const financeKeys = {
  'supplier→Supplier_Load': ['supplier_id'],
  'gl_balance→GL_Opening_Balance': ['cost_centre', 'account_code', 'period'],
};

// ---------- invented data ----------

// Small fixed-seed generator so the demo is identical every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLACE = ['Harbour', 'Castle', 'Meadow', 'Riverside', 'Oakfield', 'Hillcrest', 'Ashgrove', 'Northgate', 'Kingsway', 'Brookvale', 'Stonebridge', 'Elmwood'];
const TRADE = ['Building Supplies', 'Catering', 'Office Furniture', 'Grounds Care', 'Electrical', 'Print and Design', 'Vehicle Hire', 'Cleaning Services', 'Training', 'Plumbing and Heating'];
const FORM = ['Ltd', 'Ltd', 'Ltd', 'LLP', '& Sons', 'Group Ltd'];
const FIRST = ['Avery', 'Rowan', 'Morgan', 'Jordan', 'Casey', 'Robin', 'Taylor', 'Quinn', 'Harper', 'Reese'];
const LAST = ['Example', 'Sample', 'Testcase', 'Placeholder', 'Demo', 'Specimen'];

const LONG_NAMES = {
  9: 'Stonebridge and District Community Transport Partnership Ltd',
  27: 'Northgate Specialist Educational Equipment Suppliers Ltd',
  41: 'Riverside Environmental and Grounds Maintenance Services LLP',
};

function pad2(n) { return String(n).padStart(2, '0'); }
function money(n) { return n.toFixed(2); }

function buildSuppliers() {
  const r = rng(20261115);
  const pick = list => list[Math.floor(r() * list.length)];
  const rows = [];
  for (let i = 0; i < 60; i++) {
    const id = 10001 + i * 7;
    const status = i % 20 === 3 ? 'H' : i % 9 === 4 ? 'I' : 'A';
    let vat = i % 6 === 2 ? 'Z' : i % 11 === 5 ? 'E' : 'S';
    if ([14, 22, 38, 51].includes(i)) vat = 'R'; // a code nobody agreed a translation for
    const paid = i % 13 === 6
      ? ''
      : `2026-${pad2(1 + Math.floor(r() * 10))}-${pad2(1 + Math.floor(r() * 28))}`;
    rows.push({
      supplier_id: String(id),
      supplier_name: LONG_NAMES[i] || `${pick(PLACE)} ${pick(TRADE)} ${pick(FORM)}`,
      status,
      payment_terms: String(pick([7, 14, 30, 30, 30, 60])),
      vat_code: vat,
      sort_code: `${pad2(10 + Math.floor(r() * 80))}-${pad2(Math.floor(r() * 100))}-${pad2(Math.floor(r() * 100))}`,
      contact_name: `${pick(FIRST)} ${pick(LAST)}`,
      last_payment_date: paid,
      balance_outstanding: money(Math.round(r() * 2500000) / 100),
    });
  }
  return rows;
}

function buildLedger() {
  const r = rng(7741);
  const centres = ['E1010', 'E1020', 'H2010', 'H2030', 'S3010', 'S3040', 'W4010', 'C5010'];
  const accounts = ['4000', '4100', '5200', '6300', '7100', '9000'];
  const rows = [];
  for (const cc of centres) {
    for (const acc of accounts) {
      const credit = acc.startsWith('9') || acc.startsWith('4');
      const amount = Math.round(r() * 90000000) / 100;
      rows.push({ cost_centre: cc, account_code: acc, period: '2027-P01', balance: money(credit ? -amount : amount) });
    }
  }
  return rows;
}

const STATUS = { A: 'Active', I: 'Inactive', H: 'On hold' };
const VAT = { S: 'STD', Z: 'ZERO', E: 'EXEMPT' };

function ukDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function loadSuppliers(source, load) {
  const out = [];
  source.forEach((s, i) => {
    const t = {
      SUPPLIER_REF: s.supplier_id,
      SUPPLIER_NAME: s.supplier_name,
      STATUS: STATUS[s.status],
      TERMS_DAYS: s.payment_terms,
      TAX_CODE: VAT[s.vat_code] || 'STD', // the unmapped code R was loaded as standard rate
      BANK_SORT_CODE: s.sort_code,
      CONTACT: s.contact_name,
      LAST_PAID: ukDate(s.last_payment_date),
      OPEN_BALANCE: String(Number(s.balance_outstanding)), // new system drops trailing zeros
    };

    // Present in both loads: "on hold" suppliers were loaded as inactive.
    if (s.status === 'H') t.STATUS = 'Inactive';

    if (load === 1) {
      if (i === 12 || i === 47) return;                              // two suppliers did not load
      if (LONG_NAMES[i]) t.SUPPLIER_NAME = s.supplier_name.slice(0, 40); // names cut at 40 characters
      if (i === 20) t.OPEN_BALANCE = money(Number(s.balance_outstanding) + 100); // wrong balance
      if (i === 33) t.BANK_SORT_CODE = '';                           // sort code lost
      if (i === 8) t.SUPPLIER_NAME = s.supplier_name.toUpperCase();  // case changed
    }
    if (load === 2) {
      if (i === 18 || i === 44) t.CONTACT = '';                      // new fault introduced by the fix
    }

    out.push(t);
    if (load === 1 && i === 5) out.push({ ...t });                   // one supplier loaded twice
  });
  return out;
}

function loadLedger(source) {
  return source.map(s => ({
    COST_CENTRE: s.cost_centre,
    ACCOUNT: s.account_code,
    PERIOD: s.period,
    AMOUNT: s.balance,
  }));
}

/**
 * Extracts for a demo trial load.
 * @param {1|2} load  1 = first trial load, 2 = second load after fixes
 * @returns {Record<string, {sourceRows, targetRows, sourceFile, targetFile}>} keyed by table-pair id
 */
export function financeDemoExtracts(load = 1) {
  const suppliers = buildSuppliers();
  const ledger = buildLedger();
  return {
    'supplier→Supplier_Load': {
      sourceRows: suppliers,
      targetRows: loadSuppliers(suppliers, load),
      sourceFile: 'legacy-supplier-extract.csv',
      targetFile: `new-supplier-trial-load-${load}.csv`,
    },
    'gl_balance→GL_Opening_Balance': {
      sourceRows: ledger,
      targetRows: loadLedger(ledger),
      sourceFile: 'legacy-gl-balance-extract.csv',
      targetFile: `new-gl-opening-balance-trial-load-${load}.csv`,
    },
  };
}

export function rowsToCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const cell = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [headers.join(','), ...rows.map(r => headers.map(h => cell(r[h] ?? '')).join(','))].join('\n') + '\n';
}
