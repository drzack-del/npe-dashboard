// Written cases for replaying saved clicks and building rows from a greyfinch-sync answer.
//   node --test src/preconsult/state.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, stateOf, rowsFromPull, isStale, AUTO_REFRESH_MS, STALE_ON_RETURN_MS } from './state.mjs';
import * as FD from './status.mjs';

const ev = (patient_key, action, item = null, value = null, by_name = 'Jess', t = 0) =>
  ({ patient_key, action, item, value, by_name, created_at: `2026-10-13T10:00:0${t}Z` });

test('tick then untick: last click wins', () => {
  const s = stateOf(replay([ev('p1', 'tick', 'bv'), ev('p1', 'untick', 'bv')]), 'p1');
  assert.equal(s.manual.bv, undefined);
  const s2 = stateOf(replay([ev('p1', 'untick', 'bv'), ev('p1', 'tick', 'bv')]), 'p1');
  assert.equal(s2.manual.bv.by, 'Jess');
});
test('two staff on two patients do not interfere', () => {
  const by = replay([ev('p1', 'tick', 'welcome', null, 'Jess'), ev('p2', 'tick', 'medical', null, 'Andrea')]);
  assert.ok(by.p1.manual.welcome && !by.p1.manual.medical);
  assert.ok(by.p2.manual.medical && !by.p2.manual.welcome);
  assert.equal(by.p2.manual.medical.by, 'Andrea');
});
test('verify by phone is per carrier and counts toward the BV', () => {
  const s = stateOf(replay([ev('p1', 'verify', 'Cigna')]), 'p1');
  const row = { date: '2026-10-20', kind: 'upcoming', carriers: ['Delta Dental', 'Cigna'], docs: {} };
  assert.equal(FD.isDone(row, s, 'bv'), false);
  assert.deepEqual(FD.carriersToCall(row, s), ['Delta Dental']);
});
test('insurance edits: set carriers, then self-pay, then back', () => {
  const s = stateOf(replay([ev('p1', 'set_carriers', null, ['Aetna']), ev('p1', 'set_self_pay', null, true)]), 'p1');
  assert.equal(s.selfPay, true);
  assert.deepEqual(s.carriers, []);
  const s2 = stateOf(replay([ev('p1', 'set_self_pay', null, true), ev('p1', 'set_carriers', null, ['Aetna'])]), 'p1');
  assert.equal(s2.selfPay, false);
  assert.deepEqual(s2.carriers, ['Aetna']);
});
test('reactivation calls and removal', () => {
  const s = stateOf(replay([ev('p1', 'called'), ev('p1', 'called'), ev('p1', 'reac_remove')]), 'p1');
  assert.equal(s.reac.attempts.length, 2);
  assert.equal(s.reac.closed, 'Removed');
});
test('junk rows are ignored, never fatal', () => {
  const s = stateOf(replay([ev('p1', 'something_new'), ev('p1', 'set_carriers', null, 'not a list'), ev('p1', 'tick', null)]), 'p1');
  assert.deepEqual(s.carriers, []);
  assert.deepEqual(s.manual, {});
  assert.deepEqual(stateOf(replay(null), 'nobody').manual, {});
});

// A greyfinch-sync 'preconsult' answer shaped exactly like the function returns it.
const pull = {
  today: '2026-10-14',
  bookings: [
    { patientId: 'p1', appointmentId: 'a1', date: '2026-10-16', time: '09:00', state: 'SCHEDULED', confirmed: true, location: 'Main' },
    { patientId: 'p2', appointmentId: 'a2', date: '2026-10-10', time: '10:00', state: 'NO_SHOW', confirmed: false, location: 'Main' },
  ],
  patients: {
    p1: { id: 'p1', humanId: '1A', notes: 'Sunshine Health\nMember ID:', documents: [{ name: 'Doe, Jane - BV DD.pdf', type: 'FILE', createdAt: '2026-10-01T10:00:00' }],
      person: { id: 'x1', firstName: 'Jane', lastName: 'Doe', birthDate: '2012-01-01', phones: [{ value: '555', type: 'MOBILE' }], relationshipsFrom: [],
        relationshipsTo: [{ role: 'RESPONSIBLE', type: 'MOTHER', fromPerson: { id: 'm1', firstName: 'Mary', lastName: 'Doe', birthDate: '1985-01-01' }, toPerson: { id: 'x1' } }] } },
    p2: { id: 'p2', humanId: '2B', notes: '', documents: [], person: { id: 'x2', firstName: 'Sam', lastName: 'Poe', birthDate: '2011-01-01', phones: [], relationshipsFrom: [], relationshipsTo: [] } },
  },
  memberIds: { m1: ['M-1'] },
};
test('rows from a pull: notes carrier, parent, member ID via parent, lists', () => {
  const rows = rowsFromPull(pull, '2026-10-14');
  const jane = rows.find(r => r.id === 'p1');
  assert.deepEqual(jane.carriers, ['Sunshine Health']);
  assert.equal(jane.responsible[0].name, 'Mary Doe');
  assert.deepEqual(jane.memberIds, ['M-1']);
  assert.equal(FD.isDone(jane, {}, 'bv'), true);
  assert.equal(FD.listOf(jane, {}, '2026-10-14'), 'upcoming');
  assert.equal(FD.listOf(rows.find(r => r.id === 'p2'), {}, '2026-10-14'), 'reactivate');
});
test('rows from a broken or empty answer: nothing, no crash', () => {
  assert.deepEqual(rowsFromPull(null, '2026-10-14'), []);
  assert.deepEqual(rowsFromPull({ error: 'x' }, '2026-10-14'), []);
  assert.deepEqual(rowsFromPull({ bookings: [{ patientId: 'gone', appointmentId: 'a', date: '2026-10-20', state: 'SCHEDULED' }], patients: {} }, '2026-10-14'), []);
});

test('refresh timing: every 10 minutes; on return only if older than 5 minutes', () => {
  assert.equal(AUTO_REFRESH_MS, 600000);
  assert.equal(STALE_ON_RETURN_MS, 300000);
  const now = Date.parse('2026-10-13T15:00:00Z');
  assert.equal(isStale('2026-10-13T14:57:00Z', now), false, '3 minutes old: no re-check on return');
  assert.equal(isStale('2026-10-13T14:54:00Z', now), true, '6 minutes old: re-check on return');
  assert.equal(isStale(undefined, now), true, 'never pulled: re-check');
  assert.equal(isStale('garbage', now), true);
});
