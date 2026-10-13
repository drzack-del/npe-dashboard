// Pre Consult data rules, applied to what greyfinch-sync (mode 'preconsult') returns:
//   - readCarrier(notes)        every carrier named in the chart's Patient Notes
//   - classifyDocs(documents)   which checklist documents are in the chart, with dates
//   - buildPatients(bookings)   one row per patient: their current consult, rebooks,
//                               reschedules and what happened to past consults
//   - makeRow(...)              the full row the Pre Consult tab shows
// The written cases are in rules.test.mjs (node --test src/preconsult/rules.test.mjs).

// ── Carrier from Patient Notes ───────────────────────────────────────────────
// Names that can only mean an insurance carrier.
const CLEAR = [
  ['Delta Dental', /\bdelta\b/i],
  ['Cigna', /\bcigna\b/i],
  ['MetLife', /\bmet\s*life\b/i],
  ['Aetna', /\baetna\b/i],
  ['United Concordia', /\bunited\s*concordia\b|\bucci?\b/i],
  ['UnitedHealthcare', /\bunited\s*health\s*care\b|\buhc\b/i],
  ['Humana', /\bhumana\b/i],
  ['Blue Cross / Florida Blue', /\bblue\s*cross\b|\bbcbs\b|\bflorida\s*blue\b/i],
  ['Ameritas', /\bameritas\b/i],
  ['Assurant', /\bassurant\b/i],
  ['Careington', /\bcareington\b/i],
  ['GEHA', /\bgeha\b/i],
  ['Tricare', /\btricare\b|\bfedvip\b/i],
  ['Sun Life', /\bsun\s*life\b/i],
  ['DentaQuest', /\bdenta\s*quest\b/i],
  ['MCNA', /\bmcna\b/i],
  ['Medicaid', /\bmedicaid\b/i],
  // Florida Medicaid / marketplace plans and other carriers seen locally (added 10-13
  // after "Sunshine Health" was missed).
  ['Sunshine Health', /\bsunshine\s*health\b/i],
  ['Simply Healthcare', /\bsimply\s*(health\s*care|healthcare)?\b/i],
  ['Staywell / WellCare', /\bstaywell\b|\bwell\s*care\b/i],
  ['Molina', /\bmolina\b/i],
  ['Florida Healthy Kids', /\bhealthy\s*kids\b/i],
  ['AmeriHealth Caritas', /\bamerihealth\b/i],
  ['Ambetter', /\bambetter\b/i],
  ['Community Care Plan', /\bcommunity\s*care\s*plan\b/i],
  ['Avesis', /\bavesis\b/i],
  ['Envolve Dental', /\benvolve\b/i],
  ['Dental Health Alliance', /\bdental\s*health\s*alliance\b|\bdha\b/i],
  ['TruAssure', /\btru\s*assure\b/i],
  ['Anthem', /\banthem\b/i],
  ['Mutual of Omaha', /\bmutual\s*of\s*omaha\b/i],
  ['Physicians Mutual', /\bphysicians\s*mutual\b/i],
  ['Unum', /\bunum\b/i],
  ['Florida Combined Life', /\bflorida\s*combined\b/i],
];
// Carrier names that are also everyday words. Dr. Miller (2026-10-12): they count on
// their own, no insurance word needed. The one exception is "legal guardian", which is
// never the carrier.
const ALSO_WORDS = [
  ['Guardian', /\bguardian\b(?<!\blegal\s+guardian\b)/i],
  ['Liberty Dental', /\bliberty\b/i],
  ['Lincoln Financial', /\blincoln\b/i],
  ['Principal', /\bprincipal\b/i],
  ['Spirit Dental', /\bspirit\b/i],
  ['Renaissance', /\brenaissance\b/i],
  ['Solstice', /\bsolstice\b/i],
];

// "Cash" alone is too loose (cash copay); these mean no insurance.
const SELF_PAY = /\bno\s*(dental\s*)?ins(urance)?\b|\bself[\s-]*pay\b|\bprivate\s*pay\b|\bcash\s*(pay|patient|only)\b|\buninsured\b/i;
// Florida Medicaid dental plans: "Medicaid - Liberty" is one coverage, not two.
const MEDICAID_PLANS = new Set(['Liberty Dental', 'DentaQuest', 'MCNA']);

