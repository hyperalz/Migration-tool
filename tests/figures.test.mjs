import test from 'node:test';
import assert from 'node:assert/strict';
import { leadFigure, figureTone, boldLeadNumber } from '../js/figures.js';

test('the leading figure is pulled out of a to-do line', () => {
  assert.deepEqual(leadFigure('2 fields failed testing in test. Fix the match or the data, then send again.'),
    { n: '2', what: 'fields failed testing in test', action: 'Fix the match or the data, then send again.' });
  assert.deepEqual(leadFigure('1,240 records not compared yet.'), { n: '1,240', what: 'records not compared yet', action: '' });
  assert.equal(leadFigure('Download the evidence pack and keep it safe.'), null);
});

test('failures are red and passes green', () => {
  assert.equal(figureTone('failed-AP', 'fields failed testing in test'), 'bad');
  assert.equal(figureTone('to-live-AP', 'fields passed testing in test'), 'good');
  assert.equal(figureTone('send-AP', 'matched fields not sent for loading yet'), '');
});

test('a short board cell shows its number in bold', () => {
  const esc = s => s;
  assert.equal(boldLeadNumber('7 of 13 passed', esc), '<strong class="fig-inline">7</strong> of 13 passed');
  assert.equal(boldLeadNumber('All sent', esc), 'All sent');
});
