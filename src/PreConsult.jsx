// Pre Consult tab: upcoming consults with a checklist (BV, health history, welcome call,
// insurance card front/back), an insurance verification call list grouped by carrier, and
// no-show / cancel reactivation calls. Shown only where hasFeature('preConsult') is on.
//
// Data: greyfinch-sync { mode: 'preconsult' } (read live each time the tab opens), turned
// into rows by src/preconsult/rules.mjs. Staff clicks are rows in public.pre_consult_events,
// shared by the whole practice and replayed by src/preconsult/state.mjs. The rules are the
// ones checked by the written cases in src/preconsult/*.test.mjs.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as FD from './preconsult/status.mjs';
import { replay, stateOf, rowsFromPull } from './preconsult/state.mjs';

const CARRIERS = ['Delta Dental', 'Cigna', 'MetLife', 'Aetna', 'Guardian', 'United Concordia', 'UnitedHealthcare', 'Humana', 'Blue Cross / Florida Blue', 'Ameritas', 'Principal', 'Lincoln Financial', 'Sun Life', 'GEHA', 'Tricare', 'Liberty Dental', 'DentaQuest', 'MCNA', 'Sunshine Health', 'Simply Healthcare', 'Staywell / WellCare', 'Molina', 'Florida Healthy Kids', 'Medicaid', 'Other'];
const COLS = [['bv', 'BV'], ['medical', 'Health hx'], ['welcome', 'Welcome call'], ['cardFront', 'Ins card front'], ['cardBack', 'Ins card back']];
const AUDIT_ITEMS = ['Wrong list', 'Insurance', 'BV', 'Health history', 'Insurance card', 'Other'];
const EVENT_DAYS = 200;      // clicks older than this can't affect anyone on the lists
const POLL_MS = 60 * 1000;   // pick up teammates' clicks

const nyToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const d0 = s => new Date(s + 'T12:00:00');
const fmtDate = s => s ? d0(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
const fmtDob = s => s ? d0(s).toLocaleDateString('en-US') : '';
const fmtTime = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
const fmtStamp = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const byConsult = (a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`);
const titleCase = s => s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Responsible';

const CSS = `
.pc{font-size:15px;color:#1f1e1b}
.pc-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.pc-tabs button{font-size:16px;padding:9px 18px;border-radius:10px;border:1px solid #e6e4dd;background:#fff;cursor:pointer;color:#1f1e1b}
.pc-tabs button.on{background:#185fa5;border-color:#185fa5;color:#fff;font-weight:600}
.pc-tabs .n{opacity:.75;font-weight:400;margin-left:6px}
.pc-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px;font-size:14px;color:#6b6a64}
.pc-tools input[type=text],.pc-tools select{border:1px solid #e6e4dd;border-radius:8px;padding:6px 10px;font-size:14px}
.pc-hint{color:#6b6a64;font-size:13.5px;margin:0 0 10px}
.pc-panel{background:#fff;border:1px solid #e6e4dd;border-radius:12px;overflow:hidden}
.pc table{width:100%;border-collapse:collapse}
.pc th{font-size:12.5px;font-weight:600;color:#6b6a64;text-align:left;padding:9px 8px;border-bottom:1px solid #e6e4dd}
.pc td{padding:9px 8px;border-top:1px solid #e6e4dd;vertical-align:middle;font-size:14px}
.pc th.c,.pc td.c{text-align:center;width:78px}
.pc tr.group td{background:#fafaf8;font-weight:600;font-size:13px;padding:7px 10px}
.pc tr.red td:first-child{box-shadow:inset 4px 0 0 #c23b3b}
.pc .sub{color:#6b6a64;font-size:12.5px}
.pc .name{font-weight:600;cursor:pointer;border:none;background:none;padding:0;text-align:left;font-size:14px;color:#1f1e1b}
.pc .name:hover{text-decoration:underline}
.pc .box{width:26px;height:26px;border-radius:6px;border:2px solid #6b6a64;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:15px;line-height:1}
.pc .box:hover{border-color:#185fa5}
.pc .box:disabled{cursor:default;opacity:.6}
.pc .box.on{background:#2f7a3a;border-color:#2f7a3a;color:#fff}
.pc .box.auto{background:#e3f1df;border-color:#e3f1df;color:#2f7a3a;cursor:default}
.pc .box.part{border-color:#8a5a00}
.pc .na{color:#6b6a64}
.pc .frac{display:block;font-size:10.5px;color:#8a5a00}
.pc .add{color:#8a5a00;font-size:13px;border:1px dashed #8a5a00;background:none;border-radius:6px;padding:2px 6px}
.pc tr.details td{background:#fafaf8;font-size:13px;color:#6b6a64;padding:8px 12px}
.pc .btn{border:1px solid #e6e4dd;background:#fff;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:14px}
.pc .btn.go{background:#185fa5;border-color:#185fa5;color:#fff}
.pc .due{color:#c23b3b;font-weight:600}
.pc .empty{padding:26px;text-align:center;color:#6b6a64}
.pc .msg{padding:10px 14px;border-radius:8px;margin-bottom:10px;font-size:14px}
.pc .msg.err{background:#fcebeb;color:#a32d2d}
.pc .msg.info{background:#faeeda;color:#8a5a00}
.pc .foot{display:flex;gap:10px;align-items:center;margin-top:14px;color:#6b6a64;font-size:12.5px;flex-wrap:wrap}
`;

export default function PreConsult({ supabase, callGreyfinch, practiceId, canEdit, canSpotCheck, myName }) {
  const [tab, setTab] = useState('upcoming');
  const [pull, setPull] = useState(null);
  const [pullError, setPullError] = useState('');
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  // 'loading' | 'ok' | 'error'. Until the team's checkmarks have loaded, boxes stay locked:
  // an empty box must mean "not done", never "not loaded yet".
  const [eventsStatus, setEventsStatus] = useState('loading');
  const [saveError, setSaveError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [q, setQ] = useState('');
  const [loc, setLoc] = useState('');
  const [notDone, setNotDone] = useState(false);
  const [auditMode, setAuditMode] = useState(false);
  const [auditOpen, setAuditOpen] = useState(null);
  const [today, setToday] = useState(nyToday());
  const pending = useRef(0);

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadEvents = useCallback(async () => {
    if (pending.current) return;   // don't overwrite a click that's still saving
    const since = new Date(Date.now() - EVENT_DAYS * 864e5).toISOString();
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('pre_consult_events')
        .select('id,patient_key,action,item,value,by_name,created_at')
        .eq('practice_id', practiceId).gte('created_at', since).order('id').range(from, from + 999);
      if (error) { setEventsStatus(st => st === 'ok' ? 'ok' : 'error'); return; }
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    if (!pending.current) { setEvents(all); setEventsStatus('ok'); }
  }, [supabase, practiceId]);

  const loadPull = useCallback(async () => {
    setLoading(true);
    setPullError('');
    try {
      const r = await callGreyfinch({ mode: 'preconsult' });
      setPull(r);
      setToday(nyToday());
    } catch (e) {
      setPullError(/not connected/i.test(e.message)
        ? 'Your practice software is not connected yet. Ask Dr. Miller to add the key.'
        : /staff only|403/i.test(e.message)
          ? 'Pre Consult is available to practice staff only.'
          : 'Could not reach your practice software. Try Refresh in a minute.');
    } finally {
      setLoading(false);
    }
  }, [callGreyfinch]);

  useEffect(() => { loadPull(); loadEvents(); }, [loadPull, loadEvents]);
  useEffect(() => {
    const t = setInterval(loadEvents, POLL_MS);
    const onFocus = () => loadEvents();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [loadEvents]);

  // ── Rows and state ──────────────────────────────────────────────────────────
  const rows = useMemo(() => rowsFromPull(pull, today), [pull, today]);
  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);
  const states = useMemo(() => replay(events), [events]);
  const st = id => stateOf(states, id);

  const filtered = list => {
    const needle = q.trim().toLowerCase();
    return list.filter(r => (!needle || r.name.toLowerCase().includes(needle)) && (!loc || r.location === loc));
  };
  const listOf = r => FD.listOf(r, st(r.id), today);
  const upcoming = filtered(rows.filter(r => ['today', 'upcoming'].includes(listOf(r)))).sort(byConsult);
  const toVerify = upcoming.filter(r => FD.insuranceCallDue(r, st(r.id), today));
  const reactivations = filtered(rows.filter(r => listOf(r) === 'reactivate'));
  const callDue = r => { const d = FD.nextReactivationCall(r, st(r.id), today); return d && d <= today; };
  const locations = [...new Set(rows.map(r => r.location).filter(Boolean))].sort();

  // ── Saving a click ──────────────────────────────────────────────────────────
  const editable = canEdit && eventsStatus === 'ok';
  const record = async (patientKey, action, item = null, value = null) => {
    if (!editable) return;
    setSaveError('');
    const temp = { id: `temp-${Date.now()}-${Math.random()}`, patient_key: patientKey, action, item, value, by_name: myName || 'You', created_at: new Date().toISOString() };
    setEvents(ev => [...ev, temp]);
    pending.current++;
    const { error } = await supabase.from('pre_consult_events').insert({ practice_id: practiceId, patient_key: patientKey, action, item, value });
    pending.current--;
    if (error) {
      setEvents(ev => ev.filter(e => e.id !== temp.id));
      setSaveError('That click was not saved. Check your connection and try again.');
    } else if (!pending.current) {
      loadEvents();
    }
  };

  // ── Pieces ──────────────────────────────────────────────────────────────────
  const addSelect = (r, label) => (
    <select className="add" value="" disabled={!editable} onChange={e => {
      const v = e.target.value;
      if (!v) return;
      if (v === '__self') record(r.id, 'set_self_pay', null, true);
      else record(r.id, 'set_carriers', null, [...FD.carriersOf(r, st(r.id)), v]);
    }}>
      <option value="">{label}</option>
      {CARRIERS.map(c => <option key={c}>{c}</option>)}
      <option value="__self">Self-pay</option>
    </select>
  );

  const insuranceCell = r => {
    const s = st(r.id), list = FD.carriersOf(r, s);
    if (FD.isSelfPay(r, s)) return <span>Self-pay</span>;
    if (!list.length) return addSelect(r, 'Add insurance');
    return <span>{list.map(c => <div key={c}>{c}</div>)}</span>;
  };

  const box = (r, k) => {
    const s = st(r.id);
    if (!FD.isNeeded(r, s, k)) return <span className="na" title="Not needed (self-pay)">—</span>;
    const label = FD.item(k).label, m = s.manual[k];
    if (m) return <button className="box on" disabled={!editable} onClick={() => record(r.id, 'untick', k)} title={`${label}: checked by ${m.by} ${fmtStamp(m.at)}. Click to uncheck.`}>✓</button>;
    if (FD.isDone(r, s, k)) {
      const f = k === 'welcome' ? [] : FD.found(r, k).fresh;
      const phone = k === 'bv' ? Object.entries(s.verified || {}).filter(([c]) => FD.carriersOf(r, s).includes(c) || c === 'Insurance not in notes') : [];
      const why = phone.length ? 'Verified by phone: ' + phone.map(([c, v]) => `${c} (${v.by})`).join(', ') : f.length ? 'In the chart: ' + f.map(d => d.name).join(', ') : 'Done';
      return <span className="box auto" title={`${label}. ${why}`}>✓</span>;
    }
    const frac = FD.countText(r, s, k);
    const old = k !== 'welcome' && FD.found(r, k).old[0];
    const noSide = (k === 'cardFront' || k === 'cardBack') && r.docs.cardNoSide.length ? ` A card is on file (${r.docs.cardNoSide[0].name}) but its title doesn't say front or back.` : '';
    const tip = `${label}: click when done.${frac ? ` ${frac} insurances done.` : ''}${old ? ` One on file from ${fmtDob(old.date)} is too old.` : ''}${noSide}`;
    return <>
      <button className={`box ${frac || old || noSide ? 'part' : ''}`} disabled={!editable} onClick={() => record(r.id, 'tick', k)} title={tip} />
      {frac && <span className="frac">{frac}</span>}
    </>;
  };

  const details = (r, cols) => {
    const s = st(r.id), list = FD.carriersOf(r, s);
    const parts = [
      ...(r.responsible || []).map(p => `${titleCase(p.type)}: ${p.name}${p.dob ? ', DOB ' + fmtDob(p.dob) : ''}`),
      r.memberIds?.length ? 'Member ID ' + r.memberIds.join(', ') : null,
      r.chart ? 'Chart #' + r.chart : null,
      r.location,
      r.movedFrom ? 'Moved from ' + fmtDate(r.movedFrom) : null,
      r.rebookedAfter ? `Rebooked after ${r.rebookedAfter.state === 'NO_SHOW' ? 'no-show' : 'cancel'} on ${fmtDate(r.rebookedAfter.date)}` : null,
      r.docs.insInfo?.length ? 'Insurance info on file: ' + r.docs.insInfo.map(d => d.name).join(', ') : null,
    ].filter(Boolean);
    return (
      <tr className="details"><td colSpan={cols}>
        {parts.join(' · ')}
        {editable && <div style={{ marginTop: 6 }}>Insurance:{' '}
          {FD.isSelfPay(r, s)
            ? <>Self-pay <button className="btn" onClick={() => record(r.id, 'set_self_pay', null, false)}>Not self-pay</button></>
            : <>{list.map(c => <button key={c} className="btn" style={{ marginRight: 4 }} title="Remove" onClick={() => record(r.id, 'set_carriers', null, list.filter(x => x !== c))}>{c} ×</button>)}
                {list.length < 2 && addSelect(r, list.length ? 'Add 2nd insurance' : 'Add insurance')}</>}
        </div>}
      </td></tr>
    );
  };

  const auditCell = r => {
    if (!auditMode) return null;
    const a = st(r.id).audit;
    if (auditOpen === r.id) {
      const picked = new Set(a?.wrong || []);
      return <div style={{ marginTop: 4 }}>
        {AUDIT_ITEMS.map(x => <label key={x} className="sub" style={{ marginRight: 6 }}><input type="checkbox" defaultChecked={picked.has(x)} onChange={e => e.target.checked ? picked.add(x) : picked.delete(x)} /> {x}</label>)}
        <button className="btn" onClick={() => { record(r.id, 'audit', null, { ok: true, wrong: [] }); setAuditOpen(null); }}>All right</button>{' '}
        <button className="btn" onClick={() => { const wrong = [...picked]; record(r.id, 'audit', null, wrong.length ? { ok: false, wrong } : { ok: true, wrong: [] }); setAuditOpen(null); }}>Save</button>
      </div>;
    }
    return <button className="btn" style={{ fontSize: 11.5, padding: '1px 6px', marginTop: 3 }} onClick={() => setAuditOpen(r.id)}>{a ? (a.ok ? '✓ checked' : '✗ ' + a.wrong.join(', ')) : 'Spot check'}</button>;
  };

  const patientCell = r => <>
    <button className="name" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.name}</button>
    <div className="sub">DOB {fmtDob(r.dob)}{r.phone ? ' · ' + r.phone : ''}</div>
    {auditCell(r)}
  </>;

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const upcomingTab = () => {
    const list = upcoming.filter(r => !notDone || !FD.isReady(r, st(r.id)));
    const cols = 3 + COLS.length;
    const body = [];
    let lastDate = '';
    for (const r of list) {
      if (r.date !== lastDate) { lastDate = r.date; body.push(<tr key={'g' + r.date} className="group"><td colSpan={cols}>{r.date === today ? 'Today' : fmtDate(r.date)}</td></tr>); }
      body.push(<tr key={r.id} className={FD.isRed(r, st(r.id), today) ? 'red' : ''}>
        <td>{fmtTime(r.time)}</td><td>{patientCell(r)}</td><td>{insuranceCell(r)}</td>
        {COLS.map(([k]) => <td key={k} className="c">{box(r, k)}</td>)}
      </tr>);
      if (expanded === r.id) body.push(<React.Fragment key={r.id + 'd'}>{details(r, cols)}</React.Fragment>);
    }
    return <>
      <p className="pc-hint">Click a box when it's done. Light green = found in the chart automatically. Red edge = consult within 2 business days and something isn't done. Click a name for parent, member ID and insurance.</p>
      <div className="pc-panel">{list.length
        ? <table><thead><tr><th style={{ width: 84 }}>Time</th><th>Patient</th><th style={{ width: 150 }}>Insurance</th>{COLS.map(([, l]) => <th key={l} className="c">{l}</th>)}</tr></thead><tbody>{body}</tbody></table>
        : <div className="empty">{notDone ? 'Everyone is done.' : 'No consults in the next 30 days.'}</div>}</div>
    </>;
  };

  const insuranceTab = () => {
    const groups = new Map();
    for (const r of toVerify) for (const c of FD.carriersToCall(r, st(r.id))) { if (!groups.has(c)) groups.set(c, []); groups.get(c).push(r); }
    const order = [...groups].sort((a, b) => (a[0] === 'Insurance not in notes') - (b[0] === 'Insurance not in notes') || b[1].length - a[1].length);
    const body = [];
    for (const [c, rs] of order) {
      const unknown = c === 'Insurance not in notes';
      body.push(<tr key={'g' + c} className="group"><td colSpan={5}>{unknown ? 'Insurance unknown: add it first' : c} · {rs.length}</td></tr>);
      for (const r of rs) {
        const parent = (r.responsible || [])[0];
        body.push(<tr key={c + r.id} className={FD.isRed(r, st(r.id), today) ? 'red' : ''}>
          <td>{r.date === today ? 'Today' : fmtDate(r.date)}<div className="sub">{fmtTime(r.time)}</div></td>
          <td>{patientCell(r)}</td>
          <td className="sub">{parent ? <>{parent.name}{parent.dob && <><br />DOB {fmtDob(parent.dob)}</>}</> : '—'}</td>
          <td className="sub">{r.memberIds?.length ? r.memberIds.map(m => <div key={m}>{m}</div>) : '—'}{r.docs.insInfo?.length ? <div title={r.docs.insInfo.map(d => d.name).join(', ')}>Insurance info on file</div> : null}</td>
          <td className="c">{unknown ? addSelect(r, 'Add insurance') : <button className="box" disabled={!editable} title={`Check when ${c} is verified`} onClick={() => record(r.id, 'verify', c)} />}</td>
        </tr>);
        if (expanded === r.id) body.push(<React.Fragment key={c + r.id + 'd'}>{details(r, 5)}</React.Fragment>);
      }
    }
    return <>
      <p className="pc-hint">Consults in the next 3 business days with no BV from the insurance team. Call each insurance and check the box when verified. A BV arriving takes them off this list.</p>
      <div className="pc-panel">{toVerify.length
        ? <table><thead><tr><th style={{ width: 110 }}>Consult</th><th>Patient</th><th style={{ width: 170 }}>Parent</th><th style={{ width: 150 }}>Member ID</th><th className="c">Verified</th></tr></thead><tbody>{body}</tbody></table>
        : <div className="empty">Nothing to verify right now.</div>}</div>
    </>;
  };

  const reactivationTab = () => {
    const list = [...reactivations].sort((a, b) => (callDue(b) - callDue(a)) || b.date.localeCompare(a.date));
    return <>
      <p className="pc-hint">No-shows and cancels who haven't rebooked. Calls on day 1, 3, 7, 14 and 30. Press Called after each call. Remove when they rebook or say no. Rebooking in your practice software also takes them off.</p>
      <div className="pc-panel">{list.length
        ? <table><thead><tr><th style={{ width: 120 }}>Missed</th><th>Patient</th><th style={{ width: 200 }}>Calls</th><th /></tr></thead><tbody>
          {list.map(r => {
            const s = st(r.id), n = s.reac.attempts.length, next = FD.nextReactivationCall(r, s, today);
            return <React.Fragment key={r.id}>
              <tr>
                <td>{fmtDate(r.date)}<div className="sub">{r.state === 'PATIENT_CANCELLED' ? 'Cancelled' : 'No-show'}</div></td>
                <td>{patientCell(r)}</td>
                <td>{!next ? 'All 5 calls made' : next <= today ? <span className="due">Call today</span> : 'Next call ' + fmtDate(next)}
                  <div className="sub">{n} of 5 calls{n ? ` · last ${fmtStamp(s.reac.attempts[n - 1].at)} by ${s.reac.attempts[n - 1].by}` : ''}</div></td>
                <td style={{ width: 210, textAlign: 'right' }}>
                  {editable && next && <button className="btn go" onClick={() => record(r.id, 'called')}>Called</button>}{' '}
                  {editable && <button className="btn" title="Rebooked, not interested, or done calling" onClick={() => { if (window.confirm(`Take ${r.name} off the reactivation list?`)) record(r.id, 'reac_remove'); }}>Remove</button>}
                </td>
              </tr>
              {expanded === r.id && details(r, 4)}
            </React.Fragment>;
          })}
        </tbody></table>
        : <div className="empty">No one to call.</div>}</div>
    </>;
  };

  const audits = Object.values(states).filter(s => s.audit);
  const copyAudit = () => {
    const counts = AUDIT_ITEMS.map(x => [x, audits.filter(s => s.audit.wrong?.includes(x)).length]).filter(([, n]) => n);
    const text = `Pre Consult spot check: ${audits.length} checked, ${audits.filter(s => s.audit.ok).length} right, ${audits.filter(s => !s.audit.ok).length} wrong.` + (counts.length ? ' Wrong: ' + counts.map(([x, n]) => `${x} ${n}`).join(', ') : '');
    navigator.clipboard?.writeText(text).then(() => window.alert('Copied (no patient names):\n\n' + text), () => window.prompt('Copy this:', text));
  };

  const tabs = [['upcoming', 'Upcoming', upcoming.length], ['insurance', 'Insurance verification', toVerify.length], ['reac', 'Reactivations', `${reactivations.filter(callDue).length} to call`]];
  return (
    <div className="pc">
      <style>{CSS}</style>
      <div className="pc-tabs">{tabs.map(([k, l, n]) => <button key={k} className={k === tab ? 'on' : ''} onClick={() => { setTab(k); setExpanded(null); }}>{l}<span className="n">{n}</span></button>)}</div>
      {pullError && <div className="msg err">{pullError}</div>}
      {saveError && <div className="msg err">{saveError}</div>}
      {!canEdit && <div className="msg info">View only: your role can see Pre Consult but not check things off.</div>}
      {canEdit && eventsStatus === 'error' && <div className="msg err">Your team's checkmarks couldn't load, so boxes are locked to avoid doing work twice. Press Refresh, or sign out and back in.</div>}
      {canEdit && eventsStatus === 'loading' && pull && <div className="msg info">Loading your team's checkmarks…</div>}
      <div className="pc-tools">
        <input type="text" placeholder="Find a patient" value={q} onChange={e => setQ(e.target.value)} style={{ width: 200 }} />
        {locations.length > 1 && <select value={loc} onChange={e => setLoc(e.target.value)}><option value="">All locations</option>{locations.map(l => <option key={l}>{l}</option>)}</select>}
        {tab === 'upcoming' && <label><input type="checkbox" checked={notDone} onChange={e => setNotDone(e.target.checked)} /> Not done only</label>}
        <span style={{ flex: 1 }} />
        <span>{loading ? 'Loading from your practice software…' : pull?.pulledAt ? `Updated ${fmtStamp(pull.pulledAt)}` : ''}</span>
        <button className="btn" onClick={() => { loadPull(); loadEvents(); }} disabled={loading}>Refresh</button>
      </div>
      {loading && !pull ? <div className="pc-panel"><div className="empty">Loading from your practice software…</div></div>
        : tab === 'upcoming' ? upcomingTab() : tab === 'insurance' ? insuranceTab() : reactivationTab()}
      {canSpotCheck && <div className="foot">
        <label><input type="checkbox" checked={auditMode} onChange={e => setAuditMode(e.target.checked)} /> Spot-check mode</label>
        {auditMode && <><span>{audits.length ? `Checked ${audits.length}, wrong ${audits.filter(s => !s.audit.ok).length}` : ''}</span><button className="btn" style={{ fontSize: 12 }} onClick={copyAudit}>Copy spot-check summary</button></>}
      </div>}
    </div>
  );
}
