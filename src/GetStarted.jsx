import React, { useState, useEffect } from 'react';
import { goalsForYear, withYearGoals, monthGoalTotals, upcomingMonths } from './goals.js';

// "Get Started" — the setup page a brand-new practice's admin lands on. Replaces the old
// pop-up checklist, which did not fit a laptop screen and sent people around Settings with
// spotlight hints. Every step is done right here; App.jsx owns the data and the saving.
// Steps report done from the practice's real data, so finishing a step in Settings counts too.

// Practice management systems offered in Get Started and Settings → Features.
export const PRACTICE_SOFTWARE = [
  { value: 'greyfinch', label: 'Greyfinch' },
  { value: 'dolphin', label: 'Dolphin' },
  { value: 'orthotrac', label: 'OrthoTrac' },
  { value: 'cloud9', label: 'Cloud 9' },
  { value: 'edge', label: 'Edge (Ortho2)' },
  { value: 'topsortho', label: 'topsOrtho' },
  { value: 'other', label: 'Something else' },
];

const RATE_FIELDS = [
  { key: 'sds', label: 'Same-day start', hint: 'per patient who starts the day of their exam' },
  { key: 'ret', label: 'Retainer add-on', hint: 'per R+ sold' },
  { key: 'white', label: 'Whitening add-on', hint: 'per W+ sold' },
  { key: 'pif', label: 'Paid in full', hint: 'per patient who pays in full' },
];
// Roles offered when adding someone, with what each can do (see Settings → Team for Location Owner).
export const ROLE_INFO = [
  { value: 'tc', label: 'TC', who: 'Treatment coordinators',
    can: 'Works the Follow-Up Queue and adds new patients. Sees only their own bonus.' },
  { value: 'manager', label: 'Office Manager', who: 'Office or practice managers',
    can: 'Everything a TC does, for the whole practice. By default they can also add TCs, delete patients and see every TC\'s bonus; change that in Settings → Team. No production dollars.' },
  { value: 'admin', label: 'Admin', who: 'Doctors and owners',
    can: 'Full control: settings, goals, team, bonus rates and production numbers.' },
  { value: 'consultant', label: 'Consultant', who: 'Outside consultants, or anyone who should only look',
    can: 'Sees every number, including production and bonuses, but can\'t change anything.' },
];
const CA_TIER_COUNT = 3;
export const hasAnyBonus = r => !!r && (
  ['sds', 'ret', 'white', 'pif', 'goalBelow', 'goalMet', 'goalBeat'].some(k => Number(r[k]) > 0) ||
  (Array.isArray(r.caTiers) && r.caTiers.some(t => Number(t?.amt) > 0)));

export const setupStepsDone = ({ locations, goalsStore, goalsSkipped, practiceSoftware, medicaidAnswered,
  teamMembers, bonusUsers, bonusesEnabled, patientCount }) => {
  const goalsSet = upcomingMonths(12).some(({ year, month }) => {
    const yg = goalsForYear(goalsStore, year);
    const t = monthGoalTotals(yg, yg.monthly[month]);
    return t.npe > 0 || t.started > 0;
  });
  return {
    offices: locations.length > 0,
    practice: !!practiceSoftware && !!medicaidAnswered,
    goals: goalsSet || !!goalsSkipped,
    team: teamMembers.length > 0,
    bonus: !bonusesEnabled || bonusUsers.some(u => hasAnyBonus(u.bonus_rates)),
    exam: patientCount > 0,
  };
};

