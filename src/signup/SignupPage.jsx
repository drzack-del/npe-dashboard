import React, { useEffect, useMemo, useState } from 'react';
import { documentPackage, printablePackage } from './documents.mjs';
import { chargeSummary, money, practiceDetailErrors, signupProgress, stageLabel } from './workflow.mjs';
import { fakeBackend } from './fakeBackend.mjs';
import { apiBackend } from './apiBackend.mjs';

// Which backend the page talks to: the AWS signup function when VITE_SIGNUP_API is set (its
// /functions/v1/signup address); otherwise, locally (npm run dev), the in-browser fake so the
// whole flow can be clicked through. The live site without it shows "opening soon".
const SIGNUP_API = import.meta.env.VITE_SIGNUP_API;
const backend = SIGNUP_API ? apiBackend(SIGNUP_API) : import.meta.env.DEV ? fakeBackend : null;
const returnedFromCheckout = (() => { try { return new URLSearchParams(window.location.search).get('checkout'); } catch { return null; } })();

const blankDetails = { legalName: '', dba: '', officeAddress: '', city: '', state: '', postalCode: '',
  signerName: '', signerTitle: '', signerEmail: '', billingEmail: '', locations: [], practiceManagementSystem: '' };

export default function SignupPage() {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState(blankDetails);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [editingInfo, setEditingInfo] = useState(true);
  const [openDoc, setOpenDoc] = useState('order-form');
  const [reviewedDocs, setReviewedDocs] = useState(['order-form']);
  const [authorized, setAuthorized] = useState(false);
  const [signature, setSignature] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('us_bank_account');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = (await backend.get()) || (await backend.start());
      setRecord(r); setForm({ ...blankDetails, ...r.details }); setEditingInfo(r.stage === 'started');
      if (r.stage === 'started' || r.stage === 'information_complete') { setReviewedDocs(['order-form']); setAuthorized(false); setSignature(''); }
    } catch (e) { setMessage(e.message); }
    setLoading(false);
  };
  useEffect(() => {
    if (!backend) { setLoading(false); return; }
    load();
    if (returnedFromCheckout === 'success') setMessage('Payment received. Setting up your practice…');
    if (returnedFromCheckout === 'canceled') setMessage('Checkout was canceled. Nothing was charged; you can choose a payment method again.');
  }, []);
  // After Stripe, the practice is created a few seconds later (card) or when the bank payment
  // clears (ACH). Check back every few seconds while this page is open.
  useEffect(() => {
    if (!record || record.stage !== 'payment_pending') return;
    const t = setInterval(async () => { try { const r = await backend.get(); if (r) setRecord(r); } catch {} }, 5000);
    return () => clearInterval(t);
  }, [record?.stage]);

  const docs = useMemo(() => record ? documentPackage({ ...record, details: form }) : [], [record, form]);
  const run = async (label, fn) => {
    setBusy(true); setMessage(label);
    try { await fn(); } catch (e) {
      // The server can send back field errors, or the current record (e.g. the price changed).
      if (e.fieldErrors) setFieldErrors(e.fieldErrors);
      if (e.record) { setRecord(e.record); setForm({ ...blankDetails, ...e.record.details }); setReviewedDocs(['order-form']); setSignature(''); setAuthorized(false); }
      setMessage(e.message || 'Something went wrong. Please try again.');
    }
    setBusy(false);
  };

  const saveDetails = () => {
    const details = { ...form, locations: (form.locations || []).map(x => x.trim()).filter(Boolean) };
    setForm(details);
    const errors = practiceDetailErrors(details);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setMessage('Please correct the highlighted fields before continuing.');
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    run('Saving…', async () => {
      const next = await backend.saveDetails(details);
      setRecord(next); setEditingInfo(false);
      setMessage('Practice information saved. Review and sign the agreements below.');
    });
  };

  const sign = () => {
    if (reviewedDocs.length < docs.length) return setMessage(`Open and review each of the ${docs.length} documents before signing.`);
    if (!authorized || signature.trim().toLowerCase() !== String(form.signerName || '').trim().toLowerCase()) {
      return setMessage('The signature must match the authorized signer name, and the consent box must be checked.');
    }
    run('Recording signature…', async () => {
      setRecord(await backend.sign(signature, record.plan.key));
      setMessage('Agreements signed. Choose how you would like to pay.');
    });
  };

  const checkout = () => run('Opening secure checkout…', async () => {
    const result = await backend.checkout(paymentMethod);
    if (result.url) return window.location.assign(result.url);
    setRecord(result.record);
    setMessage(backend.testMode ? 'Test payment succeeded. No money was charged.' : '');
  });

  const printDocs = () => {
    const popup = window.open('', '_blank');
    if (!popup) return setMessage('Allow pop-ups to print or save the agreement package.');
    popup.opener = null;
    popup.document.write(printablePackage({ ...record, details: form }));
    popup.document.close();
    popup.focus(); popup.print();
  };

  const startOver = () => run('Starting over…', async () => {
    await backend.reset(); setFieldErrors({}); await load(); setMessage('Test sign-up cleared. Nothing was charged.');
  });

  if (!backend) return <Shell><div style={{ padding: '48px 28px', textAlign: 'center' }}>
    <h1 style={{ fontSize: 24, margin: '0 0 10px' }}>Online sign-up is opening soon</h1>
    <p style={{ color: '#475569', margin: '0 0 22px' }}>In the meantime, we would love to talk with you about getting your practice started.</p>
    <a href="/#contact" style={{ ...primary, textDecoration: 'none', display: 'inline-block' }}>Contact us</a>
  </div></Shell>;
  if (loading) return <Shell><div style={{ textAlign: 'center', padding: 60 }}>Loading…</div></Shell>;
  if (!record) return <Shell><div style={{ padding: 40, color: '#b91c1c' }}>{message || 'Sign-up could not be loaded.'}</div></Shell>;

  const plan = record.plan;
  const complete = record.stage === 'provisioned';
  const cardAllowed = record.cardSurchargeAvailable;
  const ach = chargeSummary(plan, 'us_bank_account');
  const card = chargeSummary(plan, 'card', record.cardSurchargeBps);
  const chosen = paymentMethod === 'card' ? card : ach;

  return <Shell testMode={backend.testMode}>
    <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Practice sign-up</div>
      <h1 style={{ margin: '5px 0 4px', fontSize: 24 }}>{form.dba || form.legalName || 'Start your CadenceIQ subscription'}</h1>
      <div style={{ color: '#64748b', fontSize: 14 }}>{stageLabel(record.stage)}</div>
      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 10, marginTop: 16, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${signupProgress(record.stage)}%`, background: '#2563eb', transition: 'width .3s' }} />
      </div>
    </div>

    {complete ? <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 44, color: '#16a34a' }}>✓</div>
      <h2 style={{ margin: '6px 0 8px' }}>You're all set</h2>
      <p style={{ color: '#475569', maxWidth: 520, margin: '0 auto 22px' }}>
        Payment and agreements are complete. We are emailing <strong>{form.signerEmail}</strong> a link to create
        your CadenceIQ login, then you will set up your practice on the Get Started page.
      </p>
      <button onClick={printDocs} style={primary}>Print signed agreements</button>
      {backend.testMode && <button onClick={startOver} style={{ ...secondary, marginLeft: 10 }}>Start test over</button>}
    </div> : <div style={{ padding: 24 }}>

      <PlanCard plan={plan} spotsLeft={record.foundationSpotsLeft} />

      {editingInfo ? <>
        <h2 style={h2}>1. Practice information</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px' }}>Fields marked * are required. The signer's email becomes the practice's first CadenceIQ login.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
          {[
            ['legalName', 'Legal practice name *'], ['dba', 'Public name (DBA)'],
            ['officeAddress', 'Street address *'], ['city', 'City *'], ['state', 'State *'], ['postalCode', 'ZIP code *'],
            ['signerName', 'Authorized signer *'], ['signerTitle', 'Signer title *'],
            ['signerEmail', 'Signer email *', 'email'], ['billingEmail', 'Billing email *', 'email'],
          ].map(([name, label, type]) => <Field key={name} name={name} label={label} type={type} error={fieldErrors[name]} value={form[name]}
            onChange={v => setForm({ ...form, [name]: name === 'state' ? v.toUpperCase().slice(0, 2) : v })} />)}
          <Field name="locations" label="Office locations, up to 3 (comma separated) *" error={fieldErrors.locations} value={(form.locations || []).join(', ')}
            onChange={v => setForm({ ...form, locations: v.split(',').map(x => x.trimStart()) })} />
          <Field name="practiceManagementSystem" label="Practice management software" value={form.practiceManagementSystem}
            onChange={v => setForm({ ...form, practiceManagementSystem: v })} />
        </div>
        <button onClick={saveDetails} disabled={busy} style={{ ...primary, marginTop: 18 }}>Save and continue to agreements</button>
      </> : <div style={{ padding: 16, background: '#ecfdf5', border: '1px solid #86efac', borderRadius: 10, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><strong style={{ color: '#166534' }}>✓ Practice information saved</strong>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 5 }}>{form.legalName} · {form.city}, {form.state} · {form.signerEmail}</div></div>
        {!record.signedAt && <button style={secondary} onClick={() => { setEditingInfo(true); setMessage('Update the information, then save again before signing.'); }}>Edit</button>}
      </div>}

      {!editingInfo && <>
        <hr style={hr} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...h2, margin: 0 }}>2. Review and sign</h2>
          <button onClick={printDocs} style={secondary}>Print / save PDF</button>
        </div>
        <div style={{ padding: '10px 12px', background: '#fffbeb', border: '1px solid #f59e0b', color: '#92400e', borderRadius: 8, fontSize: 12, fontWeight: 700, marginTop: 14 }}>
          DRAFT LEGAL LANGUAGE — to be replaced with attorney-approved documents before accepting a real practice.
        </div>
        <div style={{ display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
          {docs.map(doc => <button key={doc.id} onClick={() => { setOpenDoc(doc.id); setReviewedDocs(old => old.includes(doc.id) ? old : [...old, doc.id]); }}
            style={{ ...secondary, background: openDoc === doc.id ? '#dbeafe' : 'white', color: openDoc === doc.id ? '#1d4ed8' : '#475569' }}>
            {reviewedDocs.includes(doc.id) ? '✓ ' : ''}{doc.title}</button>)}
        </div>
        <article className="signup-doc" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '4px 20px 16px', marginTop: 12, maxHeight: 380, overflowY: 'auto', lineHeight: 1.6, fontSize: 14 }}
          dangerouslySetInnerHTML={{ __html: docs.find(x => x.id === openDoc)?.body || '' }} />
        {!record.signedAt ? <div style={{ background: '#f8fafc', padding: 18, borderRadius: 10, marginTop: 14 }}>
          <div style={{ fontSize: 12, color: reviewedDocs.length === docs.length ? '#166534' : '#92400e', fontWeight: 700, marginBottom: 12 }}>
            {reviewedDocs.length === docs.length ? `✓ All ${docs.length} documents opened` : `${reviewedDocs.length} of ${docs.length} documents opened — open each tab before signing`}
          </div>
          <label style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.45 }}>
            <input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />
            <span>I am authorized to bind the practice, have reviewed all {docs.length} documents, accept the recurring monthly charges, the non-refundable setup fee, and the 30-day cancellation notice, and agree to sign electronically.</span>
          </label>
          <div style={{ marginTop: 14, maxWidth: 420 }}><Field label={`Type your full name to sign: ${form.signerName}`} value={signature} onChange={setSignature} /></div>
          <button onClick={sign} disabled={busy || reviewedDocs.length < docs.length} style={{ ...primary, marginTop: 14, opacity: reviewedDocs.length < docs.length ? .55 : 1 }}>Sign all agreements</button>
        </div> : <div style={{ padding: 14, background: '#ecfdf5', color: '#166534', borderRadius: 8, marginTop: 14, fontWeight: 700 }}>
          Signed by {record.signatureName} on {new Date(record.signedAt).toLocaleString()}</div>}
      </>}

      {record.signedAt && record.paymentStatus === 'processing' && <>
        <hr style={hr} />
        <div style={{ padding: 18, background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 10 }}>
          <strong style={{ color: '#1e40af' }}>Your bank payment is clearing</strong>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>Bank (ACH) payments take a few business days. As soon as it clears, we will email {form.signerEmail} a link to create your CadenceIQ login. You can close this page.</div>
        </div>
      </>}
      {record.signedAt && record.paymentStatus !== 'processing' && <>
        <hr style={hr} />
        <h2 style={h2}>3. Payment</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 12 }}>
          <PaymentChoice active={paymentMethod === 'us_bank_account'} onClick={() => setPaymentMethod('us_bank_account')} title="Bank account (ACH)" badge="Lower cost"
            lines={[['Monthly subscription', money(plan.monthlyFeeCents)], ['ACH processing cost', money(ach.monthlyExtra)], ['Monthly total', money(ach.monthlyTotal)]]}
            note="Recovers Stripe's 0.8% ACH fee, $5 maximum per payment. Bank payments can take a few business days to clear." />
          <PaymentChoice active={paymentMethod === 'card'} disabled={!cardAllowed} onClick={() => setPaymentMethod('card')} title="Credit card" badge="Surcharge"
            lines={[['Monthly subscription', money(plan.monthlyFeeCents)], ['Card surcharge', money(card.monthlyExtra)], ['Monthly total', money(card.monthlyTotal)]]}
            note={cardAllowed ? 'Surcharge equals our card processing cost (2.9% + $0.30), never more than 3%. Credit cards only; debit and prepaid cards are not accepted.' : 'Card payment is not available in your state yet. Please use a bank account.'} />
        </div>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 18, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
          <div><strong>Due today: {money(chosen.dueToday)}</strong>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 5 }}>
              One-time setup {money(plan.setupFeeCents)} + first month {money(plan.monthlyFeeCents)}
              {chosen.setupExtra + chosen.monthlyExtra > 0 && ` + ${money(chosen.setupExtra + chosen.monthlyExtra)} ${paymentMethod === 'card' ? 'card surcharge' : 'ACH processing cost'}`}.
              Then {money(chosen.monthlyTotal)} monthly.</div></div>
          <button onClick={checkout} disabled={busy || (paymentMethod === 'card' && !cardAllowed)} style={primary}>{backend.testMode ? 'Run test payment' : 'Continue to secure checkout'}</button>
        </div>
      </>}

      {message && <div role="status" style={{ marginTop: 18, padding: 12, background: '#eff6ff', color: '#1e40af', borderRadius: 8, fontSize: 13 }}>{message}</div>}
      {backend.testMode && <button onClick={startOver} style={{ ...linkButton, marginTop: 18 }}>Start test over</button>}
    </div>}
  </Shell>;
}

function PlanCard({ plan, spotsLeft }) {
  const foundation = plan.key === 'foundation';
  return <div style={{ border: `1px solid ${foundation ? '#93c5fd' : '#e2e8f0'}`, background: foundation ? '#eff6ff' : '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
    <div>
      <div style={{ fontWeight: 800, color: '#172033' }}>{plan.name}</div>
      <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
        {foundation ? `Foundation Partners keep this rate for as long as they remain active clients.${spotsLeft != null ? ` ${spotsLeft} of 5 spots left.` : ''}` : 'Priced per practice, not per location.'}
      </div>
    </div>
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#172033' }}>{money(plan.monthlyFeeCents)}<span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>/month</span></div>
      <div style={{ fontSize: 12, color: '#64748b' }}>+ {money(plan.setupFeeCents)} one-time setup</div>
    </div>
  </div>;
}

function Shell({ children, testMode }) {
  return <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '24px 16px 48px', boxSizing: 'border-box' }}>
    <style>{`.signup-doc h1{font-size:20px;margin:14px 0 8px}.signup-doc h2{font-size:15px;margin:16px 0 4px}.signup-doc p{margin:0 0 8px}`}</style>
    <div style={{ maxWidth: 880, margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <a href="/" style={{ fontSize: 22, fontWeight: 900, color: '#202020', textDecoration: 'none' }}>Cadence<span style={{ color: '#4A90E2' }}>IQ</span></a>
      {testMode && <span style={{ padding: '6px 10px', borderRadius: 20, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 800 }}>TEST MODE · NO CHARGE</span>}
    </div>
    <main style={{ maxWidth: 880, margin: '0 auto', background: 'white', borderRadius: 16, overflow: 'hidden', boxShadow: '0 10px 30px rgba(15,23,42,.08)', color: '#172033' }}>{children}</main>
  </div>;
}

function Field({ name, label, value = '', onChange, type = 'text', error }) {
  const errorId = name ? `${name}-error` : undefined;
  return <label style={{ display: 'block' }}>
    <span style={labelStyle}>{label}</span>
    <input name={name} type={type} value={value || ''} onChange={e => onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
      style={{ ...fieldStyle, borderColor: error ? '#dc2626' : '#cbd5e1', background: error ? '#fef2f2' : 'white' }} />
    {error && <span id={errorId} style={{ display: 'block', fontSize: 11, color: '#b91c1c', marginTop: 4 }}>{error}</span>}
  </label>;
}

function PaymentChoice({ active, disabled = false, onClick, title, badge, lines, note }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ textAlign: 'left', padding: 16, border: `2px solid ${active ? '#2563eb' : '#e2e8f0'}`, borderRadius: 11, background: disabled ? '#f8fafc' : active ? '#eff6ff' : 'white', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .65 : 1, font: 'inherit' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#172033' }}><span>{title}</span><span style={{ fontSize: 11, color: active ? '#1d4ed8' : '#64748b' }}>{badge}</span></div>
    {lines.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginTop: 8 }}><span>{k}</span><strong>{v}</strong></div>)}
    <div style={{ fontSize: 12, color: disabled ? '#b45309' : '#64748b', lineHeight: 1.4, marginTop: 10 }}>{note}</div>
  </button>;
}

const fieldStyle = { width: '100%', padding: '11px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 15, boxSizing: 'border-box', font: 'inherit' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 };
const h2 = { fontSize: 18, margin: '0 0 6px' };
const hr = { border: 0, borderTop: '1px solid #e2e8f0', margin: '28px 0' };
const primary = { padding: '11px 18px', border: 0, borderRadius: 8, background: '#2563eb', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: 14 };
const secondary = { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 7, background: 'white', color: '#475569', fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const linkButton = { background: 'none', border: 0, color: '#64748b', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, padding: 0 };
