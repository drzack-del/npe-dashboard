// Monthly goals, kept per calendar year.
//
// Stored in settings key 'goals' as { version: 2, years: { '2026': YearGoals, '2027': ... } }.
// YearGoals = { overallMode, monthly: 12 × { totalNPE, totalStarted, carNPE, carStarted,
// apoNPE, apoStarted, loc2NPE, loc2Started, ..., convGoal }, quarterly: 4 × { npe, started, conv } }.
//
// Before 2026-10 the setting was a single YearGoals with no year. Every such value was saved
// during 2026, so it is read as 2026's goals. Any year with nothing saved has no goals (zeros),
// which hides the goal bars instead of silently reusing another year's numbers.

export const LEGACY_GOALS_YEAR = 2026;

export const blankYearGoals = () => ({
  overallMode: true,
  monthly: Array.from({ length: 12 }, () => ({
    carNPE: 0, carStarted: 0, apoNPE: 0, apoStarted: 0, totalNPE: 0, totalStarted: 0, convGoal: 70,
  })),
  quarterly: [0, 1, 2, 3].map(() => ({ npe: 0, started: 0, conv: 70 })),
});

const isYearGoals = v => v && typeof v === 'object' && Array.isArray(v.monthly);

// Any stored value (old single-year, new per-year, or nothing) → { version: 2, years }.
export const normalizeGoals = (raw) => {
  if (raw && typeof raw === 'object' && raw.years && typeof raw.years === 'object') {
    const years = {};
    for (const [y, g] of Object.entries(raw.years)) if (isYearGoals(g)) years[y] = g;
    return { version: 2, years };
  }
  if (isYearGoals(raw)) return { version: 2, years: { [LEGACY_GOALS_YEAR]: raw } };
  return { version: 2, years: {} };
};

export const goalsForYear = (store, year) => {
  const g = store?.years?.[String(year)];
  return isYearGoals(g) ? g : blankYearGoals();
};

export const withYearGoals = (store, year, yearGoals) =>
  ({ version: 2, years: { ...(store?.years || {}), [String(year)]: yearGoals } });

// One month's practice-wide goal, however the goals were entered (whole practice or per office).
export const monthGoalTotals = (yearGoals, m) => {
  if (!m) return { npe: 0, started: 0 };
  if (yearGoals?.overallMode) return { npe: Number(m.totalNPE) || 0, started: Number(m.totalStarted) || 0 };
  let npe = 0, started = 0;
  for (const [k, v] of Object.entries(m)) {
    if (k === 'totalNPE' || k === 'totalStarted') continue;
    if (/NPE$/.test(k)) npe += Number(v) || 0;
    else if (/Started$/.test(k)) started += Number(v) || 0;
  }
  return { npe, started };
};

// Goal totals for a "YYYY-MM" month, or for (year, monthIndex).
export const monthGoal = (store, year, monthIndex) => {
  const yg = goalsForYear(store, year);
  return monthGoalTotals(yg, yg.monthly[monthIndex]);
};

// The next `count` months starting with the current one: [{ year, month, label }].
export const upcomingMonths = (count = 12, from = new Date()) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() + i, 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
  });