const card = { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const input = { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' };
const primaryBtn = { padding: '9px 18px', backgroundColor: '#2563EB', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const darkBtn = { ...primaryBtn, backgroundColor: '#202020' };
const quietBtn = { padding: '8px 14px', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const label = { display: 'block', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' };
const Note = ({ children, tone = 'info' }) => {
  const c = { info: ['#eff6ff', '#1e40af', '#bfdbfe'], ok: ['#f0fdf4', '#166534', '#bbf7d0'], error: ['#fef2f2', '#b91c1c', '#fecaca'] }[tone];
  return <div style={{ padding: '10px 12px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.5, backgroundColor: c[0], color: c[1], border: `1px solid ${c[2]}`, whiteSpace: 'pre-line' }}>{children}</div>;
};

const OfficesStep = ({ locations, onAddLocation, onRemoveLocation }) => {
  const [name, setName] = useState('');
  const [msg, setMsg] = useState(null);
  const add = async () => {
    const n = name.trim();
    if (!n) return setMsg({ tone: 'error', text: 'Type the office name first.' });
    if (locations.some(l => l.toLowerCase() === n.toLowerCase())) return setMsg({ tone: 'error', text: `"${n}" is already on the list.` });
    const err = await onAddLocation(n);
    if (err) return setMsg({ tone: 'error', text: `Could not save: ${err}` });
    setName('');
    setMsg({ tone: 'ok', text: `"${n}" added. Add another, or go on to the next step.` });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
        Add each office where you see new patients. Every exam is logged to an office, so you can compare offices on the dashboard. One office is fine.
      </p>
      {locations.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {locations.map(loc => (
            <span key={loc} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 8px 6px 12px', backgroundColor: '#f3f4f6', borderRadius: '20px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>
              📍 {loc}
              <button aria-label={`Remove ${loc}`} title="Remove" onClick={() => onRemoveLocation(loc)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '16px', lineHeight: 1, padding: '0 4px' }}>×</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder={locations.length ? 'Another office name' : 'Office name, e.g. Main Office or Downtown'}
          style={{ ...input, flex: '1 1 220px' }} />
        <button onClick={add} style={darkBtn}>Add office</button>
      </div>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </div>
  );
};

const Choice = ({ selected, onClick, children }) => (
  <button onClick={onClick} style={{ ...quietBtn, borderColor: selected ? '#2563EB' : '#d1d5db', backgroundColor: selected ? '#eff6ff' : 'white', color: selected ? '#1d4ed8' : '#374151' }}>
    {selected ? '✓ ' : ''}{children}
  </button>
);

const PracticeStep = ({ medicaidEnabled, medicaidAnswered, onSetMedicaid, practiceSoftware, onSetSoftware }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
    <div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#202020', marginBottom: '4px' }}>Do you take Medicaid patients?</div>
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', lineHeight: 1.5 }}>
        If not, CadenceIQ hides everything Medicaid: the Medicaid Pipeline, Medicaid numbers on the dashboard, and the Medicaid question when adding a patient.
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Choice selected={medicaidAnswered && medicaidEnabled} onClick={() => onSetMedicaid(true)}>Yes, we take Medicaid</Choice>
        <Choice selected={medicaidAnswered && !medicaidEnabled} onClick={() => onSetMedicaid(false)}>No</Choice>
      </div>
    </div>
    <div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#202020', marginBottom: '4px' }}>Which practice management software do you use?</div>
      <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px', lineHeight: 1.5 }}>
        The system you schedule patients in. We use it to know which connections can work for you.
      </div>
      <select value={practiceSoftware || ''} onChange={e => onSetSoftware(e.target.value || null)} style={{ ...input, minWidth: '220px' }}>
        <option value="">Choose…</option>
        {PRACTICE_SOFTWARE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {practiceSoftware === 'greyfinch' && (
        <div style={{ marginTop: '8px' }}><Note>A Greyfinch connection that fills in new patients for you is coming soon. Until then, you add patients by hand.</Note></div>
      )}
    </div>
    <div style={{ fontSize: '12px', color: '#6b7280' }}>You can change both later in Settings → Features.</div>
  </div>
);

const GoalsStep = ({ goalsStore, onSaveGoalsStore, goalsSkipped, onSkipGoals, onOpenSettings }) => {
  const months = upcomingMonths(12);
  const fromStore = () => Object.fromEntries(months.map(({ year, month }) => {
    const yg = goalsForYear(goalsStore, year);
    return [`${year}-${month}`, monthGoalTotals(yg, yg.monthly[month])];
  }));
  const [rows, setRows] = useState(fromStore);
  const [fillNpe, setFillNpe] = useState('');
  const [fillStarts, setFillStarts] = useState('');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRows(fromStore()); }, [goalsStore]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCell = (k, key, v) => setRows(r => ({ ...r, [k]: { ...r[k], [key]: v === '' ? '' : Math.max(0, Number(v)) } }));
  const fillAll = () => {
    if (fillNpe === '' && fillStarts === '') return setMsg({ tone: 'error', text: 'Type a number of exams and/or starts first.' });
    setRows(r => Object.fromEntries(Object.entries(r).map(([k, row]) => [k, {
      npe: fillNpe === '' ? row.npe : Math.max(0, Number(fillNpe)),
      started: fillStarts === '' ? row.started : Math.max(0, Number(fillStarts)),
    }])));
    setMsg({ tone: 'info', text: 'Filled in. Adjust any month, then click Save goals.' });
  };
  const save = async () => {
    if (Object.values(rows).some(r => Number(r.npe) > 0 && Number(r.started) > Number(r.npe)))
      return setMsg({ tone: 'error', text: 'A month has more starts than exams. Check the numbers.' });
    setSaving(true);
    let store = goalsStore;
    for (const year of [...new Set(months.map(m => m.year))]) {
      const yg = goalsForYear(store, year);
      const monthly = yg.monthly.map((m, i) => {
        const row = rows[`${year}-${i}`];
        return row ? { ...m, totalNPE: Number(row.npe) || 0, totalStarted: Number(row.started) || 0 } : m;
      });
      const sumQ = (q, key) => [0, 1, 2].reduce((t, k) => t + (Number(monthly[q * 3 + k][key]) || 0), 0);
      const quarterly = [0, 1, 2, 3].map(q => ({ ...(yg.quarterly?.[q] || { conv: 70 }), npe: sumQ(q, 'totalNPE'), started: sumQ(q, 'totalStarted') }));
      store = withYearGoals(store, year, { ...yg, overallMode: true, monthly, quarterly });
    }
    const err = await onSaveGoalsStore(store);
    setSaving(false);
    setMsg(err ? { tone: 'error', text: `Could not save: ${err}` } : { tone: 'ok', text: 'Goals saved. The dashboard now tracks you against them.' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
        How many new patient exams do you expect each month, and how many of them do you want to start treatment? These are for the whole practice. The dashboard shows how you're tracking against them. Goals are optional.
      </p>
      {goalsSkipped && <Note>You chose not to set goals. The dashboard shows your numbers without goal bars. You can still set goals here or in Settings → Goals anytime.</Note>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
        <div>
          <label style={label}>Exams per month</label>
          <input type="number" min="0" value={fillNpe} onChange={e => setFillNpe(e.target.value)} placeholder="e.g. 40" style={{ ...input, width: '120px' }} />
        </div>
        <div>
          <label style={label}>Starts per month</label>
          <input type="number" min="0" value={fillStarts} onChange={e => setFillStarts(e.target.value)} placeholder="e.g. 20" style={{ ...input, width: '120px' }} />
        </div>
        <button onClick={fillAll} style={quietBtn}>Use for all 12 months</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '320px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontSize: '12px', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>Month</th>
              <th style={{ padding: '8px 6px' }}>Exams goal</th>
              <th style={{ padding: '8px 6px' }}>Starts goal</th>
            </tr>
          </thead>
          <tbody>
            {months.map(({ year, month, label: monthLabel }, i) => {
              const k = `${year}-${month}`;
              return (
                <tr key={k} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: i === 0 ? '#fffbeb' : 'white' }}>
                  <td style={{ padding: '6px', fontWeight: i === 0 ? 700 : 500 }}>{monthLabel}{i === 0 && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#b45309' }}>this month</span>}</td>
                  <td style={{ padding: '6px' }}><input type="number" min="0" aria-label={`${monthLabel} exams goal`} value={rows[k]?.npe ?? 0} onChange={e => setCell(k, 'npe', e.target.value)} style={{ ...input, width: '90px', padding: '6px 8px' }} /></td>
                  <td style={{ padding: '6px' }}><input type="number" min="0" aria-label={`${monthLabel} starts goal`} value={rows[k]?.started ?? 0} onChange={e => setCell(k, 'started', e.target.value)} style={{ ...input, width: '90px', padding: '6px 8px' }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save goals'}</button>
        {!goalsSkipped && <button onClick={onSkipGoals} style={quietBtn}>We don't set goals</button>}
        <span style={{ fontSize: '12px', color: '#6b7280' }}>
          Separate goals per office: <button onClick={() => onOpenSettings()} style={{ border: 'none', background: 'none', color: '#2563EB', cursor: 'pointer', padding: 0, fontSize: '12px', fontWeight: 600 }}>Settings → Goals</button>
        </span>
      </div>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </div>
  );
};

const TeamStep = ({ teamMembers, form, onAddTeamMember, teamAdding, teamMsg, teamMsgType, showPassword, inviteHelp, onResendInvite, inviteState = {} }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
      Add everyone who will use CadenceIQ. Each person gets their own login, so calls and bonuses are tracked per person. Pick the role that matches what they should see and do:
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
      {ROLE_INFO.map(r => (
        <div key={r.value} style={{ padding: '10px 12px', borderRadius: '8px', border: `1px solid ${form.role === r.value ? '#93c5fd' : '#e5e7eb'}`, backgroundColor: form.role === r.value ? '#eff6ff' : '#f9fafb' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#202020' }}>{r.label} <span style={{ fontWeight: 400, color: '#6b7280' }}>· {r.who}</span></div>
          <div style={{ fontSize: '12px', color: '#4b5563', marginTop: '3px', lineHeight: 1.5 }}>{r.can}</div>
        </div>
      ))}
    </div>
    <div style={{ fontSize: '12px', color: '#6b7280' }}>A partner who should see only one office's numbers? Add them as a Location Owner in Settings → Team, after your offices are set up.</div>
    {teamMembers.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {teamMembers.map(u => (
          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', fontSize: '13px' }}>
            <span><strong>{u.name}</strong> <span style={{ color: '#6b7280' }}>· {u.email}</span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6b7280' }}>
              {(ROLE_INFO.find(r => r.value === u.role)?.label) || (u.role === 'location_owner' ? 'Location Owner' : u.role)}
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', backgroundColor: u.auth_user_id ? '#dcfce7' : '#fef3c7', color: u.auth_user_id ? '#166534' : '#92400e' }}>
                {u.auth_user_id ? 'Signed in' : 'Invite pending'}
              </span>
              {onResendInvite && !u.auth_user_id && (
                <button onClick={() => onResendInvite(u)} disabled={inviteState[u.id] === 'sending'}
                  style={{ ...quietBtn, padding: '4px 10px', fontSize: '12px' }}>
                  {inviteState[u.id] === 'sending' ? 'Sending…' : inviteState[u.id] === 'sent' ? '✓ Sent' : 'Resend invite'}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    )}
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ flex: '1 1 140px' }}>
        <label style={label}>Name</label>
        <input value={form.name} onChange={e => form.setName(e.target.value)} placeholder="First and last name" style={{ ...input, width: '100%' }} />
      </div>
      <div style={{ flex: '2 1 200px' }}>
        <label style={label}>Work email</label>
        <input type="email" value={form.email} onChange={e => form.setEmail(e.target.value)} placeholder="name@yourpractice.com" style={{ ...input, width: '100%' }} />
      </div>
      {showPassword && (
        <div style={{ flex: '1 1 140px' }}>
          <label style={label}>Temporary password</label>
          <input type="password" value={form.password} onChange={e => form.setPassword(e.target.value)} placeholder="Min 6 characters" style={{ ...input, width: '100%' }} />
        </div>
      )}
      <div>
        <label style={label}>Role</label>
        <select value={form.role} onChange={e => form.setRole(e.target.value)} style={{ ...input, paddingRight: '28px' }}>
          {ROLE_INFO.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <button onClick={onAddTeamMember} disabled={teamAdding} style={{ ...darkBtn, opacity: teamAdding ? 0.6 : 1 }}>{teamAdding ? 'Adding…' : 'Add'}</button>
    </div>
    <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>{inviteHelp}</div>
    {teamMsg && <Note tone={teamMsgType === 'error' ? 'error' : teamMsgType === 'success' || teamMsgType === 'info' ? 'ok' : 'info'}>{teamMsg}</Note>}
  </div>
);

const blankTiers = () => Array.from({ length: CA_TIER_COUNT }, () => ({ min: '', amt: '' }));
const draftFor = u => ({
  ...Object.fromEntries(RATE_FIELDS.map(f => [f.key, Number(u.bonus_rates?.[f.key]) || 0])),
  caTiers: blankTiers().map((b, i) => {
    const t = u.bonus_rates?.caTiers?.[i];
    return t ? { min: t.min ?? '', amt: t.amt ?? '' } : b;
  }),
});
// Keep only filled tiers, lowest threshold first.
export const cleanTiers = tiers => (tiers || [])
  .filter(t => Number(t.min) > 0 && Number(t.amt) > 0)
  .map(t => ({ min: Math.min(100, Number(t.min)), amt: Number(t.amt) }))
  .sort((a, b) => a.min - b.min);

const BonusStep = ({ bonusUsers, onSaveBonusRates, bonusesEnabled, onSetBonusesEnabled, onOpenSettings }) => {
  const initial = () => Object.fromEntries(bonusUsers.map(u => [u.id, draftFor(u)]));
  const [drafts, setDrafts] = useState(initial);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const ids = bonusUsers.map(u => u.id).join(',');
  useEffect(() => { setDrafts(initial()); }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bonusesEnabled) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Note>Bonuses are off for your practice. Bonus Audit, bonus cards and bonus rates are hidden for everyone.</Note>
      <div><button onClick={() => onSetBonusesEnabled(true)} style={quietBtn}>We do pay bonuses, turn them back on</button></div>
    </div>
  );
  const offButton = (
    <button onClick={() => { if (window.confirm('Turn bonuses off for your practice? Bonus Audit, bonus cards and bonus rates will be hidden for everyone. You can turn them back on in Settings → Features.')) onSetBonusesEnabled(false); }}
      style={quietBtn}>We don't pay TC bonuses</button>
  );
  if (bonusUsers.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
        Bonus rates are set per person, so add your TCs (or Office Managers) in the Team step first. They'll show up here.
      </p>
      <div>{offButton}</div>
    </div>
  );
  const setRate = (id, key, v) => setDrafts(d => ({ ...d, [id]: { ...d[id], [key]: Math.max(0, Number(v)) } }));
  const setTier = (id, i, key, v) => setDrafts(d => ({ ...d, [id]: { ...d[id], caTiers: d[id].caTiers.map((t, j) => j === i ? { ...t, [key]: v === '' ? '' : Math.max(0, Number(v)) } : t) } }));
  const save = async () => {
    for (const u of bonusUsers) {
      const t = cleanTiers(drafts[u.id]?.caTiers);
      if (t.some((x, i) => i > 0 && x.amt < t[i - 1].amt)) return setMsg({ tone: 'error', text: `${u.name}: a higher Case Acceptance level should pay at least as much as a lower one.` });
    }
    setSaving(true);
    const out = Object.fromEntries(Object.entries(drafts).map(([id, d]) => [id, { ...d, caTiers: cleanTiers(d.caTiers) }]));
    const err = await onSaveBonusRates(out);
    setSaving(false);
    setMsg(err ? { tone: 'error', text: `Could not save: ${err}` } : { tone: 'ok', text: 'Bonus rates saved. Each person sees their own earnings in Bonus Audit.' });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
        CadenceIQ works out each person's bonus from their own patients. Leave $0 for anything you don't pay. Each TC sees only their own bonus.
      </p>
      {bonusUsers.map(u => (
        <div key={u.id} style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>{u.name} <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '12px' }}>{u.role === 'manager' ? 'Office Manager' : 'TC'}</span></div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>Per patient</div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {RATE_FIELDS.map(f => (
              <div key={f.key} style={{ flex: '1 1 130px' }}>
                <label style={label}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#6b7280' }}>$</span>
                  <input type="number" min="0" aria-label={`${u.name} ${f.label}`} value={drafts[u.id]?.[f.key] ?? 0}
                    onChange={e => setRate(u.id, f.key, e.target.value)} style={{ ...input, width: '90px', padding: '6px 8px' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{f.hint}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed #e5e7eb' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151' }}>Monthly Case Acceptance bonus <span style={{ fontWeight: 400, color: '#6b7280' }}>(optional)</span></div>
            <div style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 8px', lineHeight: 1.5 }}>
              Their starts that month ÷ their exams that month (Observation patients not counted). Paid once a month at the highest level reached. Use one level for a single target, or up to three.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(drafts[u.id]?.caTiers || blankTiers()).map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '13px', color: '#374151' }}>
                  <span style={{ width: '58px', color: '#6b7280' }}>Level {i + 1}</span>
                  <span>at least</span>
                  <input type="number" min="0" max="100" aria-label={`${u.name} level ${i + 1} percent`} value={t.min} placeholder={['60', '70', '80'][i]}
                    onChange={e => setTier(u.id, i, 'min', e.target.value)} style={{ ...input, width: '70px', padding: '6px 8px' }} />
                  <span>% pays $</span>
                  <input type="number" min="0" aria-label={`${u.name} level ${i + 1} amount`} value={t.amt} placeholder={['100', '200', '300'][i]}
                    onChange={e => setTier(u.id, i, 'amt', e.target.value)} style={{ ...input, width: '80px', padding: '6px 8px' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save bonus rates'}</button>
        {offButton}
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        A monthly bonus for hitting the practice starts goal, and turning one person's bonuses off, are in <button onClick={() => onOpenSettings()} style={{ border: 'none', background: 'none', color: '#2563EB', cursor: 'pointer', padding: 0, fontSize: '12px', fontWeight: 600 }}>Settings → Bonus Rates</button>.
      </div>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </div>
  );
};

const ExamStep = ({ onLogFirstExam, locationsReady }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
      This is the daily habit. After every new patient exam where the patient doesn't start treatment that day, log them in <strong>Add NPE</strong>. Pick why they didn't start, and CadenceIQ schedules their follow-up calls in the <strong>Follow-Up Queue</strong>. Your TCs work that queue each day.
    </p>
    <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
      Patients who start the same day get logged too, so your conversion numbers are right.
    </p>
    {!locationsReady && <Note>Add at least one office first. Every exam is logged to an office.</Note>}
    <div><button onClick={onLogFirstExam} disabled={!locationsReady} style={{ ...primaryBtn, opacity: locationsReady ? 1 : 0.5, cursor: locationsReady ? 'pointer' : 'not-allowed' }}>Log your first exam →</button></div>
  </div>
);

const GetStarted = (props) => {
  const { practiceName, onFinish } = props;
  const done = setupStepsDone(props);
  const steps = [
    { key: 'offices', title: 'Add your offices', body: <OfficesStep {...props} /> },
    { key: 'practice', title: 'How your practice works', body: <PracticeStep {...props} /> },
    { key: 'goals', title: 'Set monthly goals', body: <GoalsStep {...props} /> },
    { key: 'team', title: 'Add your team', body: <TeamStep {...props} /> },
    { key: 'bonus', title: 'Set bonus rates', body: <BonusStep {...props} /> },
    { key: 'exam', title: 'Log your first exam', body: <ExamStep {...props} locationsReady={props.locations.length > 0} /> },
  ];
  const doneCount = steps.filter(s => done[s.key]).length;
  const firstOpen = steps.find(s => !done[s.key])?.key || null;
  // Opens on the first unfinished step. It never jumps ahead by itself (someone adding
  // their first office may have three more to add): a finished step shows a Next button.
  const [open, setOpen] = useState(firstOpen);
  const nextAfter = i => steps.slice(i + 1).find(x => !done[x.key]) || steps.slice(i + 1)[0] || null;
  const allDone = doneCount === steps.length;

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Welcome to CadenceIQ</div>
        <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#202020', margin: '4px 0 6px' }}>{allDone ? `${practiceName || 'Your practice'} is set up` : `Let's set up ${practiceName || 'your practice'}`}</h2>
        <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', lineHeight: 1.6 }}>
          {allDone
            ? "Everything's in place. Click Finish setup to hide this page. You can change any of this later in Settings."
            : 'CadenceIQ tracks every new patient exam and tells your TCs who to call each day. These six steps take about 10 minutes. You can stop anytime: this page stays in the menu until you finish.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
          <div style={{ flex: 1, height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: '100%', backgroundColor: '#10b981', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{doneCount} of {steps.length} done</span>
        </div>
      </div>

      {allDone && (
        <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#166534' }}>🎉 You're all set.</span>
          <button onClick={onFinish} style={{ ...primaryBtn, backgroundColor: '#16a34a' }}>Finish setup → Dashboard</button>
        </div>
      )}

      {steps.map((s, i) => {
        const isOpen = open === s.key;
        return (
          <section key={s.key} style={{ ...card, overflow: 'hidden', borderColor: isOpen ? '#93c5fd' : '#e5e7eb' }}>
            <button onClick={() => setOpen(isOpen ? null : s.key)} aria-expanded={isOpen}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 800, color: 'white', backgroundColor: done[s.key] ? '#10b981' : isOpen ? '#2563EB' : '#9ca3af' }}>
                {done[s.key] ? '✓' : i + 1}
              </span>
              <span style={{ flex: 1, fontSize: '16px', fontWeight: 700, color: '#202020' }}>{s.title}</span>
              {done[s.key] && <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534', backgroundColor: '#dcfce7', padding: '3px 8px', borderRadius: '10px' }}>Done</span>}
              <span style={{ color: '#9ca3af', fontSize: '13px' }}>{isOpen ? '▲' : '▼'}</span>
            </button>
            {/* Closed steps stay mounted (hidden) so half-typed numbers survive a peek at another step. */}
            {(
              <div style={{ padding: '0 20px 20px 64px', display: isOpen ? 'block' : 'none' }} className="get-started-step-body">
                {s.body}
                {done[s.key] && !allDone && nextAfter(i) && (
                  <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setOpen(nextAfter(i).key)} style={primaryBtn}>Next: {nextAfter(i).title} →</button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {!allDone && (
        <div style={{ textAlign: 'center', fontSize: '12px', color: '#9ca3af', padding: '4px 0 12px' }}>
          Already set up some other way?{' '}
          <button onClick={() => { if (window.confirm('Hide the Get Started page? Everything you entered stays. You can change any of it in Settings.')) onFinish(); }}
            style={{ border: 'none', background: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, fontSize: '12px', textDecoration: 'underline' }}>
            Hide this page
          </button>
        </div>
      )}
      <style>{'@media (max-width: 600px) { .get-started-step-body { padding: 0 16px 16px 16px !important; } }'}</style>
    </div>
  );
};

export default GetStarted;
