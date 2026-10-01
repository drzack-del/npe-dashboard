// Sign-in screens for builds pointed at the AWS backend (VITE_AUTH_PROVIDER=cognito). Same look
// as the Supabase sign-in in App.jsx; App.jsx loads this file only in that mode.
//
// Steps: email + password → (first time) choose a password → (first time) set up an
// authenticator app → six-digit code. Forgot password emails a code. There is no sign-up:
// accounts are invite-only.
import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import * as auth from './cognitoAuth.js';

const inputStyle = {width:'100%',padding:'13px',border:'2px solid #e5e7eb',borderRadius:'9px',fontSize:'15px',boxSizing:'border-box',outline:'none'};
const labelStyle = {display:'block',fontSize:'13px',fontWeight:'600',marginBottom:'7px',color:'#374151'};
const linkStyle = {fontSize:'13px',color:'#2563EB',background:'none',border:'none',cursor:'pointer',fontWeight:'600'};
const noteStyle = {fontSize:'13px',color:'#6b7280',lineHeight:1.55,margin:'0 0 16px'};

const PASSWORD_RULE = 'At least 12 characters, with an uppercase letter, a lowercase letter and a number.';

export default function CognitoLogin({ brandHero, onSignedIn, onDemo }) {
  const [step, setStep] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [resetTo, setResetTo] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!setup?.setupUri) { setQr(''); return; }
    QRCode.toDataURL(setup.setupUri, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(''));
  }, [setup]);

  const normEmail = () => email.trim().toLowerCase();

  const go = (fn) => async (e) => {
    e?.preventDefault();
    setError(''); setNotice('');
    setLoading(true);
    try { await fn(); } catch (err) { setError(auth.friendlyError(err)); }
    setLoading(false);
  };

  // Moves to the screen for Cognito's next step; on "done", loads the person's CadenceIQ profile.
  const advance = async (r) => {
    setCode('');
    if (r.step === 'done') {
      const user = await auth.currentUser();
      const problem = await onSignedIn(user);
      if (problem) { await auth.signOut(); setStep('password'); setPassword(''); setError(problem); }
      return;
    }
    if (r.step === 'totp-setup') setSetup(r);
    setStep(r.step);
  };

  const submitPassword = go(async () => advance(await auth.startSignIn(normEmail(), password)));

  const submitNewPassword = go(async () => {
    if (newPassword !== confirmPassword) throw new Error('The two passwords do not match.');
    await advance(await auth.answerStep(newPassword, normEmail()));
    setNewPassword(''); setConfirmPassword('');
  });

  const submitCode = go(async () => advance(await auth.answerStep(code.trim(), normEmail())));

  const sendReset = go(async () => {
    if (!normEmail()) throw new Error('Enter your email address above, then click Forgot password.');
    setResetTo(await auth.sendResetCode(normEmail()));
    setStep('reset-code');
  });

  const submitReset = go(async () => {
    if (newPassword !== confirmPassword) throw new Error('The two passwords do not match.');
    await auth.finishReset(normEmail(), code.trim(), newPassword);
    setCode(''); setNewPassword(''); setConfirmPassword(''); setPassword('');
    setStep('password');
    setNotice('Password changed. Sign in with your new password.');
  });

  const backToSignIn = () => { setStep('password'); setError(''); setNotice(''); setCode(''); setSetup(null); auth.signOut(); };

  const errorBox = error && <div role="alert" style={{fontSize:'13px',color:'#ef4444',marginBottom:'14px',padding:'10px 12px',backgroundColor:'#fef2f2',borderRadius:'7px',border:'1px solid #fecaca'}}>{error}</div>;
  const noticeBox = notice && <div role="status" style={{fontSize:'13px',color:'#166534',marginBottom:'14px',padding:'10px 12px',backgroundColor:'#f0fdf4',borderRadius:'7px',border:'1px solid #bbf7d0'}}>{notice}</div>;
  const submit = (label) => (
    <button type="submit" disabled={loading}
      style={{width:'100%',padding:'14px',backgroundColor:'#202020',color:'white',border:'none',borderRadius:'9px',fontSize:'15px',fontWeight:'700',cursor:'pointer',opacity:loading?0.6:1}}>
      {loading ? 'Please wait...' : label}
    </button>
  );
  const codeInput = (
    <div style={{marginBottom:'20px'}}>
      <label htmlFor="cognito-code" style={labelStyle}>Six-digit code</label>
      <input id="cognito-code" aria-label="Authentication code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric" autoComplete="one-time-code" required autoFocus pattern="\d{6}"
        style={{...inputStyle,letterSpacing:'0.3em',textAlign:'center',fontSize:'20px'}} placeholder="123456" />
    </div>
  );
  const newPasswordInputs = (
    <>
      <div style={{marginBottom:'14px'}}>
        <label htmlFor="cognito-new-pw" style={labelStyle}>New password</label>
        <input id="cognito-new-pw" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={12}
          autoComplete="new-password" style={inputStyle} placeholder="Choose a password" />
      </div>
      <div style={{marginBottom:'8px'}}>
        <label htmlFor="cognito-confirm-pw" style={labelStyle}>Confirm new password</label>
        <input id="cognito-confirm-pw" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={12}
          autoComplete="new-password" style={inputStyle} placeholder="Type it again" />
      </div>
      <div style={{fontSize:'12px',color:'#9ca3af',marginBottom:'20px'}}>{PASSWORD_RULE}</div>
    </>
  );

  const titles = {
    'password': 'Sign in to your practice',
    'new-password': 'Choose your password',
    'totp-setup': 'Set up two-step sign-in',
    'totp-code': 'Two-step sign-in',
    'reset-code': 'Reset your password',
  };

  let body;
  if (step === 'new-password') {
    body = (
      <form onSubmit={submitNewPassword}>
        <p style={noteStyle}>Welcome to CadenceIQ. Replace the one-time password from your invite with one only you know.</p>
        {newPasswordInputs}
        {errorBox}
        {submit('Save password')}
      </form>
    );
  } else if (step === 'totp-setup') {
    body = (
      <form onSubmit={submitCode}>
        <p style={noteStyle}>CadenceIQ asks for a code from an authenticator app (such as Google Authenticator, Microsoft Authenticator or 1Password) every time you sign in. Scan this with the app:</p>
        <div style={{textAlign:'center',marginBottom:'12px'}}>
          {qr ? <img src={qr} alt="QR code for your authenticator app" width="200" height="200" style={{border:'1px solid #e5e7eb',borderRadius:'8px'}} />
              : <div style={{height:'200px'}} />}
        </div>
        <details style={{fontSize:'12px',color:'#6b7280',marginBottom:'16px'}}>
          <summary style={{cursor:'pointer'}}>Can't scan? Enter this key instead</summary>
          <code data-testid="totp-secret" style={{display:'block',marginTop:'8px',padding:'8px',backgroundColor:'#f3f4f6',borderRadius:'6px',wordBreak:'break-all',fontSize:'13px',color:'#111827'}}>{setup?.secret}</code>
        </details>
        <p style={{...noteStyle,marginBottom:'10px'}}>Then type the six-digit code the app shows:</p>
        {codeInput}
        {errorBox}
        {submit('Verify and continue')}
      </form>
    );
  } else if (step === 'totp-code') {
    body = (
      <form onSubmit={submitCode}>
        <p style={noteStyle}>Open your authenticator app and type the current code for CadenceIQ.</p>
        {codeInput}
        {errorBox}
        {submit('Verify and continue')}
      </form>
    );
  } else if (step === 'reset-code') {
    body = (
      <form onSubmit={submitReset}>
        <p style={noteStyle}>If <strong>{normEmail()}</strong> has a CadenceIQ account, we emailed a code to {resetTo}. Enter it with your new password.</p>
        <div style={{marginBottom:'14px'}}>
          <label htmlFor="cognito-reset-code" style={labelStyle}>Code from the email</label>
          <input id="cognito-reset-code" value={code} onChange={e => setCode(e.target.value.trim())} required autoComplete="one-time-code"
            inputMode="numeric" style={inputStyle} placeholder="Code" autoFocus />
        </div>
        {newPasswordInputs}
        {errorBox}
        {submit('Change password')}
      </form>
    );
  } else {
    body = (
      <>
        <form onSubmit={submitPassword}>
          <div style={{marginBottom:'14px'}}>
            <label htmlFor="cognito-email" style={labelStyle}>Email</label>
            <input id="cognito-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username"
              style={inputStyle} placeholder="you@example.com" autoFocus />
          </div>
          <div style={{marginBottom:'20px'}}>
            <label htmlFor="cognito-password" style={labelStyle}>Password</label>
            <input id="cognito-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
              style={inputStyle} placeholder="Enter your password" />
          </div>
          {noticeBox}
          {errorBox}
          {submit('Sign In')}
        </form>
        <div style={{textAlign:'center',marginTop:'12px'}}>
          <button onClick={sendReset} disabled={loading}
            style={{fontSize:'12px',color:'#6b7280',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>
            Forgot password?
          </button>
        </div>
        <div style={{marginTop:'10px',padding:'10px 12px',backgroundColor:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'8px',fontSize:'12px',color:'#64748b',textAlign:'center',lineHeight:'1.5'}}>
          <strong style={{color:'#374151'}}>New to CadenceIQ?</strong> Ask your practice admin for an invite. It arrives by email with a one-time password.
        </div>
      </>
    );
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',backgroundColor:'#202020',padding:'24px'}}>
      {brandHero}
      <div style={{backgroundColor:'white',padding:'36px',borderRadius:'16px',boxShadow:'0 24px 48px rgba(0,0,0,0.4)',maxWidth:'380px',width:'100%',boxSizing:'border-box'}}>
        <div style={{textAlign:'center',marginBottom:'24px'}}>
          <div style={{fontSize:'16px',fontWeight:'700',color:'#202020',marginBottom:'3px'}}>CadenceIQ Portal</div>
          <div style={{fontSize:'13px',color:'#9ca3af'}}>{titles[step]}</div>
        </div>
        {body}
        {step !== 'password' ? (
          <div style={{textAlign:'center',marginTop:'16px'}}>
            <button onClick={backToSignIn} style={linkStyle}>Back to Sign In</button>
          </div>
        ) : (
          <>
            <div style={{margin:'20px 0 4px',display:'flex',alignItems:'center',gap:'10px'}}>
              <div style={{flex:1,height:'1px',backgroundColor:'#e5e7eb'}}/>
              <span style={{fontSize:'11px',color:'#9ca3af',fontWeight:'600',letterSpacing:'0.05em'}}>OR</span>
              <div style={{flex:1,height:'1px',backgroundColor:'#e5e7eb'}}/>
            </div>
            <button onClick={onDemo}
              style={{width:'100%',marginTop:'12px',padding:'13px',backgroundColor:'#EBF3FC',color:'#2563EB',border:'2px solid #A7C6ED',borderRadius:'9px',fontSize:'14px',fontWeight:'700',cursor:'pointer',letterSpacing:'0.01em'}}>
              ▶ Try Demo — no login required
            </button>
          </>
        )}
      </div>
    </div>
  );
}