// Every carrier named in the notes, in the order they appear. Patients can have two
// insurances, so two names means two insurances to verify (staff can remove one).
// Self-pay only when no carrier is named at all.
export function readCarrier(notes) {
  const text = notes || '';
  const found = [];
  for (const [name, re] of [...CLEAR, ...ALSO_WORDS]) {
    const m = re.exec(text);
    if (m) found.push({ name, at: m.index });
  }
  let carriers = [...new Set(found.sort((a, b) => a.at - b.at).map(f => f.name))];
  if (carriers.includes('Medicaid') && carriers.some(n => MEDICAID_PLANS.has(n))) carriers = carriers.filter(n => n !== 'Medicaid');
  if (carriers.length) return { carriers, selfPay: false };
  // Safety net for carriers not on the list: the front desk writes the carrier on the
  // line just above "Member ID" (e.g. "Sunshine Health" / "Member ID:"). Use that line
  // as written. Marked unlisted so the page can show it was read this way.
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const idAt = lines.findIndex(l => /^(member\s*id|mem\s*id|subscriber\s*id|sub\s*id|id\s*#?)\b/i.test(l));
  const above = idAt > 0 ? lines.slice(0, idAt).reverse().find(l => l) : '';
  if (above && above.length <= 40 && /[a-z]{3}/i.test(above) && above.split(/\s+/).length <= 5 && !/:/.test(above) && !SELF_PAY.test(above))
    return { carriers: [above.replace(/\s+/g, ' ')], selfPay: false, unlisted: true };
  return { carriers: [], selfPay: SELF_PAY.test(text) };
}

// ── Checklist documents in the chart ─────────────────────────────────────────
// Titles are normalised first: lower case, file ending dropped, punctuation -> space.
export const norm = s => ` ${(s || '').toLowerCase().replace(/\.(pdf|jpe?g|png|heic|tiff?|docx?)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()} `;
const CARRIER_WORDS = ' (ins|insurance|delta|cigna|metlife|met life|aetna|guardian|humana|uhc|bcbs|blue cross|florida blue|ameritas|principal|lincoln|geha|tricare|liberty|dentaquest|mcna|medicaid|concordia) ';
export const TITLE = {
  // "web ver" = verified on the carrier's website (Dr. Miller 10-13): counts as a BV.
  bv: t => / b ?v /.test(t) || / web ver/.test(t),
  // Insurance details from the pedo office (INS SS screenshot, INS INFO, MILLER INS FORM).
  // Helpful for the call, but not the card and not a verification (Dr. Miller 10-13).
  insInfo: t => / ins (ss|info|screenshot|form) /.test(t) || / insurance (info|form) /.test(t),
  medical: t => / medical form/.test(t) || / health hist/.test(t) || / medical hist/.test(t),
  // "image_5150c2.jpeg" uploads are insurance card photos (Dr. Miller 10-13).
  card: t => / image [0-9a-f]{5,8} /.test(t)
          || (/ (card|crd|cards) /.test(t) && !/ (credit|debit|report|birthday|gift|visa|mastercard|amex|business) /.test(t))
          || (new RegExp(CARRIER_WORDS).test(t) && / (front|back|frt|frnt|bk) /.test(t)),
  front: t => / (front|frt|frnt) /.test(t) || / (front and back|front back|both sides|f b) /.test(t),
  back: t => / (back|bk) /.test(t) || / (front and back|front back|both sides|f b) /.test(t),
  dl: t => / (dl|drivers?|driver s|licen[sc]e|lic) /.test(t) || (/ (id|state id) /.test(t) && !new RegExp(CARRIER_WORDS + '| member ').test(t)),
};

// Each item gets its matching documents, newest first, as [{ name, date }]. Insurance
// items keep every match because a patient with two insurances needs two of each.
export function classifyDocs(documents) {
  const files = (documents || []).filter(d => d && d.type !== 'FOLDER')
    .map(d => ({ name: d.name || '', date: (d.createdAt || '').slice(0, 10), t: norm(d.name) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const all = f => files.filter(f).map(({ name, date }) => ({ name, date }));
  const isCard = d => TITLE.card(d.t);
  const noSide = all(d => isCard(d) && !TITLE.front(d.t) && !TITLE.back(d.t));
  // Card images whose titles name no side come in pairs from uploads
  // (insurance_card_1.jpg, insurance_card_2.jpg): each pair is one front and one back.
  // An odd one left over stays "side not named" for staff to confirm.
  const pairs = Math.floor(noSide.length / 2);
  return {
    bv: all(d => TITLE.bv(d.t)),
    medical: all(d => TITLE.medical(d.t)),
    cardFront: [...all(d => isCard(d) && TITLE.front(d.t)), ...noSide.slice(0, pairs)],
    cardBack: [...all(d => isCard(d) && TITLE.back(d.t)), ...noSide.slice(pairs, pairs * 2)],
    cardNoSide: noSide.slice(pairs * 2),
    dl: all(d => !isCard(d) && TITLE.dl(d.t)),
    insInfo: all(d => TITLE.insInfo(d.t)),
  };
}

// Carriers named in BV titles ("Lockhart, Mackenzie - BV Aetna.pdf"), with the patient's
// own name taken out first so a surname like Lincoln or Guardian isn't read as a carrier.
// Short forms the insurance team uses in BV titles ("BV DD GA" = Delta Dental).
const BV_ABBREV = { dd: 'Delta Dental', ddfl: 'Delta Dental', dq: 'DentaQuest', met: 'MetLife', bc: 'Blue Cross' };
export function carriersFromBvTitles(bvDocs, ownNames) {
  const own = new Set((ownNames || []).flatMap(n => (n || '').toLowerCase().split(/[^a-z]+/)).filter(Boolean));
  const text = (bvDocs || []).map(d => d.name.split(/([^A-Za-z]+)/)
    .filter(w => !own.has(w.toLowerCase()))
    .map(w => BV_ABBREV[w.toLowerCase()] || w).join('')).join(' ; ');
  return readCarrier(text).carriers;
}

// ── One row per patient ──────────────────────────────────────────────────────
// Input: every New Patient Exam booking from the start of the window onward, each as
// { patientId, appointmentId, date, time, state, confirmed, location }. An appointment can
// carry two bookings (Greyfinch's reschedule: the old one cancelled, the new one live).
export const CANCELLED = new Set(['PATIENT_CANCELLED', 'OFFICE_CANCELLED']);
const NOT_MARKED = new Set(['SCHEDULED', 'SCHEDULING']);

export function buildPatients(bookings, today) {
  // 1. One booking per appointment: the live one if any, else the latest cancelled one.
  const byAppt = new Map();
  for (const b of bookings) {
    if (!byAppt.has(b.appointmentId)) byAppt.set(b.appointmentId, []);
    byAppt.get(b.appointmentId).push(b);
  }
  const appts = [...byAppt.values()].map(list => {
    list.sort((x, y) => `${x.date}${x.time}`.localeCompare(`${y.date}${y.time}`));
    const live = list.filter(x => !CANCELLED.has(x.state));
    const chosen = live.length ? live[live.length - 1] : list[list.length - 1];
    return { ...chosen, movedFrom: live.length && list.length > 1 ? list.find(x => CANCELLED.has(x.state))?.date || null : null };
  });

  // 2. Group by patient.
  const byPatient = new Map();
  for (const a of appts) {
    if (!byPatient.has(a.patientId)) byPatient.set(a.patientId, []);
    byPatient.get(a.patientId).push(a);
  }

  const rows = [];
  for (const [patientId, list] of byPatient) {
    list.sort((x, y) => `${x.date}${x.time}`.localeCompare(`${y.date}${y.time}`));
    const upcoming = list.filter(a => a.date >= today && !CANCELLED.has(a.state));
    const past = list.filter(a => a.date < today);
    const lastPast = past[past.length - 1] || null;
    // A cancelled future booking with nothing live after it is a cancel, not a consult.
    const futureCancel = list.filter(a => a.date >= today && CANCELLED.has(a.state)).pop() || null;

    if (upcoming.length) {
      const next = upcoming[0];
      const missedBefore = past.filter(a => a.state === 'NO_SHOW' || a.state === 'PATIENT_CANCELLED').pop() || null;
      rows.push({ patientId, kind: 'upcoming', ...pickBooking(next), movedFrom: next.movedFrom,
        rebookedAfter: missedBefore ? { date: missedBefore.date, state: missedBefore.state } : null });
      continue;
    }
    const last = [lastPast, futureCancel].filter(Boolean).sort((x, y) => x.date.localeCompare(y.date)).pop();
    if (!last) continue;
    let kind = 'past';
    if (last.state === 'NO_SHOW' || last.state === 'PATIENT_CANCELLED') kind = 'reactivate';
    else if (last.state === 'OFFICE_CANCELLED') kind = 'officeCancelled';
    else if (NOT_MARKED.has(last.state) && last.date < today) kind = 'notMarked';
    rows.push({ patientId, kind, ...pickBooking(last), movedFrom: null, rebookedAfter: null });
  }
  return rows;
}
const pickBooking = b => ({ appointmentId: b.appointmentId, date: b.date, time: b.time, state: b.state, confirmed: b.confirmed, location: b.location });

// ── The full row the page shows ──────────────────────────────────────────────
// patient: { id, humanId, notes, documents, person: { firstName, lastName, birthDate, phones } }
// responsible: [{ name, type, dob }]; memberIds: [string]
export function ageOn(birthDate, today) {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  let a = ty - by;
  if (tm < bm || (tm === bm && td < bd)) a--;
  return a >= 0 && a < 130 ? a : null;
}
export function pickPhone(phones) {
  const ph = phones || [];
  return ((ph.find(x => /mobile|cell/i.test(x.type || '')) || ph[0])?.value || '').trim();
}
export function makeRow(base, patient, responsible, memberIds, today) {
  const person = patient.person || {};
  const docs = classifyDocs(patient.documents);
  const carrier = readCarrier(patient.notes);
  // Notes first; if they name no carrier, use the carrier named in a BV title.
  const fromBv = carrier.carriers.length ? [] : carriersFromBvTitles(docs.bv, [person.firstName, person.lastName]);
  return {
    ...base,
    id: base.patientId,
    name: [person.firstName, person.lastName].filter(Boolean).join(' '),
    chart: patient.humanId || '', dob: person.birthDate || '', age: ageOn(person.birthDate, today), phone: pickPhone(person.phones),
    responsible: (responsible || []).map(({ name, type, dob }) => ({ name, type, dob })),
    carriers: carrier.carriers.length ? carrier.carriers : fromBv, selfPay: carrier.selfPay && !fromBv.length,
    carrierFrom: carrier.carriers.length ? (carrier.unlisted ? 'notes, name as written' : 'notes') : fromBv.length ? 'BV title' : '',
    memberIds: [...new Set(memberIds || [])],
    docs,
  };
}
