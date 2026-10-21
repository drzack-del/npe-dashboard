// Written cases for saving a patient over a newer copy without losing anyone's work.
//   node --test src/patientMerge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePatientRows, mergeContactLogs, stableKey } from './patientMerge.mjs';

const call = (date, reached, extra = {}) => ({ date, reachedPatient: reached, outcome: '', ...extra });
// The database hands entries back with their keys in a different order.
const reordered = (e) => Object.fromEntries(Object.entries(e).reverse());

const base = {
  id: 'p1', pen: true, mp: false, contact_attempts: 0, next_touch_date: '2026-10-21',
  last_contact_date: '', notes: 'first visit', contact_log: [],
};

test('stale screen pushes a date: the call logged elsewhere survives', () => {
  // Screen B logged a call; screen A (still holding the 8am copy) pushed the date.
  const fresh = { ...base, contact_attempts: 1, last_contact_date: '2026-10-21', next_touch_date: '2026-11-04',
    contact_log: [reordered(call('2026-10-21', 'Spoke with patient'))] };
  const local = { ...base, next_touch_date: '2026-10-23' };
  const out = mergePatientRows(base, local, fresh);
  assert.equal(out.contact_log.length, 1);
  assert.equal(out.contact_attempts, 1);
  assert.equal(out.last_contact_date, '2026-10-21');
  assert.equal(out.next_touch_date, '2026-10-23'); // A's change is the newest action
});

test('two screens each log a call: both calls are kept, in order', () => {
  const b = call('2026-10-21', 'No answer', { time: '09:00' });
  const a = call('2026-10-21', 'Left voicemail', { time: '09:05' });
  const fresh = { ...base, contact_attempts: 1, contact_log: [reordered(b)] };
  const local = { ...base, contact_attempts: 1, contact_log: [a] };
  const out = mergePatientRows(base, local, fresh);
  assert.deepEqual(out.contact_log.map(e => e.reachedPatient), ['No answer', 'Left voicemail']);
});

test('nothing changed elsewhere: the save is exactly what this screen sent', () => {
  const local = { ...base, pen: false, sch: true, contact_log: [call('2026-10-21', 'Spoke with patient')] };
  const out = mergePatientRows(base, local, { ...base, contact_log: [] });
  assert.equal(stableKey(out), stableKey(local));
});

test('a save that already landed is not added twice', () => {
  const e = call('2026-10-21', 'No answer');
  const local = { ...base, contact_log: [e] };
  const fresh = { ...base, contact_log: [reordered(e)] };
  assert.equal(mergePatientRows(base, local, fresh).contact_log.length, 1);
});

test('fields this screen did not touch keep the newer value', () => {
  const fresh = { ...base, notes: 'updated by the office manager' };
  const local = { ...base, next_touch_date: '2026-10-30' };
  const out = mergePatientRows(base, local, fresh);
  assert.equal(out.notes, 'updated by the office manager');
  assert.equal(out.next_touch_date, '2026-10-30');
});

test('an edited older entry keeps the edit, and calls added elsewhere are kept', () => {
  const old = call('2026-10-10', 'No answer');
  const b0 = { ...base, contact_log: [old] };
  const local = { ...b0, contact_log: [{ ...old, notes: 'fixed typo' }] };
  const fresh = { ...b0, contact_log: [old, call('2026-10-21', 'Spoke with patient')] };
  const log = mergeContactLogs(b0.contact_log, local.contact_log, fresh.contact_log);
  assert.equal(log.length, 2);
  assert.equal(log[0].notes, 'fixed typo');
  assert.equal(log[1].reachedPatient, 'Spoke with patient');
});

test('a new patient (nothing stored yet) saves as is', () => {
  const local = { ...base, id: 'new' };
  assert.equal(mergePatientRows(null, local, null), local);
  assert.equal(mergePatientRows(base, local, null), local);
});

test('key order and undefined do not count as changes', () => {
  assert.equal(stableKey({ a: 1, b: { c: 2 } }), stableKey({ b: { c: 2 }, a: 1 }));
  assert.equal(stableKey({ a: 1, x: undefined }), stableKey({ a: 1 }));
  assert.equal(stableKey(undefined), stableKey(null));
});
