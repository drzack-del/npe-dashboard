// Written cases for the Front Desk pre-consult rules. Fake patients only.
//   node --test src/preconsult/rules.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCarrier, classifyDocs, buildPatients, carriersFromBvTitles, makeRow } from './rules.mjs';
import * as FD from './status.mjs';


// ── Carrier from Patient Notes ───────────────────────────────────────────────
const carriers = t => readCarrier(t).carriers;
test('carrier: plain carrier names', () => {
  assert.deepEqual(carriers('Ins: Delta Dental PPO'), ['Delta Dental']);
  assert.deepEqual(carriers('cigna thru dad work'), ['Cigna']);
  assert.deepEqual(carriers('Florida Blue dental'), ['Blue Cross / Florida Blue']);
  assert.deepEqual(carriers(''), []);
});
test('carrier: everyday-word carriers count on their own (Dr. Miller 10-12)', () => {
  assert.deepEqual(carriers('Guardian'), ['Guardian']);
  assert.deepEqual(carriers('liberty'), ['Liberty Dental']);
  assert.deepEqual(carriers('principal'), ['Principal']);
});
test('carrier: "legal guardian" is never the carrier', () => {
  assert.deepEqual(carriers('legal guardian is grandma'), []);
  assert.deepEqual(carriers('legal guardian is grandma, ins Guardian'), ['Guardian']);
});
test('carrier: "cash" alone is not self-pay', () => {
  assert.equal(readCarrier('will pay cash copay').selfPay, false);
});
test('carrier: two insurances are both kept, in order', () => {
  assert.deepEqual(carriers('Delta primary, Cigna secondary'), ['Delta Dental', 'Cigna']);
});
test('carrier: Florida plans (Sunshine Health missed, 10-13)', () => {
  assert.deepEqual(carriers('Sunshine Health\nMember ID:'), ['Sunshine Health']);
  assert.deepEqual(carriers('Simply Healthcare'), ['Simply Healthcare']);
  assert.deepEqual(carriers('staywell'), ['Staywell / WellCare']);
});
test('carrier: an unlisted name on the line above "Member ID" is used as written', () => {
  const r = readCarrier('Brand New Dental Co\nMember ID: 12345');
  assert.deepEqual(r.carriers, ['Brand New Dental Co']);
  assert.equal(r.unlisted, true);
  assert.deepEqual(carriers('called mom 10/2, left vm'), [], 'no Member ID line: nothing guessed');
  assert.deepEqual(carriers('Member ID: 12345'), [], 'nothing above Member ID');
  assert.deepEqual(carriers('Subscriber: Mom\nMember ID: 1'), [], 'a label line is not a carrier');
  assert.equal(readCarrier('self pay\nMember ID:').selfPay, true);
});
test('carrier: Medicaid plus its plan is one coverage', () => {
  assert.deepEqual(carriers('Medicaid - Liberty dental'), ['Liberty Dental']);
  assert.deepEqual(carriers('medicaid dentaquest'), ['DentaQuest']);
});
test('carrier: self-pay only when no carrier is named', () => {
  assert.equal(readCarrier('no insurance, self pay').selfPay, true);
  assert.equal(readCarrier('private pay').selfPay, true);
  assert.equal(readCarrier('Aetna but may self pay').selfPay, false);
});

