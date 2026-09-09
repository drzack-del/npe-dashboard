# Financing Term vs. Treatment Length — Design Plan

**Status:** Plan only. Nothing built yet.
**Date:** 2026-09-09

Goal: know, for every start, whether we finish collecting before or after the braces
come off — and put an honest read on that on the dashboard.

Today Cadence captures **Down Payment** and **Contract Amount** on every start
(`src/App.jsx:6564`). It captures nothing about *time*: not how long the plan runs,
not how long treatment runs. So a $5,800 case at 12 months and the same case at
36 months look identical everywhere in the app, even though one is paid off at
debond and the other has us chasing money from a patient who no longer has a
reason to come in.

**Decisions locked in with Dr. Miller, 2026-09-09:**

- Treatment length **is on the treatment plan** Mikayla presents — so it is captured
  at the consult, on the Add NPE form, not at bond.
- Both fields are **required wherever Down Payment and Contract Amount are required
  today** — every status except OBS / DB-RETS / No TX. PEN and MP included.
- Backfill covers **2026 starts only** (~380 patients). Older starts stay
  permanently unmeasured.
- The dashboard headline is **average financed term vs. average treatment length**,
  shown as a pair.
- The stat covers **financed cases only.** Paid-in-full and $0 cases are excluded
  from the comparison entirely, not counted as compliant.

---

## 1. The two numbers

| Field | Meaning | Blank vs. zero |
|---|---|---|
| **Financed Months** | Number of monthly payments on the contract | `NULL` = not recorded yet. `0` = paid in full, no plan. These must not be confused. |
| **Treatment Months** | Estimated length of active treatment, as quoted to the patient at the consult | `NULL` = not recorded. There is no meaningful zero. |

Both are plain integers. Nothing else is stored, because everything else worth
knowing is already derivable:

- **Monthly payment** = `(contractAmount − dp) / financedMonths`
- **Overrun** = `financedMonths − treatmentMonths`
  - `≤ 0` → paid off at or before debond.
  - `> 0` → we are still collecting after the patient walks out.
- **Dollars owed after debond** = `monthlyPayment × overrun`

That last one is the money this feature exists to surface; it rides the card as a
supporting line under the headline pair.

### Edge cases that have to be decided up front, not discovered later

- **Paid in full.** `PIF` patients get `financedMonths = 0`. They are *not* missing
  data — we know the answer, and the answer is "no plan." They sit **outside** the
  comparison: there is no term to compare against treatment length. The card reports
  them as a context count, never as a compliant case.
- **Medicaid.** No patient-financed plan in the usual sense. Recorded as `0` and
  handled exactly like paid in full: known, and outside the comparison.
- **Why not count them as compliant.** A month where half the starts paid cash would
  score near-perfect while every financed case ran a year past debond. The question
  is *when we finance, how long do we finance for* — so cash cases have no vote.
- **Range estimates.** If the doctor quotes "18–24 months," one number has to go in.
  Recommendation: **the high end**, so the stat is conservative and never flatters us.

---

## 2. Where the numbers get captured

Three write paths touch a contract today. All three need the fields, or the data
arrives full of holes and the backfill tab never empties.

| Path | File | What changes |
|---|---|---|
| **Add NPE form** | `src/App.jsx:6564` | The DP / Contract Amount row becomes a 2×2 grid. Same visibility gate as today (`newPatientForm.status && !['OBS','DBRETS','NOTX']`), and now the same *required* gate: both fields join the `needsPayment` checks at `src/App.jsx:2711`. |
| **"Mark as Started" modal** | `src/App.jsx:12108` | A patient added as PEN/SCH who starts later goes through here. Fields + validation at `src/App.jsx:2334`. |
| **Edit Patient modal** | `src/App.jsx:12356` | The correction path, and what the backfill tab links into for anything unusual. |

The Add NPE form is the one Mikayla lives in, so the layout matters:

```
Down Payment *        Contract Amount *
Financed Months *     Treatment Months *
```

