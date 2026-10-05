import React, { useState, useEffect } from 'react';

// "Get Started" — the setup page a brand-new practice's admin lands on. Replaces the old
// pop-up checklist, which did not fit a laptop screen and sent people around Settings with
// spotlight hints. Every step is done right here; App.jsx owns the data and the saving.
// Steps report done from the practice's real data, so finishing a step in Settings counts too.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RATE_FIELDS = [
  { key: 'sds', label: 'Same-day start', hint: 'per patient who starts the day of their exam' },
  { key: 'ret', label: 'Retainer add-on', hint: 'per R+ sold' },
  { key: 'white', label: 'Whitening add-on', hint: 'per W+ sold' },
  { key: 'pif', label: 'Paid in full', hint: 'per patient who pays in full' },
];

// A month's practice-wide goal, whichever way the goals were entered.
export const monthGoalTotals = (goals, m) => {
  if (goals?.overallMode) return { npe: m.totalNPE || 0, started: m.totalStarted || 0 };
  let npe = 0, started = 0;
  for (const [k, v] of Object.entries(m)) {
    if (k === 'totalNPE' || k === 'totalStarted') continue;
    if (/NPE$/.test(k)) npe += Number(v) || 0;
    else if (/Started$/.test(k)) started += Number(v) || 0;
  }
  return { npe, started };
};

