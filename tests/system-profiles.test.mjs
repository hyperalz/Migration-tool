import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES, getProfile, profileToSchema, profileRecord, profileSourceLine, profileFieldCount, checkTemplate, templateCSV, TEMPLATE_COLUMNS, SOURCE_KIND } from '../js/system-profiles.js';
import { ROUTES, routeFor, listOrigin, originLine, recordOrigin } from '../js/setup-routes.js';
import { resultHtml } from '../js/supplier-view.js';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

test('every profile says where it came from and when it was checked', () => {
  for (const p of PROFILES) {
    assert.ok(SOURCE_KIND[p.source.kind], p.id);
    assert.match(p.source.url, /^https:\/\//);
    assert.ok(p.checked && p.note && p.version);
    assert.ok(profileFieldCount(p) > 0);
    assert.match(profileSourceLine(p), /Checked /);
  }
});

test('profiles hold field definitions only, never example records', () => {
  for (const p of PROFILES) for (const t of p.tables) for (const c of t.columns) {
    assert.deepEqual(Object.keys(c).filter(k => !['name', 'type', 'required', 'description', 'values'].includes(k)), []);
    assert.equal(new Set(t.columns.map(x => x.name)).size, t.columns.length, `${t.name} has duplicate fields`);
  }
});

test('a profile becomes a field list MapBridge can use, with a trail', () => {
  const p = getProfile('dfe-cbds-pupil-starter');
  const s = profileToSchema(p);
  assert.equal(s.tables.length, p.tables.length);
  assert.equal(s.tables[0].columns[0].name, 'Unique pupil number');
  assert.equal(s.tables[0].columns[0].required, true);
  const rec = profileRecord(p);
  assert.equal(rec.id, p.id);
  assert.match(rec.source, /Public standard: DfE common basic data set/);
});

test('the ready field list is an extra way in on both sides, after the existing ones', () => {
  assert.equal(ROUTES.new.at(-1).key, 'profile');
  assert.equal(ROUTES.old.at(-1).key, 'profile');
  assert.deepEqual(ROUTES.new.slice(0, 3).map(r => r.key), ['supplier', 'db', 'file']);
  assert.ok(routeFor('new', 'profile'));
  const project = { targetSchema: profileToSchema(PROFILES[0]) };
  recordOrigin(project, 'new', 'profile', 'replace');
  assert.equal(listOrigin(project, 'new'), 'profile');
  assert.match(originLine(project, 'new'), /from a ready field list$/);
});

test('the template downloads with its headings and an example row', () => {
  const lines = templateCSV().trim().split('\n');
  assert.equal(lines[0], TEMPLATE_COLUMNS.join(','));
  assert.equal(lines.length, 2);
});

test('a good file passes the check with a summary', () => {
  const r = checkTemplate([
    TEMPLATE_COLUMNS,
    ['Supplier', 'Supplier number', 'text', 'No', 'Leave blank to auto-number', '', '26D'],
    ['Supplier', 'Supplier name', 'varchar', 'Yes', 'Trading name', '', '26D'],
    ['Site', 'Site code', 'text', 'Y', 'Short code', '', '26D'],
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.summary, { tables: 2, fields: 3, release: '26D' });
  assert.match(resultHtml(r, esc), /ready to send: 3 fields in 2 tables, release 26D/);
});

test('the check names each problem by row', () => {
  const r = checkTemplate([
    TEMPLATE_COLUMNS,
    ['Supplier', 'Supplier name', 'text', 'Yes', 'x', '', '26D'],
    ['Supplier', 'supplier name', 'text', 'Yes', 'x', '', '26D'],
    ['Supplier', '', 'text', 'Yes', '', '', '26D'],
    ['Supplier', 'Status', 'text', 'maybe', '', '', '26C'],
    ['Supplier', 'Colour', 'wibble', 'No', '', '', '26D'],
  ]);
  assert.ok(r.errors.some(e => /Row 3: .*more than once/.test(e)));
  assert.ok(r.errors.some(e => /Row 4: the Field is blank/.test(e)));
  assert.ok(r.errors.some(e => /Row 5: Required should be Yes or No/.test(e)));
  assert.ok(r.warnings.some(w => /Row 6: "wibble" is not a type/.test(w)));
  assert.ok(r.warnings.some(w => /mixes releases/.test(w)));
  assert.match(resultHtml(r, esc), /3 problems to fix/);
});

test('missing headings stop the check straight away', () => {
  const r = checkTemplate([['Name', 'Kind'], ['a', 'b']]);
  assert.equal(r.summary, null);
  assert.match(r.errors[0], /Table, Field, Type, Required/);
  assert.match(checkTemplate([]).errors[0], /empty/);
});

test('the Wales list follows the Welsh census, not the England one', () => {
  const w = getProfile('wg-plasc-pupil-2026');
  assert.match(w.source.url, /^https:\/\/www\.gov\.wales\//);
  const field = name => w.tables.flatMap(t => t.columns).find(c => c.name === name);
  assert.match(field('National identity').values, /WAL/);
  assert.equal(field('Pupil ALN provision').values, 'N, C or L');
  assert.ok(w.tables.some(t => t.name === 'Welsh language'));
  assert.match(getProfile('dfe-cbds-pupil-starter').note, /Wales list/);
});

import { libraryStats, libraryBoard, libraryLog, LIBRARY_AREAS } from '../js/system-profiles.js';
import { statsHtml, boardHtml } from '../js/library-page.js';

test('the library numbers come from the lists themselves', () => {
  const s = libraryStats();
  assert.equal(s.lists, PROFILES.length);
  assert.equal(s.fields, PROFILES.reduce((n, p) => n + profileFieldCount(p), 0));
  assert.equal(s.areas, LIBRARY_AREAS.length);
  assert.equal(s.bySupplier, 0);
  assert.match(statsHtml(s), /Be the first/);
  assert.doesNotMatch(statsHtml({ ...s, bySupplier: 1 }), /Be the first/);
});

test('an area is ready only when a list is held for it', () => {
  const board = libraryBoard();
  assert.equal(board.find(a => a.name === 'Schools').status, 'ready');
  assert.equal(board.find(a => a.name === 'Finance').status, 'planned');
  assert.equal(board.find(a => a.name === 'Housing').status, 'none');
  assert.match(boardHtml(board), /Next: Oracle Fusion/);
  const extra = [...PROFILES, { ...PROFILES[0], id: 'x', area: 'Housing' }];
  assert.equal(libraryBoard(extra).find(a => a.name === 'Housing').status, 'ready');
});

test('the update log lists every addition, newest first', () => {
  const log = libraryLog([{ ...PROFILES[0], added: '2026-12-01' }, PROFILES[1]]);
  assert.equal(log.length, 2);
  assert.equal(log[0].date, '2026-12-01');
  assert.match(log[0].text, /Added Schools: pupil records \(England\), 29 fields/);
});
