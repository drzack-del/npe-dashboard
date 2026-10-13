// Pre Consult status rules: Ready, red, which list, insurance calls, reactivation calls.
// The Pre Consult tab, the local test page and the written cases (rules.test.mjs) all use
// this one file, so they can never disagree.
//
// Decisions (Dr. Miller, 2026-10-12):
//   Ready = BV + health history + welcome call + insurance card front + insurance card
//   back. (Driver's license taken off 2026-10-13: it's almost never in the chart before
//   the consult.)
//   Self-pay skips BV and the insurance card; still needs health history and welcome call.
//   Two insurances = two of each insurance item (a BV, card front and card back for each).
//   BV counts if dated within 6 months before the consult; health history within 12.
//   Red = not ready and the consult is within 2 business days (weekends skipped).
//   Reactivations = no-shows and patient cancels that haven't rebooked. Office cancels
//   are not recalled.
//   Insurance with no BV document from the off-site team is verified by phone by the
//   practice's own staff; a phone result (verified, or not active) counts like a BV.
//   Those calls start 3 business days before the consult (one day before it turns red);
//   until then the off-site team still has time to send the BV.
//
// s = one patient's saved clicks:
//   { carriers?: [..], selfPay?: bool, manual: {k: {by, at}}, calls: [{outcome,...}],
//     verified?: {carrier: {by, at, result, note}}, insCalls?: [{carrier, by, at, note}],
//     outcome?: 'showed'|'noshow', reac: {attempts: [...], closed} }

const ITEMS = [
  { k: 'bv', label: 'BV', insurance: true, freshDays: 183 },
  { k: 'medical', label: 'Health history', freshDays: 365 },
  { k: 'welcome', label: 'Welcome call' },
  { k: 'cardFront', label: 'Insurance card front', insurance: true },
  { k: 'cardBack', label: 'Insurance card back', insurance: true },
];
const REACTIVATION_CADENCE = [1, 3, 7, 14, 30]; // days between calls
const RED_BUSINESS_DAYS = 2;
const INSURANCE_CALL_BUSINESS_DAYS = 3;

const d0 = s => new Date(s + 'T12:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = d0(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((d0(b) - d0(a)) / 864e5);
const isWeekend = s => [0, 6].includes(d0(s).getUTCDay());
const addBusinessDays = (s, n) => { let d = s; while (n > 0) { d = addDays(d, 1); if (!isWeekend(d)) n--; } return d; };
const subBusinessDays = (s, n) => { let d = s; while (n > 0) { d = addDays(d, -1); if (!isWeekend(d)) n--; } return d; };
const item = k => ITEMS.find(i => i.k === k);

// Staff edits win over what was read from the notes.
const carriersOf = (r, s) => (s && s.carriers) || r.carriers || [];
const isSelfPay = (r, s) => (s && typeof s.selfPay === 'boolean') ? s.selfPay : (!!r.selfPay && carriersOf(r, s).length === 0);
const isNeeded = (r, s, k) => !(item(k).insurance && isSelfPay(r, s));
// How many of an insurance item are needed: one per insurance (at least one).
const howMany = (r, s, k) => item(k).insurance ? Math.max(1, carriersOf(r, s).length) : 1;

// Documents found for an item, split into recent enough and too old.
function found(r, k) {
  const it = item(k), list = (r.docs && r.docs[k]) || [];
  const fresh = [], old = [];
  for (const doc of list) (!it.freshDays || !doc.date || daysBetween(doc.date, r.date) <= it.freshDays ? fresh : old).push(doc);
  return { fresh, old };
}

// Insurance verified by phone, for carriers the patient still has.
const phoneVerified = (r, s) => FD_carriersOrUnknown(r, s).filter(c => s && s.verified && s.verified[c]);
const FD_carriersOrUnknown = (r, s) => carriersOf(r, s).length ? carriersOf(r, s) : ['Insurance not in notes'];
// How many of an item are on file: documents, plus phone verifications for the BV.
const haveCount = (r, s, k) => found(r, k).fresh.length + (k === 'bv' ? phoneVerified(r, s).length : 0);

function isDone(r, s, k) {
  s = s || {};
  if (k === 'welcome') return (s.calls || []).some(c => c.outcome === 'Reached') || !!(s.manual || {}).welcome;
  if ((s.manual || {})[k]) return true;
  return haveCount(r, s, k) >= howMany(r, s, k);
}
// "1 of 2" style progress for insurance items with two insurances.
function countText(r, s, k) {
  const need = howMany(r, s, k);
  if (need < 2 || isDone(r, s, k)) return '';
  return `${Math.min(haveCount(r, s, k), need)} of ${need}`;
}
// Carriers the practice still has to call: every insurance not yet verified by phone,
// until there are enough BVs/verifications. (A BV document doesn't say which carrier it
// covers, so with two insurances and one BV both stay listed until one is called.)
function carriersToCall(r, s) {
  s = s || {};
  if (!isNeeded(r, s, 'bv') || isDone(r, s, 'bv')) return [];
  return FD_carriersOrUnknown(r, s).filter(c => !(s.verified && s.verified[c]));
}

const missing = (r, s) => ITEMS.filter(i => isNeeded(r, s, i.k) && !isDone(r, s, i.k));
const progress = (r, s) => { const need = ITEMS.filter(i => isNeeded(r, s, i.k)); return { done: need.length - missing(r, s).length, of: need.length }; };
const isReady = (r, s) => missing(r, s).length === 0;
const isRed = (r, s, today) => r.date >= today && !isReady(r, s) && r.date <= addBusinessDays(today, RED_BUSINESS_DAYS);


// The day our team starts calling for a consult with no BV, and whether that's today.
const insuranceCallStarts = r => subBusinessDays(r.date, INSURANCE_CALL_BUSINESS_DAYS);
const insuranceCallDue = (r, s, today) => r.date >= today && carriersToCall(r, s).length > 0 && today >= insuranceCallStarts(r);

// Which list a patient belongs on today, after this browser's clicks.
function listOf(r, s, today) {
  s = s || {};
  if (s.outcome === 'noshow') return (s.reac && s.reac.closed) ? 'closed' : 'reactivate';
  if (s.outcome === 'showed') return r.date === today ? 'today' : 'done';
  if (r.kind === 'reactivate') return (s.reac && s.reac.closed) ? 'closed' : 'reactivate';
  if (r.kind === 'upcoming') return r.date === today ? 'today' : r.date <= addDays(today, 30) ? 'upcoming' : 'later';
  if (r.kind === 'notMarked') return daysBetween(r.date, today) <= 14 ? 'notMarked' : 'done';
  return 'done'; // came in, or office cancelled
}

// Next reactivation call: counted from the missed date (or today, for a cancel of a
// future consult), stepping through the cadence one logged call at a time.
function nextReactivationCall(r, s, today) {
  const n = ((s && s.reac && s.reac.attempts) || []).length;
  if (n >= REACTIVATION_CADENCE.length) return null;
  const start = r.date < today ? r.date : today;
  return addDays(start, REACTIVATION_CADENCE.slice(0, n + 1).reduce((a, b) => a + b, 0));
}

export { ITEMS, REACTIVATION_CADENCE, addDays, addBusinessDays, daysBetween, item, carriersOf, isSelfPay, isNeeded, howMany, found, isDone, countText, missing, progress, isReady, isRed, carriersToCall, insuranceCallStarts, insuranceCallDue, listOf, nextReactivationCall };