// ── Documents in the chart ───────────────────────────────────────────────────
const doc = (name, createdAt = '2026-10-01') => ({ name, type: 'FILE', createdAt });
test('docs: BV, health history, license', () => {
  const d = classifyDocs([doc('Jane Doe BV.pdf'), doc('Medical Form Contract.pdf'), doc('DL.jpeg')]);
  assert.equal(d.bv[0].name, 'Jane Doe BV.pdf');
  assert.equal(d.medical[0].name, 'Medical Form Contract.pdf');
  assert.equal(d.dl[0].name, 'DL.jpeg');
});
test('docs: every BV kept, newest first', () => {
  const d = classifyDocs([doc('Jane BV', '2024-01-05'), doc('Jane BV 2026', '2026-09-01')]);
  assert.deepEqual(d.bv.map(x => x.date), ['2026-09-01', '2024-01-05']);
});
test('docs: card sides, both-sides scans, and unnamed sides', () => {
  assert.equal(classifyDocs([doc('Ins Card Front.jpg')]).cardFront.length, 1);
  assert.equal(classifyDocs([doc('Insurance card - back.png')]).cardBack.length, 1);
  const both = classifyDocs([doc('INS CRD F&B')]);
  assert.ok(both.cardFront.length && both.cardBack.length);
  assert.equal(classifyDocs([doc('Delta front')]).cardFront.length, 1);
  const noSide = classifyDocs([doc('Cigna card.jpg')]);
  assert.equal(noSide.cardFront.length, 0);
  assert.equal(noSide.cardNoSide.length, 1);
});
test('docs: two card images with no side named are front and back (real chart, 10-13)', () => {
  const d = classifyDocs([doc('insurance_card_1.jpg'), doc('insurance_card_2.jpg')]);
  assert.equal(d.cardFront.length, 1);
  assert.equal(d.cardBack.length, 1);
  assert.equal(d.cardNoSide.length, 0);
  const three = classifyDocs([doc('insurance_card_1.jpg'), doc('insurance_card_2.jpg'), doc('insurance_card_3.jpg')]);
  assert.equal(three.cardNoSide.length, 1, 'odd one left over still needs staff to confirm');
});
test('docs: image_xxxxxx uploads are insurance cards (Dr. Miller 10-13)', () => {
  const two = classifyDocs([doc('image_5150c2.jpeg'), doc('image_b156c8.jpeg')]);
  assert.equal(two.cardFront.length, 1);
  assert.equal(two.cardBack.length, 1);
  const one = classifyDocs([doc('image_19f4e3.jpeg')]);
  assert.equal(one.cardFront.length, 0);
  assert.equal(one.cardNoSide.length, 1, 'a single image: staff confirm the side');
  assert.equal(classifyDocs([doc('Pano 2026 10 01.jpg')]).cardNoSide.length, 0, 'x-rays are not cards');
});
test('carrier from a BV title when notes name none (real chart, 10-13)', () => {
  assert.deepEqual(carriersFromBvTitles([{ name: 'Doe, Jane  - BV Aetna.pdf' }], ['Jane', 'Doe']), ['Aetna']);
  assert.deepEqual(carriersFromBvTitles([{ name: 'Lincoln, Ava - BV Cigna.pdf' }], ['Ava', 'Lincoln']), ['Cigna'], 'surname is not a carrier');
  assert.deepEqual(carriersFromBvTitles([{ name: 'Doe, Jane - BV DD GA.pdf' }], ['Jane', 'Doe']), ['Delta Dental'], 'DD = Delta Dental (real title shape, 10-13)');
  assert.deepEqual(carriersFromBvTitles([{ name: 'Doe, Jane - BV DQ.pdf' }], ['Jane', 'Doe']), ['DentaQuest']);
  const row = makeRow({ patientId: 'p', date: '2026-10-13' }, { id: 'p', notes: '', documents: [{ name: 'Doe, Jane  - BV Aetna.pdf', type: 'FILE', createdAt: '2026-08-24' }], person: { firstName: 'Jane', lastName: 'Doe' } }, [], [], '2026-10-13');
  assert.deepEqual(row.carriers, ['Aetna']);
  assert.equal(row.carrierFrom, 'BV title');
  assert.equal(FD.isDone(row, {}, 'bv'), true);
});
test('real chart (10-13): BV, health history and both card sides all count', () => {
  const docs = ['Doe, Jane  - BV Aetna.pdf|2026-08-24', 'Medical Form Contract.PDF|2026-08-18', 'insurance_card_2.jpg|2026-08-18', 'insurance_card_1.jpg|2026-08-18', 'INS SS|2026-08-17', 'MILLER INS FORM.pdf|2026-08-17']
    .map(x => { const [name, createdAt] = x.split('|'); return { name, type: 'FILE', createdAt }; });
  const row = makeRow({ patientId: 'p', date: '2026-10-13', kind: 'upcoming' }, { id: 'p', notes: '', documents: docs, person: { firstName: 'Jane', lastName: 'Doe' } }, [], [], '2026-10-13');
  for (const k of ['bv', 'medical', 'cardFront', 'cardBack']) assert.equal(FD.isDone(row, {}, k), true, k);
  assert.deepEqual(FD.missing(row, {}).map(i => i.k), ['welcome']);
});
test('docs: web ver counts as BV; pedo insurance info is info only (Dr. Miller 10-13)', () => {
  assert.equal(classifyDocs([doc('Web Ver.pdf')]).bv.length, 1);
  const d = classifyDocs([doc('INS SS'), doc('INS INFO'), doc('MILLER INS FORM.pdf'), doc('ins screenshot.png')]);
  assert.equal(d.insInfo.length, 4);
  for (const k of ['bv', 'cardFront', 'cardBack', 'dl']) assert.equal(d[k].length, 0, k);
});
test('docs: things that are not checklist items', () => {
  const d = classifyDocs([doc('Credit card auth'), doc('FA contract'), doc('Back to school letter'), doc('Insurance ID card'), { name: 'Scans', type: 'FOLDER' }]);
  for (const k of ['bv', 'medical', 'cardFront', 'cardBack', 'dl']) assert.equal(d[k].length, 0, k);
});

