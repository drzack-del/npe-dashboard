// Saving a patient without erasing someone else's work.
//
// Every save writes the whole patient row. A screen opened at 8am still holds the 8am copy,
// so saving from it used to put the 8am contact log back and wipe any call logged since on
// another screen. Before each save the app now reads the row as it is in the database and
// merges: only the fields this screen actually changed are written over it, and contact-log
// entries are added to the stored log instead of replacing it.
//
//   base  = the row this screen's copy was loaded from (or last saved as)
//   local = the row this screen wants to save
//   fresh = the row in the database right now
//
// Rows here are the snake_case rows buildPatientRow makes in App.jsx.

// The database copy a patient object was loaded from. A symbol key rides along through
// {...patient} copies but stays out of JSON, so the device backup does not double in size.
export const SERVER_BASE = Symbol('serverBase');

// Same content → same string, whatever order the keys are in. The database (jsonb) stores
// object keys in its own order, so a log entry read back never stringifies the way the
// object the app built does. undefined counts as null.
export const stableKey = (v) => {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(stableKey).join(',')}]`;
  if (typeof v === 'object') {
    return `{${Object.keys(v).sort()
      .filter(k => v[k] !== undefined)
      .map(k => `${JSON.stringify(k)}:${stableKey(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
};

const same = (a, b) => stableKey(a) === stableKey(b);

export const mergeContactLogs = (base = [], local = [], fresh = []) => {
  base = base || []; local = local || []; fresh = fresh || [];
  const baseKeys = base.map(stableKey);
  const onlyAdded = base.length <= local.length && baseKeys.every((k, i) => stableKey(local[i]) === k);
  if (onlyAdded) {
    // The usual case: this screen appended calls. Add them to the stored log, skipping any
    // already there (a save that landed even though its answer never came back).
    const stored = new Set(fresh.map(stableKey));
    return [...fresh, ...local.slice(base.length).filter(e => !stored.has(stableKey(e)))];
  }
  // This screen changed or removed earlier entries: keep its version of the log, plus
  // whatever other screens added since this copy was loaded.
  const known = new Set([...baseKeys, ...local.map(stableKey)]);
  return [...local, ...fresh.filter(e => !known.has(stableKey(e)))];
};

export const mergePatientRows = (base, local, fresh) => {
  if (!fresh || !base) return local; // a new patient, or nothing to compare against
  const out = { ...fresh };
  for (const k of Object.keys(local)) {
    if (k === 'contact_log') continue;
    if (!same(local[k], base[k])) out[k] = local[k]; // this screen changed it
  }
  out.contact_log = mergeContactLogs(base.contact_log, local.contact_log, fresh.contact_log);
  return out;
};

export const rowsEqual = same;
