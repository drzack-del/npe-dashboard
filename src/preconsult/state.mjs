// Pre Consult: turning saved clicks (rows of public.pre_consult_events, oldest first) into
// each patient's state, and turning a greyfinch-sync 'preconsult' answer into rows.
//
// A patient's state has the shape the status rules (status.mjs) read:
//   { manual: {item: {by, at}}, verified: {carrier: {by, at, result}}, carriers?, selfPay?,
//     reac: {attempts: [{by, at}], closed?}, audit? }
// Replaying is append-only: an untick is a later row, so two staff clicking at once never
// overwrite each other, and the last click wins.
import { buildPatients, makeRow } from './rules.mjs';

const blank = () => ({ manual: {}, verified: {}, calls: [], reac: { attempts: [] } });

export function replay(events) {
  const by = {};
  for (const e of events || []) {
    const s = (by[e.patient_key] = by[e.patient_key] || blank());
    const who = { by: e.by_name || 'Staff', at: e.created_at };
    switch (e.action) {
      case 'tick': if (e.item) s.manual[e.item] = who; break;
      case 'untick': if (e.item) delete s.manual[e.item]; break;
      case 'verify': if (e.item) s.verified[e.item] = { ...who, result: 'Verified' }; break;
      case 'called': s.reac.attempts.push(who); break;
      case 'reac_remove': s.reac.closed = 'Removed'; break;
      case 'set_carriers': s.carriers = Array.isArray(e.value) ? e.value.filter(c => typeof c === 'string') : []; s.selfPay = false; break;
      case 'set_self_pay': s.selfPay = e.value === true; if (s.selfPay) s.carriers = []; break;
      case 'audit': s.audit = e.value && typeof e.value === 'object' ? e.value : null; break;
      default: break;   // unknown actions are ignored, never fatal
    }
  }
  return by;
}
export const stateOf = (by, id) => by[id] || blank();

// greyfinch-sync answer -> one row per patient (see rules.mjs makeRow).
export function rowsFromPull(pull, today) {
  if (!pull || !Array.isArray(pull.bookings) || !pull.patients) return [];
  const memberIds = pull.memberIds || {};
  return buildPatients(pull.bookings, today).map(base => {
    const p = pull.patients[base.patientId];
    if (!p) return null;
    const me = p.person?.id;
    const responsible = [];
    const seen = new Set();
    for (const r of [...(p.person?.relationshipsFrom || []), ...(p.person?.relationshipsTo || [])]) {
      if (r.role !== 'RESPONSIBLE') continue;
      const other = r.fromPerson?.id === me ? r.toPerson : r.fromPerson;
      if (!other?.id || other.id === me || seen.has(other.id)) continue;
      seen.add(other.id);
      responsible.push({ personId: other.id, name: [other.firstName, other.lastName].filter(Boolean).join(' '), type: r.type, dob: other.birthDate || '' });
    }
    const ids = [...(memberIds[me] || []), ...responsible.flatMap(r => memberIds[r.personId] || [])];
    return makeRow(base, p, responsible, ids, today);
  }).filter(Boolean);
}

// How fresh the practice-software data must be. While the tab is open it re-checks every
// 10 minutes (Dr. Miller, 2026-10-13), and right away when someone comes back to the
// window if the last pull is more than 5 minutes old.
export const AUTO_REFRESH_MS = 10 * 60 * 1000;
export const STALE_ON_RETURN_MS = 5 * 60 * 1000;
export const isStale = (pulledAt, now = Date.now(), limit = STALE_ON_RETURN_MS) => {
  const t = Date.parse(pulledAt || '');
  return isNaN(t) || now - t > limit;
};