// ── One row per patient ──────────────────────────────────────────────────────
const TODAY = '2026-10-14'; // a Wednesday
const bk = (patientId, appointmentId, date, state = 'SCHEDULED') => ({ patientId, appointmentId, date, time: '09:00', state, confirmed: false, location: 'Main' });
const only = (rows, id) => rows.filter(r => r.patientId === id);

test('patients: simple upcoming consult', () => {
  const rows = buildPatients([bk('p1', 'a1', '2026-10-20')], TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'upcoming');
});
test('patients: rescheduled in Greyfinch (same appointment) shows once, on the new date', () => {
  const rows = buildPatients([bk('p1', 'a1', '2026-10-16', 'PATIENT_CANCELLED'), bk('p1', 'a1', '2026-10-23')], TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-10-23');
  assert.equal(rows[0].movedFrom, '2026-10-16');
});
test('patients: cancelled then booked as a NEW appointment shows once, upcoming', () => {
  const rows = buildPatients([bk('p1', 'a1', '2026-10-16', 'PATIENT_CANCELLED'), bk('p1', 'a2', '2026-10-28')], TODAY);
  assert.equal(only(rows, 'p1').length, 1);
  assert.equal(rows[0].kind, 'upcoming');
});
test('patients: no-show who already rebooked is NOT a reactivation', () => {
  const rows = buildPatients([bk('p1', 'a1', '2026-10-01', 'NO_SHOW'), bk('p1', 'a2', '2026-10-21')], TODAY);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'upcoming');
  assert.deepEqual(rows[0].rebookedAfter, { date: '2026-10-01', state: 'NO_SHOW' });
});
test('patients: no-show rebooked far out (beyond 30 days) is still not a reactivation', () => {
  const rows = buildPatients([bk('p1', 'a1', '2026-10-01', 'NO_SHOW'), bk('p1', 'a2', '2026-12-20')], TODAY);
  assert.equal(rows[0].kind, 'upcoming');
  assert.equal(FD.listOf(rows[0], {}, TODAY), 'later');
});
test('patients: no-show and patient cancel are reactivations; office cancel is not', () => {
  const rows = buildPatients([
    bk('ns', 'a1', '2026-10-01', 'NO_SHOW'),
    bk('pc', 'a2', '2026-10-02', 'PATIENT_CANCELLED'),
    bk('oc', 'a3', '2026-10-03', 'OFFICE_CANCELLED'),
  ], TODAY);
  assert.equal(only(rows, 'ns')[0].kind, 'reactivate');
  assert.equal(only(rows, 'pc')[0].kind, 'reactivate');
  assert.equal(only(rows, 'oc')[0].kind, 'officeCancelled');
  assert.equal(FD.listOf(only(rows, 'oc')[0], {}, TODAY), 'done');
});
test('patients: cancelled a FUTURE consult and never rebooked is a reactivation', () => {
  const rows = buildPatients([bk('p1', 'a1', '2026-10-20', 'PATIENT_CANCELLED')], TODAY);
  assert.equal(rows[0].kind, 'reactivate');
});
test('patients: past consult never marked in Greyfinch goes to "not marked"', () => {
  const rows = buildPatients([bk('p1', 'a1', '2026-10-13', 'SCHEDULED')], TODAY);
  assert.equal(rows[0].kind, 'notMarked');
  assert.equal(FD.listOf(rows[0], {}, TODAY), 'notMarked');
});
test('patients: came in (checked out) is done, not on any list', () => {
  const rows = buildPatients([bk('p1', 'a1', '2026-10-10', 'CHECKED_OUT')], TODAY);
  assert.equal(FD.listOf(rows[0], {}, TODAY), 'done');
});
test('patients: siblings on the same day are two separate rows', () => {
  const rows = buildPatients([bk('kid1', 'a1', '2026-10-20'), bk('kid2', 'a2', '2026-10-20')], TODAY);
  assert.equal(rows.length, 2);
});