export const setupStepsDone = ({ locations, goals, teamMembers, bonusUsers, bonusSkipped, patientCount }) => {
  const curMonth = new Date().getMonth();
  const goalsSet = (goals?.monthly || []).some((m, i) => {
    if (i < curMonth) return false;
    const t = monthGoalTotals(goals, m);
    return t.npe > 0 || t.started > 0;
  });
  const bonusSet = bonusSkipped || bonusUsers.some(u =>
    ['sds', 'ret', 'white', 'pif', 'goalBelow', 'goalMet', 'goalBeat'].some(k => Number(u.bonus_rates?.[k]) > 0));
  return {
    offices: locations.length > 0,
    goals: goalsSet,
    team: teamMembers.length > 0,
    bonus: bonusSet,
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

const GoalsStep = ({ goals, onSaveGoals, onOpenSettings }) => {
  const curMonth = new Date().getMonth();
  const year = new Date().getFullYear();
  const fromGoals = () => (goals?.monthly || []).map(m => monthGoalTotals(goals, m));
  const [rows, setRows] = useState(fromGoals);
  const [fillNpe, setFillNpe] = useState('');
  const [fillStarts, setFillStarts] = useState('');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRows(fromGoals()); }, [goals]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCell = (i, key, v) => setRows(r => r.map((row, j) => j === i ? { ...row, [key]: v === '' ? '' : Math.max(0, Number(v)) } : row));
  const fillAll = () => {
    if (fillNpe === '' && fillStarts === '') return setMsg({ tone: 'error', text: 'Type a number of exams and/or starts first.' });
    setRows(r => r.map((row, i) => i < curMonth ? row : {
      npe: fillNpe === '' ? row.npe : Math.max(0, Number(fillNpe)),
      started: fillStarts === '' ? row.started : Math.max(0, Number(fillStarts)),
    }));
    setMsg({ tone: 'info', text: 'Filled in. Adjust any month, then click Save goals.' });
  };
  const save = async () => {
    const bad = rows.some((r, i) => i >= curMonth && Number(r.started) > Number(r.npe) && Number(r.npe) > 0);
    if (bad) return setMsg({ tone: 'error', text: 'A month has more starts than exams. Check the numbers.' });
    setSaving(true);
    const monthly = (goals.monthly || []).map((m, i) => i < curMonth ? m : { ...m, totalNPE: Number(rows[i].npe) || 0, totalStarted: Number(rows[i].started) || 0 });
    const sumQ = (q, key) => [0, 1, 2].reduce((s, k) => s + (Number(monthly[q * 3 + k][key]) || 0), 0);
    const quarterly = [0, 1, 2, 3].map(q => ({ ...(goals.quarterly?.[q] || { conv: 70 }), npe: sumQ(q, 'totalNPE'), started: sumQ(q, 'totalStarted') }));
    const err = await onSaveGoals({ ...goals, overallMode: true, monthly, quarterly });
    setSaving(false);
    setMsg(err ? { tone: 'error', text: `Could not save: ${err}` } : { tone: 'ok', text: 'Goals saved. The dashboard now tracks you against them.' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
        How many new patient exams do you expect each month, and how many of them do you want to start treatment? These are for the whole practice. The dashboard shows how you're tracking against them.
      </p>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
        <div>
          <label style={label}>Exams per month</label>
          <input type="number" min="0" value={fillNpe} onChange={e => setFillNpe(e.target.value)} placeholder="e.g. 40" style={{ ...input, width: '120px' }} />
        </div>
        <div>
          <label style={label}>Starts per month</label>
          <input type="number" min="0" value={fillStarts} onChange={e => setFillStarts(e.target.value)} placeholder="e.g. 20" style={{ ...input, width: '120px' }} />
        </div>
        <button onClick={fillAll} style={quietBtn}>Use for every month</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '320px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontSize: '12px', textAlign: 'left' }}>
              <th style={{ padding: '8px 6px' }}>Month ({year})</th>
              <th style={{ padding: '8px 6px' }}>Exams goal</th>
              <th style={{ padding: '8px 6px' }}>Starts goal</th>
            </tr>
          </thead>
          <tbody>
            {MONTHS.map((month, i) => i < curMonth ? null : (
              <tr key={month} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: i === curMonth ? '#fffbeb' : 'white' }}>
                <td style={{ padding: '6px', fontWeight: i === curMonth ? 700 : 500 }}>{month}{i === curMonth && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#b45309' }}>this month</span>}</td>
                <td style={{ padding: '6px' }}><input type="number" min="0" aria-label={`${month} exams goal`} value={rows[i]?.npe ?? 0} onChange={e => setCell(i, 'npe', e.target.value)} style={{ ...input, width: '90px', padding: '6px 8px' }} /></td>
                <td style={{ padding: '6px' }}><input type="number" min="0" aria-label={`${month} starts goal`} value={rows[i]?.started ?? 0} onChange={e => setCell(i, 'started', e.target.value)} style={{ ...input, width: '90px', padding: '6px 8px' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save goals'}</button>
        <span style={{ fontSize: '12px', color: '#6b7280' }}>
          Want separate goals per office, or next year's goals? <button onClick={() => onOpenSettings()} style={{ border: 'none', background: 'none', color: '#2563EB', cursor: 'pointer', padding: 0, fontSize: '12px', fontWeight: 600 }}>Settings → Goals</button>
        </span>
      </div>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </div>
  );
};

const TeamStep = ({ teamMembers, form, onAddTeamMember, teamMsg, teamMsgType, showPassword, inviteHelp }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
    <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
      Add your treatment coordinators, and anyone else who will use CadenceIQ. Each person gets their own login, so calls and bonuses are tracked per person.
    </p>
    {teamMembers.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {teamMembers.map(u => (
          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: '8px', fontSize: '13px' }}>
            <span><strong>{u.name}</strong> <span style={{ color: '#6b7280' }}>· {u.email}</span></span>
            <span style={{ color: '#6b7280' }}>{{ tc: 'TC', manager: 'Office Manager', admin: 'Admin', location_owner: 'Location Owner' }[u.role] || u.role}</span>
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
          <option value="tc">TC</option>
          <option value="manager">Office Manager</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button onClick={onAddTeamMember} style={darkBtn}>Add</button>
    </div>
    <div style={{ fontSize: '12px', color: '#6b7280' }}>{inviteHelp}</div>
    {teamMsg && <Note tone={teamMsgType === 'error' ? 'error' : teamMsgType === 'success' || teamMsgType === 'info' ? 'ok' : 'info'}>{teamMsg}</Note>}
  </div>
);

const BonusStep = ({ bonusUsers, onSaveBonusRates, onSkipBonus, bonusSkipped, onOpenSettings }) => {
  const initial = () => Object.fromEntries(bonusUsers.map(u => [u.id, Object.fromEntries(RATE_FIELDS.map(f => [f.key, Number(u.bonus_rates?.[f.key]) || 0]))]));
  const [drafts, setDrafts] = useState(initial);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const ids = bonusUsers.map(u => u.id).join(',');
  useEffect(() => { setDrafts(initial()); }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  if (bonusUsers.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
        Bonus rates are set per person, so add your TCs (or Office Managers) in the Team step first. They'll show up here.
      </p>
      {!bonusSkipped && <div><button onClick={onSkipBonus} style={quietBtn}>We don't pay TC bonuses</button></div>}
    </div>
  );
  const save = async () => {
    setSaving(true);
    const err = await onSaveBonusRates(drafts);
    setSaving(false);
    setMsg(err ? { tone: 'error', text: `Could not save: ${err}` } : { tone: 'ok', text: 'Bonus rates saved. Each person sees their own earnings in Bonus Audit.' });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
        CadenceIQ works out each person's bonus from their patients. Enter what you pay per patient. Leave $0 for anything you don't pay. Each TC sees only their own bonus.
      </p>
      {bonusUsers.map(u => (
        <div key={u.id} style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>{u.name} <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '12px' }}>{u.role === 'manager' ? 'Office Manager' : 'TC'}</span></div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {RATE_FIELDS.map(f => (
              <div key={f.key} style={{ flex: '1 1 130px' }}>
                <label style={label} title={f.hint}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#6b7280' }}>$</span>
                  <input type="number" min="0" aria-label={`${u.name} ${f.label}`} value={drafts[u.id]?.[f.key] ?? 0}
                    onChange={e => setDrafts(d => ({ ...d, [u.id]: { ...d[u.id], [f.key]: Math.max(0, Number(e.target.value)) } }))}
                    style={{ ...input, width: '90px', padding: '6px 8px' }} />
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{f.hint}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save bonus rates'}</button>
        {!bonusSkipped && <button onClick={onSkipBonus} style={quietBtn}>We don't pay TC bonuses</button>}
      </div>
      <div style={{ fontSize: '12px', color: '#6b7280' }}>
        A monthly bonus for hitting the starts goal, and turning one person's bonuses off, are in <button onClick={() => onOpenSettings()} style={{ border: 'none', background: 'none', color: '#2563EB', cursor: 'pointer', padding: 0, fontSize: '12px', fontWeight: 600 }}>Settings → Bonus Rates</button>.
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
  const { practiceName, locations, teamMembers, bonusUsers, bonusSkipped, patientCount, goals, onFinish } = props;
  const done = setupStepsDone({ locations, goals, teamMembers, bonusUsers, bonusSkipped, patientCount });
  const steps = [
    { key: 'offices', title: 'Add your offices', body: <OfficesStep {...props} /> },
    { key: 'goals', title: 'Set monthly goals', body: <GoalsStep {...props} /> },
    { key: 'team', title: 'Add your team', body: <TeamStep {...props} /> },
    { key: 'bonus', title: 'Set bonus rates', body: <BonusStep {...props} /> },
    { key: 'exam', title: 'Log your first exam', body: <ExamStep {...props} locationsReady={locations.length > 0} /> },
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
            : 'CadenceIQ tracks every new patient exam and tells your TCs who to call each day. These five steps take about 10 minutes. You can stop anytime: this page stays in the menu until you finish.'}
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