No new "paid in full" checkbox — the form already has **PIF**, alongside Retainers
and Whitening (`src/App.jsx:6925`). Ticking PIF sets Financed Months to `0` and
disables the input; clearing it re-enables it. One source of truth for "no payment
plan," and it is the one already driving PIF bonuses.

**Inline sanity check under the row**, rendered live as she types — this is what
makes the field worth filling in rather than something she rushes past:

> $5,800 − $500 down = $5,300 over 30 months = **$177/mo**
> Treatment is 24 months → **6 months of payments after debond (~$1,060).**

---

## 3. Schema and plumbing

New migration `supabase/migrations/20260909_contract_terms.sql`:

```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS financed_months  INTEGER DEFAULT NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS treatment_months INTEGER DEFAULT NULL;

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_financed_months_check;
ALTER TABLE patients ADD CONSTRAINT patients_financed_months_check
  CHECK (financed_months IS NULL OR (financed_months >= 0 AND financed_months <= 120));

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_treatment_months_check;
ALTER TABLE patients ADD CONSTRAINT patients_treatment_months_check
  CHECK (treatment_months IS NULL OR (treatment_months >= 1 AND treatment_months <= 120));

-- Patients already marked Paid In Full have no payment plan, and the app has known
-- that all along. Answer them from existing data instead of asking anyone to retype
-- it. Guarded on IS NULL so it can never overwrite a hand-entered term.
UPDATE patients SET financed_months = 0 WHERE pif = true AND financed_months IS NULL;
```

Nullable on purpose. A `DEFAULT 0` would silently mark 400 historical starts as
"paid in full" — and since paid-in-fulls are excluded from the stat, the card would
launch with an empty cohort and no way to tell that from a genuinely cash-heavy month.

Client plumbing, two lines each:

- Load mapping — `src/App.jsx:1038`: `financedMonths: r.financed_months ?? '', treatmentMonths: r.treatment_months ?? ''`
- `buildPatientRow` — `src/App.jsx:1205`: coerce `'' → null`, else `parseInt`.

All writes go through `dbUpsert` so they inherit the retry + offline outbox. No
direct upserts.

### Field-survival check (non-negotiable)

We have wiped a KPI-feeding field during a workflow transition before. Before this
ships, every path that rebuilds a patient object gets read and confirmed to carry
both fields through:

- No-Treatment conversion — `src/App.jsx:2263`
- Started conversion — `src/App.jsx:2365`
- Medicaid pipeline removal — `src/App.jsx:7314`
- Add-form reset — `src/App.jsx:2824`

---

## 4. The backfill tab

New nav view `terms`, labeled **📆 Contract Terms**. Visible to admin, manager, and
TC. Not location owners (their nav is dashboard / patients / settings by design).

It is a worklist, not a table to browse. One job: get to zero.

- **Rows:** every patient who should have the data and is missing either number.
- **Sort:** newest start first. Recent cases are the ones Mikayla can still recall
  without opening Greyfinch.
- **Row contents:** name · start date · TC · contract amount · down payment, then
  two number inputs, a **PIF** toggle, and an **Open in Greyfinch** link.
- **PIF patients do not appear at all.** The migration already answered them from
  the existing PIF flag, so they are done before Mikayla opens the tab. She never
  sees them and never clicks anything for them.
- If a patient paid in full but PIF was never ticked, they *will* show up in the
  list — ticking PIF right there fills in the `0` and clears the row. PIF drives
  bonus pay, so it is unlikely to be missing often, but this is the escape hatch.
- **Saving:** on blur, per row, through `dbUpsert`. No bulk Save button to forget.
- **Filters:** month, TC, location; "hide completed" on by default.
- **Progress:** `184 of 372 done` with a bar, so the work feels finite.

**Scope: 2026 starts only.** July 2026 alone had 42 starts
(`july-2026-production-reconcile.csv`), so calendar-2026 is roughly **370–400
patients**. Treatment length is not in Cadence for any of them, so each is a
Greyfinch lookup. This is days of work spread across weeks, not an evening — the
tab is built to be picked up and put down, which is why it saves per row and shows
a progress bar.