// ── Checklist, Ready and red ─────────────────────────────────────────────────
const D = date => [{ name: 'x', date }];
const row = (over = {}) => ({ date: '2026-10-20', kind: 'upcoming', carriers: ['Delta Dental'], selfPay: false, docs: {}, ...over });
const allDocs = { bv: D('2026-10-01'), medical: D('2026-10-01'), cardFront: D('2026-10-01'), cardBack: D('2026-10-01') };
const reached = { calls: [{ outcome: 'Reached' }] };

test('ready: everything in the chart plus a reached welcome call', () => {
  assert.equal(FD.isReady(row({ docs: allDocs }), reached), true);
  assert.deepEqual(FD.progress(row({ docs: allDocs }), reached), { done: 5, of: 5 });
});
test('ready: welcome call left voicemail does not count', () => {
  assert.equal(FD.isReady(row({ docs: allDocs }), { calls: [{ outcome: 'Left voicemail' }] }), false);
  assert.deepEqual(FD.missing(row({ docs: allDocs }), {}).map(i => i.k), ['welcome']);
});
test('ready: self-pay skips BV and card but still needs health history and welcome call', () => {
  const docs = { medical: D('2026-10-01') };
  assert.equal(FD.isReady(row({ carriers: [], selfPay: true, docs }), reached), true);
  assert.equal(FD.isReady(row({ carriers: [], selfPay: true, docs: {} }), reached), false);
  assert.equal(FD.isReady(row({ carriers: [], selfPay: true, docs }), {}), false, 'welcome call still needed');
});
test("driver's license is not on the checklist (Dr. Miller 10-13)", () => {
  assert.equal(FD.ITEMS.some(i => i.k === 'dl'), false);
  assert.equal(FD.isReady(row({ docs: allDocs }), reached), true, 'ready with no license');
});
test('ready: staff marking self-pay, or adding a carrier, changes what is needed', () => {
  const docs = { medical: D('2026-10-01') };
  assert.equal(FD.isReady(row({ carriers: [], docs }), reached), false);
  assert.equal(FD.isReady(row({ carriers: [], docs }), { ...reached, selfPay: true }), true);
  assert.equal(FD.isSelfPay(row({ carriers: [], selfPay: true }), { selfPay: false, carriers: ['Aetna'] }), false);
});
test('two insurances: need two BVs and two of each card side', () => {
  const two = row({ carriers: ['Delta Dental', 'Cigna'], docs: { ...allDocs } });
  assert.equal(FD.isDone(two, {}, 'bv'), false);
  assert.equal(FD.countText(two, {}, 'bv'), '1 of 2');
  const twoDocs = { ...allDocs, bv: [...D('2026-10-02'), ...D('2026-10-01')], cardFront: [...D('2026-10-01'), ...D('2026-10-01')], cardBack: [...D('2026-10-01'), ...D('2026-10-01')] };
  assert.equal(FD.isReady(row({ carriers: ['Delta Dental', 'Cigna'], docs: twoDocs }), reached), true);
  assert.equal(FD.isDone(two, { carriers: ['Delta Dental'] }, 'bv'), true, 'staff removing the second insurance needs one');
});
test('freshness: BV older than 6 months before the consult does not count', () => {
  assert.equal(FD.isDone(row({ docs: { bv: D('2026-04-01') } }), {}, 'bv'), false);
  assert.equal(FD.isDone(row({ docs: { bv: D('2026-05-01') } }), {}, 'bv'), true);
  assert.equal(FD.found(row({ docs: { bv: D('2026-04-01') } }), 'bv').old.length, 1);
});
test('freshness: health history older than 12 months does not count', () => {
  assert.equal(FD.isDone(row({ docs: { medical: D('2025-09-01') } }), {}, 'medical'), false);
  assert.equal(FD.isDone(row({ docs: { medical: D('2025-11-01') } }), {}, 'medical'), true);
});
test('manual tick counts even with no document', () => {
  assert.equal(FD.isDone(row(), { manual: { medical: { by: 'Jess' } } }, 'medical'), true);
});
test('insurance calls: no BV means our team calls the carrier', () => {
  assert.deepEqual(FD.carriersToCall(row(), {}), ['Delta Dental']);
  assert.deepEqual(FD.carriersToCall(row({ docs: { bv: D('2026-10-01') } }), {}), [], 'off-site BV on file: no call');
  assert.deepEqual(FD.carriersToCall(row({ carriers: [], selfPay: true }), {}), [], 'self-pay: no call');
  assert.deepEqual(FD.carriersToCall(row({ carriers: [] }), {}), ['Insurance not in notes']);
});
test('insurance calls: a phone verification counts like a BV, per carrier', () => {
  const two = row({ carriers: ['Delta Dental', 'Cigna'] });
  const s = { verified: { 'Delta Dental': { result: 'Verified' } } };
  assert.deepEqual(FD.carriersToCall(two, s), ['Cigna']);
  assert.equal(FD.countText(two, s, 'bv'), '1 of 2');
  s.verified.Cigna = { result: 'Not active' };
  assert.equal(FD.isDone(two, s, 'bv'), true);
  assert.deepEqual(FD.carriersToCall(two, s), []);
});
test('insurance calls: one BV on file plus one call covers two insurances', () => {
  const two = row({ carriers: ['Delta Dental', 'Cigna'], docs: { bv: D('2026-10-01') } });
  assert.deepEqual(FD.carriersToCall(two, {}), ['Delta Dental', 'Cigna']);
  assert.equal(FD.isDone(two, { verified: { Cigna: { result: 'Verified' } } }, 'bv'), true);
});
test('insurance calls: removing an insurance drops its old verification', () => {
  const s = { carriers: ['Cigna'], verified: { 'Delta Dental': { result: 'Verified' } } };
  assert.equal(FD.isDone(row(), s, 'bv'), false);
});
test('insurance calls start 3 business days before the consult', () => {
  const mon = row({ date: '2026-10-19' });   // Monday consult
  assert.equal(FD.insuranceCallStarts(mon), '2026-10-14', 'calls start the Wednesday before');
  assert.equal(FD.insuranceCallDue(mon, {}, '2026-10-13'), false, 'Tuesday: still waiting on the insurance team');
  assert.equal(FD.insuranceCallDue(mon, {}, '2026-10-14'), true, 'Wednesday: our team calls');
  assert.equal(FD.insuranceCallDue(row({ date: '2026-10-19', docs: { bv: D('2026-10-01') } }), {}, '2026-10-16'), false, 'BV on file: no call');
  assert.equal(FD.insuranceCallDue(mon, { verified: { 'Delta Dental': { result: 'Verified' } } }, '2026-10-16'), false, 'verified: no call');
});
test('red: 2 business days, skipping the weekend', () => {
  const thu = '2026-10-15', fri = '2026-10-16';
  assert.equal(FD.isRed(row({ date: '2026-10-19' }), {}, thu), true, 'Monday consult is red on Thursday');
  assert.equal(FD.isRed(row({ date: '2026-10-20' }), {}, thu), false, 'Tuesday consult is not red on Thursday');
  assert.equal(FD.isRed(row({ date: '2026-10-20' }), {}, fri), true, 'Tuesday consult is red on Friday');
  assert.equal(FD.isRed(row({ date: '2026-10-19', docs: allDocs }), reached, thu), false, 'ready is never red');
});

// ── Reactivation calls ───────────────────────────────────────────────────────
test('reactivation: calls step through day 1, 3, 7, 14, 30 from the missed date', () => {
  const r = row({ date: '2026-10-01', kind: 'reactivate' });
  assert.equal(FD.nextReactivationCall(r, {}, TODAY), '2026-10-02');
  assert.equal(FD.nextReactivationCall(r, { reac: { attempts: [{}] } }, TODAY), '2026-10-05');
  assert.equal(FD.nextReactivationCall(r, { reac: { attempts: [{}, {}, {}, {}, {}] } }, TODAY), null);
});
test('reactivation: marked no-show today moves to reactivations; closing removes it', () => {
  const r = row({ date: TODAY });
  assert.equal(FD.listOf(r, { outcome: 'noshow' }, TODAY), 'reactivate');
  assert.equal(FD.listOf(r, { outcome: 'noshow', reac: { closed: 'Not interested' } }, TODAY), 'closed');
});