Anything before 2026-01-01 is deliberately out of scope and stays unmeasured. The
stat is about a habit we want to change going forward; 2025 cases will not change a
decision.

One optional accelerant, same scope either way: `scripts/greyfinch-introspect.mjs`
already filters for `contract|treatment|plan|financial` types (`:167`), and
`scripts/greyfinch-probe.mjs:171` already probes `treatmentPlans`, `contracts`,
`ledgers` and `payments`. Running them is about an hour. If either number turns out
to be reachable, the same 380 rows arrive prefilled and Mikayla is confirming
instead of typing. If not, nothing is lost and the manual plan proceeds unchanged.

---

## 5. The dashboard stat

One card, in the admin/owner column next to Production (`src/App.jsx:3807`).

**Cohort: financed starts in the selected period** — starts with
`financedMonths > 0`. PIF patients are excluded; there is no term to compare.

**The number: average months financed beyond treatment time.**

```
FINANCED BEYOND TREATMENT      36 financed starts · Aug 2026

              +5.2
         months on average

  28 mo financed  ·  23 mo treatment
  Coverage: 36 of 39 financed starts have both numbers
```

`avg(financedMonths − treatmentMonths)` over that cohort. That is the whole stat.

**No thresholds, no green/amber/red, no target.** Decided 2026-09-09. The number is
reported and left to speak for itself; a colour band would be inventing a standard
nobody set. It renders in the card's neutral text colour like any other figure.

The two averages under it are shown because a `+5.2` is meaningless without knowing
whether that is 28-vs-23 or 40-vs-35. Both are computed over the same 36 patients —
averaging the term of financed cases against the treatment length of *all* cases
compares two different populations and quietly biases the number.

Coverage follows the same honesty rule as `prodMissingFee` at `src/App.jsx:3814`,
and has to draw one distinction: `financedMonths = NULL` is **missing** and shows in
coverage; `financedMonths = 0` is **known** (PIF) and is out of the cohort entirely.
Collapsing those two is the one bug that would make this card lie.

Clicking the card opens a name-by-name breakdown of the financed cohort, like
`showProductionDetail` and `feeBreakdown`: patient, contract, term, treatment
length, months beyond — sorted highest first.

**Deliberately not built:** no second copy of this number in Practice Metrics, no
new column in Monthly Reports. One place, one cohort, one time base.

---

## 6. Nothing open

All decisions are locked. The thresholds question raised on 2026-09-09 was answered:
there are none.

---

## 7. Build order

**Done — data entry side (2026-09-09):**

1. ✅ Migration (`supabase/migrations/20260909_contract_terms.sql`) + client plumbing.
2. ✅ Add NPE form fields, validation, live read-back.
3. ✅ Started modal + Edit modal fields.

Verified end to end in the demo practice: entered on the Add NPE form, saved to the
patient, read back in the Edit modal. `0` passes validation while blank is rejected
(the falsy trap — `!'0'` is `false` in JS), and PIF zeroes and disables Financed
Months in both the Add form and the Started modal.

**Done — backfill tab and dashboard card (2026-09-09):**

4. ✅ Contract Terms tab (§4) — worklist, progress bar, per-row save on blur,
   PIF button, month/TC/location filters. Completed rows drop out of the list.
5. ✅ Dashboard card + drill-down (§5) — average months financed beyond treatment,
   over financed starts only, with coverage and the paid-in-full count beside it.

Verified against demo data: filling a row advanced the progress bar and removed the
row; the card read `+8.0 months on average` from terms of 24/30/36 against 22, and
the money line computed $442 on a $5,800 contract with $500 down financed 24 months
against 22 months of treatment ($220.83/mo × 2).

**Remaining:** the migration has not been applied to Supabase. Until it is, the two
columns do not exist and saves drop both values silently.

Steps 1–3 stop the hole getting deeper and ship on their own. Optional before step
4: the Greyfinch check in §4 — it cannot change scope, only the amount of typing.
