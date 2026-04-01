import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';


        // ── SUPABASE CONFIG ──────────────────────────────────────────────
        const SUPABASE_URL  = 'https://flhvblepqsuvsmscmmxm.supabase.co';
        const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsaHZibGVwcXN1dnNtc2NtbXhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzM3MzAsImV4cCI6MjA4ODQ0OTczMH0.0FF6wCEFjpHqg55m1wKZCtJp6jQnPodECgUspc0ZoMo';
        const supabase = (SUPABASE_URL.startsWith('http'))
          ? createClient(SUPABASE_URL, SUPABASE_ANON, {
              auth: { detectSessionInUrl: false }
            })
          : null;
        // ────────────────────────────────────────────────────────────────

        // LocalStorage fallback (used only if Supabase not configured)
        const storage = {
            get: async (key) => {
                const value = localStorage.getItem(key);
                return value ? { value } : null;
            },
            set: async (key, value) => {
                localStorage.setItem(key, value);
                return { value };
            },
            delete: async (key) => {
                localStorage.removeItem(key);
            }
        };

        // ── CADENCE ENGINE ───────────────────────────────────────────────
        const CADENCES = {
          'Price / Down Payment':                [1, 3, 7, 14],
          'Spouse / Partner Needs to Approve':   [1, 4, 10],
          'Co-Parenting / Other Parent':         [3, 10, 21, 45],
          'Getting a Second Opinion':            [2, 7, 21, 45],
          'Insurance / Benefits Pending':        [2, 5, 10, 21],
          'Waiting to Hear from Medicaid':       [14, 5, 10, 21],
          'Dental Work Needed First':            [7, 30, 60, 90],
          'Waiting on Finances':                 [3, 14, 30, 60],
          'Timing / Life Event':                 [7, 30, 90],
          'Fear / Bad Experience':               [2, 7, 21],
          'Scheduling / Logistics':              [2, 7, 14],
        };
        const DEFAULT_CADENCE = [1, 3, 7, 14];
        const OBSTACLE_OPTIONS = [
          'Price / Down Payment',
          'Spouse / Partner Needs to Approve',
          'Co-Parenting / Other Parent',
          'Getting a Second Opinion',
          'Insurance / Benefits Pending',
          'Waiting to Hear from Medicaid',
          'Dental Work Needed First',
          'Waiting on Finances',
          'Timing / Life Event',
          'Fear / Bad Experience',
          'Scheduling / Logistics',
        ];

        const skipWeekend = (dateStr) => {
          const d = new Date(dateStr + 'T12:00:00');
          if (d.getDay() === 6) d.setDate(d.getDate() + 2);
          if (d.getDay() === 0) d.setDate(d.getDate() + 1);
          return d.toISOString().split('T')[0];
        };

        const addMonths = (dateStr, months) => {
          const d = new Date(dateStr + 'T12:00:00');
          d.setMonth(d.getMonth() + months);
          return skipWeekend(d.toISOString().split('T')[0]);
        };

        // Standalone Supabase settings helpers (usable before login / outside NPEDashboard)
        const loadSetting = async (key) => {
          if (!supabase) return null;
          try {
            const { data } = await supabase.from('settings').select('value').eq('key', key).single();
            return data ? data.value : null;
          } catch { return null; }
        };
        const saveSetting = async (key, value) => {
          if (!supabase) return;
          try { await supabase.from('settings').upsert({ key, value }); } catch {}
        };

        const generateId = () => crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });

        const generateDemoPatients = () => {
          const todayStr = new Date().toISOString().split('T')[0];
          const ago = (n) => { const d = new Date(todayStr + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };
          let id = 90001;
          const p = (fields) => ({
            'R+': false, 'W+': false, PIF: false, BR: false, INV: false, PH1: false, PH2: false, LTD: false,
            ST: false, SCH: false, PEN: false, OBS: false, MP: false, NOTX: false,
            obstacle: '', notes: '', bondDate: '', startDate: '', contactAttempts: 0, lastContactDate: '',
            nextTouchDate: '', contact_log: [], ...fields, id: id++
          });
          return [
            // Started today (SDS)
            p({ name: 'Ethan Brown',    phone: '(813) 555-0142', npeDate: todayStr, location: 'Car', dp: '$750', tc: 'Reaghan', BR: true,  'R+': true,  startDate: todayStr }),
            p({ name: 'Sophia Davis',   phone: '(813) 555-0293', npeDate: ago(2),   location: 'Apo', dp: '$500', tc: 'Katelyn', INV: true, PIF: true,  startDate: ago(2) }),
            p({ name: 'Isabella Clark', phone: '(813) 555-0388', npeDate: ago(1),   location: 'Car', dp: '$500', tc: 'Reaghan', PH1: true, 'W+': true, startDate: ago(1) }),
            // ST - started but not same day
            p({ name: 'James Nguyen',   phone: '(813) 555-0451', npeDate: ago(10),  location: 'Apo', dp: '$500', tc: 'Katelyn', BR: true, ST: true, startDate: ago(3) }),
            // Scheduled - bond check-in today
            p({ name: 'Tyler Chen',     phone: '(813) 555-0371', npeDate: ago(7),   location: 'Car', dp: '$500', tc: 'Reaghan', BR: true, SCH: true,
                bondDate: ago(1), nextTouchDate: getBondCheckDate({ SCH: true, bondDate: ago(1) }) }),
            // Pending - due today
            p({ name: 'Sarah Johnson',  phone: '(813) 555-0182', npeDate: ago(1),   location: 'Car', dp: '$500', tc: 'Reaghan', PEN: true,
                obstacle: 'Price / Down Payment',
                nextTouchDate: skipWeekend(todayStr) }),
            p({ name: 'Marcus Williams',phone: '(813) 555-0447', npeDate: ago(2),   location: 'Apo', dp: '$0',   tc: 'Katelyn', PEN: true,
                obstacle: 'Getting a Second Opinion',
                nextTouchDate: skipWeekend(todayStr) }),
            // MP - due today
            p({ name: 'Emma Rodriguez', phone: '(813) 555-0516', npeDate: ago(14),  location: 'Car', dp: '$0',   tc: 'Reaghan', MP: true,
                obstacle: 'Waiting to Hear from Medicaid',
                nextTouchDate: skipWeekend(todayStr) }),
            // Pending - with prior contact, due soon
            p({ name: 'Ashley Thompson',phone: '(813) 555-0624', npeDate: ago(8),   location: 'Car', dp: '$500', tc: 'Reaghan', PEN: true,
                obstacle: 'Spouse / Partner Needs to Approve', contactAttempts: 1, lastContactDate: ago(4),
                nextTouchDate: calcNextTouchDate(ago(8), 'Spouse / Partner Needs to Approve', 1, ago(4)),
                contact_log: [{ date: ago(4), scheduledDate: ago(4), reachedPatient: 'Spoke with patient', outcome: 'Husband still reviewing — call back in a few days', sentText: false, notes: '' }] }),
            p({ name: 'Madison Lee',    phone: '(813) 555-0738', npeDate: ago(5),   location: 'Apo', dp: '$500', tc: 'Katelyn', PEN: true,
                obstacle: 'Fear / Bad Experience', contactAttempts: 1, lastContactDate: ago(5),
                nextTouchDate: calcNextTouchDate(ago(5), 'Fear / Bad Experience', 1, ago(5)),
                contact_log: [{ date: ago(5), scheduledDate: ago(5), reachedPatient: 'Left voicemail', outcome: 'Left voicemail', sentText: true, notes: '' }] }),
            // MP - upcoming
            p({ name: 'Ava Thompson',   phone: '(813) 555-0829', npeDate: ago(10),  location: 'Car', dp: '$0',   tc: 'Reaghan', MP: true,
                obstacle: 'Waiting to Hear from Medicaid',
                nextTouchDate: calcNextTouchDate(ago(10), 'Waiting to Hear from Medicaid', 0, '') }),
            // Pending - further out
            p({ name: 'Olivia Garcia',  phone: '(813) 555-1047', npeDate: ago(23),  location: 'Apo', dp: '$500', tc: 'Katelyn', PEN: true,
                obstacle: 'Timing / Life Event', contactAttempts: 2, lastContactDate: ago(16),
                nextTouchDate: calcNextTouchDate(ago(23), 'Timing / Life Event', 2, ago(16)),
                contact_log: [
                  { date: ago(23), scheduledDate: ago(23), reachedPatient: 'No answer',  outcome: 'Left voicemail', sentText: true, notes: '' },
                  { date: ago(16), scheduledDate: ago(16), reachedPatient: 'Spoke with patient', outcome: 'Moving next month — call back in 30 days', sentText: false, notes: '' }
                ] }),
            p({ name: 'Luca Hernandez', phone: '(813) 555-1163', npeDate: ago(18),  location: 'Car', dp: '$500', tc: 'Reaghan', PEN: true,
                obstacle: 'Dental Work Needed First', contactAttempts: 1, lastContactDate: ago(11),
                nextTouchDate: calcNextTouchDate(ago(18), 'Dental Work Needed First', 1, ago(11)),
                contact_log: [{ date: ago(11), scheduledDate: ago(11), reachedPatient: 'Spoke with patient', outcome: 'Still finishing dental work — check back in a month', sentText: false, notes: '' }] }),
            // OBS
            p({ name: 'Noah Wilson',    phone: '(813) 555-0934', npeDate: ago(182), location: 'Car', dp: '$0',   tc: 'Reaghan', OBS: true,
                notes: 'Waiting for growth — recheck in 6 months',
                nextTouchDate: addMonths(ago(182), 6) }),
            // NOTX
            p({ name: 'Liam Taylor',    phone: '(813) 555-1182', npeDate: ago(5),   location: 'Car', dp: '$0',   tc: 'Reaghan', NOTX: true,
                notes: 'Decided not to proceed with treatment' }),
          ];
        };

        const calcNextTouchDate = (npeDate, obstacle, contactAttempts, lastContactDate) => {
          const cadence = CADENCES[obstacle] || DEFAULT_CADENCE;
          const todayStr = new Date().toISOString().split('T')[0];

          if (contactAttempts >= cadence.length) return '__MAX__';

          // Touch 1 counts from NPE date; touches 2–4 count from the last contact date
          const baseStr = (contactAttempts > 0 && lastContactDate) ? lastContactDate : npeDate;
          const base = new Date(baseStr + 'T12:00:00');
          const d = new Date(base);
          d.setDate(base.getDate() + cadence[contactAttempts]);
          const dateStr = skipWeekend(d.toISOString().split('T')[0]);

          // If the result is already past (e.g. patient added late), default to today
          return dateStr >= todayStr ? dateStr : skipWeekend(todayStr);
        };

        const getBondCheckDate = (p) => {
          if (!p.SCH || !p.bondDate) return null;
          const d = new Date(p.bondDate + 'T12:00:00');
          d.setDate(d.getDate() + 1);
          return skipWeekend(d.toISOString().split('T')[0]); // skip to Monday if day-after falls on weekend
        };
        // ────────────────────────────────────────────────────────────────

        // Main App with Supabase Auth
        const App = () => {
            const [currentUser, setCurrentUser] = useState(null);
            const [authLoading, setAuthLoading] = useState(true);
            const [showDemoWelcome, setShowDemoWelcome] = useState(false);
            const [email, setEmail] = useState('');
            const [password, setPassword] = useState('');
            const [loginError, setLoginError] = useState('');
            const [loginLoading, setLoginLoading] = useState(false);
            const [isSignUp, setIsSignUp] = useState(false);
            const [signUpDone, setSignUpDone] = useState(false);

            const fetchProfile = async (userId, userEmail) => {
                if (!supabase) return { id: userId, name: userEmail, role: 'admin', email: userEmail };
                const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000));
                let data;
                try {
                    const result = await Promise.race([
                        supabase.from('tc_users').select('*').eq('email', userEmail).single(),
                        timeout
                    ]);
                    data = result.data;
                } catch {
                    return null;
                }
                if (!data) return null;
                if (!data.auth_user_id) {
                    await supabase.from('tc_users').update({ auth_user_id: userId }).eq('email', userEmail);
                }
                return { id: userId, name: data.name, role: data.role, email: userEmail, practiceId: data.practice_id || 'miller-ortho' };
            };

            useEffect(() => {
                if (!supabase) { setAuthLoading(false); return; }
                const loadingTimeout = setTimeout(() => setAuthLoading(false), 5000);
                supabase.auth.getSession().then(async ({ data: { session } }) => {
                    clearTimeout(loadingTimeout);
                    if (session) {
                        const profile = await fetchProfile(session.user.id, session.user.email);
                        if (profile) setCurrentUser(profile);
                        else await supabase.auth.signOut();
                    }
                    setAuthLoading(false);
                }).catch(() => { clearTimeout(loadingTimeout); setAuthLoading(false); });
                const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
                    if (event === 'SIGNED_OUT') {
                        setCurrentUser(null);
                    }
                });
                return () => subscription.unsubscribe();
            }, []);

            const withTimeout = (promise, ms = 60000) => Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timed out. The server may be waking up — please try again in a few seconds.')), ms))
            ]);

            const handleLogin = async (e) => {
                e.preventDefault();
                setLoginError('');
                setLoginLoading(true);
                try {
                    const { data, error } = await withTimeout(supabase.auth.signInWithPassword({ email, password }));
                    if (error) {
                        setLoginError(error.message);
                    } else if (data?.session) {
                        const profile = await fetchProfile(data.session.user.id, data.session.user.email);
                        if (profile) {
                            setCurrentUser(profile);
                        } else {
                            await supabase.auth.signOut();
                            setLoginError('No account found for this email. Ask your admin to add you first.');
                        }
                    }
                } catch (err) {
                    setLoginError(err.message);
                }
                setLoginLoading(false);
            };

            const handleSignUp = async (e) => {
                e.preventDefault();
                setLoginError('');
                setLoginLoading(true);
                try {
                    const { data: tcRow } = await withTimeout(supabase.from('tc_users').select('id').eq('email', email).single());
                    if (!tcRow) {
                        setLoginError('Your email was not found. Ask your admin to add you before setting up your account.');
                        setLoginLoading(false);
                        return;
                    }
                    const { error } = await withTimeout(supabase.auth.signUp({ email, password }));
                    if (error) setLoginError(error.message);
                    else setSignUpDone(true);
                } catch (err) {
                    setLoginError(err.message);
                }
                setLoginLoading(false);
            };

            const handleDemoLogin = () => {
                setCurrentUser({ id: 'demo', name: 'Demo Practice', role: 'admin', email: 'demo@cadenceiq.com', practiceId: 'demo-ortho' });
                setShowDemoWelcome(true);
            };

            const handleSignOut = async () => {
                if (supabase && currentUser?.id !== 'demo') await supabase.auth.signOut();
                setCurrentUser(null);
                setEmail(''); setPassword('');
            };

            if (authLoading) return (
                <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',backgroundColor:'#202020'}}>
                    <div style={{textAlign:'center'}}>
                        <div style={{fontSize:'26px',fontWeight:'900',letterSpacing:'-0.03em',color:'white',marginBottom:'12px'}}>
                            <span>Cadence</span><span style={{color:'#4A90E2'}}>IQ</span>
                        </div>
                        <div style={{fontSize:'13px',color:'rgba(255,255,255,0.4)'}}>Loading...</div>
                    </div>
                </div>
            );

            if (!currentUser) {
                const brandHero = (
                    <div style={{textAlign:'center',marginBottom:'40px'}}>
                        <svg width="72" height="60" viewBox="0 0 72 60" fill="none" xmlns="http://www.w3.org/2000/svg" style={{marginBottom:'20px'}}>
                            <rect x="0"  y="48" width="10" height="12" rx="3" fill="white" fillOpacity="0.2"/>
                            <rect x="14" y="36" width="10" height="24" rx="3" fill="white" fillOpacity="0.4"/>
                            <rect x="28" y="20" width="10" height="40" rx="3" fill="white" fillOpacity="0.65"/>
                            <rect x="42" y="6"  width="10" height="54" rx="3" fill="white" fillOpacity="0.88"/>
                            <rect x="56" y="0"  width="10" height="60" rx="3" fill="#4A90E2"/>
                        </svg>
                        <div style={{fontSize:'52px',fontWeight:'900',letterSpacing:'-0.04em',lineHeight:1,marginBottom:'10px'}}>
                            <span style={{color:'white'}}>Cadence</span><span style={{color:'#4A90E2'}}>IQ</span>
                        </div>
                        <div style={{fontSize:'12px',color:'rgba(255,255,255,0.4)',letterSpacing:'0.2em',textTransform:'uppercase',marginBottom:'6px'}}>Practice Intelligence</div>
                        <div style={{width:'40px',height:'2px',backgroundColor:'#4A90E2',margin:'0 auto',opacity:0.5}}></div>
                    </div>
                );

                if (signUpDone) return (
                    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',backgroundColor:'#202020',padding:'24px'}}>
                        {brandHero}
                        <div style={{backgroundColor:'white',padding:'36px',borderRadius:'16px',boxShadow:'0 24px 48px rgba(0,0,0,0.4)',maxWidth:'380px',width:'100%',textAlign:'center'}}>
                            <div style={{fontSize:'36px',marginBottom:'16px'}}>✉️</div>
                            <h2 style={{fontSize:'20px',fontWeight:'800',color:'#202020',marginBottom:'8px'}}>Check your email</h2>
                            <p style={{fontSize:'14px',color:'#6b7280',marginBottom:'20px'}}>We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back and sign in.</p>
                            <button onClick={() => { setIsSignUp(false); setSignUpDone(false); }}
                                style={{fontSize:'14px',color:'#2563EB',background:'none',border:'none',cursor:'pointer',fontWeight:'600'}}>
                                Back to Sign In
                            </button>
                        </div>
                    </div>
                );

                return (
                    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',backgroundColor:'#202020',padding:'24px'}}>
                        {brandHero}
                        <div style={{backgroundColor:'white',padding:'36px',borderRadius:'16px',boxShadow:'0 24px 48px rgba(0,0,0,0.4)',maxWidth:'380px',width:'100%'}}>
                            <div style={{textAlign:'center',marginBottom:'28px'}}>
                                <div style={{fontSize:'16px',fontWeight:'700',color:'#202020',marginBottom:'3px'}}>Miller Orthodontics</div>
                                <div style={{fontSize:'13px',color:'#9ca3af'}}>{isSignUp ? 'Create your account' : 'Treatment Coordinator Portal'}</div>
                            </div>
                            <form onSubmit={isSignUp ? handleSignUp : handleLogin}>
                                <div style={{marginBottom:'14px'}}>
                                    <label style={{display:'block',fontSize:'13px',fontWeight:'600',marginBottom:'7px',color:'#374151'}}>Email</label>
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                                        style={{width:'100%',padding:'13px',border:'2px solid #e5e7eb',borderRadius:'9px',fontSize:'15px',boxSizing:'border-box',outline:'none'}}
                                        placeholder="you@millerortho.com" autoFocus />
                                </div>
                                <div style={{marginBottom:'20px'}}>
                                    <label style={{display:'block',fontSize:'13px',fontWeight:'600',marginBottom:'7px',color:'#374151'}}>Password</label>
                                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                                        style={{width:'100%',padding:'13px',border:'2px solid #e5e7eb',borderRadius:'9px',fontSize:'15px',boxSizing:'border-box',outline:'none'}}
                                        placeholder={isSignUp ? 'Create a password' : 'Enter your password'} />
                                </div>
                                {loginError && <div style={{fontSize:'13px',color:'#ef4444',marginBottom:'14px',padding:'10px 12px',backgroundColor:'#fef2f2',borderRadius:'7px',border:'1px solid #fecaca'}}>{loginError}</div>}
                                <button type="submit" disabled={loginLoading}
                                    style={{width:'100%',padding:'14px',backgroundColor:'#202020',color:'white',border:'none',borderRadius:'9px',fontSize:'15px',fontWeight:'700',cursor:'pointer',opacity:loginLoading?0.6:1}}>
                                    {loginLoading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
                                </button>
                            </form>
                            <div style={{textAlign:'center',marginTop:'18px'}}>
                                <button onClick={() => { setIsSignUp(!isSignUp); setLoginError(''); }}
                                    style={{fontSize:'13px',color:'#2563EB',background:'none',border:'none',cursor:'pointer',fontWeight:'600'}}>
                                    {isSignUp ? 'Already have an account? Sign In' : 'First time? Set up your account'}
                                </button>
                            </div>
                            <div style={{margin:'20px 0 4px',display:'flex',alignItems:'center',gap:'10px'}}>
                                <div style={{flex:1,height:'1px',backgroundColor:'#e5e7eb'}}/>
                                <span style={{fontSize:'11px',color:'#9ca3af',fontWeight:'600',letterSpacing:'0.05em'}}>OR</span>
                                <div style={{flex:1,height:'1px',backgroundColor:'#e5e7eb'}}/>
                            </div>
                            <button onClick={handleDemoLogin}
                                style={{width:'100%',marginTop:'12px',padding:'13px',backgroundColor:'#EBF3FC',color:'#2563EB',border:'2px solid #A7C6ED',borderRadius:'9px',fontSize:'14px',fontWeight:'700',cursor:'pointer',letterSpacing:'0.01em'}}>
                                ▶ Try Demo — no login required
                            </button>
                        </div>
                        <div style={{marginTop:'32px',textAlign:'center'}}>
                            <div style={{fontSize:'11px',color:'rgba(255,255,255,0.3)',letterSpacing:'0.05em'}}>Powered by</div>
                            <div style={{fontSize:'13px',color:'rgba(255,255,255,0.5)',fontWeight:'600',marginTop:'3px',fontStyle:'italic'}}>Amanda Floyd Consulting</div>
                            <div style={{fontSize:'11px',color:'rgba(255,255,255,0.25)',marginTop:'2px',letterSpacing:'0.04em'}}>Where Growth Happens</div>
                        </div>
                    </div>
                );
            }

            return (
              <>
                <NPEDashboard currentUser={currentUser} onSignOut={handleSignOut} />
                {showDemoWelcome && (
                  <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.72)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}
                       onClick={() => setShowDemoWelcome(false)}>
                    <div style={{backgroundColor:'white',borderRadius:'20px',maxWidth:'560px',width:'100%',overflow:'hidden',boxShadow:'0 32px 80px rgba(0,0,0,0.5)'}}
                         onClick={e => e.stopPropagation()}>
                      {/* Header */}
                      <div style={{background:'linear-gradient(135deg,#202020 0%,#2d2d2d 100%)',padding:'32px 36px 28px'}}>
                        <div style={{fontSize:'26px',fontWeight:'900',letterSpacing:'-0.04em',marginBottom:'6px'}}>
                          <span style={{color:'white'}}>Cadence</span><span style={{color:'#4A90E2'}}>IQ</span>
                        </div>
                        <div style={{fontSize:'13px',color:'rgba(255,255,255,0.45)',letterSpacing:'0.15em',textTransform:'uppercase'}}>Practice Intelligence Platform</div>
                      </div>
                      {/* Body */}
                      <div style={{padding:'28px 36px 32px',overflowY:'auto',maxHeight:'70vh'}}>
                        {/* Problem */}
                        <div style={{marginBottom:'24px'}}>
                          <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:'8px'}}>The Problem</div>
                          <p style={{fontSize:'15px',color:'#374151',lineHeight:1.65,margin:0}}>
                            After a new patient exam, most patients don't start treatment that same day. They need to think it over, talk to a spouse, wait on insurance — and without a system, those patients fall through the cracks. Treatment coordinators are left guessing who to call, when to call, and what was said last time.
                          </p>
                        </div>
                        {/* Solution */}
                        <div style={{marginBottom:'24px'}}>
                          <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:'8px'}}>What CadenceIQ Does</div>
                          <p style={{fontSize:'15px',color:'#374151',lineHeight:1.65,margin:0}}>
                            CadenceIQ turns every new patient exam into a managed follow-up cadence. Each patient's specific obstacle determines a smart call schedule — so every TC knows exactly who to call today, and nothing slips through.
                          </p>
                        </div>
                        {/* Features */}
                        <div style={{marginBottom:'28px'}}>
                          <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:'12px'}}>Key Features</div>
                          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                            {[
                              { icon:'📋', title:'Smart Follow-Up Queue', desc:'See exactly who needs a call today — auto-scheduled based on each patient\'s obstacle (pricing, Medicaid, spouse approval, etc.)' },
                              { icon:'📞', title:'Contact Logging', desc:'Log every call with outcome and notes. Full history on every patient so the whole team is on the same page.' },
                              { icon:'📅', title:'Bond Appointment Tracking', desc:'Patients who schedule get a check-in the day after their bond appointment to confirm they started.' },
                              { icon:'📊', title:'Live Dashboard', desc:'NPE counts, starts, and conversion rates by location — updated in real time for the whole practice.' },
                              { icon:'✅', title:'On-Time Follow-Up Audit', desc:'See what percentage of follow-ups are happening on schedule, broken down by TC.' },
                              { icon:'💰', title:'TC Bonus Calculator', desc:'Automatically calculates same-day start bonuses, retainer upsells, and whitening add-ons.' },
                            ].map(f => (
                              <div key={f.title} style={{display:'flex',gap:'12px',alignItems:'flex-start',padding:'12px 14px',backgroundColor:'#f9fafb',borderRadius:'10px'}}>
                                <span style={{fontSize:'20px',lineHeight:1,marginTop:'1px'}}>{f.icon}</span>
                                <div>
                                  <div style={{fontSize:'14px',fontWeight:'700',color:'#111827',marginBottom:'2px'}}>{f.title}</div>
                                  <div style={{fontSize:'13px',color:'#6b7280',lineHeight:1.5}}>{f.desc}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => setShowDemoWelcome(false)}
                          style={{width:'100%',padding:'15px',backgroundColor:'#202020',color:'white',border:'none',borderRadius:'10px',fontSize:'15px',fontWeight:'700',cursor:'pointer',letterSpacing:'-0.01em'}}>
                          Explore the Demo →
                        </button>
                        <div style={{textAlign:'center',marginTop:'10px',fontSize:'12px',color:'#9ca3af'}}>Click anywhere outside to dismiss</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
        };



const NPEDashboard = ({ currentUser, onSignOut }) => {
  const [currentView, setCurrentView] = useState(currentUser?.role === 'tc' ? 'followup' : 'dashboard');
  const [dashTimeframe, setDashTimeframe] = useState('month'); // 'month' | 'all'
  const [dashTCFilter, setDashTCFilter] = useState('All');
  const [showContactLog, setShowContactLog] = useState(null);
  const [showEditModal, setShowEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showStartedModal, setShowStartedModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWeekDay, setSelectedWeekDay] = useState(new Date().toISOString().split('T')[0]);
  const [weekOffset, setWeekOffset] = useState(0);

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tcList, setTcList] = useState(() => {
    const saved = localStorage.getItem('npe-tc-list');
    return saved ? JSON.parse(saved) : ['Reaghan'];
  });
  const [monthlyTCFilter, setMonthlyTCFilter] = useState('All');
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(new Date().getMonth());
  const [selectedMonthYear, setSelectedMonthYear] = useState(new Date().getFullYear());
  const newTCRef = useRef(null);

  // Admin state
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminInput, setAdminInput] = useState('');
  const [newDashPw, setNewDashPw] = useState('');
  const [newDashPwConfirm, setNewDashPwConfirm] = useState('');
  const [newAdminPw, setNewAdminPw] = useState('');
  const [newAdminPwConfirm, setNewAdminPwConfirm] = useState('');
  const [bonusRates, setBonusRates] = useState(() => {
    const saved = localStorage.getItem('npe-bonus-rates');
    return saved ? JSON.parse(saved) : { sds: 20, ret: 5, white: 5, pif: 5 };
  });
  const [popupBonuses, setPopupBonuses] = useState([]);
  const [popupBonusForm, setPopupBonusForm] = useState({ name: '', amount: 10, startDate: '', endDate: '', description: '', tcFilter: 'All' });

  const adminMsg_placeholder = null; // keep line ref stable
  const [adminMsg, setAdminMsg] = useState('');
  const [saveToast, setSaveToast] = useState('');
  const [saveError, setSaveError] = useState('');

  // Support / feedback
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({ category: '', description: '' });
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackList, setFeedbackList] = useState([]);
  const [feedbackListLoading, setFeedbackListLoading] = useState(false);

  // Password visibility toggles (#10)
  const [showDashPw, setShowDashPw] = useState(false);
  const [showDashPwConfirm, setShowDashPwConfirm] = useState(false);
  const [showAdminPwNew, setShowAdminPwNew] = useState(false);
  const [showAdminPwConfirm, setShowAdminPwConfirm] = useState(false);
  const [showAdminInput, setShowAdminInput] = useState(false);

  // Default TC (#8)
  const [defaultTC, setDefaultTC] = useState(() => localStorage.getItem('npe-default-tc') || 'Reaghan');

  // Supabase connection test (#9)
  const [supabaseTestResult, setSupabaseTestResult] = useState(null); // null | 'testing' | { count, ok }

  // Auto-persist TC list to localStorage + Supabase whenever it changes
  useEffect(() => {
    localStorage.setItem('npe-tc-list', JSON.stringify(tcList));
    // Note: dbSaveSettings defined below — using window-level ref trick
    if (supabase && currentUser && currentUser.id !== 'demo') supabase.from('settings').upsert({ key: 'tc-list', value: tcList, practice_id: currentUser.practiceId });
  }, [tcList]);

  const [newPatientForm, setNewPatientForm] = useState({
    name: '', phone: '', npeDate: new Date().toISOString().split('T')[0], location: 'Car', dp: '', tc: localStorage.getItem('npe-default-tc') || 'Reaghan', status: '',
    BR: false, INV: false, PH1: false, PH2: false, LTD: false,
    'R+': false, 'W+': false, PIF: false, obstacle: '', notes: '', nextTouchOverride: '', bondDate: ''
  });
  const [addPatientError, setAddPatientError] = useState('');

  const [startedForm, setStartedForm] = useState({
    startDate: new Date().toISOString().split('T')[0],
    dp: '', BR: false, INV: false, PH1: false, PH2: false, LTD: false,
    'R+': false, 'W+': false, PIF: false
  });

  const [bonusMonthFilter, setBonusMonthFilter] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [ontimeMonthFilter, setOntimeMonthFilter] = useState(
    new Date().toISOString().slice(0, 7)
  );

  // ── Practice Metrics ─────────────────────────────────────────────────
  const [metricsUnlocked, setMetricsUnlocked] = useState(true);
  const [metricsPassword, setMetricsPassword] = useState('');
  const [showMetricsPw, setShowMetricsPw] = useState(false);
  const [practiceMetrics, setPracticeMetrics] = useState([]);
  const [practiceGoals, setPracticeGoals] = useState([]);
  const [metricsYear, setMetricsYear] = useState(new Date().getFullYear());
  const [metricsViewMode, setMetricsViewMode] = useState('monthly');
  const [showMetricsEntry, setShowMetricsEntry] = useState(false);
  const [metricsForm, setMetricsForm] = useState({
    year: new Date().getFullYear(), month: new Date().getMonth() + 1,
    net_production: '', collections: '', npe_scheduled: '',
    npe_showed: '', starts: '', obs_added: '', notes: ''
  });
  const [showAIGoals, setShowAIGoals] = useState(false);
  const [goalAdjust, setGoalAdjust] = useState({ production: 0, npe: 0, starts: 0, conversion: 0, case_fee: 0 });
  const [metricsSaveMsg, setMetricsSaveMsg] = useState('');
  const [showDetailedMetricsCols, setShowDetailedMetricsCols] = useState(false);
  // ── Team Management ───────────────────────────────────────────────────
  const [tcUsers, setTcUsers] = useState([]);
  const [newTCName, setNewTCName] = useState('');
  const [newTCEmail, setNewTCEmail] = useState('');
  const [newTCRole, setNewTCRole] = useState('tc');
  const [tcMgmtMsg, setTcMgmtMsg] = useState('');
  // ─────────────────────────────────────────────────────────────────────

  const defaultGoalsData = {
    monthly: Array.from({length: 12}, (_, i) => ({
      carNPE: i === 1 ? 40 : 35, carStarted: i === 1 ? 20 : 18,
      apoNPE: i === 1 ? 15 : 12, apoStarted: i === 1 ? 8 : 6,
      convGoal: 50,
    })),
    quarterly: [
      { npe: 150, started: 75, conv: 50 }, { npe: 165, started: 85, conv: 50 },
      { npe: 180, started: 90, conv: 50 }, { npe: 200, started: 100, conv: 50 },
    ]
  };
  const [goals, setGoals] = useState(() => {
    const saved = localStorage.getItem('npe-goals');
    return saved ? JSON.parse(saved) : defaultGoalsData;
  });
  const [goalsSaveMsg, setGoalsSaveMsg] = useState('');

  // ── Load patients from Supabase (or localStorage fallback) ──────────
  useEffect(() => {
    const load = async () => {
      if (currentUser?.id === 'demo') {
        setPatients(generateDemoPatients());
        setLoading(false);
        return;
      }
      if (supabase) {
        const { data, error } = await supabase.from('patients').select('*').eq('practice_id', currentUser.practiceId).order('npe_date', { ascending: false });
        if (!error && data) {
          setPatients(data.map(r => ({
            id: r.id, name: r.name, phone: r.phone || '',
            npeDate: r.npe_date, location: r.location,
            dp: r.dp, tc: r.tc || 'Reaghan',
            BR: r.br, INV: r.inv, PH1: r.ph1, PH2: r.ph2, LTD: r.ltd,
            'R+': r.r_plus, 'W+': r.w_plus, PIF: r.pif,
            ST: r.st, SCH: r.sch, PEN: r.pen, OBS: r.obs, MP: r.mp, NOTX: r.notx, DBRETS: r.dbrets || false,
            obstacle: r.obstacle || '', notes: r.notes || '',
            bondDate: r.bond_date || '',
            startDate: r.start_date || '',
            contactAttempts: r.contact_attempts || 0,
            nextTouchDate: r.next_touch_date || '',
            lastContactDate: r.last_contact_date || '',
            contact_log: r.contact_log || [],
            fromPending: r.from_pending || false
          })));
        }
      } else {
        const saved = localStorage.getItem('npe-patients-v2');
        if (saved) setPatients(JSON.parse(saved));
      }
      setLoading(false);
    };
    load();
  }, []);

  // Auto-fix: MP and OBS patients with incorrect nextTouchDate
  useEffect(() => {
    if (loading || patients.length === 0) return;
    const toFix = patients.filter(p => {
      if (p.MP) {
        const effObstacle = p.obstacle || 'Waiting to Hear from Medicaid';
        const correctNext = calcNextTouchDate(p.npeDate, effObstacle, p.contactAttempts || 0, p.lastContactDate || '');
        return !p.obstacle || !p.nextTouchDate;
      }
      if (p.OBS) {
        return !p.nextTouchDate; // only fix if no date is set at all
      }
      return false;
    });
    if (toFix.length === 0) return;
    const fixed = patients.map(p => {
      if (p.MP) {
        const effObstacle = p.obstacle || 'Waiting to Hear from Medicaid';
        const correctNext = calcNextTouchDate(p.npeDate, effObstacle, p.contactAttempts || 0, p.lastContactDate || '');
        if (p.obstacle && p.nextTouchDate === correctNext) return p;
        return { ...p, obstacle: effObstacle, nextTouchDate: correctNext };
      }
      if (p.OBS) {
        if (p.nextTouchDate) return p;
        return { ...p, nextTouchDate: addMonths(p.npeDate, 6) };
      }
      return p;
    });
    setPatients(fixed);
    toFix.forEach(p => {
      const fp = fixed.find(f => f.id === p.id);
      if (fp) dbUpsert(fp);
    });
  }, [loading]);

  // Always backup to localStorage — safety net even when Supabase is active
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('npe-patients-v2', JSON.stringify(patients));
    }
  }, [patients, loading]);

  const dbUpsert = async (patient) => {
    if (!supabase || currentUser?.id === 'demo') return;
    const { error } = await supabase.from('patients').upsert({
      id: patient.id, name: patient.name, phone: patient.phone || '',
      npe_date: patient.npeDate, location: patient.location,
      dp: patient.dp, tc: patient.tc || 'Reaghan',
      br: patient.BR, inv: patient.INV, ph1: patient.PH1, ph2: patient.PH2, ltd: patient.LTD,
      r_plus: patient['R+'], w_plus: patient['W+'], pif: patient.PIF,
      st: patient.ST, sch: patient.SCH, pen: patient.PEN, obs: patient.OBS, mp: patient.MP, notx: patient.NOTX, dbrets: patient.DBRETS || false,
      obstacle: patient.obstacle, notes: patient.notes,
      bond_date: patient.bondDate || '',
      start_date: patient.startDate || '',
      contact_attempts: patient.contactAttempts,
      next_touch_date: patient.nextTouchDate,
      last_contact_date: patient.lastContactDate,
      contact_log: patient.contact_log || [],
      from_pending: patient.fromPending || false,
      practice_id: currentUser.practiceId
    });
    if (error) {
      console.error('Supabase upsert error:', error);
      setSaveError('⚠️ Cloud save failed for ' + patient.name + ' — ' + (error.message || error.code || 'unknown error') + '. Saved locally only.');
      setTimeout(() => setSaveError(''), 15000);
    }
  };

  const dbDelete = async (id) => {
    if (!supabase || currentUser?.id === 'demo') return;
    await supabase.from('patients').delete().eq('id', id);
  };

  // ── Feedback / Support ───────────────────────────────────────────────
  const handleSubmitFeedback = async () => {
    if (!feedbackForm.description.trim()) { alert('Please describe the issue before submitting.'); return; }
    setFeedbackSubmitting(true);
    if (supabase && currentUser?.id !== 'demo') {
      await supabase.from('feedback').insert({
        practice_id: currentUser.practiceId,
        tc_name: currentUser.name,
        tc_email: currentUser.email,
        view: currentView,
        category: feedbackForm.category || 'General',
        description: feedbackForm.description.trim(),
      });
    }
    setFeedbackSubmitting(false);
    setShowFeedbackModal(false);
    setFeedbackForm({ category: '', description: '' });
    setSaveToast('✅ Report submitted — thank you!');
    setTimeout(() => setSaveToast(''), 3000);
  };

  const loadFeedback = async () => {
    if (!supabase || currentUser?.id === 'demo') return;
    setFeedbackListLoading(true);
    const { data } = await supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(100);
    setFeedbackList(data || []);
    setFeedbackListLoading(false);
  };

  const deleteFeedback = async (id) => {
    if (!supabase) return;
    await supabase.from('feedback').delete().eq('id', id);
    setFeedbackList(prev => prev.filter(f => f.id !== id));
  };

  // ── Settings (goals, bonus rates, TC list) ───────────────────────────
  const dbSaveSettings = async (key, value) => {
    if (!supabase || currentUser?.id === 'demo') return;
    const { error } = await supabase.from('settings').upsert(
      { key, value, practice_id: currentUser.practiceId },
      { onConflict: 'key,practice_id' }
    );
    if (error) {
      console.error('dbSaveSettings error:', error);
      setSaveError('⚠️ Settings save failed — ' + (error.message || error.code || 'unknown error'));
      setTimeout(() => setSaveError(''), 10000);
    }
  };

  const dbLoadSettings = async (key) => {
    if (!supabase || currentUser?.id === 'demo') return null;
    const { data, error } = await supabase.from('settings').select('value').eq('key', key).eq('practice_id', currentUser.practiceId).maybeSingle();
    if (error) { console.warn('dbLoadSettings:', key, error.message); return null; }
    return data ? data.value : null;
  };

  // Load settings from Supabase on mount (overrides localStorage)
  useEffect(() => {
    const loadSettings = async () => {
      if (currentUser?.id === 'demo') return;
      const [cloudGoals, cloudBonusRates, cloudTCList, cloudAdminPw, cloudPopupBonuses] = await Promise.all([
        dbLoadSettings('goals'),
        dbLoadSettings('bonus-rates'),
        dbLoadSettings('tc-list'),
        dbLoadSettings('admin-password'),
        dbLoadSettings('popup-bonuses')
      ]);
      if (cloudGoals) setGoals(cloudGoals);
      if (cloudBonusRates) setBonusRates(cloudBonusRates);
      if (cloudTCList && Array.isArray(cloudTCList)) setTcList(cloudTCList);
      if (cloudAdminPw) localStorage.setItem('npe-admin-password', cloudAdminPw);
      if (cloudPopupBonuses && Array.isArray(cloudPopupBonuses)) setPopupBonuses(cloudPopupBonuses);
    };
    loadSettings();
  }, []);
  // ─────────────────────────────────────────────────────────────────────

  // ── Team Management helpers ───────────────────────────────────────────
  const loadTCUsers = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('tc_users').select('*').eq('practice_id', currentUser.practiceId).order('created_at', { ascending: true });
    if (data) setTcUsers(data);
  };
  useEffect(() => { if (currentUser?.role === 'admin') loadTCUsers(); }, [currentUser]);
  // ── Practice Metrics Supabase helpers ────────────────────────────────
  const loadPracticeMetrics = async () => {
    if (!supabase) return;
    const [{ data: metrics }, { data: goals }] = await Promise.all([
      supabase.from('practice_metrics').select('*').eq('practice_id', currentUser.practiceId).order('year', { ascending: true }).order('month', { ascending: true }),
      supabase.from('practice_goals').select('*').eq('practice_id', currentUser.practiceId).order('year', { ascending: true }).order('month', { ascending: true })
    ]);
    if (metrics) setPracticeMetrics(metrics);
    if (goals) setPracticeGoals(goals);
  };
  useEffect(() => { if (metricsUnlocked) loadPracticeMetrics(); }, [metricsUnlocked]);

  // Pull shows, starts, OBS for a given month directly from patient data
  const getDashboardMonthData = (year, month) => {
    const pts = patients.filter(p => {
      const d = new Date(p.npeDate + 'T12:00:00');
      return d.getFullYear() === year && d.getMonth() + 1 === month;
    });
    const npe_showed = pts.length;
    const starts     = pts.filter(p => isSDS(p) || p.ST).length;
    const obs_added  = pts.filter(p => p.OBS).length;
    return { npe_showed, starts, obs_added };
  };
  // ─────────────────────────────────────────────────────────────────────

  // Contact logging state
  const [contactForm, setContactForm] = useState({
    reachedPatient: '',
    outcome: '',
    sentText: false,
    notes: '',
    nextTouchDate: '',
    obstacle: ''   // allows TC to update obstacle from within the contact log form
  });

  // Bond check-in notes (per patient id)
  const [bondCheckNotes, setBondCheckNotes] = useState({});
  // Bond reschedule UI state (per patient id)
  const [bondRescheduleOpen, setBondRescheduleOpen] = useState({});
  const [bondRescheduleDate, setBondRescheduleDate] = useState({});

  // Push follow-up date UI state (per patient id)
  const [pushDateOpen, setPushDateOpen] = useState({});
  const [pushDateValue, setPushDateValue] = useState({});

  // SDS = has a real treatment type AND is NOT in any pending/non-SDS status
  const isSDS = (p) => {
    const hasTreatment = p.BR || p.INV || p.PH1 || p.PH2 || p.LTD; // PIF/R+/W+ alone don't make an SDS
    return hasTreatment && !p.PEN && !p.SCH && !p.OBS && !p.MP && !p.NOTX && !p.ST;
  };

  const parseDP = (dp) => {
    if (!dp) return 0;
    return parseFloat(dp.toString().replace(/[^0-9.]/g, '')) || 0;
  };

  // Returns the effective start date for a patient — uses startDate if set, falls back to npeDate for old SDS/DBRETS records
  const effectiveStartDate = (p) => (p.startDate && p.startDate !== '') ? p.startDate : ((isSDS(p) || p.ST || p.DBRETS) ? p.npeDate : '');

  // Calculate metrics. npePts = patients filtered by NPE date (for NPE totals).
  // startPts = patients filtered by start date (for start counts). Defaults to npePts if not provided.
  const calculateMetrics = (pts, startPts = null) => {
    const total = pts.length;
    const _sp = startPts || pts;

    const sds = _sp.filter(isSDS);
    const started = _sp.filter(p => isSDS(p) || p.ST);

    const pending = pts.filter(p => p.PEN === true).length;
    const scheduled = pts.filter(p => p.SCH === true).length;
    const observation = pts.filter(p => p.OBS === true).length;
    const medicaidPending = pts.filter(p => p.MP === true).length;
    const noTx = pts.filter(p => p.NOTX === true).length;

    const retainers = _sp.filter(p => (isSDS(p) || p.DBRETS) && p['R+'] === true).length;
    const whitening = _sp.filter(p => (isSDS(p) || p.DBRETS) && p['W+'] === true).length;
    const pif = started.filter(p => p.PIF === true).length;

    const overallConv = total > 0 ? Math.round((started.length / total) * 100) : 0;
    const sdsConv = total > 0 ? Math.round((sds.length / total) * 100) : 0;

    // Per-office metrics
    const carPts = pts.filter(p => p.location === 'Car');
    const apoPts = pts.filter(p => p.location === 'Apo');
    const carStarted = _sp.filter(p => p.location === 'Car' && (isSDS(p) || p.ST)).length;
    const apoStarted = _sp.filter(p => p.location === 'Apo' && (isSDS(p) || p.ST)).length;
    const carConv = carPts.length > 0 ? Math.round((carStarted / carPts.length) * 100) : 0;
    const apoConv = apoPts.length > 0 ? Math.round((apoStarted / apoPts.length) * 100) : 0;

    // Average down payment — SDS/ST only, PIF excluded (full-pay skews the avg high)
    const startedDPs = started.filter(p => !p.PIF).map(p => parseDP(p.dp)).filter(v => v > 0);
    const avgDP = startedDPs.length > 0 ? Math.round(startedDPs.reduce((a, b) => a + b, 0) / startedDPs.length) : 0;
    const allDPs = pts.filter(p => !p.PIF).map(p => parseDP(p.dp)).filter(v => v > 0);
    const avgDPAll = allDPs.length > 0 ? Math.round(allDPs.reduce((a, b) => a + b, 0) / allDPs.length) : 0;

    // Treatment type breakdown (for started patients)
    const brCount = started.filter(p => p.BR).length;
    const invCount = started.filter(p => p.INV).length;
    const ph1Count = started.filter(p => p.PH1).length;
    const ph2Count = started.filter(p => p.PH2).length;
    const ltdCount = started.filter(p => p.LTD).length;

    // SDS rate (% of starts that are same-day)
    const sdsRate = started.length > 0 ? Math.round((sds.length / started.length) * 100) : 0;

    const sdsBonus = sds.length * bonusRates.sds;
    const retBonus = retainers * bonusRates.ret;
    const whiteBonus = whitening * bonusRates.white;
    const pifBonus = pif * bonusRates.pif;
    const totalBonus = sdsBonus + retBonus + whiteBonus + pifBonus;

    return {
      total, started: started.length, sds: sds.length, pending, scheduled, observation, medicaidPending, noTx,
      overallConv, sdsConv, retainers, whitening, pif, sdsBonus, retBonus, whiteBonus, pifBonus, totalBonus,
      carTotal: carPts.length, apoTotal: apoPts.length, carStarted, apoStarted, carConv, apoConv,
      avgDP, avgDPAll, brCount, invCount, ph1Count, ph2Count, ltdCount, sdsRate
    };
  };

  const overall = calculateMetrics(patients);

  const today = new Date().toISOString().split('T')[0];

  // Follow-ups: PEN + MP + OBS (6-month cadence); NOTX excluded; past-due pinned to today
  const selectedFollowUps = patients.filter(p => {
    if (!p.PEN && !p.MP && !p.OBS) return false;
    if (!p.nextTouchDate || p.nextTouchDate === '__MAX__') return false;
    const effectiveDate = skipWeekend(p.nextTouchDate); // normalize any stored weekend date → next Monday
    if (selectedWeekDay === today) return effectiveDate <= today;
    return effectiveDate === selectedWeekDay;
  });

  // Bond check-ins: SCH patients, reminder = day after bond date; past-due pinned to today
  const selectedBondCheckins = patients.filter(p => {
    if (!p.SCH || !p.bondDate) return false;
    const checkDate = getBondCheckDate(p);
    if (!checkDate) return false;
    if (selectedWeekDay === today) return checkDate <= today;
    return checkDate === selectedWeekDay;
  });

  const selectedDayPatients = [...selectedFollowUps, ...selectedBondCheckins];

  const getWeekMonday = (offset) => {
    const d = new Date();
    const dayOfWeek = d.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(d.getDate() + daysToMonday + (offset * 7));
    return monday;
  };

  const handleSaveContact = async (patientId) => {
    if (!contactForm.reachedPatient) {
      alert('Please select whether you reached the patient before saving.');
      return;
    }
    const todayStr = new Date().toISOString().split('T')[0];
    let updatedPatient = null;
    const updated = patients.map(p => {
      if (p.id !== patientId) return p;
      const newAttempts = p.OBS ? p.contactAttempts : p.contactAttempts + 1;
      const logEntry = {
        date: todayStr,
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        scheduledDate: p.nextTouchDate || '',
        reachedPatient: contactForm.reachedPatient,
        outcome: contactForm.outcome,
        sentText: contactForm.sentText,
        notes: contactForm.notes
      };
      const updatedObstacle = (contactForm.obstacle || p.obstacle) || (p.MP ? 'Waiting to Hear from Medicaid' : '');
      const effectiveObstacle = updatedObstacle || (p.MP ? 'Waiting to Hear from Medicaid' : '');
      let nextDate = (contactForm.nextTouchDate ? skipWeekend(contactForm.nextTouchDate) : null)
        || (p.OBS ? addMonths(todayStr, 6) : calcNextTouchDate(p.npeDate, effectiveObstacle, newAttempts, todayStr));
      const result = {
        ...p,
        obstacle: updatedObstacle,
        contactAttempts: newAttempts,
        lastContactDate: todayStr,
        nextTouchDate: nextDate,
        contact_log: [...(p.contact_log || []), logEntry]
      };
      updatedPatient = result;
      return result;
    });
    setPatients(updated);
    if (updatedPatient) await dbUpsert(updatedPatient);
    setShowContactLog(null);
    setContactForm({ reachedPatient: '', outcome: '', sentText: false, notes: '', nextTouchDate: '', obstacle: '' });
  };

  const handleConvertToNotx = async (patientId) => {
    const todayStr = new Date().toISOString().split('T')[0];
    let updatedPatient = null;
    const updated = patients.map(p => {
      if (p.id !== patientId) return p;
      const logEntry = {
        date: todayStr,
        reachedPatient: contactForm.reachedPatient,
        outcome: 'Not interested — converted to No Treatment',
        sentText: contactForm.sentText,
        notes: contactForm.notes
      };
      updatedPatient = {
        ...p,
        PEN: false, MP: false, OBS: false, NOTX: true,
        nextTouchDate: '',
        obstacle: contactForm.obstacle || p.obstacle,
        contact_log: [...(p.contact_log || []), logEntry]
      };
      return updatedPatient;
    });
    setPatients(updated);
    if (updatedPatient) await dbUpsert(updatedPatient);
    setShowContactLog(null);
    setContactForm({ reachedPatient: '', outcome: '', sentText: false, notes: '', nextTouchDate: '', obstacle: '' });
    setSaveToast('✅ ' + (updatedPatient?.name || '') + ' moved to No Treatment');
    setTimeout(() => setSaveToast(''), 3000);
  };

  const handlePushDate = async (patientId) => {
    const newDate = pushDateValue[patientId];
    if (!newDate) return;
    const safeDate = skipWeekend(newDate);
    let updatedPatient = null;
    const updated = patients.map(p => {
      if (p.id !== patientId) return p;
      updatedPatient = { ...p, nextTouchDate: safeDate };
      return updatedPatient;
    });
    setPatients(updated);
    if (updatedPatient) await dbUpsert(updatedPatient);
    setPushDateOpen(prev => ({ ...prev, [patientId]: false }));
    setPushDateValue(prev => ({ ...prev, [patientId]: '' }));
    setSaveToast(`📅 Follow-up pushed to ${new Date(safeDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`);
    setTimeout(() => setSaveToast(''), 3000);
  };

  const handleMarkStarted = (patient) => {
    // Pre-populate: SCH patients confirm today; SDS defaults to NPE date
    setStartedForm({
      startDate: patient.SCH ? new Date().toISOString().split('T')[0] : patient.npeDate,
      dp: patient.dp || '',
      BR: patient.BR || false, INV: patient.INV || false,
      PH1: patient.PH1 || false, PH2: patient.PH2 || false, LTD: patient.LTD || false,
      'R+': patient['R+'] || false, 'W+': patient['W+'] || false, PIF: patient.PIF || false
    });
    setShowStartedModal(patient);
  };

  const confirmStarted = async (patientId) => {
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return;
    const isSameDay = startedForm.startDate === patient.npeDate;
    const updated = {
      ...patient,
      ST: !isSameDay,
      fromPending: patient.PEN || patient.MP || patient.SCH || patient.fromPending || false,
      PEN: false, SCH: false, OBS: false, MP: false, bondDate: '',
      startDate: startedForm.startDate,
      dp: startedForm.dp || patient.dp,
      BR: startedForm.BR, INV: startedForm.INV, PH1: startedForm.PH1,
      PH2: startedForm.PH2, LTD: startedForm.LTD,
      'R+': startedForm['R+'], 'W+': startedForm['W+'], PIF: startedForm.PIF
    };
    setPatients(prev => prev.map(p => p.id === patientId ? updated : p));
    await dbUpsert(updated);
    setShowStartedModal(null);
    setSaveToast(`🎯 ${updated.name} marked as Started — removed from follow-up queue!`);
    setTimeout(() => setSaveToast(''), 4000);
  };

  const handleMissedBond = async (patient, notes = '') => {
    const todayStr = new Date().toISOString().split('T')[0];
    const logEntry = {
      date: todayStr,
      reachedPatient: 'Missed appointment',
      outcome: `Missed initial bond scheduled for ${patient.bondDate} — returned to Pending`,
      sentText: false,
      notes: notes
    };
    const updatedPatient = {
      ...patient,
      SCH: false,
      PEN: true,
      bondDate: '',
      obstacle: 'Getting a Second Opinion',
      contactAttempts: 0,
      nextTouchDate: calcNextTouchDate(patient.npeDate, 'Getting a Second Opinion', 0, ''),
      lastContactDate: todayStr,
      contact_log: [...(patient.contact_log || []), logEntry]
    };
    setPatients(patients.map(p => p.id === patient.id ? updatedPatient : p));
    await dbUpsert(updatedPatient);
  };

  const handleRescheduleBond = async (patient, newBondDate, notes = '') => {
    const todayStr = new Date().toISOString().split('T')[0];
    const newCheckDate = getBondCheckDate({ SCH: true, bondDate: newBondDate });
    const logEntry = {
      date: todayStr,
      reachedPatient: 'Rescheduled',
      outcome: `Bond appointment rescheduled from ${patient.bondDate} to ${newBondDate}`,
      sentText: false,
      notes: notes
    };
    const updatedPatient = {
      ...patient,
      bondDate: newBondDate,
      nextTouchDate: newCheckDate,
      contact_log: [...(patient.contact_log || []), logEntry]
    };
    setPatients(patients.map(p => p.id === patient.id ? updatedPatient : p));
    await dbUpsert(updatedPatient);
    setBondRescheduleOpen(prev => ({ ...prev, [patient.id]: false }));
    setBondRescheduleDate(prev => ({ ...prev, [patient.id]: '' }));
  };

  const handleAddPatient = async () => {
    setAddPatientError('');
    if (!newPatientForm.name.trim()) { setAddPatientError('Please enter a patient name.'); return; }
    if (!newPatientForm.status) { setAddPatientError('Please select a status before saving.'); return; }
    const isSCH = newPatientForm.status === 'SCH';
    const isOBS = newPatientForm.status === 'OBS';
    const isPending = ['PEN', 'MP'].includes(newPatientForm.status);
    if (isSCH && !newPatientForm.bondDate) { setAddPatientError('Please enter the Initial Bond Date for Scheduled patients.'); return; }
    // Determine next touch date
    const autoNext = isSCH
      ? (newPatientForm.nextTouchOverride
          ? skipWeekend(newPatientForm.nextTouchOverride)
          : getBondCheckDate({ SCH: true, bondDate: newPatientForm.bondDate }))
      : newPatientForm.nextTouchOverride
        ? skipWeekend(newPatientForm.nextTouchOverride)
        : isOBS
          ? addMonths(newPatientForm.npeDate, 6)   // OBS: 6-month re-check cadence
          : isPending
            ? calcNextTouchDate(
                newPatientForm.npeDate,
                newPatientForm.obstacle || (newPatientForm.status === 'MP' ? 'Waiting to Hear from Medicaid' : ''),
                0, '')
            : '';
    // Start date: SDS = npeDate, ST = npeDate (already started), others = ''
    const isSameDay = newPatientForm.status === 'SDS';
    const isST = newPatientForm.status === 'ST';
    const patient = {
      id: generateId(),
      name: newPatientForm.name.trim(),
      phone: newPatientForm.phone || '',
      npeDate: newPatientForm.npeDate,
      location: newPatientForm.location,
      dp: newPatientForm.dp || '$0',
      tc: newPatientForm.tc || 'Reaghan',
      BR: newPatientForm.BR, INV: newPatientForm.INV, PH1: newPatientForm.PH1,
      PH2: newPatientForm.PH2, LTD: newPatientForm.LTD,
      'R+': newPatientForm['R+'], 'W+': newPatientForm['W+'], PIF: newPatientForm.PIF,
      ST: isST,   // SDS patients have ST:false — isSDS() handles the distinction
      SCH: isSCH,
      PEN: newPatientForm.status === 'PEN',
      OBS: isOBS,
      MP: newPatientForm.status === 'MP',
      NOTX: newPatientForm.status === 'NOTX',
      DBRETS: newPatientForm.status === 'DBRETS',
      obstacle: newPatientForm.obstacle,
      notes: newPatientForm.notes,
      bondDate: newPatientForm.bondDate || '',
      startDate: (isSameDay || isST) ? newPatientForm.npeDate : '',
      contactAttempts: 0,
      nextTouchDate: autoNext === '__MAX__' ? '' : (autoNext || ''),
      lastContactDate: '',
      contact_log: []
    };
    setPatients(prev => [...prev, patient]);
    await dbUpsert(patient);
    const nextInfo = patient.nextTouchDate && patient.nextTouchDate !== '__MAX__'
      ? ` — first follow-up: ${new Date(patient.nextTouchDate + 'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'})}`
      : (isSDS(patient) || patient.ST) ? ' — added to Bonus Audit' : patient.DBRETS ? ' — added to Bonus Audit' : '';
    setAddPatientError('');
    setSaveToast('✅ ' + patient.name + ' saved!' + nextInfo);
    setTimeout(() => setSaveToast(''), 4000);
    setNewPatientForm({
      name: '', phone: '', npeDate: new Date().toISOString().split('T')[0], location: 'Car', dp: '',
      tc: defaultTC || newPatientForm.tc || 'Reaghan', status: '',
      BR: false, INV: false, PH1: false, PH2: false, LTD: false,
      'R+': false, 'W+': false, PIF: false, obstacle: '', notes: '', nextTouchOverride: '', bondDate: ''
    });
    setSearchTerm('');
    setCurrentView('patients');
  };

  if (loading) return (
    <div style={{minHeight:'100vh',backgroundColor:'#F5F5F5',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'48px',marginBottom:'16px',animation:'spin 1s linear infinite'}}>⏳</div>
        <p style={{fontSize:'18px',color:'#6b7280',fontWeight:'500'}}>Loading patient data...</p>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',backgroundColor:'#F5F5F5',fontFamily:'system-ui'}}>

      {/* Save confirmation toast */}
      {saveToast && (
        <div style={{position:'fixed',bottom:'24px',right:'24px',zIndex:9999,backgroundColor:'#10b981',color:'white',padding:'14px 20px',borderRadius:'10px',boxShadow:'0 4px 12px rgba(0,0,0,0.2)',fontWeight:'600',fontSize:'15px',display:'flex',alignItems:'center',gap:'8px'}}>
          {saveToast}
        </div>
      )}

      {/* Cloud save error banner */}
      {saveError && (
        <div style={{position:'fixed',bottom:'24px',right:'24px',zIndex:9999,backgroundColor:'#ef4444',color:'white',padding:'14px 20px',borderRadius:'10px',boxShadow:'0 4px 12px rgba(0,0,0,0.2)',fontWeight:'600',fontSize:'14px',maxWidth:'360px'}}>
          {saveError}
        </div>
      )}

      {/* Header */}
      <header style={{backgroundColor:'#202020',padding:'14px 16px',boxShadow:'0 2px 8px rgba(0,0,0,0.25)'}}>
        <div style={{maxWidth:'1400px',margin:'0 auto',display:'flex',alignItems:'center',gap:'0'}}>

          {/* CadenceIQ — Primary Brand (left) */}
          <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
            <svg width="42" height="38" viewBox="0 0 36 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="0"  y="14" width="5" height="4"  rx="2" fill="white" fillOpacity="0.3"/>
              <rect x="7"  y="9"  width="5" height="14" rx="2" fill="white" fillOpacity="0.55"/>
              <rect x="14" y="3"  width="5" height="26" rx="2" fill="white" fillOpacity="0.85"/>
              <rect x="21" y="0"  width="5" height="32" rx="2" fill="white"/>
              <rect x="28" y="5"  width="5" height="22" rx="2" fill="#4A90E2" fillOpacity="0.9"/>
            </svg>
            <div>
              <div style={{fontSize:'26px',fontWeight:'900',letterSpacing:'-0.03em',lineHeight:1,fontFamily:'system-ui'}}>
                <span style={{color:'white'}}>Cadence</span><span style={{color:'#4A90E2'}}>IQ</span>
              </div>
              <div style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',letterSpacing:'0.12em',textTransform:'uppercase',marginTop:'4px'}}>Practice Intelligence</div>
            </div>
          </div>

          {/* Divider */}
          <div style={{width:'1px',height:'36px',backgroundColor:'rgba(255,255,255,0.15)',margin:'0 20px'}}/>

          {/* Practice / Client info */}
          <div>
            <p style={{fontSize:'15px',fontWeight:'700',color:'white',margin:0}}>Miller Orthodontics</p>
            <p style={{fontSize:'11px',color:'rgba(255,255,255,0.45)',margin:'2px 0 0 0',letterSpacing:'0.03em'}}>{currentUser?.role === 'tc' ? 'Treatment Coordinator Portal' : 'Practice Owner Portal'}</p>
          </div>

          {/* Right — User info + sign out */}
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'16px'}}>
            {currentUser?.id === 'demo' && (
              <div style={{padding:'4px 10px',backgroundColor:'#4A90E2',borderRadius:'6px',fontSize:'11px',fontWeight:'800',color:'white',letterSpacing:'0.08em',textTransform:'uppercase'}}>Demo Mode</div>
            )}
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:'13px',fontWeight:'700',color:'white'}}>{currentUser?.name}</div>
              <div style={{fontSize:'10px',color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:'1px'}}>{currentUser?.role === 'admin' ? 'Practice Owner' : 'Treatment Coordinator'}</div>
            </div>
            <button onClick={onSignOut}
              style={{padding:'7px 14px',backgroundColor:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:'7px',color:'rgba(255,255,255,0.7)',fontSize:'12px',fontWeight:'600',cursor:'pointer',whiteSpace:'nowrap'}}>
              Sign Out
            </button>
          </div>

        </div>
      </header>

      {/* Navigation */}
      <nav style={{backgroundColor:'white',borderBottom:'1px solid #e5e7eb'}}>
        <div style={{maxWidth:'1400px',margin:'0 auto',padding:'0 16px',display:'flex',gap:'8px',overflowX:'auto'}}>
          {(currentUser?.role === 'tc'
            ? ['dashboard', 'followup', 'add', 'patients', 'bonus', 'ontime']
            : ['dashboard', 'followup', 'add', 'patients', 'monthly', 'bonus', 'ontime', 'metrics', 'settings',
                ...(currentUser?.id === 'demo' ? ['benchmarks'] : [])]
          ).map(view => (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              style={{
                padding:'12px 16px',
                border:'none',
                borderBottom: currentView === view ? '3px solid #2563EB' : '3px solid transparent',
                backgroundColor:'transparent',
                color: currentView === view ? '#202020' : '#6b7280',
                fontWeight: currentView === view ? '600' : '400',
                cursor:'pointer',
                fontSize:'14px',
                whiteSpace:'nowrap'
              }}
            >
              {view === 'dashboard' && '📊 Dashboard'}
              {view === 'followup' && '🔔 Follow-Up Queue'}
              {view === 'add' && '➕ Add NPE'}
              {view === 'patients' && '👥 All Patients'}
              {view === 'monthly' && '📊 Monthly Reports'}
              {view === 'bonus' && '💰 Bonus Audit'}
              {view === 'ontime' && '⏱️ On-Time Audit'}
              {view === 'metrics' && 'Practice Metrics'}
              {view === 'settings' && '⚙️ Settings'}
              {view === 'benchmarks' && '📈 Benchmarks'}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main style={{maxWidth:'1400px',margin:'0 auto',padding:'24px 16px'}}>
        
        {/* DASHBOARD VIEW */}
        {currentView === 'dashboard' && (() => {
          // ── Time-filtered metrics ──────────────────────────────────────
          const curM = new Date().getMonth();
          const curY = new Date().getFullYear();
          // TCs are always filtered to their own data
          const effectiveTCFilter = currentUser?.role === 'tc' ? currentUser.name : dashTCFilter;
          const dashPatients = (() => {
            let pts = dashTimeframe === 'month'
              ? patients.filter(p => {
                  const d = new Date(p.npeDate + 'T12:00:00');
                  return d.getMonth() === curM && d.getFullYear() === curY;
                })
              : patients;
            if (effectiveTCFilter !== 'All') pts = pts.filter(p => p.tc === effectiveTCFilter);
            return pts;
          })();
          const dashStartPatients = (() => {
            if (dashTimeframe !== 'month') return null; // all-time: no split needed
            let pts = patients.filter(p => {
              const sd = effectiveStartDate(p);
              if (!sd) return false;
              const d = new Date(sd + 'T12:00:00');
              return d.getMonth() === curM && d.getFullYear() === curY;
            });
            if (effectiveTCFilter !== 'All') pts = pts.filter(p => p.tc === effectiveTCFilter);
            return pts;
          })();
          const dash = calculateMetrics(dashPatients, dashStartPatients);

          // On-time follow-up rate for dashboard
          // Uses all patients (filtered by TC only) so it matches the On-Time Audit,
          // which counts any contact made in the month regardless of the patient's npeDate.
          const dashMonthStr = `${curY}-${String(curM + 1).padStart(2, '0')}`;
          const onTimePatients = effectiveTCFilter !== 'All'
            ? patients.filter(p => p.tc === effectiveTCFilter)
            : patients;
          let dashOnTimeCount = 0, dashTotalTracked = 0;
          onTimePatients.forEach(p => {
            (p.contact_log || []).forEach(entry => {
              const inPeriod = dashTimeframe === 'month'
                ? (entry.date && entry.date.startsWith(dashMonthStr))
                : true;
              if (inPeriod && entry.date && entry.scheduledDate) {
                dashTotalTracked++;
                if (entry.date <= entry.scheduledDate) dashOnTimeCount++;
              }
            });
          });
          const dashOnTimeRate = dashTotalTracked > 0 ? Math.round((dashOnTimeCount / dashTotalTracked) * 100) : null;
          const dashOnTimeColor = dashOnTimeRate === null ? '#9ca3af' : dashOnTimeRate >= 80 ? '#10b981' : dashOnTimeRate >= 60 ? '#f59e0b' : '#ef4444';

          // Monthly goals for current month
          const mGoal = goals.monthly[curM] || {};
          const carNPEGoal = mGoal.carNPE || 0;
          const carStartedGoal = mGoal.carStarted || 0;
          const apoNPEGoal = mGoal.apoNPE || 0;
          const apoStartedGoal = mGoal.apoStarted || 0;
          const convGoal = mGoal.convGoal || 50;
          const totalNPEGoal = carNPEGoal + apoNPEGoal;
          const totalStartedGoal = carStartedGoal + apoStartedGoal;

          // Today's queue counts
          const todayStr = new Date().toISOString().split('T')[0];
          const todayFollowCount = patients.filter(p => {
            if (!p.PEN && !p.MP && !p.OBS) return false;
            if (!p.nextTouchDate || p.nextTouchDate === '__MAX__') return false;
            return skipWeekend(p.nextTouchDate) <= todayStr;
          }).length;
          const todayBondCount = patients.filter(p => {
            if (!p.SCH || !p.bondDate) return false;
            const cd = getBondCheckDate(p);
            return cd && cd <= todayStr;
          }).length;
          const todayTotal = todayFollowCount + todayBondCount;

          // Formatted date
          const dateLabel = new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});
          const monthLabel = new Date().toLocaleDateString('en-US', {month:'long', year:'numeric'});

          return (
          <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>

            {/* ── Header row: date + timeframe toggle ── */}
            <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
              <div>
                <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'2px'}}>{dateLabel}</div>
                <h2 style={{fontSize:'26px',fontWeight:'800',color:'#202020',margin:0}}>Dashboard Overview</h2>
              </div>
              <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
                {currentUser?.role === 'admin' ? (
                  <select value={dashTCFilter} onChange={e => setDashTCFilter(e.target.value)}
                    style={{padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:'8px',fontSize:'13px',fontWeight:'600',color:'#374151',backgroundColor:'white',cursor:'pointer'}}>
                    <option value="All">All TCs</option>
                    {tcList.map(tc => <option key={tc} value={tc}>{tc}</option>)}
                  </select>
                ) : (
                  <div style={{padding:'8px 14px',border:'1px solid #d1d5db',borderRadius:'8px',fontSize:'13px',fontWeight:'700',color:'#374151',backgroundColor:'#f9fafb'}}>
                    {currentUser?.name}
                  </div>
                )}
                <div style={{display:'flex',border:'1px solid #d1d5db',borderRadius:'8px',overflow:'hidden'}}>
                  <button onClick={() => setDashTimeframe('month')}
                    style={{padding:'8px 18px',border:'none',cursor:'pointer',fontSize:'13px',fontWeight:'600',
                      backgroundColor: dashTimeframe === 'month' ? '#202020' : 'white',
                      color: dashTimeframe === 'month' ? 'white' : '#374151'}}>
                    📅 This Month
                  </button>
                  <button onClick={() => setDashTimeframe('all')}
                    style={{padding:'8px 18px',border:'none',borderLeft:'1px solid #d1d5db',cursor:'pointer',fontSize:'13px',fontWeight:'600',
                      backgroundColor: dashTimeframe === 'all' ? '#202020' : 'white',
                      color: dashTimeframe === 'all' ? 'white' : '#374151'}}>
                    All Time
                  </button>
                </div>
              </div>
            </div>

            {/* Active popup bonus banner */}
            {(() => {
              const todayStr = new Date().toISOString().split('T')[0];
              const myTC = currentUser?.role === 'tc' ? currentUser.name : null;
              const activeBonuses = popupBonuses.filter(b =>
                todayStr >= b.startDate && todayStr <= b.endDate &&
                (b.tcFilter === 'All' || myTC === null || b.tcFilter === myTC)
              );
              if (activeBonuses.length === 0) return null;
              return activeBonuses.map(bonus => {
                const qualifying = patients.filter(p =>
                  (p.fromPending || p.ST) &&
                  p.startDate >= bonus.startDate && p.startDate <= bonus.endDate &&
                  (bonus.tcFilter === 'All' || p.tc === bonus.tcFilter) &&
                  (myTC === null || p.tc === myTC)
                );
                const earned = qualifying.reduce((sum, p) => sum + bonus.amount + (p['R+'] ? bonusRates.ret : 0) + (p['W+'] ? bonusRates.white : 0), 0);
                const endLabel = new Date(bonus.endDate + 'T12:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric'});
                return (
                  <div key={bonus.id} style={{backgroundColor:'#fefce8',border:'2px solid #fbbf24',borderRadius:'10px',padding:'16px 20px',display:'flex',alignItems:'center',gap:'20px',flexWrap:'wrap'}}>
                    <div style={{fontSize:'28px'}}>🎯</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:'800',fontSize:'16px',color:'#92400e'}}>{bonus.name}</div>
                      <div style={{fontSize:'13px',color:'#92400e',marginTop:'2px'}}>
                        <strong>${bonus.amount}/start + ${bonusRates.ret} retainers + ${bonusRates.white} whitening</strong> — ends {endLabel}
                        {bonus.description && <span> · {bonus.description}</span>}
                      </div>
                    </div>
                    <div style={{textAlign:'center',backgroundColor:'white',padding:'10px 18px',borderRadius:'8px',border:'1px solid #fde68a'}}>
                      <div style={{fontSize:'26px',fontWeight:'900',color:'#10b981',lineHeight:1}}>${earned}</div>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'2px'}}>{qualifying.length} starts so far</div>
                    </div>
                  </div>
                );
              });
            })()}

            {/* ── Today's Calls Hero ── */}
            <div style={{background:'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)',borderRadius:'12px',padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px',flexWrap:'wrap',boxShadow:'0 4px 12px rgba(30,64,175,0.25)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
                <div style={{fontSize:'36px'}}>📞</div>
                <div>
                  <div style={{fontSize:'11px',color:'rgba(255,255,255,0.7)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'2px',fontWeight:'700'}}>Today's Follow-Up Queue</div>
                  <div style={{fontSize:'30px',fontWeight:'800',color:'white',lineHeight:1}}>{todayTotal} patient{todayTotal !== 1 ? 's' : ''} to call</div>
                  <div style={{fontSize:'13px',color:'rgba(255,255,255,0.75)',marginTop:'3px'}}>
                    {todayTotal === 0 ? '✅ All clear — no calls due today!' : 'These are due today — don\'t let the day slip'}
                  </div>
                </div>
              </div>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                {todayFollowCount > 0 && <div style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',borderRadius:'20px',padding:'6px 14px',fontSize:'13px',color:'white',fontWeight:'500'}}>{todayFollowCount} follow-up{todayFollowCount !== 1 ? 's' : ''}</div>}
                {todayBondCount > 0 && <div style={{background:'rgba(251,191,36,0.2)',border:'1px solid rgba(251,191,36,0.5)',borderRadius:'20px',padding:'6px 14px',fontSize:'13px',color:'white',fontWeight:'500'}}>📅 {todayBondCount} bond check-in{todayBondCount !== 1 ? 's' : ''}</div>}
              </div>
              <button onClick={() => setCurrentView('followup')}
                style={{background:'white',color:'#1e40af',border:'none',borderRadius:'8px',padding:'12px 22px',fontSize:'14px',fontWeight:'700',cursor:'pointer',whiteSpace:'nowrap'}}>
                Go to Queue →
              </button>
            </div>

            {/* ── Key Metrics with goals ── */}
            <div>
              <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'10px'}}>
                {dashTimeframe === 'month' ? `📅 ${monthLabel}${effectiveTCFilter !== 'All' ? ` · ${effectiveTCFilter}` : ''} — Performance vs. Goal` : `📊 All-Time Performance${effectiveTCFilter !== 'All' ? ` · ${effectiveTCFilter}` : ''}`}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))',gap:'14px'}}>
                <MetricCard label="Total NPE" value={dash.total}
                  goal={dashTimeframe === 'month' && totalNPEGoal > 0 ? totalNPEGoal : null}
                  goalLabel={dashTimeframe === 'month' && totalNPEGoal > 0 && dash.total < totalNPEGoal ? `· ${totalNPEGoal - dash.total} to go` : null} />
                <MetricCard label="Started" value={dash.started} color="#10b981"
                  goal={dashTimeframe === 'month' && totalStartedGoal > 0 ? totalStartedGoal : null}
                  goalLabel={dashTimeframe === 'month' && totalStartedGoal > 0 && dash.started < totalStartedGoal ? `· ${totalStartedGoal - dash.started} to go` : null} />
                <MetricCard label="Conversion Rate" value={`${dash.overallConv}%`} color="#2563EB"
                  goal={dashTimeframe === 'month' && convGoal > 0 ? `${convGoal}%` : null}
                  goalLabel={dashTimeframe === 'month' && dash.overallConv < convGoal ? `· ${convGoal - dash.overallConv} pts behind` : null}
                  badge={dashTimeframe === 'month' ? (dash.overallConv >= convGoal ? '✓ Goal Met' : `${dash.overallConv}%`) : null}
                  badgeColor={dashTimeframe === 'month' ? (dash.overallConv >= convGoal ? '#dcfce7' : dash.overallConv >= convGoal * 0.8 ? '#fef3c7' : '#fee2e2') : null} />
                <MetricCard label="Same-Day Starts" value={dash.sds} color="#3b82f6"
                  sub={dash.started > 0 ? `SDS Rate: ${dash.sdsRate}% of starts` : 'No starts yet'} />
                <MetricCard label="Avg Down Payment" value={dash.avgDP > 0 ? `$${dash.avgDP}` : '—'} color="#8b5cf6"
                  sub="Started patients only" />
                <MetricCard label="On-Time Follow-Up Rate" value={dashOnTimeRate !== null ? `${dashOnTimeRate}%` : '—'} color={dashOnTimeColor}
                  sub={dashTotalTracked > 0 ? `${dashOnTimeCount}/${dashTotalTracked} contacts on time` : 'No tracked contacts yet'}
                  goal={dashOnTimeRate !== null ? '80%' : null}
                  goalLabel={dashOnTimeRate !== null && dashOnTimeRate < 80 ? `· ${80 - dashOnTimeRate} pts behind` : null} />
              </div>
            </div>

            {/* ── Pipeline — single clean section ── */}
            {dash.total > 0 && (
              <div style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                <h3 style={{fontSize:'14px',fontWeight:'700',color:'#374151',marginBottom:'14px',display:'flex',alignItems:'center',gap:'6px'}}>🔄 Pipeline — Where Patients Are Now</h3>
                <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
                  {[
                    {count: dash.pending,         label:'Pending',     sub:'In follow-up',      bg:'#fff7ed', border:'#fed7aa', color:'#c2410c'},
                    {count: dash.scheduled,        label:'Scheduled',   sub:'Bond upcoming',     bg:'#eff6ff', border:'#bfdbfe', color:'#1d4ed8'},
                    {count: dash.observation,      label:'Observation', sub:'6-mo re-check',     bg:'#f0fdf4', border:'#bbf7d0', color:'#15803d'},
                    {count: dash.medicaidPending,  label:'Medicaid',    sub:'Awaiting approval', bg:'#fef3c7', border:'#fde68a', color:'#92400e'},
                    {count: dash.noTx,             label:'Declined',    sub:'No treatment',      bg:'#f9fafb', border:'#e5e7eb', color:'#6b7280'},
                  ].map(item => (
                    <div key={item.label} style={{flex:'1',minWidth:'90px',borderRadius:'8px',padding:'14px 16px',textAlign:'center',backgroundColor:item.bg,border:`1px solid ${item.border}`}}>
                      <div style={{fontSize:'28px',fontWeight:'800',color:item.color,lineHeight:1,marginBottom:'4px'}}>{item.count}</div>
                      <div style={{fontSize:'11px',fontWeight:'600',color:item.color}}>{item.label}</div>
                      <div style={{fontSize:'10px',color:item.color,opacity:0.7,marginTop:'2px'}}>{item.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Obstacle Intelligence ── */}
            {(() => {
              // Respect TC filter but NOT timeframe — win rates need all-time data to be meaningful
              const tcPts = effectiveTCFilter === 'All' ? patients : patients.filter(p => p.tc === effectiveTCFilter);
              const activePending = tcPts.filter(p => p.PEN || p.MP);

              // Win rate per obstacle: of everyone who ever had this obstacle, how many started?
              const winRates = OBSTACLE_OPTIONS.map(obs => {
                const withObs = tcPts.filter(p => p.obstacle === obs);
                const started = withObs.filter(p => isSDS(p) || p.ST).length;
                const total   = withObs.length;
                const active  = withObs.filter(p => p.PEN || p.MP).length;
                const rate    = total > 0 ? Math.round((started / total) * 100) : null;
                return { obs, total, started, active, rate };
              }).filter(r => r.total > 0).sort((a, b) => b.total - a.total);

              // Needs a decision: max attempts reached OR 45+ days stuck on same obstacle
              const todayDate = new Date(today + 'T12:00:00');
              const needsDecision = activePending
                .filter(p => {
                  const daysIn = Math.floor((todayDate - new Date(p.npeDate + 'T12:00:00')) / 86400000);
                  return p.nextTouchDate === '__MAX__' || daysIn >= 45;
                })
                .sort((a, b) => {
                  const aMax = a.nextTouchDate === '__MAX__';
                  const bMax = b.nextTouchDate === '__MAX__';
                  if (aMax !== bMax) return aMax ? -1 : 1;
                  return new Date(a.npeDate) - new Date(b.npeDate);
                });

              // Reach rate from all contact log entries
              let totalContacts = 0, reachedCount = 0, voicemailCount = 0, noAnswerCount = 0;
              tcPts.forEach(p => {
                (p.contact_log || []).forEach(entry => {
                  if (!entry.reachedPatient) return;
                  totalContacts++;
                  if (entry.reachedPatient === 'Spoke with patient') reachedCount++;
                  else if (entry.reachedPatient === 'Left voicemail') voicemailCount++;
                  else if (entry.reachedPatient === 'No answer') noAnswerCount++;
                });
              });
              const reachRate  = totalContacts > 0 ? Math.round((reachedCount / totalContacts) * 100) : null;
              const reachColor = reachRate === null ? '#9ca3af' : reachRate >= 50 ? '#10b981' : reachRate >= 30 ? '#f59e0b' : '#ef4444';

              if (winRates.length === 0 && activePending.length === 0 && totalContacts === 0) return null;

              const barColor = (rate) => rate === null ? '#9ca3af' : rate >= 50 ? '#10b981' : rate >= 25 ? '#f59e0b' : '#ef4444';

              return (
                <div style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>

                  {/* Header */}
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'20px',flexWrap:'wrap',gap:'8px'}}>
                    <h3 style={{fontSize:'14px',fontWeight:'700',color:'#374151',margin:0}}>🚧 Obstacle Intelligence</h3>
                    {activePending.length > 0 && (
                      <span style={{fontSize:'12px',color:'#6b7280'}}>{activePending.length} patient{activePending.length!==1?'s':''} in active follow-up</span>
                    )}
                  </div>

                  {/* Win Rate + Needs Decision — side by side */}
                  <div style={{display:'grid',gridTemplateColumns: needsDecision.length > 0 ? '1fr 1fr' : '1fr',gap:'24px',marginBottom: totalContacts > 0 ? '20px' : '0'}}>

                    {/* Win Rate by Obstacle */}
                    <div>
                      <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'12px'}}>
                        Win Rate by Obstacle — All Time
                      </div>
                      {winRates.length > 0 ? (
                        <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                          {winRates.map(({obs, total, started, active, rate}) => (
                            <div key={obs}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:'4px'}}>
                                <div>
                                  <span style={{fontSize:'13px',fontWeight:'600',color:'#374151'}}>{obs}</span>
                                  {active > 0 && <span style={{fontSize:'11px',color:'#6b7280',marginLeft:'6px'}}>{active} active now</span>}
                                </div>
                                <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
                                  <span style={{fontSize:'11px',color:'#9ca3af'}}>{started}/{total} started</span>
                                  <span style={{fontSize:'15px',fontWeight:'800',color:barColor(rate),minWidth:'36px',textAlign:'right'}}>{rate !== null ? `${rate}%` : '—'}</span>
                                </div>
                              </div>
                              <div style={{height:'6px',backgroundColor:'#f3f4f6',borderRadius:'3px'}}>
                                <div style={{height:'6px',borderRadius:'3px',backgroundColor:barColor(rate),width:`${rate || 0}%`}}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{fontSize:'13px',color:'#9ca3af',margin:0}}>Tag obstacles on pending patients to start tracking win rates.</p>
                      )}
                    </div>

                    {/* Needs a Decision */}
                    {needsDecision.length > 0 && (
                      <div>
                        <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'12px'}}>
                          Needs a Decision — Cadence Isn't Working
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                          {needsDecision.slice(0, 6).map(p => {
                            const daysIn = Math.floor((todayDate - new Date(p.npeDate + 'T12:00:00')) / 86400000);
                            const isMax  = p.nextTouchDate === '__MAX__';
                            return (
                              <div key={p.id} style={{padding:'9px 12px',borderRadius:'7px',backgroundColor: isMax ? '#fef2f2' : '#fffbeb',border:`1px solid ${isMax ? '#fca5a5' : '#fde68a'}`,display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px'}}>
                                <div>
                                  <div style={{fontSize:'13px',fontWeight:'700',color:'#374151'}}>{p.name}</div>
                                  <div style={{fontSize:'11px',color:'#6b7280',marginTop:'1px'}}>
                                    {p.obstacle || <span style={{fontStyle:'italic',color:'#9ca3af'}}>No obstacle tagged</span>}
                                  </div>
                                </div>
                                <div style={{display:'flex',gap:'5px',alignItems:'center',flexShrink:0}}>
                                  {isMax && <span style={{fontSize:'10px',fontWeight:'700',padding:'2px 5px',backgroundColor:'#fee2e2',color:'#991b1b',borderRadius:'4px'}}>MAX</span>}
                                  <span style={{fontSize:'13px',fontWeight:'800',color: daysIn >= 60 ? '#dc2626' : '#d97706'}}>{daysIn}d</span>
                                </div>
                              </div>
                            );
                          })}
                          {needsDecision.length > 6 && (
                            <div style={{fontSize:'12px',color:'#9ca3af',textAlign:'center',paddingTop:'4px'}}>+{needsDecision.length - 6} more — see All Patients</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reach Rate Strip */}
                  {totalContacts > 0 && (
                    <div style={{paddingTop:'16px',borderTop:'1px solid #f3f4f6'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'20px',flexWrap:'wrap'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                          <span style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.08em'}}>Reach Rate</span>
                          <span style={{fontSize:'24px',fontWeight:'800',color:reachColor,lineHeight:1}}>{reachRate}%</span>
                          <span style={{fontSize:'12px',color:'#6b7280'}}>of calls reach the patient</span>
                        </div>
                        <div style={{display:'flex',gap:'20px',marginLeft:'auto'}}>
                          {[
                            {val: reachedCount,   lbl: 'Spoke with'},
                            {val: voicemailCount, lbl: 'Voicemail'},
                            {val: noAnswerCount,  lbl: 'No Answer'},
                          ].map(({val, lbl}) => (
                            <div key={lbl} style={{textAlign:'center'}}>
                              <div style={{fontSize:'17px',fontWeight:'700',color:'#374151'}}>{val}</div>
                              <div style={{fontSize:'11px',color:'#9ca3af'}}>{lbl}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {reachRate < 40 && (
                        <div style={{marginTop:'10px',fontSize:'12px',color:'#92400e',backgroundColor:'#fef3c7',padding:'8px 12px',borderRadius:'6px',border:'1px solid #fde68a'}}>
                          📞 Reach rate is low — try texting before calling, or shift call times to late afternoon.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Best Time to Call */}
                  {(() => {
                    const buckets = [
                      { label: '8–10 AM',  start: 8,  end: 10 },
                      { label: '10–12 PM', start: 10, end: 12 },
                      { label: '12–2 PM',  start: 12, end: 14 },
                      { label: '2–4 PM',   start: 14, end: 16 },
                      { label: '4–6 PM',   start: 16, end: 18 },
                      { label: '6+ PM',    start: 18, end: 24 },
                    ].map(bucket => {
                      let total = 0, reached = 0, voicemail = 0, noAnswer = 0;
                      tcPts.forEach(p => {
                        (p.contact_log || []).forEach(entry => {
                          if (!entry.time || !entry.reachedPatient) return;
                          const hour = parseInt(entry.time.split(':')[0]);
                          if (hour >= bucket.start && hour < bucket.end) {
                            total++;
                            if (entry.reachedPatient === 'Spoke with patient') reached++;
                            else if (entry.reachedPatient === 'Left voicemail') voicemail++;
                            else noAnswer++;
                          }
                        });
                      });
                      const rate = total >= 3 ? Math.round((reached / total) * 100) : null;
                      return { ...bucket, total, reached, voicemail, noAnswer, rate };
                    }).filter(b => b.total > 0);

                    if (buckets.length === 0) return null;

                    const bestRate = Math.max(...buckets.filter(b => b.rate !== null).map(b => b.rate));
                    const bColor = (rate) => rate === null ? '#9ca3af' : rate >= 50 ? '#10b981' : rate >= 30 ? '#f59e0b' : '#ef4444';

                    return (
                      <div style={{paddingTop:'16px',borderTop:'1px solid #f3f4f6',marginTop:'4px'}}>
                        <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'12px'}}>
                          🕐 Best Time to Call — Response Rate by Time of Day
                        </div>
                        <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                          {buckets.map(b => (
                            <div key={b.label} style={{display:'flex',alignItems:'center',gap:'10px'}}>
                              <div style={{fontSize:'12px',fontWeight:'600',color:'#374151',minWidth:'72px'}}>{b.label}</div>
                              <div style={{flex:1,height:'8px',backgroundColor:'#f3f4f6',borderRadius:'4px',overflow:'hidden'}}>
                                <div style={{
                                  width: b.rate !== null ? `${b.rate}%` : '0%',
                                  height:'100%',
                                  backgroundColor: bColor(b.rate),
                                  borderRadius:'4px'
                                }} />
                              </div>
                              <div style={{fontSize:'13px',fontWeight:'700',color: bColor(b.rate),minWidth:'36px',textAlign:'right'}}>
                                {b.rate !== null ? `${b.rate}%` : '—'}
                              </div>
                              <div style={{fontSize:'11px',color:'#9ca3af',minWidth:'60px'}}>
                                {b.reached}/{b.total} calls
                              </div>
                              {b.rate === bestRate && b.rate !== null && (
                                <span style={{fontSize:'10px',fontWeight:'700',padding:'2px 6px',backgroundColor:'#dcfce7',color:'#166534',borderRadius:'4px'}}>BEST</span>
                              )}
                            </div>
                          ))}
                        </div>
                        <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'8px'}}>
                          Requires min. 3 calls in a window to show a rate. Time is captured automatically when you log a contact.
                        </div>
                      </div>
                    );
                  })()}

                </div>
              );
            })()}

            {/* ── Per-Office + Treatment Mix ── */}
            {dash.total > 0 && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
                <div style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                  <h4 style={{fontSize:'15px',fontWeight:'700',color:'#0369a1',marginBottom:'14px'}}>🏢 Carrollwood</h4>
                  {[
                    {label:'NPEs', val:dash.carTotal, goal: dashTimeframe==='month'&&carNPEGoal>0 ? carNPEGoal : null, color:'#202020'},
                    {label:'Started', val:dash.carStarted, goal: dashTimeframe==='month'&&carStartedGoal>0 ? carStartedGoal : null, color:'#10b981'},
                    {label:'Conversion', val:`${dash.carConv}%`, color:'#2563EB'},
                  ].map(row => (
                    <div key={row.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #F5F5F5',fontSize:'14px'}}>
                      <span style={{color:'#6b7280'}}>{row.label}</span>
                      <span style={{fontWeight:'700',color:row.color}}>{row.val}{row.goal ? <span style={{fontSize:'11px',color:'#9ca3af',fontWeight:'400',marginLeft:'4px'}}>/ {row.goal}</span> : null}</span>
                    </div>
                  ))}
                  {dashTimeframe==='month'&&carStartedGoal>0 && (
                    <>
                      <div style={{height:'4px',backgroundColor:'#f3f4f6',borderRadius:'2px',marginTop:'12px'}}>
                        <div style={{height:'4px',borderRadius:'2px',backgroundColor: dash.carStarted>=carStartedGoal?'#10b981':'#f59e0b',width:`${Math.min(100,Math.round((dash.carStarted/carStartedGoal)*100))}%`}}></div>
                      </div>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'5px'}}>{dash.carStarted} of {carStartedGoal} starts goal</div>
                    </>
                  )}
                </div>
                <div style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                  <h4 style={{fontSize:'15px',fontWeight:'700',color:'#86198f',marginBottom:'14px'}}>🏖️ Apollo Beach</h4>
                  {[
                    {label:'NPEs', val:dash.apoTotal, goal: dashTimeframe==='month'&&apoNPEGoal>0 ? apoNPEGoal : null, color:'#202020'},
                    {label:'Started', val:dash.apoStarted, goal: dashTimeframe==='month'&&apoStartedGoal>0 ? apoStartedGoal : null, color:'#10b981'},
                    {label:'Conversion', val:`${dash.apoConv}%`, color:'#2563EB'},
                  ].map(row => (
                    <div key={row.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #F5F5F5',fontSize:'14px'}}>
                      <span style={{color:'#6b7280'}}>{row.label}</span>
                      <span style={{fontWeight:'700',color:row.color}}>{row.val}{row.goal ? <span style={{fontSize:'11px',color:'#9ca3af',fontWeight:'400',marginLeft:'4px'}}>/ {row.goal}</span> : null}</span>
                    </div>
                  ))}
                  {dashTimeframe==='month'&&apoStartedGoal>0 && (
                    <>
                      <div style={{height:'4px',backgroundColor:'#f3f4f6',borderRadius:'2px',marginTop:'12px'}}>
                        <div style={{height:'4px',borderRadius:'2px',backgroundColor: dash.apoStarted>=apoStartedGoal?'#10b981':'#f59e0b',width:`${Math.min(100,Math.round((dash.apoStarted/apoStartedGoal)*100))}%`}}></div>
                      </div>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'5px'}}>{dash.apoStarted} of {apoStartedGoal} starts goal</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Treatment Mix ── */}
            {dash.started > 0 && (
              <div style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                <h4 style={{fontSize:'15px',fontWeight:'700',color:'#374151',marginBottom:'14px'}}>
                  🦷 Treatment Mix
                  <span style={{fontSize:'12px',color:'#9ca3af',fontWeight:'400',marginLeft:'8px'}}>Started patients · {dashTimeframe==='month'?monthLabel:'All Time'}</span>
                </h4>
                <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
                  {[
                    {label:'Braces',     count:dash.brCount,  color:'#3b82f6', bg:'#eff6ff', border:'#bfdbfe'},
                    {label:'Invisalign', count:dash.invCount, color:'#8b5cf6', bg:'#f5f3ff', border:'#ddd6fe'},
                    {label:'Phase 1',    count:dash.ph1Count, color:'#0e7490', bg:'#ecfeff', border:'#a5f3fc'},
                    {label:'Phase 2',    count:dash.ph2Count, color:'#0f766e', bg:'#f0fdfa', border:'#99f6e4'},
                    {label:'Limited',    count:dash.ltdCount, color:'#b45309', bg:'#fffbeb', border:'#fde68a'},
                  ].map(t => (
                    <div key={t.label} style={{borderRadius:'8px',padding:'12px 16px',textAlign:'center',minWidth:'80px',backgroundColor:t.bg,border:`1px solid ${t.border}`}}>
                      <div style={{fontSize:'26px',fontWeight:'800',color:t.color,lineHeight:1}}>{t.count}</div>
                      <div style={{fontSize:'11px',color:t.color,opacity:0.8,marginTop:'3px'}}>{t.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Bonus mini-card (replaces full ledger) ── */}
            <div style={{backgroundColor:'white',borderRadius:'10px',padding:'18px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'16px'}}>
              <div>
                <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'2px'}}>
                  💰 {dashTimeframe==='month'?`${monthLabel} `:'All-Time '}Bonus Earned
                </div>
                <div style={{fontSize:'32px',fontWeight:'800',color:'#10b981'}}>${dash.totalBonus}</div>
                <div style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>Across all qualifying patients</div>
              </div>
              <div style={{display:'flex',gap:'20px',flexWrap:'wrap'}}>
                {[
                  {val:`$${dash.sdsBonus}`,   lbl:`${dash.sds} SDS`},
                  {val:`$${dash.retBonus}`,   lbl:`${dash.retainers} R+`},
                  {val:`$${dash.whiteBonus}`, lbl:`${dash.whitening} W+`},
                  {val:`$${dash.pifBonus}`,   lbl:`${dash.pif} PIF`},
                ].map(b => (
                  <div key={b.lbl} style={{textAlign:'center'}}>
                    <div style={{fontSize:'16px',fontWeight:'700',color:'#374151'}}>{b.val}</div>
                    <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'1px'}}>{b.lbl}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => setCurrentView('bonus')}
                style={{backgroundColor:'#f0fdf4',border:'1px solid #bbf7d0',color:'#166534',padding:'10px 18px',borderRadius:'8px',fontSize:'13px',fontWeight:'600',cursor:'pointer'}}>
                Full Bonus Audit →
              </button>
            </div>

          </div>
          );
        })()}

        {/* PRACTICE HEALTH VIEW — removed */}
        {false && (() => {
          const curM = new Date().getMonth();
          const curY = new Date().getFullYear();
          const monthStr = `${curY}-${String(curM + 1).padStart(2, '0')}`;
          const todayStr = new Date().toISOString().split('T')[0];
          const monthLabel = new Date().toLocaleDateString('en-US', {month:'long', year:'numeric'});
          const dateLabel = new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric', year:'numeric'});

          // Current month patients
          const monthPatients = patients.filter(p => {
            const d = new Date(p.npeDate + 'T12:00:00');
            return d.getMonth() === curM && d.getFullYear() === curY;
          });
          const m = calculateMetrics(monthPatients);

          // Goals
          const mGoal = goals.monthly[curM] || {};
          const totalNPEGoal = (mGoal.carNPE || 0) + (mGoal.apoNPE || 0);
          const totalStartedGoal = (mGoal.carStarted || 0) + (mGoal.apoStarted || 0);
          const convGoal = mGoal.convGoal || 50;

          // Practice-wide on-time rate (current month, all patients)
          let otCount = 0, otTotal = 0;
          patients.forEach(p => {
            (p.contact_log || []).forEach(entry => {
              if (!entry.scheduledDate || !entry.date || !entry.date.startsWith(monthStr)) return;
              otTotal++;
              if (entry.date <= entry.scheduledDate) otCount++;
            });
          });
          const onTimeRate = otTotal > 0 ? Math.round((otCount / otTotal) * 100) : null;

          // Per-TC stats
          const perTC = tcList.map(tcName => {
            let tcOT = 0, tcOTTotal = 0;
            patients.forEach(p => {
              if (p.tc !== tcName) return;
              (p.contact_log || []).forEach(entry => {
                if (!entry.scheduledDate || !entry.date || !entry.date.startsWith(monthStr)) return;
                tcOTTotal++;
                if (entry.date <= entry.scheduledDate) tcOT++;
              });
            });
            const tcOnTimeRate = tcOTTotal > 0 ? Math.round((tcOT / tcOTTotal) * 100) : null;

            let tcBonus = 0;
            patients.forEach(p => {
              if (p.tc !== tcName) return;
              const sd = effectiveStartDate(p);
              if (!sd || !sd.startsWith(monthStr)) return;
              if (isSDS(p)) {
                tcBonus += bonusRates.sds;
              }
              if (isSDS(p) || p.DBRETS) {
                if (p['R+']) tcBonus += bonusRates.ret;
                if (p['W+']) tcBonus += bonusRates.white;
              }
              if ((isSDS(p) || p.ST) && p.PIF) tcBonus += bonusRates.pif;
            });

            const tcDueToday = patients.filter(p => {
              if (p.tc !== tcName || (!p.PEN && !p.MP && !p.OBS)) return false;
              if (!p.nextTouchDate || p.nextTouchDate === '__MAX__') return false;
              return skipWeekend(p.nextTouchDate) <= todayStr;
            }).length;

            return { name: tcName, onTimeRate: tcOnTimeRate, onTimeTotal: tcOTTotal, bonus: tcBonus, dueToday: tcDueToday };
          });

          // Queue health
          const allDueToday = patients.filter(p => {
            if (!p.PEN && !p.MP && !p.OBS) return false;
            if (!p.nextTouchDate || p.nextTouchDate === '__MAX__') return false;
            return skipWeekend(p.nextTouchDate) <= todayStr;
          }).length;
          const overdue = patients.filter(p => {
            if (!p.PEN && !p.MP && !p.OBS) return false;
            if (!p.nextTouchDate || p.nextTouchDate === '__MAX__') return false;
            return skipWeekend(p.nextTouchDate) < todayStr;
          }).length;
          const staleCutoff = new Date(todayStr + 'T12:00:00');
          staleCutoff.setDate(staleCutoff.getDate() - 14);
          const staleCutoffStr = staleCutoff.toISOString().split('T')[0];
          const staleCount = patients.filter(p => {
            if (!p.PEN && !p.MP) return false;
            const recentContact = (p.contact_log || []).some(e => e.date && e.date > staleCutoffStr);
            if (recentContact) return false;
            return !p.npeDate || p.npeDate <= staleCutoffStr;
          }).length;

          const pctColor = (pct) => pct === null ? '#9ca3af' : pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
          const pctBg = (pct) => pct === null ? '#f3f4f6' : pct >= 80 ? '#dcfce7' : pct >= 60 ? '#fef3c7' : '#fee2e2';
          const otColor = onTimeRate === null ? '#9ca3af' : onTimeRate >= 80 ? '#10b981' : onTimeRate >= 60 ? '#f59e0b' : '#ef4444';

          const kpis = [
            { label:'NPEs', value: m.total, goal: totalNPEGoal > 0 ? totalNPEGoal : null, color:'#374151' },
            { label:'Starts', value: m.started, goal: totalStartedGoal > 0 ? totalStartedGoal : null, color:'#10b981' },
            { label:'Conversion', value: `${m.overallConv}%`, goal: `${convGoal}%`, color:'#2563EB' },
            { label:'SDS Rate', value: m.started > 0 ? `${m.sdsRate}%` : '—', goal: null, color:'#3b82f6' },
            { label:'On-Time %', value: onTimeRate !== null ? `${onTimeRate}%` : '—', goal: '80%', color: otColor },
          ];

          return (
            <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
              {/* Header */}
              <div>
                <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'2px'}}>{dateLabel}</div>
                <h2 style={{fontSize:'26px',fontWeight:'800',color:'#202020',margin:0}}>Practice Health — {monthLabel}</h2>
              </div>

              {/* KPI Row */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))',gap:'14px'}}>
                {kpis.map(card => {
                  const isGoalMet = card.goal && card.value !== '—' && String(card.value).replace('%','') >= String(card.goal).replace('%','');
                  return (
                    <div key={card.label} style={{backgroundColor:'white',borderRadius:'10px',padding:'16px 18px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                      <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'6px'}}>{card.label}</div>
                      <div style={{fontSize:'28px',fontWeight:'800',color:card.color,lineHeight:1}}>{card.value}</div>
                      {card.goal && (
                        <div style={{fontSize:'11px',marginTop:'5px',color: isGoalMet ? '#10b981' : '#9ca3af'}}>
                          {isGoalMet ? '✓ Goal met' : `Goal: ${card.goal}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* TC Performance + Queue Health side by side */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>

                {/* TC Performance */}
                <div style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                  <h3 style={{fontSize:'15px',fontWeight:'700',color:'#202020',marginBottom:'16px',marginTop:0}}>TC Performance — {monthLabel}</h3>
                  {perTC.length === 0 ? (
                    <div style={{color:'#9ca3af',fontSize:'14px'}}>No TCs configured</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
                      {perTC.map(tc => (
                        <div key={tc.name}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'5px'}}>
                            <span style={{fontWeight:'600',color:'#374151'}}>{tc.name}</span>
                            <span style={{
                              fontSize:'12px',fontWeight:'700',padding:'2px 10px',borderRadius:'10px',
                              backgroundColor: pctBg(tc.onTimeRate),
                              color: pctColor(tc.onTimeRate)
                            }}>
                              {tc.onTimeRate !== null ? `${tc.onTimeRate}% on-time` : 'No data'}
                            </span>
                          </div>
                          <div style={{height:'6px',backgroundColor:'#f3f4f6',borderRadius:'3px',overflow:'hidden'}}>
                            <div style={{width:`${tc.onTimeRate || 0}%`,height:'100%',backgroundColor:pctColor(tc.onTimeRate),borderRadius:'3px'}} />
                          </div>
                          <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'3px'}}>
                            {tc.dueToday > 0
                              ? <span style={{color:'#f59e0b',fontWeight:'600'}}>{tc.dueToday} in queue today</span>
                              : <span style={{color:'#10b981'}}>Queue clear</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setCurrentView('ontime')} style={{marginTop:'16px',padding:'8px 14px',backgroundColor:'transparent',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'13px',color:'#374151',cursor:'pointer',fontWeight:'500'}}>
                    Full On-Time Audit →
                  </button>
                </div>

                {/* Queue Health */}
                <div style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                  <h3 style={{fontSize:'15px',fontWeight:'700',color:'#202020',marginBottom:'16px',marginTop:0}}>Follow-Up Queue Health</h3>
                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                    {[
                      { label:'Due today (incl. overdue)', value: allDueToday, warnIf: v => v > 0, warnColor:'#c2410c', warnBg:'#fff7ed', warnBorder:'#fed7aa', okColor:'#15803d', okBg:'#f0fdf4', okBorder:'#bbf7d0' },
                      { label:'Past due', value: overdue, warnIf: v => v > 0, warnColor:'#dc2626', warnBg:'#fee2e2', warnBorder:'#fca5a5', okColor:'#15803d', okBg:'#f0fdf4', okBorder:'#bbf7d0' },
                      { label:'14+ days no contact', value: staleCount, warnIf: v => v > 0, warnColor:'#92400e', warnBg:'#fef3c7', warnBorder:'#fde68a', okColor:'#15803d', okBg:'#f0fdf4', okBorder:'#bbf7d0' },
                    ].map(row => {
                      const warn = row.warnIf(row.value);
                      return (
                        <div key={row.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',borderRadius:'8px',backgroundColor: warn ? row.warnBg : row.okBg, border:`1px solid ${warn ? row.warnBorder : row.okBorder}`}}>
                          <span style={{fontWeight:'600',color: warn ? row.warnColor : row.okColor,fontSize:'14px'}}>{row.label}</span>
                          <span style={{fontSize:'22px',fontWeight:'800',color: warn ? row.warnColor : row.okColor}}>{row.value}</span>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => setCurrentView('followup')} style={{marginTop:'16px',width:'100%',padding:'10px',backgroundColor:'#2563EB',color:'white',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:'600',cursor:'pointer'}}>
                    View Queue →
                  </button>
                </div>
              </div>

              {/* Bonus Projections */}
              <div style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                <h3 style={{fontSize:'15px',fontWeight:'700',color:'#202020',marginBottom:'16px',marginTop:0}}>💰 Bonus Projections — {monthLabel}</h3>
                {perTC.length === 0 ? (
                  <div style={{color:'#9ca3af',fontSize:'14px'}}>No TCs configured</div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    {perTC.map(tc => {
                      const bonusGoal = 520;
                      const pct = Math.min(Math.round((tc.bonus / bonusGoal) * 100), 100);
                      return (
                        <div key={tc.name} style={{display:'flex',alignItems:'center',gap:'16px'}}>
                          <div style={{fontWeight:'600',color:'#374151',minWidth:'80px'}}>{tc.name}</div>
                          <div style={{flex:1,height:'8px',backgroundColor:'#f3f4f6',borderRadius:'4px',overflow:'hidden'}}>
                            <div style={{width:`${pct}%`,height:'100%',backgroundColor: tc.bonus >= bonusGoal ? '#10b981' : tc.bonus >= bonusGoal * 0.6 ? '#f59e0b' : '#3b82f6',borderRadius:'4px'}} />
                          </div>
                          <div style={{fontWeight:'700',color: tc.bonus >= bonusGoal ? '#10b981' : '#374151',minWidth:'50px',textAlign:'right'}}>${tc.bonus}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button onClick={() => setCurrentView('bonus')} style={{marginTop:'16px',padding:'8px 16px',backgroundColor:'transparent',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'13px',color:'#374151',cursor:'pointer',fontWeight:'500'}}>
                  Full Bonus Audit →
                </button>
              </div>

            </div>
          );
        })()}

        {/* FOLLOW-UP QUEUE */}
        {currentView === 'followup' && (
          <div style={{display:'flex',flexDirection:'column',gap:'24px'}}>
            <h2 style={{fontSize:'28px',fontWeight:'bold',color:'#202020'}}>Follow-Up Queue</h2>

            {/* Active popup bonus banner */}
            {(() => {
              const todayStr = new Date().toISOString().split('T')[0];
              const myTC = currentUser?.role === 'tc' ? currentUser.name : null;
              const activeBonuses = popupBonuses.filter(b =>
                todayStr >= b.startDate && todayStr <= b.endDate &&
                (b.tcFilter === 'All' || myTC === null || b.tcFilter === myTC)
              );
              if (activeBonuses.length === 0) return null;
              return activeBonuses.map(bonus => {
                const qualifying = patients.filter(p =>
                  (p.fromPending || p.ST) &&
                  p.startDate >= bonus.startDate && p.startDate <= bonus.endDate &&
                  (bonus.tcFilter === 'All' || p.tc === bonus.tcFilter) &&
                  (myTC === null || p.tc === myTC)
                );
                const earned = qualifying.reduce((sum, p) => sum + bonus.amount + (p['R+'] ? bonusRates.ret : 0) + (p['W+'] ? bonusRates.white : 0), 0);
                const endLabel = new Date(bonus.endDate + 'T12:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric'});
                return (
                  <div key={bonus.id} style={{backgroundColor:'#fefce8',border:'2px solid #fbbf24',borderRadius:'10px',padding:'16px 20px',display:'flex',alignItems:'center',gap:'20px',flexWrap:'wrap'}}>
                    <div style={{fontSize:'28px'}}>🎯</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:'800',fontSize:'16px',color:'#92400e'}}>{bonus.name}</div>
                      <div style={{fontSize:'13px',color:'#92400e',marginTop:'2px'}}>
                        <strong>${bonus.amount}/start + ${bonusRates.ret} retainers + ${bonusRates.white} whitening</strong> — ends {endLabel}
                        {bonus.description && <span> · {bonus.description}</span>}
                      </div>
                    </div>
                    <div style={{textAlign:'center',backgroundColor:'white',padding:'10px 18px',borderRadius:'8px',border:'1px solid #fde68a'}}>
                      <div style={{fontSize:'26px',fontWeight:'900',color:'#10b981',lineHeight:1}}>${earned}</div>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'2px'}}>{qualifying.length} starts so far</div>
                    </div>
                  </div>
                );
              });
            })()}

            {/* Week Navigation + Calendar */}
            <div style={{backgroundColor:'white',padding:'16px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                <button
                  onClick={() => { const n = weekOffset - 1; setWeekOffset(n); const m = getWeekMonday(n); setSelectedWeekDay(m.toISOString().split('T')[0]); }}
                  style={{padding:'8px 16px',backgroundColor:'#F5F5F5',border:'1px solid #d1d5db',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'14px'}}
                >
                  ◀ Prev
                </button>
                <div style={{textAlign:'center'}}>
                  <h3 style={{fontSize:'16px',fontWeight:'600',margin:0}}>
                    🗓️ {(() => {
                      const m = getWeekMonday(weekOffset);
                      const s = new Date(m);
                      s.setDate(m.getDate() + 6);
                      return `${m.toLocaleDateString('en-US',{month:'short',day:'numeric'})} - ${s.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
                    })()}
                  </h3>
                  {weekOffset !== 0 && (
                    <button
                      onClick={() => { setWeekOffset(0); setSelectedWeekDay(new Date().toISOString().split('T')[0]); }}
                      style={{marginTop:'4px',padding:'4px 12px',backgroundColor:'#2563EB',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px',fontWeight:'600'}}
                    >
                      Back to Today
                    </button>
                  )}
                </div>
                <button
                  onClick={() => { const n = weekOffset + 1; setWeekOffset(n); const m = getWeekMonday(n); setSelectedWeekDay(m.toISOString().split('T')[0]); }}
                  style={{padding:'8px 16px',backgroundColor:'#F5F5F5',border:'1px solid #d1d5db',borderRadius:'6px',cursor:'pointer',fontWeight:'600',fontSize:'14px'}}
                >
                  Next ▶
                </button>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',gap:'8px'}}>
                {(() => {
                  const monday = getWeekMonday(weekOffset);
                  const todayStr = new Date().toISOString().split('T')[0];

                  const days = [];
                  for (let i = 0; i < 7; i++) {
                    const date = new Date(monday);
                    date.setDate(monday.getDate() + i);
                    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
                    const month = date.getMonth() + 1;
                    const day = date.getDate();
                    const dateStr = date.toISOString().split('T')[0];
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedWeekDay;
                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                    const count = isWeekend ? 0 : patients.filter(p => {
                      // Regular follow-ups — normalize stored dates to skip weekends
                      const hasPending = (p.PEN || p.MP || p.OBS) && p.nextTouchDate && p.nextTouchDate !== '__MAX__';
                      const effectiveTouchDate = p.nextTouchDate ? skipWeekend(p.nextTouchDate) : '';
                      const followUpMatch = hasPending && (isToday ? effectiveTouchDate <= todayStr : effectiveTouchDate === dateStr);
                      // Bond check-ins
                      const checkDate = getBondCheckDate(p);
                      const bondMatch = checkDate && (isToday ? checkDate <= todayStr : checkDate === dateStr);
                      return followUpMatch || bondMatch;
                    }).length;

                    days.push({ dayName, dateLabel: `${month}/${day}`, count, isToday, isSelected, dateStr, isWeekend });
                  }

                  return days.map((day, i) => (
                    <button
                      key={i}
                      onClick={() => !day.isWeekend && setSelectedWeekDay(day.dateStr)}
                      disabled={day.isWeekend}
                      style={{
                        padding:'12px 8px',
                        border: day.isSelected ? '2px solid #2563EB' : day.isToday ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                        borderRadius:'8px',
                        backgroundColor: day.isWeekend ? '#f9fafb' : day.isSelected ? '#fff7ed' : day.isToday ? '#eff6ff' : 'white',
                        cursor: day.isWeekend ? 'default' : 'pointer',
                        textAlign:'center',
                        opacity: day.isWeekend ? 0.45 : 1
                      }}
                    >
                      <div style={{fontSize:'11px',color: day.isWeekend ? '#9ca3af' : day.isSelected ? '#2563EB' : '#6b7280',fontWeight: day.isSelected ? '600' : '400'}}>{day.dayName}</div>
                      <div style={{fontSize:'11px',color: day.isWeekend ? '#9ca3af' : '#374151',marginTop:'2px'}}>{day.dateLabel}</div>
                      {day.isToday && <div style={{fontSize:'9px',color:'#3b82f6',fontWeight:'700',marginTop:'2px'}}>TODAY</div>}
                      {day.isWeekend
                        ? <div style={{fontSize:'11px',color:'#d1d5db',marginTop:'6px'}}>—</div>
                        : <div style={{fontSize:'20px',fontWeight:'bold',color: day.isSelected ? '#2563EB' : day.count > 0 ? '#202020' : '#d1d5db',marginTop:'4px'}}>{day.count}</div>
                      }
                    </button>
                  ));
                })()}
              </div>
            </div>

            {/* SELECTED DAY */}
            <div>
              <h3 style={{fontSize:'20px',fontWeight:'bold',color:'#202020',marginBottom:'12px'}}>
                {selectedWeekDay === today ? '🔶 CALL TODAY' : `📅 ${new Date(selectedWeekDay + 'T12:00:00').toLocaleDateString('en-US', {weekday:'long', month:'numeric', day:'numeric'})}`}
                {' '}({selectedDayPatients.length} {selectedDayPatients.length === 1 ? 'patient' : 'patients'})
              </h3>

              {/* BOND CHECK-INS */}
              {selectedBondCheckins.length > 0 && (
                <div style={{marginBottom:'24px'}}>
                  <h4 style={{fontSize:'16px',fontWeight:'700',color:'#92400e',marginBottom:'12px',display:'flex',alignItems:'center',gap:'8px'}}>
                    <span style={{padding:'4px 12px',backgroundColor:'#fef3c7',border:'1px solid #fbbf24',borderRadius:'20px'}}>📅 Bond Appointment Check-Ins ({selectedBondCheckins.length})</span>
                  </h4>
                  {selectedBondCheckins.map(patient => {
                    const bondCheckDate = getBondCheckDate(patient);
                    const daysAgo = Math.floor((new Date(today + 'T12:00:00') - new Date(bondCheckDate + 'T12:00:00')) / 86400000);
                    return (
                      <div key={patient.id} style={{backgroundColor:'#fffbeb',padding:'20px',borderRadius:'8px',border:'2px solid #f59e0b',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',marginBottom:'16px'}}>
                        <div style={{marginBottom:'12px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'6px',flexWrap:'wrap'}}>
                            <h4 style={{fontSize:'18px',fontWeight:'bold',color:'#92400e',margin:0}}>{patient.name}</h4>
                            <span style={{fontSize:'12px',padding:'3px 10px',backgroundColor:'#fef3c7',border:'1px solid #fbbf24',borderRadius:'4px',fontWeight:'600',color:'#92400e'}}>SCH — BOND CHECK-IN</span>
                            {daysAgo > 0 && <span style={{fontSize:'12px',color:'#ef4444',fontWeight:'600'}}>⚠️ {daysAgo} day{daysAgo>1?'s':''} overdue</span>}
                          </div>
                          {patient.phone && (
                            <a href={`tel:${patient.phone}`} style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'17px',fontWeight:'700',color:'#92400e',textDecoration:'none',marginBottom:'6px',padding:'4px 10px',backgroundColor:'#fef9c3',borderRadius:'6px',border:'1px solid #fbbf24'}}>
                              📞 {patient.phone}
                            </a>
                          )}
                          <div style={{fontSize:'14px',color:'#6b7280'}}>
                            📅 NPE: {new Date(patient.npeDate + 'T12:00:00').toLocaleDateString()} • 📍 {patient.location === 'Car' ? 'Carrollwood' : 'Apollo Beach'} • 👤 {patient.tc}
                          </div>
                          <div style={{fontSize:'14px',color:'#92400e',marginTop:'4px',fontWeight:'500'}}>
                            🦷 Initial Bond was scheduled for: <strong>{new Date(patient.bondDate + 'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</strong>
                          </div>
                        </div>
                        <p style={{fontSize:'14px',color:'#374151',marginBottom:'12px',fontStyle:'italic'}}>Did the patient show up for their initial bond appointment?</p>
                        <div style={{marginBottom:'12px'}}>
                          <label style={{fontSize:'13px',fontWeight:'500',display:'block',marginBottom:'4px',color:'#374151'}}>Notes (optional — saved to contact log)</label>
                          <textarea
                            value={bondCheckNotes[patient.id] || ''}
                            onChange={(e) => setBondCheckNotes(prev => ({...prev, [patient.id]: e.target.value}))}
                            placeholder="e.g. Confirmed with mom, arriving at 2pm..."
                            style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'13px',resize:'vertical'}}
                            rows={2}
                          />
                        </div>
                        <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
                          <button
                            onClick={() => handleMarkStarted(patient)}
                            style={{padding:'12px 24px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'6px',fontWeight:'700',cursor:'pointer',fontSize:'15px'}}
                          >
                            ✅ Yes — Mark as Started
                          </button>
                          <button
                            onClick={() => { if (confirm(`Mark ${patient.name} as missed appointment? They will return to Pending with obstacle "Getting a Second Opinion".`)) handleMissedBond(patient, bondCheckNotes[patient.id] || ''); }}
                            style={{padding:'12px 24px',backgroundColor:'#ef4444',color:'white',border:'none',borderRadius:'6px',fontWeight:'700',cursor:'pointer',fontSize:'15px'}}
                          >
                            ❌ No — Missed Appointment
                          </button>
                          <button
                            onClick={() => setBondRescheduleOpen(prev => ({ ...prev, [patient.id]: !prev[patient.id] }))}
                            style={{padding:'12px 24px',backgroundColor:'#f59e0b',color:'white',border:'none',borderRadius:'6px',fontWeight:'700',cursor:'pointer',fontSize:'15px'}}
                          >
                            📅 Rescheduled
                          </button>
                        </div>
                        {bondRescheduleOpen[patient.id] && (
                          <div style={{marginTop:'14px',padding:'14px',backgroundColor:'#fffbeb',border:'1px solid #f59e0b',borderRadius:'6px'}}>
                            <label style={{fontSize:'13px',fontWeight:'600',display:'block',marginBottom:'6px',color:'#92400e'}}>New Bond Appointment Date</label>
                            <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
                              <input
                                type="date"
                                value={bondRescheduleDate[patient.id] || ''}
                                onChange={e => setBondRescheduleDate(prev => ({ ...prev, [patient.id]: e.target.value }))}
                                style={{padding:'8px 10px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}}
                              />
                              <button
                                disabled={!bondRescheduleDate[patient.id]}
                                onClick={() => handleRescheduleBond(patient, bondRescheduleDate[patient.id], bondCheckNotes[patient.id] || '')}
                                style={{padding:'8px 18px',backgroundColor: bondRescheduleDate[patient.id] ? '#f59e0b' : '#d1d5db',color:'white',border:'none',borderRadius:'6px',fontWeight:'700',cursor: bondRescheduleDate[patient.id] ? 'pointer' : 'not-allowed',fontSize:'14px'}}
                              >
                                Save New Date
                              </button>
                              <button
                                onClick={() => setBondRescheduleOpen(prev => ({ ...prev, [patient.id]: false }))}
                                style={{padding:'8px 14px',backgroundColor:'transparent',color:'#6b7280',border:'1px solid #d1d5db',borderRadius:'6px',cursor:'pointer',fontSize:'13px'}}
                              >
                                Cancel
                              </button>
                            </div>
                            {bondRescheduleDate[patient.id] && (
                              <div style={{fontSize:'12px',color:'#92400e',marginTop:'6px',fontWeight:'500'}}>
                                📅 New check-in reminder: <strong>{new Date(getBondCheckDate({SCH:true, bondDate: bondRescheduleDate[patient.id]}) + 'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</strong>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* FOLLOW-UP CONTACTS */}
              {selectedFollowUps.length > 0 && (
                <div>
                  {selectedBondCheckins.length > 0 && (
                    <h4 style={{fontSize:'16px',fontWeight:'700',color:'#1e40af',marginBottom:'12px',display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{padding:'4px 12px',backgroundColor:'#dbeafe',border:'1px solid #93c5fd',borderRadius:'20px'}}>🔔 Follow-Up Contacts ({selectedFollowUps.length})</span>
                    </h4>
                  )}
                  {selectedFollowUps.map(patient => {
                    const daysOld = Math.floor((new Date() - new Date(patient.npeDate + 'T12:00:00')) / 86400000);
                    const priority = daysOld <= 7 ? 'FRESH' : daysOld <= 21 ? 'WARM' : 'HOT';
                    return (
                <div key={patient.id} style={{backgroundColor:'white',padding:'20px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',marginBottom:'16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',marginBottom:'12px'}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',marginBottom:'4px'}}>
                        <h4 style={{fontSize:'18px',fontWeight:'bold',color:'#202020',margin:0}}>{patient.name}</h4>
                        <span style={{
                          padding:'3px 8px', fontSize:'12px', fontWeight:'600', borderRadius:'4px',
                          backgroundColor: priority === 'HOT' ? '#fee2e2' : priority === 'WARM' ? '#fed7aa' : '#fef3c7',
                          color: priority === 'HOT' ? '#991b1b' : priority === 'WARM' ? '#9a3412' : '#92400e'
                        }}>
                          {priority === 'HOT' ? '🔴 HOT' : priority === 'WARM' ? '🟠 WARM' : '🟡 FRESH'} — {daysOld}d
                        </span>
                        {/* Status badge */}
                        {patient.OBS && <span style={{fontSize:'11px',padding:'2px 8px',backgroundColor:'#F5F5F5',color:'#374151',borderRadius:'4px',fontWeight:'600'}}>OBS — 6mo Re-check</span>}
                        {patient.MP && <span style={{fontSize:'11px',padding:'2px 8px',backgroundColor:'#fef3c7',color:'#92400e',borderRadius:'4px',fontWeight:'600'}}>MEDICAID PENDING</span>}
                        {/* Treatment type badges */}
                        {[['BR','Braces'],['INV','Invisalign'],['PH1','Phase 1'],['PH2','Phase 2'],['LTD','Limited']].filter(([k]) => patient[k]).map(([k,l]) => (
                          <span key={k} style={{fontSize:'11px',padding:'2px 6px',backgroundColor:'#dbeafe',color:'#1e40af',borderRadius:'3px',fontWeight:'600'}}>{l}</span>
                        ))}
                      </div>
                      {patient.phone && (
                        <a href={`tel:${patient.phone}`} style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'18px',fontWeight:'700',color:'#1d4ed8',textDecoration:'none',marginBottom:'6px',padding:'4px 12px',backgroundColor:'#eff6ff',borderRadius:'6px',border:'1px solid #93c5fd'}}>
                          📞 {patient.phone}
                        </a>
                      )}
                      <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'2px'}}>
                        📅 NPE: {new Date(patient.npeDate + 'T12:00:00').toLocaleDateString()} • 📍 {patient.location === 'Car' ? 'Carrollwood' : 'Apollo Beach'} • 👤 {patient.tc}
                      </div>
                      {patient.obstacle && (
                        <div style={{fontSize:'13px',color:'#dc2626',fontWeight:'600',marginBottom:'2px'}}>🚧 Obstacle: {patient.obstacle}</div>
                      )}
                      {patient.notes && (
                        <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'2px',fontStyle:'italic'}}>📝 Notes: {patient.notes}</div>
                      )}
                      <div style={{fontSize:'13px',color:'#6b7280',marginTop:'2px'}}>
                        {patient.OBS
                          ? '🔄 Observation re-check'
                          : `🎯 Attempt #${patient.contactAttempts + 1} of ${(CADENCES[patient.obstacle] || DEFAULT_CADENCE).length}: ${patient.contactAttempts === 0 ? 'Initial follow-up' : patient.contactAttempts === 1 ? 'Check-in call' : patient.contactAttempts === 2 ? 'Week follow-up — identify obstacles' : 'Final attempt'}`}
                        {!patient.OBS && patient.contactAttempts >= 4 && <span style={{marginLeft:'8px',padding:'2px 8px',backgroundColor:'#fee2e2',color:'#991b1b',borderRadius:'4px',fontSize:'12px',fontWeight:'700'}}>⚠️ Max Attempts Reached</span>}
                      </div>
                      {/* FINAL ATTEMPT warning banner */}
                      {!patient.OBS && patient.contactAttempts === 3 && (
                        <div style={{marginTop:'8px',padding:'8px 12px',backgroundColor:'#fef2f2',border:'1px solid #fca5a5',borderRadius:'6px',display:'flex',alignItems:'center',gap:'8px'}}>
                          <span style={{fontSize:'16px'}}>⚠️</span>
                          <span style={{fontSize:'13px',fontWeight:'700',color:'#991b1b'}}>FINAL ATTEMPT — if no response, consider converting to No Treatment.</span>
                        </div>
                      )}
                      {patient.lastContactDate && (() => {
                        const lastLog = patient.contact_log && patient.contact_log.length > 0
                          ? patient.contact_log[patient.contact_log.length - 1] : null;
                        return (
                          <div style={{fontSize:'13px',color:'#6b7280',marginTop:'4px'}}>
                            💬 Last ({new Date(patient.lastContactDate + 'T12:00:00').toLocaleDateString()}): {lastLog ? lastLog.reachedPatient : 'Contacted'}
                            {lastLog && lastLog.outcome ? ` → ${lastLog.outcome}` : ''}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Contact History */}
                  {patient.contact_log && patient.contact_log.length > 0 && (
                    <div style={{backgroundColor:'#f9fafb',padding:'12px',borderRadius:'6px',marginBottom:'12px',borderLeft:'3px solid #d1d5db'}}>
                      <strong style={{display:'block',marginBottom:'8px',color:'#374151',fontSize:'11px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Contact History ({patient.contact_log.length})</strong>
                      {[...patient.contact_log].reverse().map((log, i, arr) => (
                        <div key={i} style={{marginBottom: i < arr.length - 1 ? '10px' : 0, paddingBottom: i < arr.length - 1 ? '10px' : 0, borderBottom: i < arr.length - 1 ? '1px solid #e5e7eb' : 'none'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginBottom:'3px'}}>
                            <span style={{fontSize:'12px',fontWeight:'700',color:'#374151'}}>
                              {new Date(log.date + 'T12:00:00').toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'})}
                            </span>
                            <span style={{fontSize:'11px',padding:'1px 6px',borderRadius:'3px',fontWeight:'500',
                              backgroundColor: log.reachedPatient === 'Spoke with patient' ? '#dcfce7' : '#f3f4f6',
                              color: log.reachedPatient === 'Spoke with patient' ? '#166534' : '#6b7280'}}>
                              {log.reachedPatient}
                            </span>
                            {log.outcome && <span style={{fontSize:'12px',color:'#6b7280'}}>→ {log.outcome}</span>}
                            {log.sentText && <span style={{fontSize:'12px'}}>📱</span>}
                          </div>
                          {log.notes && (
                            <div style={{fontSize:'12px',color:'#6b7280',fontStyle:'italic',marginLeft:'2px'}}>
                              "{log.notes}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contact Log - Expandable */}
                  {showContactLog === patient.id ? (
                    <div style={{backgroundColor:'#f9fafb',padding:'16px',borderRadius:'8px',border:'2px solid #2563EB'}}>
                      <h5 style={{fontSize:'14px',fontWeight:'600',marginBottom:'12px'}}>LOG CONTACT</h5>

                      {/* #2: relabeled to "Contact result:" */}
                      <div style={{marginBottom:'12px'}}>
                        <div style={{fontSize:'13px',fontWeight:'500',marginBottom:'8px'}}>Contact result:</div>
                        {['Left voicemail', 'No answer', 'Spoke with patient'].map(option => (
                          <label key={option} style={{display:'block',marginBottom:'4px',cursor:'pointer'}}>
                            <input
                              type="radio"
                              name={`reached-${patient.id}`}
                              value={option}
                              checked={contactForm.reachedPatient === option}
                              onChange={(e) => setContactForm({...contactForm, reachedPatient: e.target.value, outcome: ''})}
                              style={{marginRight:'8px'}}
                            />
                            {option}
                          </label>
                        ))}
                      </div>

                      {/* Outcome options — context-aware per patient type */}
                      {contactForm.reachedPatient === 'Spoke with patient' && (
                        <div style={{marginBottom:'12px',paddingLeft:'16px',borderLeft:'3px solid #10b981'}}>
                          {patient.OBS ? (
                            /* #8: OBS-specific outcomes */
                            <>
                              <div style={{fontSize:'13px',fontWeight:'500',marginBottom:'8px'}}>What's the status?</div>
                              {['Not ready yet — re-check in 6 months', 'Ready to start treatment! 🎉'].map(option => (
                                <label key={option} style={{display:'block',marginBottom:'4px',cursor:'pointer'}}>
                                  <input type="radio" name={`outcome-${patient.id}`} value={option}
                                    checked={contactForm.outcome === option}
                                    onChange={(e) => setContactForm({...contactForm, outcome: e.target.value})}
                                    style={{marginRight:'8px'}} />
                                  {option}
                                </label>
                              ))}
                              {/* #9: OBS re-check preview */}
                              {contactForm.outcome === 'Not ready yet — re-check in 6 months' && (
                                <div style={{marginTop:'8px',padding:'8px 12px',backgroundColor:'#eff6ff',borderRadius:'6px',fontSize:'12px',color:'#1e40af',fontWeight:'500'}}>
                                  📅 Next re-check: <strong>{new Date(addMonths(new Date().toISOString().split('T')[0], 6) + 'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'})}</strong>
                                </div>
                              )}
                            </>
                          ) : patient.MP ? (
                            /* #7: MP-specific outcomes */
                            <>
                              <div style={{fontSize:'13px',fontWeight:'500',marginBottom:'8px'}}>Medicaid status update?</div>
                              {['Still waiting on Medicaid approval', 'Medicaid denied — converting to Pending', 'Medicaid approved — ready to schedule! 🎉'].map(option => (
                                <label key={option} style={{display:'block',marginBottom:'4px',cursor:'pointer'}}>
                                  <input type="radio" name={`outcome-${patient.id}`} value={option}
                                    checked={contactForm.outcome === option}
                                    onChange={(e) => setContactForm({...contactForm, outcome: e.target.value})}
                                    style={{marginRight:'8px'}} />
                                  {option}
                                </label>
                              ))}
                            </>
                          ) : (
                            /* Standard PEN outcomes */
                            <>
                              <div style={{fontSize:'13px',fontWeight:'500',marginBottom:'8px'}}>What's the outcome?</div>
                              {['Getting a second opinion', 'Addressed their concerns', 'Ready to schedule! 🎉', 'Not interested'].map(option => (
                                <label key={option} style={{display:'block',marginBottom:'4px',cursor:'pointer'}}>
                                  <input type="radio" name={`outcome-${patient.id}`} value={option}
                                    checked={contactForm.outcome === option}
                                    onChange={(e) => setContactForm({...contactForm, outcome: e.target.value})}
                                    style={{marginRight:'8px'}} />
                                  {option}
                                </label>
                              ))}
                            </>
                          )}
                        </div>
                      )}

                      {/* #6: Obstacle update field for PEN/MP patients */}
                      {(patient.PEN || patient.MP) && (
                        <div style={{marginBottom:'12px'}}>
                          <label style={{fontSize:'13px',fontWeight:'500',display:'block',marginBottom:'4px'}}>
                            Update Obstacle <span style={{color:'#6b7280',fontWeight:'400'}}>(optional — leave blank to keep current)</span>
                          </label>
                          <select
                            value={contactForm.obstacle}
                            onChange={(e) => setContactForm({...contactForm, obstacle: e.target.value})}
                            style={{padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',width:'100%',fontSize:'13px'}}
                          >
                            <option value="">— Keep current: {patient.obstacle || 'None'} —</option>
                            {OBSTACLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      )}

                      <label style={{display:'block',marginBottom:'12px',cursor:'pointer'}}>
                        <input
                          type="checkbox"
                          checked={contactForm.sentText}
                          onChange={(e) => setContactForm({...contactForm, sentText: e.target.checked})}
                          style={{marginRight:'8px'}}
                        />
                        Sent follow-up text
                      </label>

                      <div style={{marginBottom:'12px'}}>
                        <label style={{fontSize:'13px',fontWeight:'500',display:'block',marginBottom:'4px'}}>Notes (optional)</label>
                        <textarea
                          value={contactForm.notes}
                          onChange={(e) => setContactForm({...contactForm, notes: e.target.value})}
                          style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}}
                          rows={2}
                        />
                      </div>

                      {/* Next touch date — hidden for OBS (always auto +6mo) */}
                      {!patient.OBS && (
                        <div style={{marginBottom:'12px'}}>
                          <label style={{fontSize:'13px',fontWeight:'500',display:'block',marginBottom:'4px'}}>
                            Next Touch Date <span style={{color:'#6b7280',fontWeight:'400'}}>(optional — leave blank to auto-calculate)</span>
                          </label>
                          <input
                            type="date"
                            value={contactForm.nextTouchDate || ''}
                            onChange={(e) => {
                              if (!e.target.value) { setContactForm({...contactForm, nextTouchDate: ''}); return; }
                              const value = skipWeekend(e.target.value);
                              setContactForm({...contactForm, nextTouchDate: value});
                            }}
                            style={{padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}}
                          />
                          {/* #3: formatted auto-date preview */}
                          {!contactForm.nextTouchDate && (
                            <span style={{fontSize:'12px',color:'#10b981',marginLeft:'8px'}}>
                              Auto: {(() => {
                                const p = patients.find(x => x.id === showContactLog);
                                if (!p) return '—';
                                const todayPreview = new Date().toISOString().split('T')[0];
                                const eff = (contactForm.obstacle || p.obstacle) || (p.MP ? 'Waiting to Hear from Medicaid' : '');
                                const n = calcNextTouchDate(p.npeDate, eff, p.contactAttempts + 1, todayPreview);
                                if (n === '__MAX__') return '⚠️ Max attempts';
                                return new Date(n + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'});
                              })()}
                            </span>
                          )}
                        </div>
                      )}
                      {patient.OBS && (
                        <div style={{marginBottom:'12px',padding:'8px 12px',backgroundColor:'#f0fdf4',borderRadius:'6px',fontSize:'12px',color:'#166534',fontWeight:'500'}}>
                          ♻️ Saving will auto-schedule next re-check for <strong>{new Date(addMonths(new Date().toISOString().split('T')[0], 6) + 'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</strong>
                        </div>
                      )}

                      <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                        <button
                          onClick={() => handleSaveContact(patient.id)}
                          style={{padding:'10px 20px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer'}}
                        >
                          💾 Save Contact
                        </button>
                        {/* Mark Started: Ready to schedule (PEN) OR Medicaid approved (MP) OR Ready to start (OBS) */}
                        {(contactForm.outcome === 'Ready to schedule! 🎉' || contactForm.outcome === 'Medicaid approved — ready to schedule! 🎉' || contactForm.outcome === 'Ready to start treatment! 🎉') && (
                          <button
                            onClick={() => handleMarkStarted(patient)}
                            style={{padding:'10px 20px',backgroundColor:'#2563EB',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer'}}
                          >
                            🎯 Mark Started
                          </button>
                        )}
                        {/* #4: Convert to NOTX when Not interested */}
                        {contactForm.outcome === 'Not interested' && (
                          <button
                            onClick={() => { if (confirm(`Convert ${patient.name} to No Treatment? This will remove them from the follow-up queue.`)) handleConvertToNotx(patient.id); }}
                            style={{padding:'10px 20px',backgroundColor:'#6b7280',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer'}}
                          >
                            🚫 Convert to No Treatment
                          </button>
                        )}
                        <button
                          onClick={() => {setShowContactLog(null); setContactForm({reachedPatient: '', outcome: '', sentText: false, notes: '', nextTouchDate: '', obstacle: ''});}}
                          style={{padding:'10px 20px',backgroundColor:'#e5e7eb',color:'#374151',border:'none',borderRadius:'6px',cursor:'pointer'}}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{display:'flex',gap:'8px'}}>
                      <button
                        onClick={() => { setShowContactLog(patient.id); setContactForm({reachedPatient: '', outcome: '', sentText: false, notes: '', nextTouchDate: '', obstacle: ''}); }}
                        style={{padding:'8px 16px',backgroundColor:'#3b82f6',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'14px'}}
                      >
                        LOG CONTACT ▼
                      </button>
                      <button
                        onClick={() => handleMarkStarted(patient)}
                        style={{padding:'8px 16px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'14px'}}
                      >
                        🎯 Mark Started
                      </button>
                      <button
                        onClick={() => { setShowEditModal(patient); setEditForm(patient); }}
                        style={{padding:'8px 16px',backgroundColor:'#6b7280',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'14px'}}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => setPushDateOpen(prev => ({ ...prev, [patient.id]: !prev[patient.id] }))}
                        style={{padding:'8px 16px',backgroundColor:'#f59e0b',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'14px'}}
                      >
                        📅 Push Date
                      </button>
                    </div>
                  )}

                  {/* Push follow-up date inline form */}
                  {pushDateOpen[patient.id] && (
                    <div style={{marginTop:'12px',padding:'14px',backgroundColor:'#fffbeb',border:'1px solid #f59e0b',borderRadius:'8px'}}>
                      <div style={{fontSize:'13px',fontWeight:'600',color:'#92400e',marginBottom:'8px'}}>
                        📅 Push follow-up reminder to a later date
                      </div>
                      <div style={{fontSize:'12px',color:'#92400e',marginBottom:'10px'}}>
                        Current: <strong>{patient.nextTouchDate ? new Date(patient.nextTouchDate + 'T12:00:00').toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'}) : '—'}</strong>
                      </div>
                      <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
                        <input
                          type="date"
                          value={pushDateValue[patient.id] || ''}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={e => setPushDateValue(prev => ({ ...prev, [patient.id]: e.target.value }))}
                          style={{padding:'8px 10px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}}
                        />
                        <button
                          disabled={!pushDateValue[patient.id]}
                          onClick={() => handlePushDate(patient.id)}
                          style={{padding:'8px 18px',backgroundColor: pushDateValue[patient.id] ? '#f59e0b' : '#d1d5db',color:'white',border:'none',borderRadius:'6px',fontWeight:'700',cursor: pushDateValue[patient.id] ? 'pointer' : 'not-allowed',fontSize:'14px'}}
                        >
                          Save New Date
                        </button>
                        <button
                          onClick={() => setPushDateOpen(prev => ({ ...prev, [patient.id]: false }))}
                          style={{padding:'8px 14px',backgroundColor:'transparent',color:'#6b7280',border:'1px solid #d1d5db',borderRadius:'6px',cursor:'pointer',fontSize:'13px'}}
                        >
                          Cancel
                        </button>
                      </div>
                      <div style={{fontSize:'11px',color:'#92400e',marginTop:'8px'}}>
                        No contact will be logged — this only moves the reminder date.
                      </div>
                    </div>
                  )}
                </div>
              ); })}
                </div>
              )}

              {selectedDayPatients.length === 0 && (
                <div style={{backgroundColor:'white',padding:'48px',borderRadius:'8px',textAlign:'center'}}>
                  <div style={{fontSize:'48px',marginBottom:'16px'}}>✅</div>
                  <h4 style={{fontSize:'20px',fontWeight:'bold',color:'#202020',marginBottom:'8px'}}>All Clear!</h4>
                  <p style={{color:'#6b7280'}}>No follow-ups scheduled for {selectedWeekDay === today ? 'today' : 'this day'}</p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ADD NPE */}
        {currentView === 'add' && (
          <div style={{maxWidth:'700px'}}>
            <h2 style={{fontSize:'28px',fontWeight:'bold',color:'#202020',marginBottom:'24px'}}>Add New Patient</h2>
            <div style={{backgroundColor:'white',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>

              {/* Name + Phone */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                <div>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Patient Name *</label>
                  <input type="text" placeholder="John Smith"
                    value={newPatientForm.name}
                    onChange={e => setNewPatientForm({...newPatientForm, name: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
                </div>
                <div>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Phone Number</label>
                  <input type="tel" placeholder="(813) 555-0000"
                    value={newPatientForm.phone}
                    onChange={e => setNewPatientForm({...newPatientForm, phone: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
                </div>
              </div>

              {/* NPE Date + Location */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                <div>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>NPE Date *</label>
                  <input type="date"
                    value={newPatientForm.npeDate}
                    onChange={e => setNewPatientForm({...newPatientForm, npeDate: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
                </div>
                <div>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Location *</label>
                  <select value={newPatientForm.location}
                    onChange={e => setNewPatientForm({...newPatientForm, location: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}}>
                    <option value="Car">Carrollwood</option>
                    <option value="Apo">Apollo Beach</option>
                  </select>
                </div>
              </div>

              {/* Down Payment + TC */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
                <div>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Down Payment</label>
                  <input type="text"
                    placeholder={newPatientForm.status === 'MP' ? '$0' : '$500'}
                    value={newPatientForm.dp}
                    onChange={e => setNewPatientForm({...newPatientForm, dp: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
                </div>
                <div>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Treatment Coordinator</label>
                  <select value={newPatientForm.tc}
                    onChange={e => setNewPatientForm({...newPatientForm, tc: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}}>
                    {tcList.map(tc => <option key={tc} value={tc}>{tc}</option>)}
                  </select>
                </div>
              </div>

              {/* Status */}
              <div style={{marginBottom:'16px'}}>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'8px'}}>Status *</label>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:'8px'}}>
                  {[
                    {value:'SDS', label:'SDS - Same Day Start', sub:`Started today (+$${bonusRates.sds} bonus)`, bg:'#fef3c7', border:'#fbbf24', subColor:'#92400e'},
                    {value:'ST',  label:'ST - Started',          sub:'Scheduled start, not same day', subColor:'#6b7280'},
                    {value:'SCH', label:'SCH - Scheduled',       sub:'Enter bond date below', subColor:'#1e40af'},
                    {value:'PEN', label:'PEN - Pending',         sub:'Follow-up auto-schedules by obstacle', subColor:'#6b7280'},
                    {value:'OBS', label:'OBS - Observation',     sub:'6-month re-check auto-schedules', subColor:'#6b7280'},
                    {value:'MP',  label:'MP - Medicaid Pending', sub:'14-day follow-up auto-schedules', subColor:'#6b7280'},
                    {value:'NOTX',label:'NOTX - No TX',          sub:'Will not appear in any queue', subColor:'#991b1b'},
                    {value:'DBRETS', label:'DB/RETS - Finishing',  sub:'Debond / retainer / whitening visit', bg:'#f0fdf4', border:'#86efac', subColor:'#166534'},
                  ].map(opt => (
                    <label key={opt.value} style={{display:'flex',alignItems:'center',cursor:'pointer',padding:'10px',
                      backgroundColor: newPatientForm.status===opt.value ? (opt.bg||'#eff6ff') : 'white',
                      border: `2px solid ${newPatientForm.status===opt.value ? (opt.border||'#3b82f6') : '#d1d5db'}`,
                      borderRadius:'6px'}}>
                      <input type="radio" name="status" value={opt.value}
                        checked={newPatientForm.status === opt.value}
                        onChange={e => {
                          const s = e.target.value;
                          const updates = {...newPatientForm, status: s};
                          if (s === 'MP' && !newPatientForm.obstacle) updates.obstacle = 'Waiting to Hear from Medicaid';
                          setNewPatientForm(updates);
                        }}
                        style={{marginRight:'8px'}} />
                      <div>
                        <strong>{opt.label}</strong>
                        {opt.sub && <div style={{fontSize:'11px',color:opt.subColor||'#6b7280',marginTop:'1px'}}>{opt.sub}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* SCH: Bond Date with live check-in preview */}
              {newPatientForm.status === 'SCH' && (
                <div style={{marginBottom:'16px',padding:'16px',backgroundColor:'#fffbeb',borderRadius:'8px',border:'2px solid #f59e0b'}}>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'600',marginBottom:'6px',color:'#92400e'}}>🦷 Initial Bond Date *</label>
                  <input type="date"
                    value={newPatientForm.bondDate || ''}
                    onChange={e => setNewPatientForm({...newPatientForm, bondDate: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'2px solid #f59e0b',borderRadius:'4px',fontSize:'14px'}} />
                  {newPatientForm.bondDate ? (() => {
                    const autoCheckDate = getBondCheckDate({SCH:true, bondDate:newPatientForm.bondDate});
                    const displayCheckDate = newPatientForm.nextTouchOverride ? skipWeekend(newPatientForm.nextTouchOverride) : autoCheckDate;
                    return autoCheckDate ? (
                      <div style={{marginTop:'10px'}}>
                        <div style={{fontSize:'12px',color:'#92400e',marginBottom:'8px',fontWeight:'500'}}>
                          📅 Bond check-in reminder: <strong>{new Date(displayCheckDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'numeric',day:'numeric'})}</strong>
                          {newPatientForm.nextTouchOverride && <span style={{marginLeft:'6px',fontStyle:'italic'}}>(custom)</span>}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                          <label style={{fontSize:'13px',color:'#92400e',fontWeight:'500'}}>Override reminder date:</label>
                          <input
                            type="date"
                            value={newPatientForm.nextTouchOverride || ''}
                            onChange={e => setNewPatientForm({...newPatientForm, nextTouchOverride: e.target.value})}
                            style={{padding:'6px 8px',border:'1px solid #f59e0b',borderRadius:'4px',fontSize:'13px'}}
                          />
                          {newPatientForm.nextTouchOverride && (
                            <button
                              type="button"
                              onClick={() => setNewPatientForm({...newPatientForm, nextTouchOverride: ''})}
                              style={{fontSize:'12px',color:'#92400e',background:'none',border:'1px solid #f59e0b',borderRadius:'4px',padding:'4px 8px',cursor:'pointer'}}
                            >Reset to auto</button>
                          )}
                        </div>
                      </div>
                    ) : null;
                  })()
                  : <div style={{fontSize:'12px',color:'#b45309',marginTop:'4px'}}>Enter bond date to see check-in reminder date</div>}
                </div>
              )}

              {/* PEN / MP: Obstacle */}
              {(newPatientForm.status === 'PEN' || newPatientForm.status === 'MP') && (
                <div style={{marginBottom:'16px'}}>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Obstacle</label>
                  <select value={newPatientForm.obstacle}
                    onChange={e => setNewPatientForm({...newPatientForm, obstacle: e.target.value})}
                    style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}}>
                    <option value="">None</option>
                    {OBSTACLE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              )}

              {/* Live preview callout */}
              {(() => {
                const s = newPatientForm.status;
                if (!s) return null;
                if (s === 'SDS') return (
                  <div style={{padding:'12px 16px',backgroundColor:'#dcfce7',borderRadius:'8px',border:'1px solid #86efac',marginBottom:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
                    <span style={{fontSize:'22px'}}>✅</span>
                    <div>
                      <div style={{fontWeight:'700',color:'#166534'}}>Same Day Start — will appear in Bonus Audit</div>
                      <div style={{fontSize:'12px',color:'#166534',marginTop:'2px'}}>
                        Bonus: ${bonusRates.sds} SDS{newPatientForm['R+'] ? ` + $${bonusRates.ret} retainers` : ''}{newPatientForm['W+'] ? ` + $${bonusRates.white} whitening` : ''}
                      </div>
                    </div>
                  </div>
                );
                if (s === 'ST') return (
                  <div style={{padding:'12px 16px',backgroundColor:'#dcfce7',borderRadius:'8px',border:'1px solid #86efac',marginBottom:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
                    <span style={{fontSize:'22px'}}>✅</span>
                    <span style={{fontWeight:'700',color:'#166534'}}>Started — will appear in Bonus Audit</span>
                  </div>
                );
                if (s === 'SCH') return (
                  <div style={{padding:'12px 16px',backgroundColor:'#eff6ff',borderRadius:'8px',border:'1px solid #bfdbfe',marginBottom:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
                    <span style={{fontSize:'22px'}}>🦷</span>
                    <span style={{fontWeight:'600',color:'#1e40af'}}>Scheduled — bond check-in will fire the day after the bond date above</span>
                  </div>
                );
                if (s === 'PEN' || s === 'MP') {
                  const effObs = newPatientForm.obstacle || (s === 'MP' ? 'Waiting to Hear from Medicaid' : '');
                  const autoDate = calcNextTouchDate(newPatientForm.npeDate, effObs, 0, '');
                  if (autoDate === '__MAX__') return null;
                  const displayDate = newPatientForm.nextTouchOverride ? skipWeekend(newPatientForm.nextTouchOverride) : autoDate;
                  return (
                    <div style={{padding:'14px 16px',backgroundColor:'#fffbeb',borderRadius:'8px',border:'1px solid #fde68a',marginBottom:'16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'10px'}}>
                        <span style={{fontSize:'22px'}}>📅</span>
                        <div>
                          <div style={{fontWeight:'700',color:'#92400e'}}>First follow-up: {new Date(displayDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
                          <div style={{fontSize:'12px',color:'#92400e',marginTop:'2px'}}>
                            {newPatientForm.nextTouchOverride ? 'Custom date set' : `${effObs || 'Default'} cadence — auto-scheduled`}
                          </div>
                        </div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                        <label style={{fontSize:'13px',color:'#92400e',fontWeight:'500'}}>Override date:</label>
                        <input
                          type="date"
                          value={newPatientForm.nextTouchOverride || ''}
                          onChange={e => setNewPatientForm({...newPatientForm, nextTouchOverride: e.target.value})}
                          style={{padding:'6px 8px',border:'1px solid #f59e0b',borderRadius:'4px',fontSize:'13px'}}
                        />
                        {newPatientForm.nextTouchOverride && (
                          <button
                            type="button"
                            onClick={() => setNewPatientForm({...newPatientForm, nextTouchOverride: ''})}
                            style={{fontSize:'12px',color:'#92400e',background:'none',border:'1px solid #f59e0b',borderRadius:'4px',padding:'4px 8px',cursor:'pointer'}}
                          >Reset to auto</button>
                        )}
                      </div>
                    </div>
                  );
                }
                if (s === 'OBS') {
                  const autoRecheck = addMonths(newPatientForm.npeDate, 6);
                  const displayDate = newPatientForm.nextTouchOverride ? skipWeekend(newPatientForm.nextTouchOverride) : autoRecheck;
                  return (
                    <div style={{padding:'14px 16px',backgroundColor:'#F5F5F5',borderRadius:'8px',border:'1px solid #d1d5db',marginBottom:'16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'10px'}}>
                        <span style={{fontSize:'22px'}}>🔄</span>
                        <div>
                          <div style={{fontWeight:'700',color:'#374151'}}>Re-check: {new Date(displayDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
                          <div style={{fontSize:'12px',color:'#6b7280',marginTop:'2px'}}>{newPatientForm.nextTouchOverride ? 'Custom date set' : '6-month auto-scheduled'} — will reappear in follow-up queue</div>
                        </div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                        <label style={{fontSize:'13px',color:'#374151',fontWeight:'500'}}>Override date:</label>
                        <input
                          type="date"
                          value={newPatientForm.nextTouchOverride || ''}
                          onChange={e => setNewPatientForm({...newPatientForm, nextTouchOverride: e.target.value})}
                          style={{padding:'6px 8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'13px'}}
                        />
                        {newPatientForm.nextTouchOverride && (
                          <button
                            type="button"
                            onClick={() => setNewPatientForm({...newPatientForm, nextTouchOverride: ''})}
                            style={{fontSize:'12px',color:'#6b7280',background:'none',border:'1px solid #d1d5db',borderRadius:'4px',padding:'4px 8px',cursor:'pointer'}}
                          >Reset to 6 months</button>
                        )}
                      </div>
                    </div>
                  );
                }
                if (s === 'NOTX') return (
                  <div style={{padding:'12px 16px',backgroundColor:'#fef2f2',borderRadius:'8px',border:'1px solid #fecaca',marginBottom:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
                    <span style={{fontSize:'22px'}}>🚫</span>
                    <span style={{fontWeight:'700',color:'#991b1b'}}>No Treatment — will not appear in any follow-up queue</span>
                  </div>
                );
                return null;
              })()}

              {/* Treatment Type — hidden for NOTX */}
              {newPatientForm.status !== 'NOTX' && (
                <div style={{marginBottom:'16px'}}>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'8px'}}>Treatment Type</label>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:'8px'}}>
                    {[['BR','Braces'],['INV','Invisalign'],['PH1','Phase 1'],['PH2','Phase 2'],['LTD','Limited']].map(([key, label]) => (
                      <label key={key} style={{display:'flex',alignItems:'center',cursor:'pointer',padding:'6px',border:'1px solid #e5e7eb',borderRadius:'4px',backgroundColor: newPatientForm[key] ? '#eff6ff' : 'white'}}>
                        <input type="checkbox"
                          checked={newPatientForm[key]}
                          onChange={e => setNewPatientForm({...newPatientForm, [key]: e.target.checked})}
                          style={{marginRight:'6px'}} />
                        <span style={{fontSize:'13px'}}>{key} <span style={{color:'#6b7280'}}>({label})</span></span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Add-ons — only for SDS, ST, or DB/RETS */}
              {(newPatientForm.status === 'SDS' || newPatientForm.status === 'ST' || newPatientForm.status === 'DBRETS') && (
                <div style={{marginBottom:'16px',padding:'14px',backgroundColor:'#f0fdf4',borderRadius:'8px',border:'1px solid #bbf7d0'}}>
                  <label style={{display:'block',fontSize:'14px',fontWeight:'600',marginBottom:'10px',color:'#166534'}}>Add-ons</label>
                  <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
                    {[['R+','Retainers',`+$${bonusRates.ret}`],['W+','Whitening',`+$${bonusRates.white}`],['PIF','Paid In Full','']].map(([key, label, bonus]) => (
                      <label key={key} style={{display:'flex',alignItems:'center',cursor:'pointer',padding:'8px 12px',border:`2px solid ${newPatientForm[key] ? '#86efac' : '#d1d5db'}`,borderRadius:'6px',backgroundColor: newPatientForm[key] ? '#dcfce7' : 'white'}}>
                        <input type="checkbox"
                          checked={newPatientForm[key]}
                          onChange={e => setNewPatientForm({...newPatientForm, [key]: e.target.checked})}
                          style={{marginRight:'6px'}} />
                        <span style={{fontWeight:'500',fontSize:'13px'}}>{key} ({label})</span>
                        {bonus && <span style={{color:'#16a34a',fontWeight:'700',marginLeft:'6px',fontSize:'13px'}}>{bonus}</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{marginBottom:'16px'}}>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Notes</label>
                <textarea placeholder="Enter any notes about this patient..."
                  value={newPatientForm.notes}
                  onChange={e => setNewPatientForm({...newPatientForm, notes: e.target.value})}
                  style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}} rows={3} />
              </div>

              {/* Next Touch Override — only PEN/MP, moved to bottom */}
              {(newPatientForm.status === 'PEN' || newPatientForm.status === 'MP') && (
                <div style={{marginBottom:'20px',padding:'12px',backgroundColor:'#f9fafb',borderRadius:'8px',border:'1px solid #e5e7eb'}}>
                  <label style={{display:'block',fontSize:'13px',fontWeight:'500',marginBottom:'4px',color:'#6b7280'}}>Override Follow-Up Date <span style={{fontWeight:'400'}}>(optional — leave blank to use the auto date shown above)</span></label>
                  <input type="date"
                    value={newPatientForm.nextTouchOverride || ''}
                    onChange={e => setNewPatientForm({...newPatientForm, nextTouchOverride: e.target.value})}
                    style={{padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',maxWidth:'200px'}} />
                </div>
              )}

              {addPatientError && (
                <div style={{marginBottom:'12px',padding:'10px 14px',backgroundColor:'#fef2f2',border:'1px solid #fca5a5',borderRadius:'6px',color:'#dc2626',fontSize:'14px',fontWeight:'500'}}>
                  ⚠️ {addPatientError}
                </div>
              )}
              <button onClick={handleAddPatient} style={{padding:'12px 32px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer',fontSize:'16px'}}>
                ➕ Add Patient
              </button>
            </div>
          </div>
        )}

        {/* ALL PATIENTS */}
        {currentView === 'patients' && (
          <div>
            <h2 style={{fontSize:'28px',fontWeight:'bold',color:'#202020',marginBottom:'16px'}}>All Patients</h2>
            <input
              type="text"
              placeholder="🔍 Search patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{width:'100%',maxWidth:'400px',padding:'12px',border:'1px solid #d1d5db',borderRadius:'8px',marginBottom:'24px',fontSize:'14px'}}
            />
            {patients.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map(patient => (
              <div key={patient.id} style={{backgroundColor:'white',padding:'16px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',marginBottom:'12px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:'16px'}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'8px'}}>
                      <h4 style={{fontSize:'18px',fontWeight:'bold',color:'#202020',margin:0}}>{patient.name}</h4>
                      <div style={{display:'flex',gap:'6px'}}>
                        {(patient.ST || isSDS(patient)) && (
                          <span style={{fontSize:'11px',padding:'3px 8px',backgroundColor:'#dcfce7',color:'#166534',borderRadius:'4px',fontWeight:'600'}}>{isSDS(patient) ? 'SDS' : 'STARTED'}</span>
                        )}
                        {patient.PEN && (
                          <span style={{fontSize:'11px',padding:'3px 8px',backgroundColor:'#fed7aa',color:'#9a3412',borderRadius:'4px',fontWeight:'600'}}>PENDING</span>
                        )}
                        {patient.SCH && (
                          <span style={{fontSize:'11px',padding:'3px 8px',backgroundColor:'#dbeafe',color:'#1e40af',borderRadius:'4px',fontWeight:'600'}}>SCHEDULED</span>
                        )}
                        {patient.OBS && (
                          <span style={{fontSize:'11px',padding:'3px 8px',backgroundColor:'#F5F5F5',color:'#374151',borderRadius:'4px',fontWeight:'600'}}>OBSERVATION</span>
                        )}
                        {patient.MP && (
                          <span style={{fontSize:'11px',padding:'3px 8px',backgroundColor:'#fef3c7',color:'#92400e',borderRadius:'4px',fontWeight:'600'}}>MEDICAID PENDING</span>
                        )}
                        {patient.NOTX && (
                          <span style={{fontSize:'11px',padding:'3px 8px',backgroundColor:'#fee2e2',color:'#991b1b',borderRadius:'4px',fontWeight:'600'}}>NO TX</span>
                        )}
                      </div>
                    </div>
                    <div style={{fontSize:'14px',color:'#6b7280',marginBottom:'4px'}}>
                      📅 {new Date(patient.npeDate + 'T12:00:00').toLocaleDateString()} • 📍 {patient.location === 'Car' ? 'Carrollwood' : 'Apollo Beach'} • 💰 {patient.dp} • 👤 {patient.tc}
                      {patient.startDate && ` • 🦷 Started: ${new Date(patient.startDate + 'T12:00:00').toLocaleDateString()}`}
                    </div>
                    {patient.phone && <div style={{fontSize:'13px',color:'#374151',marginBottom:'4px',fontWeight:'500'}}>📞 {patient.phone}</div>}
                    {/* Treatment type badges */}
                    {(() => {
                      const txTypes = [['BR','Braces'],['INV','Invisalign'],['PH1','Phase 1'],['PH2','Phase 2'],['LTD','Limited']].filter(([k]) => patient[k]);
                      return txTypes.length > 0 ? (
                        <div style={{display:'flex',gap:'4px',flexWrap:'wrap',marginBottom:'4px'}}>
                          {txTypes.map(([k,l]) => (
                            <span key={k} style={{fontSize:'11px',padding:'2px 6px',backgroundColor:'#dbeafe',color:'#1e40af',borderRadius:'3px',fontWeight:'600'}}>{l}</span>
                          ))}
                          {patient['R+'] && <span style={{fontSize:'11px',padding:'2px 6px',backgroundColor:'#e0e7ff',color:'#3730a3',borderRadius:'3px',fontWeight:'600'}}>Retainers</span>}
                          {patient['W+'] && <span style={{fontSize:'11px',padding:'2px 6px',backgroundColor:'#fce7f3',color:'#831843',borderRadius:'3px',fontWeight:'600'}}>Whitening</span>}
                          {patient.PIF && <span style={{fontSize:'11px',padding:'2px 6px',backgroundColor:'#dcfce7',color:'#166534',borderRadius:'3px',fontWeight:'600'}}>PIF</span>}
                        </div>
                      ) : null;
                    })()}
                    {patient.obstacle && (
                      <div style={{fontSize:'13px',color:'#ef4444',marginBottom:'2px',fontWeight:'500'}}>🚧 {patient.obstacle}</div>
                    )}
                    {patient.notes && <div style={{fontSize:'13px',color:'#6b7280',marginBottom:'4px'}}>{patient.notes}</div>}
                    {/* Contact History */}
                    {patient.contact_log && patient.contact_log.length > 0 && (
                      <div style={{marginTop:'6px',marginBottom:'6px',backgroundColor:'#f9fafb',padding:'10px',borderRadius:'6px',borderLeft:'3px solid #d1d5db'}}>
                        <strong style={{display:'block',marginBottom:'6px',color:'#374151',fontSize:'11px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Contact History ({patient.contact_log.length})</strong>
                        {[...patient.contact_log].reverse().map((log, i, arr) => (
                          <div key={i} style={{marginBottom: i < arr.length - 1 ? '8px' : 0, paddingBottom: i < arr.length - 1 ? '8px' : 0, borderBottom: i < arr.length - 1 ? '1px solid #e5e7eb' : 'none'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap',marginBottom:'2px'}}>
                              <span style={{fontSize:'12px',fontWeight:'700',color:'#374151'}}>
                                {new Date(log.date + 'T12:00:00').toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'})}
                              </span>
                              <span style={{fontSize:'11px',padding:'1px 5px',borderRadius:'3px',fontWeight:'500',
                                backgroundColor: log.reachedPatient === 'Spoke with patient' ? '#dcfce7' : '#f3f4f6',
                                color: log.reachedPatient === 'Spoke with patient' ? '#166534' : '#6b7280'}}>
                                {log.reachedPatient}
                              </span>
                              {log.outcome && <span style={{fontSize:'12px',color:'#6b7280'}}>→ {log.outcome}</span>}
                              {log.sentText && <span style={{fontSize:'12px'}}>📱</span>}
                            </div>
                            {log.notes && (
                              <div style={{fontSize:'12px',color:'#6b7280',fontStyle:'italic',marginLeft:'2px'}}>
                                "{log.notes}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {(patient.PEN || patient.OBS || patient.MP) && (
                      <div style={{marginTop:'8px',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                        <span style={{fontSize:'13px',color:'#374151',fontWeight:'500'}}>📅 Next Touch:</span>
                        <input
                          type="date"
                          value={patient.nextTouchDate === '__MAX__' ? '' : (patient.nextTouchDate || '')}
                          onChange={async (e) => {
                            const val = e.target.value;
                            if (!val) return;
                            const skipped = skipWeekend(val);
                            const updated = patients.map(p => p.id === patient.id ? {...p, nextTouchDate: skipped} : p);
                            setPatients(updated);
                            await dbUpsert({...patient, nextTouchDate: skipped});
                          }}
                          style={{padding:'4px 8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'13px'}}
                        />
                        {patient.contactAttempts > 0 && (
                          <span style={{fontSize:'12px',color:'#6b7280'}}>({patient.contactAttempts} contact{patient.contactAttempts > 1 ? 's' : ''} logged)</span>
                        )}
                        {(patient.nextTouchDate === '__MAX__' || patient.contactAttempts >= 4) && (
                          <span style={{fontSize:'12px',padding:'3px 8px',backgroundColor:'#fee2e2',color:'#991b1b',borderRadius:'4px',fontWeight:'600'}}>⚠️ Max Attempts Reached</span>
                        )}
                      </div>
                    )}
                    {patient.SCH && (
                      <div style={{marginTop:'8px',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                        <span style={{fontSize:'13px',color:'#1e40af',fontWeight:'500'}}>🦷 Bond Date:</span>
                        <input
                          type="date"
                          value={patient.bondDate || ''}
                          onChange={async (e) => {
                            const val = e.target.value;
                            const newCheckDate = getBondCheckDate({SCH: true, bondDate: val});
                            const updatedPat = {...patient, bondDate: val, nextTouchDate: newCheckDate || patient.nextTouchDate};
                            const updated = patients.map(p => p.id === patient.id ? updatedPat : p);
                            setPatients(updated);
                            await dbUpsert(updatedPat);
                          }}
                          style={{padding:'4px 8px',border:'1px solid #bfdbfe',borderRadius:'4px',fontSize:'13px',backgroundColor:'#eff6ff'}}
                        />
                        {patient.bondDate && <span style={{fontSize:'12px',color:'#6b7280'}}>Check-in: {getBondCheckDate(patient) || '—'}</span>}
                      </div>
                    )}
                  </div>
                  <div style={{display:'flex',gap:'8px',flexDirection:'column'}}>
                    <button
                      onClick={() => {
                        setShowEditModal(patient);
                        setEditForm(patient);
                      }}
                      style={{padding:'8px 16px',backgroundColor:'#3b82f6',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'14px',fontWeight:'500',whiteSpace:'nowrap'}}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm('Delete ' + patient.name + '?')) {
                          setPatients(prev => prev.filter(p => p.id !== patient.id));
                          await dbDelete(patient.id);
                        }
                      }}
                      style={{padding:'8px 16px',backgroundColor:'#ef4444',color:'white',border:'none',borderRadius:'6px',cursor:'pointer',fontSize:'14px',fontWeight:'500',whiteSpace:'nowrap'}}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MONTHLY VIEW */}
        {currentView === 'monthly' && (
          <div style={{display:'flex',flexDirection:'column',gap:'24px'}}>
            {/* Monthly header with month navigation */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
              <h2 style={{fontSize:'28px',fontWeight:'bold',color:'#202020',margin:0}}>Monthly Performance</h2>
              <div style={{display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
                {/* Month navigator */}
                <div style={{display:'flex',alignItems:'center',gap:'6px',backgroundColor:'white',border:'1px solid #d1d5db',borderRadius:'8px',padding:'4px 8px'}}>
                  <button
                    onClick={() => {
                      const newIdx = selectedMonthIdx === 0 ? 11 : selectedMonthIdx - 1;
                      const newYear = selectedMonthIdx === 0 ? selectedMonthYear - 1 : selectedMonthYear;
                      setSelectedMonthIdx(newIdx);
                      setSelectedMonthYear(newYear);
                    }}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:'18px',padding:'0 4px',color:'#374151',fontWeight:'700'}}
                  >‹</button>
                  <select
                    value={`${selectedMonthYear}-${String(selectedMonthIdx).padStart(2,'0')}`}
                    onChange={e => {
                      const [yr, mo] = e.target.value.split('-');
                      setSelectedMonthYear(Number(yr));
                      setSelectedMonthIdx(Number(mo));
                    }}
                    style={{border:'none',fontSize:'15px',fontWeight:'600',color:'#202020',cursor:'pointer',backgroundColor:'transparent',padding:'4px 2px'}}
                  >
                    {[2024,2025,2026,2027].flatMap(yr =>
                      ['January','February','March','April','May','June','July','August','September','October','November','December'].map((mo, i) => (
                        <option key={`${yr}-${i}`} value={`${yr}-${String(i).padStart(2,'0')}`}>{mo} {yr}</option>
                      ))
                    )}
                  </select>
                  <button
                    onClick={() => {
                      const newIdx = selectedMonthIdx === 11 ? 0 : selectedMonthIdx + 1;
                      const newYear = selectedMonthIdx === 11 ? selectedMonthYear + 1 : selectedMonthYear;
                      setSelectedMonthIdx(newIdx);
                      setSelectedMonthYear(newYear);
                    }}
                    style={{background:'none',border:'none',cursor:'pointer',fontSize:'18px',padding:'0 4px',color:'#374151',fontWeight:'700'}}
                  >›</button>
                </div>
                {/* TC filter */}
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <label style={{fontSize:'14px',fontWeight:'500'}}>TC:</label>
                  <select value={monthlyTCFilter} onChange={e => setMonthlyTCFilter(e.target.value)}
                    style={{padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'14px'}}>
                    <option value="All">All TCs</option>
                    {tcList.map(tc => <option key={tc} value={tc}>{tc}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {(() => {
              const currentMonthStr = `${selectedMonthYear}-${String(selectedMonthIdx+1).padStart(2,'0')}`;
              const monthGoals = goals.monthly[selectedMonthIdx] || goals.monthly[0];
              const monthPts = patients.filter(p => p.npeDate && p.npeDate.startsWith(currentMonthStr));
              const filteredPts = monthlyTCFilter === 'All' ? monthPts : monthPts.filter(p => p.tc === monthlyTCFilter);
              const monthStartPts = patients.filter(p => { const sd = effectiveStartDate(p); return sd && sd.startsWith(currentMonthStr); });
              const filteredStartPts = monthlyTCFilter === 'All' ? monthStartPts : monthStartPts.filter(p => p.tc === monthlyTCFilter);
              const m = calculateMetrics(filteredPts, filteredStartPts);
              const monthStr = currentMonthStr;
              let onTimeCount = 0, totalTracked = 0;
              filteredPts.forEach(p => {
                (p.contact_log || []).forEach(entry => {
                  if (entry.date && entry.date.startsWith(monthStr) && entry.scheduledDate) {
                    totalTracked++;
                    if (entry.date <= entry.scheduledDate) onTimeCount++;
                  }
                });
              });
              const onTimeRate = totalTracked > 0 ? Math.round((onTimeCount / totalTracked) * 100) : null;
              const onTimeColor = onTimeRate === null ? '#9ca3af' : onTimeRate >= 80 ? '#10b981' : onTimeRate >= 60 ? '#f59e0b' : '#ef4444';

              if (patients.length === 0) return (
                <div style={{backgroundColor:'white',padding:'48px',borderRadius:'8px',textAlign:'center'}}>
                  <div style={{fontSize:'48px',marginBottom:'16px'}}>📊</div>
                  <h3 style={{fontSize:'20px',fontWeight:'bold',color:'#202020',marginBottom:'8px'}}>No Data Yet</h3>
                  <p style={{color:'#6b7280'}}>Start adding patients to see monthly performance</p>
                </div>
              );
              return (
              <>
                <div style={{backgroundColor:'white',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                  <h3 style={{fontSize:'20px',fontWeight:'bold',marginBottom:'4px'}}>📊 {monthlyTCFilter === 'All' ? 'Overall' : monthlyTCFilter} — {['January','February','March','April','May','June','July','August','September','October','November','December'][selectedMonthIdx]} {selectedMonthYear}</h3>
                  {monthlyTCFilter !== 'All' && <p style={{fontSize:'13px',color:'#6b7280',marginBottom:'12px'}}>{filteredPts.length} of {monthPts.length} patients this month</p>}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',gap:'20px',marginTop:'12px'}}>
                    <div><div style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>NPE</div><div style={{fontSize:'32px',fontWeight:'bold',color:'#202020'}}>{m.total}</div></div>
                    <div><div style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>Started</div><div style={{fontSize:'32px',fontWeight:'bold',color:'#10b981'}}>{m.started}</div></div>
                    <div><div style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>Conversion</div><div style={{fontSize:'32px',fontWeight:'bold',color:'#2563EB'}}>{m.overallConv}%</div></div>
                    <div><div style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>Avg Down Payment</div><div style={{fontSize:'32px',fontWeight:'bold',color:'#8b5cf6'}}>{m.avgDP > 0 ? `$${m.avgDP}` : '-'}</div></div>
                    <div><div style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>SDS Rate</div><div style={{fontSize:'32px',fontWeight:'bold',color:'#06b6d4'}}>{m.started > 0 ? `${m.sdsRate}%` : '-'}</div></div>
                    <div><div style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>TC Bonus</div><div style={{fontSize:'32px',fontWeight:'bold',color:'#10b981'}}>${m.totalBonus}</div></div>
                    <div><div style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>Paid In Full</div><div style={{fontSize:'32px',fontWeight:'bold',color:'#ec4899'}}>{m.pif}</div></div>
                    <div>
                      <div style={{fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>On-Time Follow-Ups</div>
                      <div style={{fontSize:'32px',fontWeight:'bold',color:onTimeColor}}>{onTimeRate !== null ? `${onTimeRate}%` : '—'}</div>
                      {totalTracked > 0 && <div style={{fontSize:'11px',color:'#9ca3af'}}>{onTimeCount}/{totalTracked} this month</div>}
                    </div>
                  </div>
                </div>
                <div style={{backgroundColor:'white',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                  <h3 style={{fontSize:'20px',fontWeight:'bold',marginBottom:'16px'}}>🎯 Monthly Goals vs Actual</h3>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'20px'}}>
                    {[
                      {label:'🏢 Carrollwood', bg:'#f0f9ff', border:'#bae6fd', hColor:'#0369a1',
                       rows:[{name:'NPE', actual:m.carTotal, goal:monthGoals.carNPE},{name:'Started', actual:m.carStarted, goal:monthGoals.carStarted}]},
                      {label:'🏖️ Apollo Beach', bg:'#fdf4ff', border:'#f0abfc', hColor:'#86198f',
                       rows:[{name:'NPE', actual:m.apoTotal, goal:monthGoals.apoNPE},{name:'Started', actual:m.apoStarted, goal:monthGoals.apoStarted}]},
                    ].map(office => (
                      <div key={office.label} style={{padding:'16px',backgroundColor:office.bg,borderRadius:'8px',border:`1px solid ${office.border}`}}>
                        <h4 style={{fontSize:'15px',fontWeight:'bold',color:office.hColor,marginBottom:'14px'}}>{office.label}</h4>
                        {office.rows.map(({name, actual, goal}) => {
                          const pct = goal > 0 ? Math.min(100, Math.round((actual/goal)*100)) : 0;
                          const barColor = pct >= 90 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
                          return (
                            <div key={name} style={{marginBottom:'14px'}}>
                              <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                                <span style={{fontSize:'13px',color:'#374151',fontWeight:'500'}}>{name}</span>
                                <span style={{fontSize:'13px',fontWeight:'700'}}>{actual} <span style={{color:'#9ca3af',fontWeight:'400'}}>/ {goal} goal</span></span>
                              </div>
                              <div style={{height:'8px',backgroundColor:'#e5e7eb',borderRadius:'4px',overflow:'hidden'}}>
                                <div style={{height:'100%',width:`${pct}%`,backgroundColor:barColor,borderRadius:'4px'}} />
                              </div>
                              <div style={{fontSize:'11px',fontWeight:'600',color:barColor,textAlign:'right',marginTop:'2px'}}>{pct}%</div>
                            </div>
                          );
                        })}
                        <div style={{display:'flex',justifyContent:'space-between',paddingTop:'8px',borderTop:'1px solid #e5e7eb'}}>
                          <span style={{fontSize:'12px',color:'#6b7280'}}>Conversion</span>
                          <strong style={{fontSize:'13px',color:'#2563EB'}}>{office.rows[0].actual > 0 && office.rows[1].actual > 0 ? `${Math.round((office.rows[1].actual/office.rows[0].actual)*100)}%` : office.rows[0].actual > 0 ? '0%' : '-'}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Overall conversion goal */}
                  {(() => {
                    const convGoal = monthGoals.convGoal || 50;
                    const convActual = m.overallConv;
                    const diff = convActual - convGoal;
                    const diffColor = diff >= 0 ? '#10b981' : '#ef4444';
                    return (
                      <div style={{marginTop:'16px',padding:'16px',backgroundColor:'#fff7ed',borderRadius:'8px',border:'1px solid #fed7aa',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span style={{fontWeight:'600',color:'#2563EB',fontSize:'15px'}}>🎯 Overall Conversion Goal</span>
                        <div style={{display:'flex',alignItems:'baseline',gap:'16px'}}>
                          <div style={{textAlign:'center'}}>
                            <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'2px'}}>Actual</div>
                            <div style={{fontSize:'24px',fontWeight:'700',color:'#2563EB'}}>{convActual}%</div>
                          </div>
                          <div style={{fontSize:'18px',color:'#d1d5db'}}>vs</div>
                          <div style={{textAlign:'center'}}>
                            <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'2px'}}>Goal</div>
                            <div style={{fontSize:'24px',fontWeight:'700',color:'#374151'}}>{convGoal}%</div>
                          </div>
                          <div style={{textAlign:'center',minWidth:'48px'}}>
                            <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'2px'}}>Diff</div>
                            <div style={{fontSize:'18px',fontWeight:'700',color:diffColor}}>{diff >= 0 ? '+' : ''}{diff}%</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{backgroundColor:'white',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                  <h3 style={{fontSize:'20px',fontWeight:'bold',marginBottom:'16px'}}>📋 Status Breakdown</h3>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))',gap:'12px'}}>
                    <div style={{padding:'12px',backgroundColor:'#dcfce7',borderRadius:'8px',textAlign:'center'}}><div style={{fontSize:'24px',fontWeight:'bold',color:'#166534'}}>{m.sds}</div><div style={{fontSize:'11px',color:'#166534'}}>SDS</div></div>
                    <div style={{padding:'12px',backgroundColor:'#dcfce7',borderRadius:'8px',textAlign:'center'}}><div style={{fontSize:'24px',fontWeight:'bold',color:'#166534'}}>{m.started - m.sds}</div><div style={{fontSize:'11px',color:'#166534'}}>Started (non-SDS)</div></div>
                    <div style={{padding:'12px',backgroundColor:'#fed7aa',borderRadius:'8px',textAlign:'center'}}><div style={{fontSize:'24px',fontWeight:'bold',color:'#9a3412'}}>{m.pending}</div><div style={{fontSize:'11px',color:'#9a3412'}}>Pending</div></div>
                    <div style={{padding:'12px',backgroundColor:'#dbeafe',borderRadius:'8px',textAlign:'center'}}><div style={{fontSize:'24px',fontWeight:'bold',color:'#1e40af'}}>{m.scheduled}</div><div style={{fontSize:'11px',color:'#1e40af'}}>Scheduled</div></div>
                    <div style={{padding:'12px',backgroundColor:'#F5F5F5',borderRadius:'8px',textAlign:'center'}}><div style={{fontSize:'24px',fontWeight:'bold',color:'#374151'}}>{m.observation}</div><div style={{fontSize:'11px',color:'#374151'}}>Observation</div></div>
                    <div style={{padding:'12px',backgroundColor:'#fef3c7',borderRadius:'8px',textAlign:'center'}}><div style={{fontSize:'24px',fontWeight:'bold',color:'#92400e'}}>{m.medicaidPending}</div><div style={{fontSize:'11px',color:'#92400e'}}>Medicaid Pending</div></div>
                    <div style={{padding:'12px',backgroundColor:'#fee2e2',borderRadius:'8px',textAlign:'center'}}><div style={{fontSize:'24px',fontWeight:'bold',color:'#991b1b'}}>{m.noTx}</div><div style={{fontSize:'11px',color:'#991b1b'}}>No TX</div></div>
                  </div>
                </div>
              </>
              );
            })()}
          </div>
        )}

        {/* BONUS AUDIT */}
        {currentView === 'bonus' && (() => {
          const bonusTCFilter = currentUser?.role === 'tc' ? currentUser.name : null;
          return (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'24px',flexWrap:'wrap',gap:'12px'}}>
              <div>
                <h2 style={{fontSize:'28px',fontWeight:'bold',color:'#202020',margin:0}}>
                  {bonusTCFilter ? `${bonusTCFilter}'s Bonus` : 'TC Bonus Audit Trail'}
                </h2>
                {bonusTCFilter && <div style={{fontSize:'13px',color:'#6b7280',marginTop:'3px'}}>Your personal bonus summary — only you can see this</div>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <label style={{fontSize:'14px',fontWeight:'500'}}>Month:</label>
                <input type="month"
                  value={bonusMonthFilter}
                  onChange={e => setBonusMonthFilter(e.target.value)}
                  style={{padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'14px'}} />
              </div>
            </div>

            {patients.length === 0 ? (
              <div style={{backgroundColor:'white',padding:'48px',borderRadius:'8px',textAlign:'center'}}>
                <div style={{fontSize:'48px',marginBottom:'16px'}}>💰</div>
                <h3 style={{fontSize:'20px',fontWeight:'bold',color:'#202020',marginBottom:'8px'}}>No Bonus Data Yet</h3>
                <p style={{color:'#6b7280'}}>Start adding patients to see your bonus breakdown</p>
              </div>
            ) : (
              <>
                <div style={{backgroundColor:'#dcfce7',border:'1px solid #86efac',padding:'16px',borderRadius:'8px',marginBottom:'24px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <strong style={{color:'#166534',fontSize:'18px'}}>Total Bonus</strong>
                      <div style={{fontSize:'14px',color:'#166534',marginTop:'4px'}}>
                        {overall.sds} SDS • {overall.retainers} Retainers • {overall.whitening} Whitening • {overall.pif} PIF
                      </div>
                    </div>
                    <div style={{fontSize:'36px',fontWeight:'bold',color:'#10b981'}}>${overall.totalBonus}</div>
                  </div>
                </div>

                {/* Popup Bonus Earnings */}
                {(() => {
                  const relevantBonuses = popupBonuses.filter(b => {
                    const overlapStart = b.startDate.substring(0, 7) <= bonusMonthFilter;
                    const overlapEnd = b.endDate.substring(0, 7) >= bonusMonthFilter;
                    return overlapStart && overlapEnd;
                  });
                  if (relevantBonuses.length === 0) return null;
                  return relevantBonuses.map(bonus => {
                    const qualifying = patients.filter(p =>
                      (p.fromPending || p.ST) &&
                      p.startDate >= bonus.startDate && p.startDate <= bonus.endDate &&
                      (bonus.tcFilter === 'All' || p.tc === bonus.tcFilter) &&
                      (!bonusTCFilter || p.tc === bonusTCFilter)
                    );
                    if (qualifying.length === 0) return null;
                    const total = qualifying.reduce((sum, p) => sum + bonus.amount + (p['R+'] ? bonusRates.ret : 0) + (p['W+'] ? bonusRates.white : 0), 0);
                    return (
                      <div key={bonus.id} style={{backgroundColor:'#fefce8',border:'2px solid #fbbf24',borderRadius:'10px',padding:'20px 24px',marginBottom:'16px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'12px'}}>
                          <span style={{fontSize:'22px'}}>🎯</span>
                          <div>
                            <div style={{fontWeight:'800',fontSize:'16px',color:'#92400e'}}>{bonus.name}</div>
                            <div style={{fontSize:'12px',color:'#92400e'}}>${bonus.amount}/start · {bonus.startDate} → {bonus.endDate}</div>
                          </div>
                          <div style={{marginLeft:'auto',textAlign:'right'}}>
                            <div style={{fontSize:'28px',fontWeight:'900',color:'#10b981',lineHeight:1}}>${total}</div>
                            <div style={{fontSize:'12px',color:'#9ca3af'}}>{qualifying.length} qualifying starts</div>
                          </div>
                        </div>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                          <thead>
                            <tr style={{backgroundColor:'#fef9c3'}}>
                              <th style={{padding:'6px 10px',textAlign:'left',fontWeight:'600',color:'#92400e'}}>Patient</th>
                              <th style={{padding:'6px 10px',textAlign:'left',fontWeight:'600',color:'#92400e'}}>TC</th>
                              <th style={{padding:'6px 10px',textAlign:'left',fontWeight:'600',color:'#92400e'}}>Start Date</th>
                              <th style={{padding:'6px 10px',textAlign:'right',fontWeight:'600',color:'#92400e'}}>Bonus</th>
                            </tr>
                          </thead>
                          <tbody>
                            {qualifying.map(p => {
                              const rowTotal = bonus.amount + (p['R+'] ? bonusRates.ret : 0) + (p['W+'] ? bonusRates.white : 0);
                              const addons = [p['R+'] && `R+ $${bonusRates.ret}`, p['W+'] && `W+ $${bonusRates.white}`].filter(Boolean).join(', ');
                              return (
                                <tr key={p.id} style={{borderBottom:'1px solid #fde68a'}}>
                                  <td style={{padding:'6px 10px',color:'#374151'}}>{p.name}</td>
                                  <td style={{padding:'6px 10px',color:'#374151'}}>{p.tc}</td>
                                  <td style={{padding:'6px 10px',color:'#374151'}}>{p.startDate}</td>
                                  <td style={{padding:'6px 10px',textAlign:'right',fontWeight:'700',color:'#10b981'}}>
                                    ${rowTotal}{addons ? <span style={{fontSize:'11px',color:'#92400e',fontWeight:'400',marginLeft:'4px'}}>({addons})</span> : null}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  });
                })()}

                {/* Per-TC Payment Summary — doctor/admin only */}
                {!bonusTCFilter && (() => {
                  const perTC = {};
                  patients.forEach(p => {
                    const sd = effectiveStartDate(p);
                    if (!sd || !sd.startsWith(bonusMonthFilter)) return;
                    const tc = p.tc || 'Unassigned';
                    if (!perTC[tc]) perTC[tc] = { sds: 0, ret: 0, white: 0, pif: 0, total: 0 };
                    if (isSDS(p)) {
                      perTC[tc].sds++;
                      perTC[tc].total += bonusRates.sds;
                    }
                    if (isSDS(p) || p.DBRETS) {
                      if (p['R+']) { perTC[tc].ret++; perTC[tc].total += bonusRates.ret; }
                      if (p['W+']) { perTC[tc].white++; perTC[tc].total += bonusRates.white; }
                    }
                    if ((isSDS(p) || p.ST) && p.PIF) { perTC[tc].pif++; perTC[tc].total += bonusRates.pif; }
                  });
                  const entries = Object.entries(perTC).filter(([, v]) => v.total > 0);
                  if (entries.length === 0) return null;
                  const monthLabel = new Date(bonusMonthFilter + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                  return (
                    <div style={{marginBottom:'24px'}}>
                      <h3 style={{fontSize:'16px',fontWeight:'700',color:'#374151',marginBottom:'14px'}}>
                        💸 Payment Summary — {monthLabel}
                      </h3>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'14px',marginBottom:'8px'}}>
                        {entries.map(([tcName, d]) => (
                          <div key={tcName} style={{backgroundColor:'white',borderRadius:'10px',padding:'20px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',border:'2px solid #86efac'}}>
                            <div style={{fontSize:'14px',fontWeight:'700',color:'#374151',marginBottom:'2px'}}>{tcName}</div>
                            <div style={{fontSize:'36px',fontWeight:'900',color:'#10b981',lineHeight:1,marginBottom:'12px'}}>${d.total}</div>
                            <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                              {d.sds > 0 && <div style={{fontSize:'12px',color:'#6b7280'}}>• {d.sds} SDS — <strong style={{color:'#374151'}}>${d.sds * bonusRates.sds}</strong></div>}
                              {d.ret > 0 && <div style={{fontSize:'12px',color:'#6b7280'}}>• {d.ret} Retainer{d.ret > 1 ? 's' : ''} — <strong style={{color:'#374151'}}>${d.ret * bonusRates.ret}</strong></div>}
                              {d.white > 0 && <div style={{fontSize:'12px',color:'#6b7280'}}>• {d.white} Whitening — <strong style={{color:'#374151'}}>${d.white * bonusRates.white}</strong></div>}
                              {d.pif > 0 && <div style={{fontSize:'12px',color:'#6b7280'}}>• {d.pif} PIF — <strong style={{color:'#374151'}}>${d.pif * bonusRates.pif}</strong></div>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:'12px',color:'#9ca3af'}}>Based on start date falling in {monthLabel}. See detailed breakdown below to verify individual patients.</div>
                    </div>
                  );
                })()}

                <div style={{backgroundColor:'white',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',marginBottom:'16px'}}>
                  <h3 style={{fontSize:'18px',fontWeight:'bold',marginBottom:'16px'}}>Detailed Breakdown</h3>
                  
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid #e5e7eb'}}>
                        <th style={{textAlign:'left',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>Date</th>
                        <th style={{textAlign:'left',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>Patient</th>
                        {!bonusTCFilter && <th style={{textAlign:'left',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>TC</th>}
                        <th style={{textAlign:'left',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>Type</th>
                        <th style={{textAlign:'right',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const started = patients.filter(p => isSDS(p) || p.ST);
                        let bonusItems = [];

                        patients.forEach(p => {
                          const sd = effectiveStartDate(p);
                          if (isSDS(p)) {
                            bonusItems.push({date: sd, patient: p.name, tc: p.tc, type: 'SDS', amount: bonusRates.sds});
                          }
                          if ((isSDS(p) || p.DBRETS) && p['R+']) {
                            bonusItems.push({date: sd, patient: p.name, tc: p.tc, type: 'Retainer', amount: bonusRates.ret});
                          }
                          if ((isSDS(p) || p.DBRETS) && p['W+']) {
                            bonusItems.push({date: sd, patient: p.name, tc: p.tc, type: 'Whitening', amount: bonusRates.white});
                          }
                          if (started.find(s => s.id === p.id) && p.PIF) {
                            bonusItems.push({date: sd, patient: p.name, tc: p.tc, type: 'PIF', amount: bonusRates.pif});
                          }
                        });
                        // Filter by month and TC role
                        bonusItems = bonusItems.filter(item => item.date && item.date.startsWith(bonusMonthFilter));
                        if (bonusTCFilter) bonusItems = bonusItems.filter(item => item.tc === bonusTCFilter);
                        bonusItems.sort((a,b) => a.date.localeCompare(b.date));
                        const filteredTotal = bonusItems.reduce((sum, item) => sum + item.amount, 0);

                        return bonusItems.map((item, i) => (
                          <tr key={i} style={{borderBottom:'1px solid #F5F5F5'}}>
                            <td style={{padding:'12px',fontSize:'14px'}}>{new Date(item.date + 'T12:00:00').toLocaleDateString()}</td>
                            <td style={{padding:'12px',fontSize:'14px'}}>{item.patient}</td>
                            {!bonusTCFilter && <td style={{padding:'12px',fontSize:'14px',color:'#6b7280'}}>{item.tc || '—'}</td>}
                            <td style={{padding:'12px',fontSize:'14px'}}>
                              <span style={{
                                padding:'2px 8px',
                                backgroundColor: item.type==='SDS' ? '#fef3c7' : item.type==='Retainer' ? '#dbeafe' : item.type==='Whitening' ? '#e0e7ff' : '#fce7f3',
                                color: item.type==='SDS' ? '#92400e' : item.type==='Retainer' ? '#1e40af' : item.type==='Whitening' ? '#3730a3' : '#831843',
                                borderRadius:'4px',fontSize:'12px',fontWeight:'600'
                              }}>
                                {item.type}
                              </span>
                            </td>
                            <td style={{padding:'12px',fontSize:'14px',textAlign:'right',fontWeight:'600',color:'#10b981'}}>${item.amount}</td>
                          </tr>
                        )).concat(bonusItems.length === 0 ? [
                          <tr key="empty"><td colSpan={bonusTCFilter ? 4 : 5} style={{padding:'24px',textAlign:'center',color:'#9ca3af',fontStyle:'italic'}}>No bonus entries for {bonusMonthFilter}</td></tr>
                        ] : []);
                      })()}
                      <tr style={{borderTop:'2px solid #202020',backgroundColor:'#f9fafb'}}>
                        <td colSpan={bonusTCFilter ? 3 : 4} style={{padding:'12px',fontSize:'16px',fontWeight:'bold'}}>TOTAL — {bonusMonthFilter}</td>
                        <td style={{padding:'12px',fontSize:'20px',fontWeight:'bold',textAlign:'right',color:'#10b981'}}>
                          ${patients.filter(p => (isSDS(p) || p.ST) && (!bonusTCFilter || p.tc === bonusTCFilter)).reduce((sum, p) => {
                            let amt = 0;
                            const sd = effectiveStartDate(p);
                            if (sd && sd.startsWith(bonusMonthFilter)) {
                              if (isSDS(p)) amt += bonusRates.sds;
                              if (isSDS(p) && p['R+']) amt += bonusRates.ret;
                              if (isSDS(p) && p['W+']) amt += bonusRates.white;
                              if (p.PIF) amt += bonusRates.pif;
                            }
                            return sum + amt;
                          }, 0)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div style={{display:'flex',gap:'12px'}}>
                  <button
                    onClick={() => {
                      const started = patients.filter(p => isSDS(p) || p.ST);
                      const rows = [['Start Date','Patient','TC','Type','Amount']];
                      patients.forEach(p => {
                        const sd = effectiveStartDate(p);
                        if (!sd || !sd.startsWith(bonusMonthFilter)) return;
                        if (isSDS(p)) rows.push([sd, p.name, p.tc||'', 'SDS', bonusRates.sds]);
                        if (isSDS(p) && p['R+']) rows.push([sd, p.name, p.tc||'', 'Retainer', bonusRates.ret]);
                        if (isSDS(p) && p['W+']) rows.push([sd, p.name, p.tc||'', 'Whitening', bonusRates.white]);
                        if (started.find(s=>s.id===p.id) && p.PIF) rows.push([sd, p.name, p.tc||'', 'PIF', bonusRates.pif]);
                      });
                      const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
                      a.download = `bonus-${bonusMonthFilter}.csv`;
                      a.click();
                    }}
                    style={{padding:'12px 24px',backgroundColor:'#3b82f6',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer'}}>
                    📥 Export to CSV
                  </button>
                  <button
                    onClick={() => window.print()}
                    style={{padding:'12px 24px',backgroundColor:'#6b7280',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer'}}>
                    🖨️ Print Report
                  </button>
                </div>
              </>
            )}
          </div>
          );
        })()}

        {/* ON-TIME AUDIT */}
        {currentView === 'ontime' && (() => {
          const isTC = currentUser?.role === 'tc';
          const tcName = currentUser?.name;

          // Collect all contact log entries with a scheduledDate in the selected month
          let entries = [];
          patients.forEach(p => {
            (p.contact_log || []).forEach(entry => {
              if (!entry.scheduledDate || !entry.date) return;
              if (!entry.date.startsWith(ontimeMonthFilter)) return;
              if (isTC && p.tc !== tcName) return;
              entries.push({
                patient: p.name,
                tc: p.tc,
                scheduledDate: entry.scheduledDate,
                actualDate: entry.date,
                onTime: entry.date <= entry.scheduledDate,
                daysLate: entry.date > entry.scheduledDate
                  ? Math.floor((new Date(entry.date + 'T12:00:00') - new Date(entry.scheduledDate + 'T12:00:00')) / 86400000)
                  : 0,
              });
            });
          });
          entries.sort((a, b) => a.actualDate.localeCompare(b.actualDate));

          // Per-TC summary
          const tcMap = {};
          entries.forEach(e => {
            if (!tcMap[e.tc]) tcMap[e.tc] = { total: 0, onTime: 0 };
            tcMap[e.tc].total++;
            if (e.onTime) tcMap[e.tc].onTime++;
          });
          const tcSummary = Object.entries(tcMap).map(([name, s]) => ({
            name, total: s.total, onTime: s.onTime,
            pct: Math.round((s.onTime / s.total) * 100)
          })).sort((a, b) => b.pct - a.pct);

          const totalOnTime = entries.filter(e => e.onTime).length;
          const overallPct = entries.length > 0 ? Math.round((totalOnTime / entries.length) * 100) : null;
          const pctColor = (pct) => pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
          const pctBg   = (pct) => pct >= 80 ? '#dcfce7' : pct >= 60 ? '#fef3c7' : '#fee2e2';

          return (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'24px',flexWrap:'wrap',gap:'12px'}}>
              <div>
                <h2 style={{fontSize:'28px',fontWeight:'bold',color:'#202020',margin:0}}>⏱️ On-Time Follow-Up Audit</h2>
                <div style={{fontSize:'13px',color:'#6b7280',marginTop:'3px'}}>Tracks whether follow-ups were completed on or before their scheduled date</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <label style={{fontSize:'14px',fontWeight:'500'}}>Month:</label>
                <input type="month"
                  value={ontimeMonthFilter}
                  onChange={e => setOntimeMonthFilter(e.target.value)}
                  style={{padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'14px'}} />
              </div>
            </div>

            {entries.length === 0 ? (
              <div style={{backgroundColor:'white',padding:'48px',borderRadius:'8px',textAlign:'center',boxShadow:'0 1px 3px rgba(0,0,0,0.1)'}}>
                <div style={{fontSize:'48px',marginBottom:'16px'}}>⏱️</div>
                <h3 style={{fontSize:'20px',fontWeight:'bold',color:'#202020',marginBottom:'8px'}}>No Data for This Month</h3>
                <p style={{color:'#6b7280'}}>Follow-up contacts logged this month will appear here</p>
              </div>
            ) : (
              <>
                {/* Overall score */}
                <div style={{backgroundColor: pctBg(overallPct),border:`1px solid ${pctColor(overallPct)}`,padding:'20px 24px',borderRadius:'8px',marginBottom:'24px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'12px'}}>
                  <div>
                    <div style={{fontWeight:'700',fontSize:'18px',color:'#202020'}}>Overall On-Time Rate</div>
                    <div style={{fontSize:'14px',color:'#6b7280',marginTop:'4px'}}>{totalOnTime} of {entries.length} follow-ups completed on time</div>
                  </div>
                  <div style={{fontSize:'48px',fontWeight:'900',color: pctColor(overallPct)}}>{overallPct}%</div>
                </div>

                {/* Per-TC summary (admin only) */}
                {!isTC && tcSummary.length > 0 && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'12px',marginBottom:'24px'}}>
                    {tcSummary.map(tc => (
                      <div key={tc.name} style={{backgroundColor:'white',padding:'16px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',textAlign:'center'}}>
                        <div style={{fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'6px'}}>{tc.name}</div>
                        <div style={{fontSize:'32px',fontWeight:'900',color: pctColor(tc.pct)}}>{tc.pct}%</div>
                        <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'4px'}}>{tc.onTime}/{tc.total} on time</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Detail table */}
                <div style={{backgroundColor:'white',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',overflow:'hidden'}}>
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid #e5e7eb',backgroundColor:'#f9fafb'}}>
                        <th style={{textAlign:'left',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>Patient</th>
                        {!isTC && <th style={{textAlign:'left',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>TC</th>}
                        <th style={{textAlign:'left',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>Scheduled</th>
                        <th style={{textAlign:'left',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>Completed</th>
                        <th style={{textAlign:'center',padding:'12px',fontSize:'13px',fontWeight:'600',color:'#6b7280'}}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={i} style={{borderBottom:'1px solid #f3f4f6',backgroundColor: e.onTime ? 'white' : '#fff8f8'}}>
                          <td style={{padding:'12px',fontSize:'14px',color:'#202020'}}>{e.patient}</td>
                          {!isTC && <td style={{padding:'12px',fontSize:'14px',color:'#374151'}}>{e.tc}</td>}
                          <td style={{padding:'12px',fontSize:'14px',color:'#374151'}}>{new Date(e.scheduledDate+'T12:00:00').toLocaleDateString('en-US',{month:'numeric',day:'numeric'})}</td>
                          <td style={{padding:'12px',fontSize:'14px',color:'#374151'}}>{new Date(e.actualDate+'T12:00:00').toLocaleDateString('en-US',{month:'numeric',day:'numeric'})}</td>
                          <td style={{padding:'12px',textAlign:'center'}}>
                            {e.onTime
                              ? <span style={{padding:'3px 10px',backgroundColor:'#dcfce7',color:'#166534',borderRadius:'12px',fontSize:'12px',fontWeight:'600'}}>✅ On Time</span>
                              : <span style={{padding:'3px 10px',backgroundColor:'#fee2e2',color:'#991b1b',borderRadius:'12px',fontSize:'12px',fontWeight:'600'}}>⚠️ {e.daysLate}d late</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          );
        })()}

        {/* PRACTICE METRICS */}
        {currentView === 'metrics' && (() => {
          const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const fmt$   = (v) => v != null && v > 0 ? '$' + Math.round(v).toLocaleString() : '—';
          const fmtPct = (v) => v != null ? Math.round(v * 100) + '%' : '—';
          const vsColor = (actual, goal, higherBetter = true) => {
            if (actual == null || !goal) return '#9ca3af';
            return higherBetter
              ? (actual >= goal ? '#10b981' : actual >= goal * 0.8 ? '#f59e0b' : '#ef4444')
              : (actual <= goal ? '#10b981' : '#f59e0b');
          };

          // ── Data helpers ─────────────────────────────────────────────
          const yearMetrics = practiceMetrics.filter(m => m.year === metricsYear);
          const yearGoals   = practiceGoals.filter(g => g.year === metricsYear);
          const getMetric   = (mo) => yearMetrics.find(m => m.month === mo) || null;
          const getGoal     = (mo) => yearGoals.find(g => g.month === mo) || null;

          const ytdProd     = yearMetrics.reduce((s, m) => s + (m.net_production || 0), 0);
          const ytdColl     = yearMetrics.reduce((s, m) => s + (m.collections || 0), 0);
          const ytdStarts   = yearMetrics.reduce((s, m) => s + (m.starts || 0), 0);
          const ytdGoalProd = yearGoals.reduce((s, g) => s + (g.production_goal || 0), 0);
          const ytdGoalStarts = yearGoals.reduce((s, g) => s + (g.start_goal || 0), 0);
          const convData    = yearMetrics.filter(m => m.conversion_rate != null);
          const avgConv     = convData.length ? convData.reduce((s, m) => s + m.conversion_rate, 0) / convData.length : null;
          const avgCaseFee  = ytdStarts > 0 ? ytdProd / ytdStarts : null;
          const showUpData  = yearMetrics.filter(m => m.show_up_rate != null);
          const avgShowUp   = showUpData.length ? showUpData.reduce((s, m) => s + m.show_up_rate, 0) / showUpData.length : null;
          const ytdCollRate = ytdProd > 0 ? ytdColl / ytdProd : null;

          // Month-over-month helpers
          const todayMo = new Date().getMonth() + 1;
          const todayYr = new Date().getFullYear();
          const curMonthMetric  = getMetric(todayMo);
          const prevMonthMo     = todayMo === 1 ? 12 : todayMo - 1;
          const prevMonthYr     = todayMo === 1 ? todayYr - 1 : todayYr;
          const prevMonthMetric = practiceMetrics.find(m => m.year === prevMonthYr && m.month === prevMonthMo) || null;
          const momArrow = (cur, prev) => {
            if (cur == null || prev == null || prev === 0) return null;
            const pct = Math.round(((cur - prev) / prev) * 100);
            return { pct, up: pct >= 0 };
          };

          // ── Export CSV ───────────────────────────────────────────────
          const exportCSV = () => {
            const headers = ['Month','Net Production','Collections','Collection Rate','NPE Scheduled','Shows','OBS Added','Show Up %','Starts','Conversion','Avg Case Fee','Notes'];
            const rows = Array.from({length:12},(_,i)=>i+1).map(mo => {
              const m = getMetric(mo);
              if (!m) return [MONTHS[mo-1],'','','','','','','','','','',''];
              return [
                MONTHS[mo-1],
                m.net_production || '',
                m.collections || '',
                m.net_production > 0 ? Math.round((m.collections/m.net_production)*100)+'%' : '',
                m.npe_scheduled || '',
                m.npe_showed || '',
                m.obs_added || '',
                m.show_up_rate != null ? Math.round(m.show_up_rate*100)+'%' : '',
                m.starts || '',
                m.conversion_rate != null ? Math.round(m.conversion_rate*100)+'%' : '',
                m.avg_case_fee ? Math.round(m.avg_case_fee) : '',
                (m.notes || '').replace(/,/g,' ')
              ];
            });
            const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
            const blob = new Blob([csv], {type:'text/csv'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `practice-metrics-${metricsYear}.csv`; a.click();
            URL.revokeObjectURL(url);
          };

          // ── Auto-insights ─────────────────────────────────────────────
          const autoInsights = (() => {
            const msgs = [];
            const sorted = [...yearMetrics].sort((a,b) => a.month - b.month);
            if (sorted.length < 2) return msgs;
            // Conversion trend
            const convMos = sorted.filter(m => m.conversion_rate != null).slice(-3);
            if (convMos.length >= 2) {
              const first = convMos[0].conversion_rate, last = convMos[convMos.length-1].conversion_rate;
              const diff = Math.round((last - first) * 100);
              if (Math.abs(diff) >= 3) msgs.push({ type: diff > 0 ? 'good' : 'warn', text: `Conversion rate is ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} pts over the last ${convMos.length} months (${fmtPct(first)} → ${fmtPct(last)}).` });
            }
            // Case fee vs goal
            if (avgCaseFee != null) {
              const gap = Math.round(5800 - avgCaseFee);
              if (gap > 200) msgs.push({ type: 'warn', text: `Avg case fee is $${gap.toLocaleString()} below the $5,800 target. Consider reviewing treatment mix or add-on offerings.` });
              else if (gap <= 0) msgs.push({ type: 'good', text: `Avg case fee is $${Math.abs(gap).toLocaleString()} above the $5,800 target.` });
            }
            // Collection rate
            if (ytdCollRate != null && ytdCollRate < 0.95) msgs.push({ type: 'warn', text: `Collection rate is ${Math.round(ytdCollRate*100)}% — below the 98% target. Review AR aging.` });
            // Missing past months
            const missing = Array.from({length: todayYr === metricsYear ? todayMo - 1 : 12}, (_,i) => i+1).filter(mo => !getMetric(mo));
            if (missing.length > 0) msgs.push({ type: 'info', text: `${missing.length} past month${missing.length > 1 ? 's' : ''} (${missing.map(m=>MONTHS[m-1]).join(', ')}) ${missing.length > 1 ? 'are' : 'is'} missing data.` });
            // Best production month
            const best = sorted.reduce((b, m) => (m.net_production > (b?.net_production || 0) ? m : b), null);
            if (best) msgs.push({ type: 'info', text: `Best production month so far: ${MONTHS[best.month-1]} at ${fmt$(best.net_production)}.` });
            return msgs;
          })();

          const getQuarter = (q) => {
            const mos = q===1?[1,2,3]:q===2?[4,5,6]:q===3?[7,8,9]:[10,11,12];
            const qm  = yearMetrics.filter(m => mos.includes(m.month));
            const qg  = yearGoals.filter(g => mos.includes(g.month));
            const qConv = qm.filter(m => m.conversion_rate != null);
            return {
              production: qm.reduce((s,m)=>s+(m.net_production||0),0),
              prodGoal:   qg.reduce((s,g)=>s+(g.production_goal||0),0),
              starts:     qm.reduce((s,m)=>s+(m.starts||0),0),
              startGoal:  qg.reduce((s,g)=>s+(g.start_goal||0),0),
              conv:       qConv.length ? qConv.reduce((s,m)=>s+m.conversion_rate,0)/qConv.length : null,
              months:     qm.length,
            };
          };

          // ── Save metric ──────────────────────────────────────────────
          const saveMetric = async () => {
            const y  = parseInt(metricsForm.year);
            const mo = parseInt(metricsForm.month);
            const dash = getDashboardMonthData(y, mo);
            const npe_showed   = metricsForm.npe_showed   !== '' ? parseInt(metricsForm.npe_showed)   : dash.npe_showed;
            const starts       = metricsForm.starts       !== '' ? parseInt(metricsForm.starts)       : dash.starts;
            const obs_added    = metricsForm.obs_added    !== '' ? parseInt(metricsForm.obs_added)    : dash.obs_added;
            const net_prod     = parseFloat(metricsForm.net_production.toString().replace(/[^0-9.]/g,'')) || 0;
            const collections  = parseFloat(metricsForm.collections.toString().replace(/[^0-9.]/g,'')) || 0;
            const npe_sched    = parseInt(metricsForm.npe_scheduled) || 0;
            const show_up_rate = npe_sched > 0 ? npe_showed / npe_sched : null;
            const denom        = npe_showed - obs_added;
            const conv_rate    = denom > 0 ? starts / denom : null;
            const avg_fee      = starts > 0 ? net_prod / starts : null;
            if (supabase) {
              await supabase.from('practice_metrics').upsert({
                year: y, month: mo, practice_id: currentUser.practiceId,
                net_production: net_prod, collections, npe_scheduled: npe_sched,
                npe_showed, obs_added, starts,
                show_up_rate, conversion_rate: conv_rate, avg_case_fee: avg_fee,
                notes: metricsForm.notes, updated_at: new Date().toISOString()
              }, { onConflict: 'year,month,practice_id' });
              await loadPracticeMetrics();
            }
            setShowMetricsEntry(false);
            setMetricsSaveMsg('✅ Saved!');
            setTimeout(() => setMetricsSaveMsg(''), 3000);
          };

          // ── AI suggestions ───────────────────────────────────────────
          const aiSuggestions = (() => {
            const all = [...practiceMetrics].sort((a,b) => a.year!==b.year ? a.year-b.year : a.month-b.month);
            if (all.length < 3) return null;
            const last3      = all.slice(-3);
            const avgProd    = last3.reduce((s,m)=>s+(m.net_production||0),0) / 3;
            const avgStarts  = last3.reduce((s,m)=>s+(m.starts||0),0) / 3;
            const avgNPE     = last3.reduce((s,m)=>s+(m.npe_scheduled||0),0) / 3;
            const convSlice  = last3.filter(m=>m.conversion_rate!=null);
            const avgConvAll = convSlice.length ? convSlice.reduce((s,m)=>s+m.conversion_rate,0)/convSlice.length : 0.50;
            const feeSlice   = all.filter(m=>m.avg_case_fee!=null);
            const avgFeeAll  = feeSlice.length ? feeSlice.reduce((s,m)=>s+m.avg_case_fee,0)/feeSlice.length : 5000;
            const gf = (key) => 1 + (goalAdjust[key] || 0) / 100;
            const last = all[all.length - 1];
            const suggestions = [];
            let sy = last.year, sm = last.month;
            for (let i = 0; i < 12; i++) {
              sm++; if (sm > 12) { sm = 1; sy++; }
              const prior = all.find(m => m.year === sy-1 && m.month === sm);
              const priorYrMos = all.filter(m => m.year === sy-1 && m.net_production);
              const priorYrAvg = priorYrMos.length ? priorYrMos.reduce((s,m)=>s+m.net_production,0)/priorYrMos.length : avgProd;
              const seasonal   = prior && priorYrAvg > 0 ? prior.net_production / priorYrAvg : 1;
              suggestions.push({
                year: sy, month: sm,
                production_goal:   Math.round(Math.max(avgProd * seasonal, avgProd * 0.5) * gf('production') / 1000) * 1000,
                npe_goal:          Math.round(avgNPE * gf('npe')),
                start_goal:        Math.round(Math.max(avgStarts * seasonal, avgStarts * 0.6) * gf('starts')),
                conversion_goal:   Math.min(0.85, avgConvAll * gf('conversion')),
                avg_case_fee_goal: Math.round(avgFeeAll * gf('case_fee')),
              });
            }
            return suggestions;
          })();

          const availableYears = [...new Set([...practiceMetrics.map(m=>m.year), metricsYear])].sort();

          return (
            <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>

              {/* ── Header ── */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
                <div>
                  <h2 style={{fontSize:'26px',fontWeight:'800',color:'#202020',margin:0}}>Practice Metrics</h2>
                  <div style={{fontSize:'13px',color:'#6b7280',marginTop:'2px'}}>Financial & growth performance — admin only</div>
                </div>
                <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                  {metricsSaveMsg && <span style={{fontSize:'13px',color:'#10b981',fontWeight:'700'}}>{metricsSaveMsg}</span>}
                  <select value={metricsYear} onChange={e => setMetricsYear(parseInt(e.target.value))}
                    style={{padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:'8px',fontSize:'13px',fontWeight:'600',backgroundColor:'white',cursor:'pointer'}}>
                    {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <div style={{display:'flex',border:'1px solid #d1d5db',borderRadius:'8px',overflow:'hidden'}}>
                    {['monthly','quarterly','annual'].map(v => (
                      <button key={v} onClick={() => setMetricsViewMode(v)}
                        style={{padding:'8px 14px',border:'none',fontSize:'12px',fontWeight:'600',cursor:'pointer',textTransform:'capitalize',
                          backgroundColor: metricsViewMode===v ? '#202020' : 'white',
                          color: metricsViewMode===v ? 'white' : '#374151'}}>
                        {v}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => {
                    const dash = getDashboardMonthData(metricsYear, new Date().getMonth()+1);
                    setMetricsForm({ year: metricsYear, month: new Date().getMonth()+1, net_production: '', collections: '', npe_scheduled: '',
                      npe_showed: String(dash.npe_showed), starts: String(dash.starts), obs_added: String(dash.obs_added), notes: '' });
                    setShowMetricsEntry(true);
                  }} style={{padding:'9px 16px',backgroundColor:'#2563EB',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer'}}>
                    + Enter Monthly Data
                  </button>
                  <button onClick={exportCSV}
                    style={{padding:'9px 12px',backgroundColor:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'12px',color:'#374151',cursor:'pointer',fontWeight:'600'}}>
                    Export CSV
                  </button>
                  <button onClick={() => setMetricsUnlocked(false)}
                    style={{padding:'9px 12px',backgroundColor:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'12px',color:'#6b7280',cursor:'pointer'}}>
                    Lock
                  </button>
                </div>
              </div>

              {/* ── This Month Spotlight ── */}
              {metricsYear === todayYr && (() => {
                const m = curMonthMetric;
                const g = getGoal(todayMo);
                const hasData = !!m;
                return (
                  <div style={{backgroundColor:'#202020',borderRadius:'12px',padding:'20px 24px',color:'white'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px',marginBottom: hasData ? '16px' : '0'}}>
                      <div>
                        <div style={{fontSize:'11px',fontWeight:'700',letterSpacing:'0.1em',textTransform:'uppercase',color:'rgba(255,255,255,0.5)',marginBottom:'2px'}}>Current Month</div>
                        <div style={{fontSize:'20px',fontWeight:'800'}}>{MONTHS[todayMo-1]} {todayYr}</div>
                      </div>
                      {!hasData && (
                        <button onClick={() => {
                          const dash = getDashboardMonthData(metricsYear, todayMo);
                          setMetricsForm({ year: metricsYear, month: todayMo, net_production:'', collections:'', npe_scheduled:'',
                            npe_showed: String(dash.npe_showed), starts: String(dash.starts), obs_added: String(dash.obs_added), notes:'' });
                          setShowMetricsEntry(true);
                        }} style={{padding:'9px 18px',backgroundColor:'#4A90E2',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer'}}>
                          + Enter This Month's Data
                        </button>
                      )}
                    </div>
                    {hasData && (
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:'16px'}}>
                        {[
                          { label:'Net Production', val: fmt$(m.net_production), goal: g?.production_goal ? fmt$(g.production_goal) : null, pct: g?.production_goal ? Math.round(m.net_production/g.production_goal*100) : null },
                          { label:'Collections',    val: fmt$(m.collections),    sub: m.net_production > 0 ? `${Math.round(m.collections/m.net_production*100)}% collected` : null },
                          { label:'Starts',         val: m.starts ?? '—',         goal: g?.start_goal ?? null, pct: g?.start_goal ? Math.round(m.starts/g.start_goal*100) : null },
                          { label:'Conversion',     val: fmtPct(m.conversion_rate), benchmark:'Target: 50%+',   good: m.conversion_rate >= 0.50 },
                          { label:'Show Rate',      val: fmtPct(m.show_up_rate),    benchmark:'Target: 70%+',   good: m.show_up_rate >= 0.70 },
                          { label:'Avg Case Fee',   val: fmt$(m.avg_case_fee),      benchmark:'Target: $5,800', good: m.avg_case_fee >= 5800 },
                        ].map(c => (
                          <div key={c.label}>
                            <div style={{fontSize:'10px',fontWeight:'700',textTransform:'uppercase',letterSpacing:'0.06em',color:'rgba(255,255,255,0.45)',marginBottom:'4px'}}>{c.label}</div>
                            <div style={{fontSize:'22px',fontWeight:'800',color: c.good === true ? '#6ee7b7' : c.good === false ? '#fca5a5' : 'white',lineHeight:1}}>{c.val}</div>
                            {c.goal   && <div style={{fontSize:'11px',color:'rgba(255,255,255,0.45)',marginTop:'3px'}}>Goal: {c.goal}{c.pct != null ? <span style={{marginLeft:'5px',fontWeight:'700',color: c.pct>=100?'#6ee7b7':c.pct>=80?'#fde68a':'#fca5a5'}}>{c.pct}%</span> : null}</div>}
                            {c.sub    && <div style={{fontSize:'11px',color:'rgba(255,255,255,0.45)',marginTop:'3px'}}>{c.sub}</div>}
                            {c.benchmark && <div style={{fontSize:'10px',color:'rgba(255,255,255,0.35)',marginTop:'2px'}}>{c.benchmark}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {!hasData && <div style={{fontSize:'13px',color:'rgba(255,255,255,0.45)'}}>No data entered yet for {MONTHS[todayMo-1]}.</div>}
                  </div>
                );
              })()}

              {/* ── Insights ── */}
              {autoInsights.length > 0 && (
                <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                  {autoInsights.map((ins, i) => (
                    <div key={i} style={{display:'flex',alignItems:'flex-start',gap:'10px',padding:'12px 16px',borderRadius:'8px',fontSize:'13px',
                      backgroundColor: ins.type==='good'?'#f0fdf4':ins.type==='warn'?'#fffbeb':'#f8fafc',
                      borderLeft: `3px solid ${ins.type==='good'?'#10b981':ins.type==='warn'?'#f59e0b':'#94a3b8'}`}}>
                      <span style={{fontSize:'14px',lineHeight:1,marginTop:'1px'}}>{ins.type==='good'?'✓':ins.type==='warn'?'!':'·'}</span>
                      <span style={{color: ins.type==='good'?'#166534':ins.type==='warn'?'#92400e':'#475569',lineHeight:'1.4'}}>{ins.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* ── YTD Summary Cards ── */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(155px,1fr))',gap:'14px'}}>
                {(() => {
                  const collRate = ytdCollRate;
                  const momProd  = momArrow(curMonthMetric?.net_production, prevMonthMetric?.net_production);
                  const momConv  = momArrow(curMonthMetric?.conversion_rate, prevMonthMetric?.conversion_rate);
                  const momFee   = momArrow(curMonthMetric?.avg_case_fee, prevMonthMetric?.avg_case_fee);
                  const momShow  = momArrow(curMonthMetric?.show_up_rate, prevMonthMetric?.show_up_rate);
                  const cards = [
                    { label:'YTD Production',    value: fmt$(ytdProd),     goal: ytdGoalProd>0?fmt$(ytdGoalProd):null,     pct: ytdGoalProd>0?Math.round(ytdProd/ytdGoalProd*100):null,       color:'#202020', mom: momProd },
                    { label:'YTD Collections',   value: fmt$(ytdColl),     color:'#374151',   sub: collRate!=null?`${Math.round(collRate*100)}% collection rate`:null, subColor: collRate!=null?(collRate>=0.98?'#10b981':collRate>=0.95?'#f59e0b':'#ef4444'):'#9ca3af', benchmark:'Target: 98%+' },
                    { label:'YTD Starts',        value: ytdStarts||'—',    goal: ytdGoalStarts>0?ytdGoalStarts:null,       pct: ytdGoalStarts>0?Math.round(ytdStarts/ytdGoalStarts*100):null, color:'#10b981' },
                    { label:'Avg Conversion',    value: fmtPct(avgConv),   color: avgConv>=0.50?'#10b981':avgConv>=0.35?'#f59e0b':avgConv?'#ef4444':'#9ca3af', benchmark:'Target: 50%+', mom: momConv },
                    { label:'Avg Case Fee',      value: fmt$(avgCaseFee),  color: avgCaseFee>=5800?'#10b981':avgCaseFee?'#f59e0b':'#9ca3af', benchmark:'Target: $5,800', mom: momFee, sub: avgCaseFee&&avgCaseFee<5800?`$${Math.round(5800-avgCaseFee).toLocaleString()} below goal`:avgCaseFee>=5800?'Above goal':null },
                    { label:'Avg Show Rate',     value: fmtPct(avgShowUp), color: avgShowUp>=0.70?'#10b981':avgShowUp>=0.50?'#f59e0b':avgShowUp?'#ef4444':'#9ca3af', benchmark:'Target: 70%+', mom: momShow },
                  ];
                  return cards.map(card => (
                    <div key={card.label} style={{backgroundColor:'white',borderRadius:'10px',padding:'18px 20px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',position:'relative'}}>
                      <div style={{fontSize:'11px',color:'#6b7280',fontWeight:'600',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:'4px'}}>{card.label}</div>
                      <div style={{display:'flex',alignItems:'baseline',gap:'6px'}}>
                        <div style={{fontSize:'28px',fontWeight:'800',color:card.color,lineHeight:1}}>{card.value}</div>
                        {card.mom && <span style={{fontSize:'11px',fontWeight:'700',color:card.mom.up?'#10b981':'#ef4444'}}>{card.mom.up?'↑':'↓'}{Math.abs(card.mom.pct)}%</span>}
                      </div>
                      {card.goal && <div style={{fontSize:'12px',color:'#9ca3af',marginTop:'4px'}}>Goal: {card.goal} · <span style={{fontWeight:'700',color:card.pct>=100?'#10b981':card.pct>=80?'#f59e0b':'#ef4444'}}>{card.pct}%</span></div>}
                      {card.sub  && <div style={{fontSize:'11px',color:card.subColor||'#9ca3af',marginTop:'3px',fontWeight:card.subColor?'700':'400'}}>{card.sub}</div>}
                      {card.benchmark && !card.sub && <div style={{fontSize:'10px',color:'#c4c9d4',marginTop:'2px'}}>{card.benchmark}</div>}
                    </div>
                  ));
                })()}
              </div>

              {/* ── MONTHLY TABLE ── */}
              {metricsViewMode === 'monthly' && (
                <div style={{backgroundColor:'white',borderRadius:'10px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',overflow:'hidden'}}>
                  {/* Table controls */}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',borderBottom:'1px solid #f3f4f6'}}>
                    <div style={{fontSize:'11px',color:'#9ca3af'}}>
                      Conversion = Starts ÷ (Shows − Observations). <span style={{color:'#6b7280'}}>Observation patients are excluded from the denominator.</span>
                    </div>
                    <button onClick={() => setShowDetailedMetricsCols(!showDetailedMetricsCols)}
                      style={{fontSize:'11px',fontWeight:'700',color:'#6b7280',background:'none',border:'1px solid #e5e7eb',borderRadius:'6px',padding:'4px 10px',cursor:'pointer',whiteSpace:'nowrap'}}>
                      {showDetailedMetricsCols ? 'Hide Details' : 'Show Details'}
                    </button>
                  </div>

                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                      <thead>
                        <tr style={{backgroundColor:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
                          <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Month</th>
                          <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Net Production</th>
                          <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Collections</th>
                          {showDetailedMetricsCols && <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Sched</th>}
                          <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Shows</th>
                          {showDetailedMetricsCols && <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Obs</th>}
                          <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Show Rate<div style={{fontSize:'9px',fontWeight:'400',color:'#c4c9d4',textTransform:'none',letterSpacing:0}}>Target 70%+</div></th>
                          <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Starts</th>
                          <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Conversion<div style={{fontSize:'9px',fontWeight:'400',color:'#c4c9d4',textTransform:'none',letterSpacing:0}}>Target 50%+</div></th>
                          <th style={{padding:'11px 13px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Avg Case Fee<div style={{fontSize:'9px',fontWeight:'400',color:'#c4c9d4',textTransform:'none',letterSpacing:0}}>Target $5,800</div></th>
                          <th style={{padding:'11px 13px'}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({length:12},(_,i)=>i+1).map(mo => {
                          const m  = getMetric(mo);
                          const g  = getGoal(mo);
                          const now = new Date();
                          const isCurrent = mo === todayMo && metricsYear === todayYr;
                          const isPast = new Date(metricsYear, mo-1, 28) < now;
                          const isFuture = !isPast && !isCurrent;
                          const collRateMo = m?.net_production > 0 ? m.collections / m.net_production : null;
                          return (
                            <tr key={mo} style={{borderBottom:'1px solid #f3f4f6',
                              backgroundColor: isCurrent ? '#f0fdf4' : !m&&isPast ? '#fffbeb' : 'white',
                              borderLeft: isCurrent ? '3px solid #10b981' : '3px solid transparent',
                              opacity: isFuture ? 0.55 : 1
                            }}>
                              <td style={{padding:'10px 13px',fontWeight:'700',color:'#374151',whiteSpace:'nowrap'}}>
                                {isCurrent && <span style={{fontSize:'9px',fontWeight:'800',color:'#10b981',marginRight:'5px',textTransform:'uppercase',letterSpacing:'0.05em'}}>Now</span>}
                                {!m && isPast && !isCurrent && <span style={{fontSize:'10px',color:'#d97706',marginRight:'4px'}}>!</span>}
                                {MONTHS[mo-1]}
                                {m?.notes && <span title={m.notes} style={{marginLeft:'5px',width:'6px',height:'6px',borderRadius:'50%',backgroundColor:'#2563EB',display:'inline-block',cursor:'help'}}></span>}
                              </td>
                              <td style={{padding:'10px 13px'}}>
                                <div style={{fontWeight:'700',color:vsColor(m?.net_production,g?.production_goal)}}>{m?fmt$(m.net_production):'—'}</div>
                                {g?.production_goal && <div style={{fontSize:'11px',color:'#9ca3af'}}>Goal: {fmt$(g.production_goal)}{m ? <span style={{marginLeft:'4px',fontWeight:'700',color:vsColor(m.net_production,g.production_goal)}}>{Math.round(m.net_production/g.production_goal*100)}%</span> : null}</div>}
                              </td>
                              <td style={{padding:'10px 13px'}}>
                                <div style={{fontWeight:'600',color:'#374151'}}>{m?fmt$(m.collections):'—'}</div>
                                {collRateMo!=null && <div style={{fontSize:'11px',fontWeight:'700',color:collRateMo>=0.98?'#10b981':collRateMo>=0.95?'#f59e0b':'#ef4444'}}>{Math.round(collRateMo*100)}%</div>}
                              </td>
                              {showDetailedMetricsCols && <td style={{padding:'10px 13px',color:'#6b7280'}}>{m?.npe_scheduled??'—'}</td>}
                              <td style={{padding:'10px 13px',color:'#374151'}}>{m?.npe_showed??'—'}</td>
                              {showDetailedMetricsCols && <td style={{padding:'10px 13px',color:'#6b7280'}}>{m?.obs_added??'—'}</td>}
                              <td style={{padding:'10px 13px'}}>
                                <span style={{fontWeight:'700',color:vsColor(m?.show_up_rate,0.70)}}>
                                  {m?.show_up_rate!=null?fmtPct(m.show_up_rate):'—'}
                                </span>
                              </td>
                              <td style={{padding:'10px 13px'}}>
                                <div style={{fontWeight:'700',color:vsColor(m?.starts,g?.start_goal)}}>{m?.starts??'—'}</div>
                                {g?.start_goal && <div style={{fontSize:'11px',color:'#9ca3af'}}>Goal: {g.start_goal}{m?.starts!=null ? <span style={{marginLeft:'4px',fontWeight:'700',color:vsColor(m.starts,g.start_goal)}}>{Math.round(m.starts/g.start_goal*100)}%</span> : null}</div>}
                              </td>
                              <td style={{padding:'10px 13px'}}>
                                <div style={{fontWeight:'700',color:vsColor(m?.conversion_rate,g?.conversion_goal||0.50)}}>{m?.conversion_rate!=null?fmtPct(m.conversion_rate):'—'}</div>
                                {g?.conversion_goal && <div style={{fontSize:'11px',color:'#9ca3af'}}>Goal: {fmtPct(g.conversion_goal)}</div>}
                              </td>
                              <td style={{padding:'10px 13px'}}>
                                <div style={{fontWeight:'700',color:vsColor(m?.avg_case_fee,5800)}}>{m?.avg_case_fee?fmt$(m.avg_case_fee):'—'}</div>
                                {m?.avg_case_fee && m.avg_case_fee < 5800 && <div style={{fontSize:'11px',color:'#ef4444'}}>−${(5800-Math.round(m.avg_case_fee)).toLocaleString()}</div>}
                              </td>
                              <td style={{padding:'10px 13px'}}>
                                <button onClick={() => {
                                  const dash = getDashboardMonthData(metricsYear, mo);
                                  setMetricsForm({
                                    year: metricsYear, month: mo,
                                    net_production: m?.net_production?String(m.net_production):'',
                                    collections:    m?.collections?String(m.collections):'',
                                    npe_scheduled:  m?.npe_scheduled?String(m.npe_scheduled):'',
                                    npe_showed:     m?.npe_showed!=null?String(m.npe_showed):String(dash.npe_showed),
                                    starts:         m?.starts!=null?String(m.starts):String(dash.starts),
                                    obs_added:      m?.obs_added!=null?String(m.obs_added):String(dash.obs_added),
                                    notes:          m?.notes||''
                                  });
                                  setShowMetricsEntry(true);
                                }} style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:'6px',backgroundColor:'white',fontSize:'12px',cursor:'pointer',color:'#374151',whiteSpace:'nowrap'}}>
                                  {m?'Edit':'Enter'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── QUARTERLY VIEW ── */}
              {metricsViewMode === 'quarterly' && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'16px'}}>
                  {[1,2,3,4].map(q => {
                    const qd = getQuarter(q);
                    const label = q===1?'Jan – Mar':q===2?'Apr – Jun':q===3?'Jul – Sep':'Oct – Dec';
                    const prodPct  = qd.prodGoal>0  ? Math.round(qd.production/qd.prodGoal*100)  : null;
                    const startPct = qd.startGoal>0 ? Math.round(qd.starts/qd.startGoal*100) : null;
                    return (
                      <div key={q} style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                        <div style={{fontSize:'18px',fontWeight:'800',color:'#202020',marginBottom:'2px'}}>Q{q} {metricsYear}</div>
                        <div style={{fontSize:'12px',color:'#9ca3af',marginBottom:'16px'}}>{label}</div>
                        {[
                          { label:'Production', val:fmt$(qd.production), goal:qd.prodGoal>0?fmt$(qd.prodGoal):null, pct:prodPct,  color:vsColor(qd.production,qd.prodGoal) },
                          { label:'Starts',     val:qd.starts||'0',      goal:qd.startGoal>0?qd.startGoal:null,    pct:startPct, color:vsColor(qd.starts,qd.startGoal) },
                          { label:'Avg Conversion', val:fmtPct(qd.conv), color:qd.conv>=0.50?'#10b981':qd.conv>=0.35?'#f59e0b':qd.conv?'#ef4444':'#9ca3af' },
                        ].map(row => (
                          <div key={row.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid #f3f4f6'}}>
                            <span style={{fontSize:'13px',color:'#6b7280'}}>{row.label}</span>
                            <div style={{textAlign:'right'}}>
                              <span style={{fontWeight:'700',color:row.color,fontSize:'14px'}}>{row.val}</span>
                              {row.goal && <div style={{fontSize:'11px',color:'#9ca3af'}}>Goal: {row.goal} · <span style={{color:row.color,fontWeight:'700'}}>{row.pct}%</span></div>}
                            </div>
                          </div>
                        ))}
                        {qd.months === 0 && <div style={{fontSize:'12px',color:'#9ca3af',marginTop:'8px'}}>No data entered yet</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── ANNUAL / YOY VIEW ── */}
              {metricsViewMode === 'annual' && (() => {
                const years = [...new Set(practiceMetrics.map(m=>m.year))].sort();
                if (!years.length) return <div style={{backgroundColor:'white',borderRadius:'10px',padding:'40px',textAlign:'center',color:'#9ca3af',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>No data yet. Enter monthly data to see annual trends.</div>;
                return (
                  <div style={{backgroundColor:'white',borderRadius:'10px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',overflow:'hidden'}}>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                        <thead>
                          <tr style={{backgroundColor:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
                            <th style={{padding:'12px 14px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em'}}>Metric</th>
                            {years.map(y => <th key={y} style={{padding:'12px 14px',textAlign:'right',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em'}}>{y}</th>)}
                            {years.length>=2 && <th style={{padding:'12px 14px',textAlign:'right',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.05em'}}>Growth</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { label:'Net Production',   key:'net_production',  fmt:v=>fmt$(v),       sum:true  },
                            { label:'Collections',      key:'collections',     fmt:v=>fmt$(v),       sum:true  },
                            { label:'NPE Scheduled',    key:'npe_scheduled',   fmt:v=>v?.toLocaleString()??'—', sum:true  },
                            { label:'Shows',            key:'npe_showed',      fmt:v=>v?.toLocaleString()??'—', sum:true  },
                            { label:'OBS Added',        key:'obs_added',       fmt:v=>v??'—',        sum:true  },
                            { label:'Starts',           key:'starts',          fmt:v=>v??'—',        sum:true  },
                            { label:'Avg Show Up Rate', key:'show_up_rate',    fmt:v=>fmtPct(v),     avg:true  },
                            { label:'Avg Conversion',   key:'conversion_rate', fmt:v=>fmtPct(v),     avg:true  },
                            { label:'Avg Case Fee',     key:'avg_case_fee',    fmt:v=>fmt$(v),       avg:true  },
                          ].map(row => {
                            const vals = years.map(y => {
                              const yms = practiceMetrics.filter(m => m.year===y && m[row.key]!=null);
                              if (!yms.length) return null;
                              if (row.sum) return yms.reduce((s,m)=>s+m[row.key],0);
                              if (row.avg) return yms.reduce((s,m)=>s+m[row.key],0)/yms.length;
                              return null;
                            });
                            const growth = years.length>=2 && vals[0] && vals[vals.length-1]
                              ? Math.round(((vals[vals.length-1]-vals[0])/vals[0])*100) : null;
                            return (
                              <tr key={row.label} style={{borderBottom:'1px solid #f3f4f6'}}>
                                <td style={{padding:'10px 14px',fontWeight:'600',color:'#374151'}}>{row.label}</td>
                                {vals.map((v,i) => <td key={i} style={{padding:'10px 14px',textAlign:'right',fontWeight:'700',color:'#202020'}}>{v!=null?row.fmt(v):'—'}</td>)}
                                {years.length>=2 && <td style={{padding:'10px 14px',textAlign:'right',fontWeight:'800',color:growth>=0?'#10b981':'#ef4444'}}>{growth!=null?`${growth>0?'+':''}${growth}%`:'—'}</td>}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* ── SMART GOAL BUILDER ── */}
              <div style={{backgroundColor:'white',borderRadius:'10px',padding:'20px 24px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px',marginBottom:showAIGoals?'20px':'0'}}>
                  <div>
                    <h3 style={{fontSize:'14px',fontWeight:'700',color:'#374151',margin:0}}>Smart Goal Builder</h3>
                    <div style={{fontSize:'12px',color:'#9ca3af',marginTop:'2px'}}>Trend-based projections using your historical data with seasonal patterns</div>
                  </div>
                  <button onClick={() => setShowAIGoals(!showAIGoals)}
                    style={{padding:'9px 16px',backgroundColor:showAIGoals?'#f3f4f6':'#202020',color:showAIGoals?'#374151':'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer'}}>
                    {showAIGoals ? 'Hide' : 'Build Goal Projections'}
                  </button>
                </div>

                {showAIGoals && aiSuggestions && (
                  <>
                    {/* Adjustment sliders */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:'16px',marginBottom:'20px',padding:'16px',backgroundColor:'#f9fafb',borderRadius:'8px'}}>
                      <div style={{fontSize:'12px',fontWeight:'700',color:'#374151',gridColumn:'1/-1',marginBottom:'2px'}}>Fine-tune targets from baseline (0% = trend baseline):</div>
                      {[
                        {key:'production',label:'Production'},
                        {key:'npe',label:'NPE Goal'},
                        {key:'starts',label:'Starts'},
                        {key:'conversion',label:'Conversion'},
                        {key:'case_fee',label:'Case Fee'},
                      ].map(({key,label}) => (
                        <div key={key}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                            <span style={{fontSize:'12px',color:'#6b7280',fontWeight:'600'}}>{label}</span>
                            <span style={{fontSize:'12px',fontWeight:'800',color:goalAdjust[key]>0?'#10b981':goalAdjust[key]<0?'#ef4444':'#374151'}}>
                              {goalAdjust[key]>0?'+':''}{goalAdjust[key]}%
                            </span>
                          </div>
                          <input type="range" min="-25" max="25" step="5" value={goalAdjust[key]}
                            onChange={e => setGoalAdjust({...goalAdjust,[key]:parseInt(e.target.value)})}
                            style={{width:'100%',accentColor:'#2563EB'}} />
                        </div>
                      ))}
                    </div>

                    {/* Suggestions table */}
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                        <thead>
                          <tr style={{backgroundColor:'#f9fafb',borderBottom:'2px solid #e5e7eb'}}>
                            {['Month','Prod Goal','NPE Goal','Start Goal','Conv Goal','Case Fee Goal',''].map(h => (
                              <th key={h} style={{padding:'10px 12px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em',whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {aiSuggestions.map((s,i) => (
                            <tr key={i} style={{borderBottom:'1px solid #f3f4f6'}}>
                              <td style={{padding:'9px 12px',fontWeight:'700',color:'#374151',whiteSpace:'nowrap'}}>{MONTHS[s.month-1]} {s.year}</td>
                              <td style={{padding:'9px 12px',color:'#374151'}}>{fmt$(s.production_goal)}</td>
                              <td style={{padding:'9px 12px',color:'#374151'}}>{s.npe_goal}</td>
                              <td style={{padding:'9px 12px',color:'#374151'}}>{s.start_goal}</td>
                              <td style={{padding:'9px 12px',color:'#374151'}}>{fmtPct(s.conversion_goal)}</td>
                              <td style={{padding:'9px 12px',color:'#374151'}}>{fmt$(s.avg_case_fee_goal)}</td>
                              <td style={{padding:'9px 12px'}}>
                                <button onClick={async () => {
                                  if (supabase) {
                                    await supabase.from('practice_goals').upsert({
                                      year: s.year, month: s.month, practice_id: currentUser.practiceId,
                                      production_goal: s.production_goal, npe_goal: s.npe_goal,
                                      start_goal: s.start_goal, conversion_goal: s.conversion_goal,
                                      avg_case_fee_goal: s.avg_case_fee_goal
                                    }, { onConflict: 'year,month,practice_id' });
                                    await loadPracticeMetrics();
                                  }
                                  setMetricsSaveMsg('Saved!');
                                  setTimeout(() => setMetricsSaveMsg(''), 2000);
                                }} style={{padding:'4px 10px',backgroundColor:'#f0fdf4',border:'1px solid #bbf7d0',color:'#166534',borderRadius:'5px',fontSize:'11px',fontWeight:'700',cursor:'pointer'}}>
                                  Save
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'14px',flexWrap:'wrap',gap:'10px'}}>
                      <div style={{fontSize:'12px',color:'#9ca3af'}}>
                        Trailing 3-month average with prior-year seasonal weighting. Save individual months or use Save All to apply every projection at once.
                      </div>
                      <button onClick={async () => {
                        if (supabase) {
                          await Promise.all(aiSuggestions.map(s =>
                            supabase.from('practice_goals').upsert({
                              year: s.year, month: s.month, practice_id: currentUser.practiceId,
                              production_goal: s.production_goal, npe_goal: s.npe_goal,
                              start_goal: s.start_goal, conversion_goal: s.conversion_goal,
                              avg_case_fee_goal: s.avg_case_fee_goal
                            }, { onConflict: 'year,month,practice_id' })
                          ));
                          await loadPracticeMetrics();
                        }
                        setMetricsSaveMsg(`All ${aiSuggestions.length} months saved!`);
                        setTimeout(() => setMetricsSaveMsg(''), 3000);
                      }} style={{padding:'9px 18px',backgroundColor:'#202020',color:'white',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:'700',cursor:'pointer',whiteSpace:'nowrap'}}>
                        Save All Goals
                      </button>
                    </div>
                  </>
                )}
                {showAIGoals && !aiSuggestions && (
                  <div style={{fontSize:'13px',color:'#9ca3af',marginTop:'12px'}}>Need at least 3 months of data to generate projections.</div>
                )}
              </div>

              {/* ── ENTRY MODAL ── */}
              {showMetricsEntry && (() => {
                const y   = parseInt(metricsForm.year);
                const mo  = parseInt(metricsForm.month);
                const npe_showed_v = metricsForm.npe_showed !== '' ? parseInt(metricsForm.npe_showed) : 0;
                const starts_v     = metricsForm.starts     !== '' ? parseInt(metricsForm.starts)     : 0;
                const obs_v        = metricsForm.obs_added  !== '' ? parseInt(metricsForm.obs_added)  : 0;
                const net_prod_v   = parseFloat(metricsForm.net_production.toString().replace(/[^0-9.]/g,'')) || 0;
                const npe_sched_v  = parseInt(metricsForm.npe_scheduled) || 0;
                const showUpCalc   = npe_sched_v > 0 ? Math.round((npe_showed_v / npe_sched_v) * 100) : null;
                const denom        = npe_showed_v - obs_v;
                const convCalc     = denom > 0 ? Math.round((starts_v / denom) * 100) : null;
                const feeCalc      = starts_v > 0 ? Math.round(net_prod_v / starts_v) : null;
                return (
                  <div style={{position:'fixed',inset:0,backgroundColor:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}}>
                    <div style={{backgroundColor:'white',borderRadius:'12px',padding:'28px',width:'100%',maxWidth:'540px',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 40px rgba(0,0,0,0.2)'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
                        <h3 style={{fontSize:'18px',fontWeight:'800',color:'#202020',margin:0}}>Enter Monthly Data</h3>
                        <button onClick={() => setShowMetricsEntry(false)} style={{background:'none',border:'none',fontSize:'22px',cursor:'pointer',color:'#6b7280',lineHeight:1}}>×</button>
                      </div>

                      {/* Month / Year */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'16px'}}>
                        {[
                          {field:'year', label:'Year', type:'select', options:[2025,2026,2027,2028]},
                          {field:'month',label:'Month',type:'select', options:MONTHS.map((n,i)=>({v:i+1,l:n}))},
                        ].map(f => (
                          <div key={f.field}>
                            <label style={{display:'block',fontSize:'12px',fontWeight:'600',color:'#374151',marginBottom:'4px'}}>{f.label}</label>
                            <select value={metricsForm[f.field]} onChange={e => {
                              const newForm = {...metricsForm, [f.field]: e.target.value};
                              const newY  = parseInt(f.field==='year'  ? e.target.value : metricsForm.year);
                              const newMo = parseInt(f.field==='month' ? e.target.value : metricsForm.month);
                              const dash = getDashboardMonthData(newY, newMo);
                              setMetricsForm({...newForm, npe_showed: String(dash.npe_showed), starts: String(dash.starts), obs_added: String(dash.obs_added)});
                            }} style={{width:'100%',padding:'10px',border:'1px solid #d1d5db',borderRadius:'7px',fontSize:'14px'}}>
                              {f.options.map(o => typeof o === 'object'
                                ? <option key={o.v} value={o.v}>{o.l}</option>
                                : <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>

                      {/* Manual entry */}
                      <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'10px'}}>From your practice management system</div>
                      <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'16px'}}>
                        {[
                          {key:'net_production',label:'Net Production',       hint:'Total production less discounts (incl. add-ons)'},
                          {key:'collections',   label:'Collections',          hint:'Actual cash collected this month'},
                          {key:'npe_scheduled', label:'NPE Scheduled',        hint:'Total exams scheduled in practice mgmt system'},
                        ].map(f => (
                          <div key={f.key}>
                            <label style={{display:'block',fontSize:'12px',fontWeight:'600',color:'#374151',marginBottom:'3px'}}>{f.label}</label>
                            <input value={metricsForm[f.key]} onChange={e => setMetricsForm({...metricsForm,[f.key]:e.target.value})}
                              placeholder={f.key==='npe_scheduled'?'0':'$0'}
                              style={{width:'100%',padding:'10px',border:'1px solid #d1d5db',borderRadius:'7px',fontSize:'14px',boxSizing:'border-box'}} />
                            <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'2px'}}>{f.hint}</div>
                          </div>
                        ))}
                      </div>

                      {/* Auto-pulled from dashboard */}
                      <div style={{fontSize:'11px',fontWeight:'700',color:'#9ca3af',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'10px'}}>Auto-pulled from NPE dashboard — override if needed</div>
                      <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'16px'}}>
                        {[
                          {key:'npe_showed', label:'Shows (patients entered in dashboard)'},
                          {key:'starts',     label:'Starts'},
                          {key:'obs_added',  label:'OBS Added (excluded from conversion denominator)'},
                        ].map(f => (
                          <div key={f.key}>
                            <label style={{display:'block',fontSize:'12px',fontWeight:'600',color:'#374151',marginBottom:'3px'}}>{f.label}</label>
                            <input value={metricsForm[f.key]} onChange={e => setMetricsForm({...metricsForm,[f.key]:e.target.value})}
                              style={{width:'100%',padding:'10px',border:'1px solid #bfdbfe',borderRadius:'7px',fontSize:'14px',backgroundColor:'#eff6ff',boxSizing:'border-box'}} />
                          </div>
                        ))}
                      </div>

                      {/* Calculated preview */}
                      <div style={{backgroundColor:'#f9fafb',borderRadius:'8px',padding:'14px',marginBottom:'16px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px'}}>
                        {[
                          {label:'Show Up Rate', val:showUpCalc?`${showUpCalc}%`:'—', color:showUpCalc>=70?'#10b981':showUpCalc>=50?'#f59e0b':showUpCalc?'#ef4444':'#9ca3af'},
                          {label:'Conversion',   val:convCalc?`${convCalc}%`:'—',    color:convCalc>=50?'#10b981':convCalc>=35?'#f59e0b':convCalc?'#ef4444':'#9ca3af'},
                          {label:'Avg Case Fee', val:feeCalc?`$${feeCalc.toLocaleString()}`:'—', color:feeCalc>=5800?'#10b981':feeCalc?'#f59e0b':'#9ca3af'},
                        ].map(c => (
                          <div key={c.label} style={{textAlign:'center'}}>
                            <div style={{fontSize:'11px',color:'#9ca3af',fontWeight:'700',textTransform:'uppercase',marginBottom:'4px'}}>{c.label}</div>
                            <div style={{fontSize:'20px',fontWeight:'800',color:c.color}}>{c.val}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'16px'}}>
                        Conversion = Starts ÷ (Shows − OBS). OBS patients attended but are not yet treatment candidates.
                      </div>

                      {/* Notes */}
                      <div style={{marginBottom:'20px'}}>
                        <label style={{display:'block',fontSize:'12px',fontWeight:'600',color:'#374151',marginBottom:'4px'}}>Notes (optional)</label>
                        <textarea value={metricsForm.notes} onChange={e => setMetricsForm({...metricsForm,notes:e.target.value})}
                          rows={2} placeholder="Notable events, staff changes, marketing campaigns..."
                          style={{width:'100%',padding:'10px',border:'1px solid #d1d5db',borderRadius:'7px',fontSize:'14px',boxSizing:'border-box',resize:'vertical'}} />
                      </div>

                      <div style={{display:'flex',gap:'10px'}}>
                        <button onClick={() => setShowMetricsEntry(false)}
                          style={{flex:1,padding:'12px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'14px',fontWeight:'600',cursor:'pointer',backgroundColor:'white',color:'#374151'}}>
                          Cancel
                        </button>
                        <button onClick={saveMetric}
                          style={{flex:2,padding:'12px',border:'none',borderRadius:'8px',fontSize:'14px',fontWeight:'700',cursor:'pointer',backgroundColor:'#202020',color:'white'}}>
                          Save Month
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>
          );
        })()}

        {/* SETTINGS */}
        {currentView === 'settings' && (
          <div style={{maxWidth:'1200px'}}>
            <h2 style={{fontSize:'28px',fontWeight:'bold',color:'#202020',marginBottom:'24px'}}>Goals & Settings</h2>

            {/* ADMIN PANEL */}
            <div style={{backgroundColor:'white',border:'2px solid #202020',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',marginBottom:'24px'}}>
              <h3 style={{fontSize:'20px',fontWeight:'bold',color:'#202020',marginBottom:'16px'}}>⚙️ Admin Panel</h3>
                <div style={{display:'flex',flexDirection:'column',gap:'24px'}}>
                  {adminMsg && (
                    <div style={{padding:'10px 16px',backgroundColor:'#dcfce7',border:'1px solid #86efac',borderRadius:'6px',color:'#166534',fontWeight:'600'}}>
                      {adminMsg}
                    </div>
                  )}

                  {/* Team Management */}
                  <div style={{padding:'20px',backgroundColor:'#f9fafb',borderRadius:'8px',border:'1px solid #e5e7eb'}}>
                    <h4 style={{fontSize:'16px',fontWeight:'bold',marginBottom:'4px',color:'#202020'}}>Team Management</h4>
                    <p style={{fontSize:'12px',color:'#6b7280',marginBottom:'16px'}}>Add TCs and manage their access. Each person signs in with their own email and password.</p>
                    {tcMgmtMsg && <div style={{padding:'8px 12px',borderRadius:'6px',marginBottom:'12px',fontSize:'13px',fontWeight:'600',backgroundColor: tcMgmtMsg.startsWith('Error') ? '#fef2f2' : '#f0fdf4',color: tcMgmtMsg.startsWith('Error') ? '#ef4444' : '#166534'}}>{tcMgmtMsg}</div>}

                    {/* Existing users table */}
                    {tcUsers.length > 0 && (
                      <table style={{width:'100%',borderCollapse:'collapse',marginBottom:'20px',fontSize:'13px'}}>
                        <thead>
                          <tr style={{borderBottom:'2px solid #e5e7eb'}}>
                            {['Name','Email','Role','Status',''].map(h => (
                              <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:'11px',fontWeight:'700',color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.04em'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tcUsers.map(u => (
                            <tr key={u.id} style={{borderBottom:'1px solid #f3f4f6'}}>
                              <td style={{padding:'10px',fontWeight:'700',color:'#374151'}}>{u.name}{u.id === (currentUser?.id || '') ? <span style={{marginLeft:'6px',fontSize:'10px',color:'#2563EB',fontWeight:'800'}}>YOU</span> : null}</td>
                              <td style={{padding:'10px',color:'#6b7280'}}>{u.email}</td>
                              <td style={{padding:'10px'}}>
                                <span style={{padding:'2px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:'700',backgroundColor: u.role==='admin'?'#fef3c7':'#eff6ff',color: u.role==='admin'?'#92400e':'#1e40af'}}>
                                  {u.role === 'admin' ? 'Admin' : 'TC'}
                                </span>
                              </td>
                              <td style={{padding:'10px'}}>
                                <span style={{padding:'2px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:'700',backgroundColor: u.auth_user_id?'#f0fdf4':'#f9fafb',color: u.auth_user_id?'#166534':'#9ca3af'}}>
                                  {u.auth_user_id ? 'Active' : 'Pending Setup'}
                                </span>
                              </td>
                              <td style={{padding:'10px'}}>
                                {u.email !== currentUser?.email && (
                                  <button onClick={async () => {
                                    const newStatus = u.status === 'active' ? 'inactive' : 'active';
                                    await supabase.from('tc_users').update({ status: newStatus }).eq('id', u.id);
                                    await loadTCUsers();
                                    setTcMgmtMsg(`${u.name} ${newStatus === 'active' ? 'reactivated' : 'deactivated'}.`);
                                    setTimeout(() => setTcMgmtMsg(''), 3000);
                                  }} style={{fontSize:'11px',padding:'4px 10px',border:'1px solid #e5e7eb',borderRadius:'5px',cursor:'pointer',backgroundColor:'white',color: u.status==='active'?'#ef4444':'#10b981',fontWeight:'600'}}>
                                    {u.status === 'active' ? 'Deactivate' : 'Reactivate'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {/* Add TC form */}
                    <div style={{borderTop: tcUsers.length > 0 ? '1px solid #e5e7eb' : 'none', paddingTop: tcUsers.length > 0 ? '16px' : '0'}}>
                      <div style={{fontSize:'12px',fontWeight:'700',color:'#374151',marginBottom:'10px'}}>Add a Team Member</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto auto',gap:'8px',alignItems:'end'}}>
                        <div>
                          <label style={{display:'block',fontSize:'11px',fontWeight:'600',color:'#6b7280',marginBottom:'4px'}}>Name</label>
                          <input value={newTCName} onChange={e => setNewTCName(e.target.value)} placeholder="First name"
                            style={{width:'100%',padding:'9px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'13px',boxSizing:'border-box'}} />
                        </div>
                        <div>
                          <label style={{display:'block',fontSize:'11px',fontWeight:'600',color:'#6b7280',marginBottom:'4px'}}>Email</label>
                          <input value={newTCEmail} onChange={e => setNewTCEmail(e.target.value)} placeholder="email@example.com" type="email"
                            style={{width:'100%',padding:'9px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'13px',boxSizing:'border-box'}} />
                        </div>
                        <div>
                          <label style={{display:'block',fontSize:'11px',fontWeight:'600',color:'#6b7280',marginBottom:'4px'}}>Role</label>
                          <select value={newTCRole} onChange={e => setNewTCRole(e.target.value)}
                            style={{padding:'9px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'13px'}}>
                            <option value="tc">TC</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <button onClick={async () => {
                          if (!newTCName.trim() || !newTCEmail.trim()) return setTcMgmtMsg('Error: Name and email are required.');
                          const { error } = await supabase.from('tc_users').insert({ name: newTCName.trim(), email: newTCEmail.trim().toLowerCase(), role: newTCRole, status: 'active', practice_id: currentUser.practiceId });
                          if (error) { setTcMgmtMsg('Error: ' + (error.message || 'Could not add user.')); return; }
                          setNewTCName(''); setNewTCEmail(''); setNewTCRole('tc');
                          await loadTCUsers();
                          setTcMgmtMsg(`${newTCName} added. Ask them to visit the dashboard and click "Set up your account" using ${newTCEmail}.`);
                          setTimeout(() => setTcMgmtMsg(''), 8000);
                        }} style={{padding:'9px 16px',backgroundColor:'#202020',color:'white',border:'none',borderRadius:'6px',fontSize:'13px',fontWeight:'700',cursor:'pointer',whiteSpace:'nowrap'}}>
                          Add
                        </button>
                      </div>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginTop:'8px'}}>
                        After adding, send them the dashboard URL and ask them to click "Set up your account" with their email. Their status will show Active once they've signed in.
                      </div>
                    </div>
                  </div>

                  {/* Change Dashboard Password */}
                  <div style={{padding:'20px',backgroundColor:'#f9fafb',borderRadius:'8px',border:'1px solid #e5e7eb'}}>
                    <h4 style={{fontSize:'16px',fontWeight:'bold',marginBottom:'4px',color:'#202020'}}>🔑 Change Dashboard Password</h4>
                    <p style={{fontSize:'12px',color:'#6b7280',marginBottom:'16px'}}>Legacy shared password — no longer needed with individual logins.</p>
                    <div style={{display:'grid',gap:'10px',maxWidth:'400px'}}>
                      {/* #10: show/hide toggle on dashboard password */}
                      <div style={{position:'relative'}}>
                        <input type={showDashPw ? 'text' : 'password'} placeholder="New dashboard password"
                          value={newDashPw} onChange={e => setNewDashPw(e.target.value)}
                          style={{padding:'8px 36px 8px 12px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px',width:'100%'}} />
                        <button onClick={() => setShowDashPw(v => !v)}
                          style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:'15px',color:'#6b7280',padding:0}}>
                          {showDashPw ? '🙈' : '👁'}
                        </button>
                      </div>
                      <div style={{position:'relative'}}>
                        <input type={showDashPwConfirm ? 'text' : 'password'} placeholder="Confirm new password"
                          value={newDashPwConfirm} onChange={e => setNewDashPwConfirm(e.target.value)}
                          style={{padding:'8px 36px 8px 12px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px',width:'100%'}} />
                        <button onClick={() => setShowDashPwConfirm(v => !v)}
                          style={{position:'absolute',right:'8px',top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',fontSize:'15px',color:'#6b7280',padding:0}}>
                          {showDashPwConfirm ? '🙈' : '👁'}
                        </button>
                      </div>
                      {/* #1: warning about session logout */}
                      <div style={{fontSize:'12px',color:'#92400e',backgroundColor:'#fffbeb',padding:'8px 12px',borderRadius:'4px',border:'1px solid #fde68a'}}>
                        ⚠️ Saving a new password will log out any "Remember me" sessions on all devices. TCs will need to log in again.
                      </div>
                      <button
                        onClick={async () => {
                          if (!newDashPw) return setAdminMsg('Enter a password');
                          if (newDashPw !== newDashPwConfirm) return setAdminMsg('Passwords do not match');
                          localStorage.setItem('npe-dashboard-password', newDashPw);
                          await dbSaveSettings('dashboard-password', newDashPw);
                          localStorage.removeItem('npe-auth');
                          setNewDashPw(''); setNewDashPwConfirm('');
                          setAdminMsg('✅ Dashboard password updated & synced to cloud!');
                          setTimeout(() => setAdminMsg(''), 4000);
                        }}
                        style={{padding:'8px 20px',backgroundColor:'#202020',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontWeight:'600',width:'fit-content'}}
                      >
                        Save Dashboard Password
                      </button>
                    </div>
                  </div>

                  {/* Bonus Rate Editor */}
                  <div style={{padding:'20px',backgroundColor:'#f9fafb',borderRadius:'8px',border:'1px solid #e5e7eb'}}>
                    <h4 style={{fontSize:'16px',fontWeight:'bold',marginBottom:'4px',color:'#202020'}}>💰 Bonus Rates</h4>
                    <p style={{fontSize:'12px',color:'#6b7280',marginBottom:'16px'}}>Rates appear in the Bonus Audit tab and are calculated per qualifying patient.</p>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:'16px',marginBottom:'16px'}}>
                      {[
                        {key:'sds', label:'SDS Bonus', desc:'Patient starts treatment same day as NPE'},
                        {key:'ret', label:'Retainer Bonus', desc:'Retainer add-on included at start (R+)'},
                        {key:'white', label:'Whitening Bonus', desc:'Whitening add-on included at start (W+)'},
                        {key:'pif', label:'PIF Bonus', desc:'Patient pays in full (no financing)'},
                      ].map(({key, label, desc}) => (
                        <div key={key} style={{backgroundColor:'white',padding:'12px',borderRadius:'6px',border:'1px solid #e5e7eb'}}>
                          <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'2px'}}>{label}</label>
                          <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'8px'}}>{desc}</div>
                          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                            <span style={{fontSize:'16px',fontWeight:'600',color:'#6b7280'}}>$</span>
                            <input
                              type="number" min="0"
                              value={bonusRates[key]}
                              onChange={e => setBonusRates(prev => ({...prev, [key]: Number(e.target.value)}))}
                              style={{padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'16px',fontWeight:'600',width:'80px'}}
                            />
                            <span style={{fontSize:'13px',color:'#6b7280'}}>/ patient</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        localStorage.setItem('npe-bonus-rates', JSON.stringify(bonusRates));
                        setSaveToast('⏳ Saving bonus rates...');
                        const { error } = await supabase.from('settings').upsert(
                          { key: 'bonus-rates', value: bonusRates, practice_id: currentUser.practiceId },
                          { onConflict: 'key,practice_id' }
                        );
                        if (error) {
                          setSaveToast('❌ Bonus rates save failed: ' + error.message);
                        } else {
                          setSaveToast('✅ Bonus rates saved to cloud!');
                        }
                        setTimeout(() => setSaveToast(''), 4000);
                      }}
                      style={{padding:'8px 20px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontWeight:'600'}}
                    >
                      Save Bonus Rates
                    </button>
                  </div>
                </div>
            </div>

            {/* Popup Bonus Campaigns */}
            <div style={{backgroundColor:'white',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',marginBottom:'24px'}}>
              <h3 style={{fontSize:'20px',fontWeight:'bold',color:'#202020',marginBottom:'4px'}}>🎯 Popup Bonus Campaigns</h3>
              <p style={{fontSize:'13px',color:'#6b7280',marginBottom:'20px'}}>
                Run a time-limited bonus for starts off the pending list. TCs will see the active campaign in their Follow-Up Queue.
              </p>

              {/* Create form */}
              <div style={{backgroundColor:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'20px',marginBottom:'24px'}}>
                <h4 style={{fontSize:'15px',fontWeight:'700',color:'#374151',marginBottom:'16px',marginTop:0}}>Create New Campaign</h4>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'12px'}}>
                  <div>
                    <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'4px'}}>Campaign Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. April Pending Push"
                      value={popupBonusForm.name}
                      onChange={e => setPopupBonusForm(f => ({...f, name: e.target.value}))}
                      style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}}
                    />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'4px'}}>$ Per Start *</label>
                    <input
                      type="number"
                      min="1"
                      value={popupBonusForm.amount}
                      onChange={e => setPopupBonusForm(f => ({...f, amount: Number(e.target.value)}))}
                      style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}}
                    />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'4px'}}>Start Date *</label>
                    <input
                      type="date"
                      value={popupBonusForm.startDate}
                      onChange={e => setPopupBonusForm(f => ({...f, startDate: e.target.value}))}
                      style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}}
                    />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'4px'}}>End Date *</label>
                    <input
                      type="date"
                      value={popupBonusForm.endDate}
                      onChange={e => setPopupBonusForm(f => ({...f, endDate: e.target.value}))}
                      style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}}
                    />
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'4px'}}>TC (or All)</label>
                    <select
                      value={popupBonusForm.tcFilter}
                      onChange={e => setPopupBonusForm(f => ({...f, tcFilter: e.target.value}))}
                      style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}}
                    >
                      <option value="All">All TCs</option>
                      {tcList.map(tc => <option key={tc} value={tc}>{tc}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{display:'block',fontSize:'13px',fontWeight:'600',color:'#374151',marginBottom:'4px'}}>Note for TC (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Patients from PMS pending report"
                      value={popupBonusForm.description}
                      onChange={e => setPopupBonusForm(f => ({...f, description: e.target.value}))}
                      style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px',fontSize:'14px'}}
                    />
                  </div>
                </div>
                <button
                  disabled={!popupBonusForm.name || !popupBonusForm.startDate || !popupBonusForm.endDate}
                  onClick={async () => {
                    const newBonus = { ...popupBonusForm, id: Date.now().toString(), createdAt: new Date().toISOString() };
                    const updated = [...popupBonuses, newBonus];
                    setPopupBonuses(updated);
                    await dbSaveSettings('popup-bonuses', updated);
                    setPopupBonusForm({ name: '', amount: 10, startDate: '', endDate: '', description: '', tcFilter: 'All' });
                    setSaveToast('🎯 Popup bonus campaign created!');
                    setTimeout(() => setSaveToast(''), 3000);
                  }}
                  style={{padding:'10px 24px',backgroundColor: (!popupBonusForm.name || !popupBonusForm.startDate || !popupBonusForm.endDate) ? '#d1d5db' : '#2563EB',color:'white',border:'none',borderRadius:'6px',fontWeight:'700',cursor: (!popupBonusForm.name || !popupBonusForm.startDate || !popupBonusForm.endDate) ? 'not-allowed' : 'pointer',fontSize:'14px'}}
                >
                  Launch Campaign
                </button>
              </div>

              {/* Existing campaigns */}
              {popupBonuses.length === 0 ? (
                <div style={{fontSize:'14px',color:'#9ca3af'}}>No campaigns created yet.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                  {[...popupBonuses].reverse().map(bonus => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const isActive = todayStr >= bonus.startDate && todayStr <= bonus.endDate;
                    const isEnded = todayStr > bonus.endDate;
                    const qualifying = patients.filter(p =>
                      (p.fromPending || p.ST) &&
                      p.startDate >= bonus.startDate && p.startDate <= bonus.endDate &&
                      (bonus.tcFilter === 'All' || p.tc === bonus.tcFilter)
                    );
                    const earned = qualifying.reduce((sum, p) => sum + bonus.amount + (p['R+'] ? bonusRates.ret : 0) + (p['W+'] ? bonusRates.white : 0), 0);
                    return (
                      <div key={bonus.id} style={{display:'flex',alignItems:'center',gap:'16px',padding:'14px 16px',backgroundColor: isActive ? '#f0fdf4' : '#f9fafb',border:`1px solid ${isActive ? '#86efac' : '#e5e7eb'}`,borderRadius:'8px',flexWrap:'wrap'}}>
                        <div style={{flex:1,minWidth:'200px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'2px'}}>
                            <span style={{fontWeight:'700',color:'#374151'}}>{bonus.name}</span>
                            <span style={{fontSize:'11px',fontWeight:'700',padding:'2px 8px',borderRadius:'10px',
                              backgroundColor: isActive ? '#dcfce7' : isEnded ? '#f3f4f6' : '#fef3c7',
                              color: isActive ? '#166534' : isEnded ? '#9ca3af' : '#92400e'
                            }}>
                              {isActive ? 'ACTIVE' : isEnded ? 'ENDED' : 'UPCOMING'}
                            </span>
                          </div>
                          <div style={{fontSize:'12px',color:'#6b7280'}}>
                            ${bonus.amount}/start + ${bonusRates.ret} ret + ${bonusRates.white} whitening · {bonus.tcFilter === 'All' ? 'All TCs' : bonus.tcFilter} · {bonus.startDate} → {bonus.endDate}
                            {bonus.description && <span> · <em>{bonus.description}</em></span>}
                          </div>
                        </div>
                        <div style={{textAlign:'center'}}>
                          <div style={{fontSize:'20px',fontWeight:'800',color:'#10b981'}}>${earned}</div>
                          <div style={{fontSize:'11px',color:'#9ca3af'}}>{qualifying.length} starts</div>
                        </div>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete campaign "${bonus.name}"?`)) return;
                            const updated = popupBonuses.filter(b => b.id !== bonus.id);
                            setPopupBonuses(updated);
                            await dbSaveSettings('popup-bonuses', updated);
                          }}
                          style={{padding:'6px 12px',backgroundColor:'transparent',border:'1px solid #fca5a5',color:'#dc2626',borderRadius:'4px',fontSize:'12px',cursor:'pointer'}}
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* TC Management */}
            <div style={{backgroundColor:'white',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',marginBottom:'24px'}}>
              <h3 style={{fontSize:'20px',fontWeight:'bold',color:'#202020',marginBottom:'4px'}}>👤 Treatment Coordinators</h3>
              <p style={{fontSize:'13px',color:'#6b7280',marginBottom:'16px'}}>★ = default TC pre-selected when adding new patients. Press Enter or click + Add TC to add.</p>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'16px'}}>
                {tcList.map(tc => {
                  const isDefault = tc === defaultTC;
                  const patientCount = patients.filter(p => p.tc === tc).length;
                  return (
                    <div key={tc} style={{display:'flex',alignItems:'center',gap:'6px',padding:'8px 14px',
                      backgroundColor: isDefault ? '#fefce8' : '#f0f9ff',
                      border: isDefault ? '2px solid #fbbf24' : '1px solid #bae6fd',
                      borderRadius:'8px'}}>
                      {/* #8: Star to set as default TC */}
                      <button
                        onClick={() => { setDefaultTC(tc); localStorage.setItem('npe-default-tc', tc); setNewPatientForm(f => ({...f, tc})); }}
                        title={isDefault ? 'Default TC' : 'Set as default TC'}
                        style={{background:'none',border:'none',cursor:'pointer',fontSize:'16px',padding:'0',lineHeight:1,color: isDefault ? '#f59e0b' : '#d1d5db'}}
                      >★</button>
                      <span style={{fontWeight: isDefault ? '700' : '500'}}>{tc}</span>
                      <span style={{fontSize:'11px',color:'#9ca3af'}}>({patientCount})</span>
                      {tcList.length > 1 && (
                        <button
                          onClick={() => {
                            // #7: warn if TC has patients
                            if (patientCount > 0) {
                              if (!confirm(`⚠️ ${tc} has ${patientCount} patient${patientCount>1?'s':''} assigned. They will keep "${tc}" in their records but it won't appear in new patient forms. Remove anyway?`)) return;
                            }
                            const next = tcList.filter(t => t !== tc);
                            setTcList(next);
                            if (defaultTC === tc) {
                              const fallback = next[0] || '';
                              setDefaultTC(fallback);
                              localStorage.setItem('npe-default-tc', fallback);
                            }
                          }}
                          style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',fontWeight:'bold',fontSize:'16px',lineHeight:1,padding:'0 2px'}}
                        >×</button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{display:'flex',gap:'8px'}}>
                <input ref={newTCRef} type="text" placeholder="New TC name..."
                  style={{padding:'8px 12px',border:'1px solid #d1d5db',borderRadius:'4px',flex:1,fontSize:'14px'}}
                  onKeyDown={e => { if (e.key === 'Enter') { const n = e.target.value.trim(); if (n && !tcList.includes(n)) { setTcList([...tcList, n]); e.target.value = ''; } } }}
                />
                <button onClick={() => { const n = newTCRef.current.value.trim(); if (n && !tcList.includes(n)) { setTcList([...tcList, n]); newTCRef.current.value = ''; } }}
                  style={{padding:'8px 20px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontWeight:'600'}}>
                  + Add TC
                </button>
              </div>
            </div>

            {/* Supabase Status (#9) */}
            <div style={{backgroundColor: supabase ? '#dcfce7' : '#fef3c7', padding:'16px 20px',borderRadius:'8px',border:`1px solid ${supabase ? '#86efac' : '#fde68a'}`,marginBottom:'24px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'12px'}}>
                <div>
                  <strong style={{color: supabase ? '#166534' : '#92400e',fontSize:'15px'}}>
                    {supabase ? '✅ Cloud Sync Active (Supabase)' : '⚠️ Running in local-only mode'}
                  </strong>
                  {supabase && (
                    <div style={{fontSize:'13px',color:'#166534',marginTop:'4px'}}>
                      {patients.length} patient{patients.length !== 1 ? 's' : ''} in sync
                      {supabaseTestResult && supabaseTestResult !== 'testing' && (
                        <span style={{marginLeft:'12px',color: supabaseTestResult.ok ? '#166534' : '#dc2626'}}>
                          {supabaseTestResult.ok ? `· Last test: ✓ ${supabaseTestResult.count} records confirmed` : `· Last test: ✗ ${supabaseTestResult.error}`}
                        </span>
                      )}
                    </div>
                  )}
                  {!supabase && <div style={{fontSize:'12px',color:'#92400e',marginTop:'4px'}}>Paste your Supabase URL & anon key in the code to enable cloud sync.</div>}
                </div>
                {supabase && (
                  <button
                    onClick={async () => {
                      setSupabaseTestResult('testing');
                      try {
                        const { data, error, count } = await supabase.from('patients').select('id', { count: 'exact', head: true });
                        if (error) throw error;
                        setSupabaseTestResult({ ok: true, count: count ?? patients.length });
                      } catch(e) {
                        setSupabaseTestResult({ ok: false, error: e.message || 'Connection failed' });
                      }
                    }}
                    style={{padding:'8px 16px',backgroundColor: supabaseTestResult === 'testing' ? '#d1d5db' : 'white',border:'1px solid #86efac',borderRadius:'6px',cursor: supabaseTestResult === 'testing' ? 'default' : 'pointer',fontWeight:'600',fontSize:'13px',color:'#166534'}}
                    disabled={supabaseTestResult === 'testing'}
                  >
                    {supabaseTestResult === 'testing' ? '⏳ Testing...' : '🔄 Test Connection'}
                  </button>
                )}
              </div>
            </div>

            <div style={{backgroundColor:'white',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',marginBottom:'24px'}}>
              {/* #4: Top save bar so you don't have to scroll to the bottom */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'24px',flexWrap:'wrap',gap:'12px'}}>
                <div>
                  <h3 style={{fontSize:'20px',fontWeight:'bold',color:'#202020',margin:0}}>Annual Goals — {new Date().getFullYear()}</h3>
                  <p style={{fontSize:'13px',color:'#9ca3af',marginTop:'4px'}}>Set monthly and quarterly targets. Past months are locked.</p>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
                  {goalsSaveMsg && <span style={{color:'#10b981',fontWeight:'600',fontSize:'15px'}}>{goalsSaveMsg}</span>}
                  <button
                    onClick={async () => {
                      localStorage.setItem('npe-goals', JSON.stringify(goals));
                      await dbSaveSettings('goals', goals);
                      setGoalsSaveMsg('✅ Goals saved!');
                      setTimeout(() => setGoalsSaveMsg(''), 3000);
                    }}
                    style={{padding:'10px 24px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer',fontSize:'15px'}}>
                    💾 Save All Goals
                  </button>
                </div>
              </div>

              {/* Monthly Goals */}
              {(() => {
                const curMonth = new Date().getMonth(); // 0-indexed
                const curYear = new Date().getFullYear();
                const isGoalYear = curYear === new Date().getFullYear();
                // Annual totals (#6)
                const totCarNPE = goals.monthly.reduce((s,m) => s + (m.carNPE||0), 0);
                const totCarStarted = goals.monthly.reduce((s,m) => s + (m.carStarted||0), 0);
                const totApoNPE = goals.monthly.reduce((s,m) => s + (m.apoNPE||0), 0);
                const totApoStarted = goals.monthly.reduce((s,m) => s + (m.apoStarted||0), 0);
                return (
                  <div style={{marginBottom:'32px'}}>
                    <h4 style={{fontSize:'18px',fontWeight:'bold',marginBottom:'16px',color:'#202020'}}>📅 Monthly Goals - {new Date().getFullYear()}</h4>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'13px'}}>
                        <thead>
                          <tr style={{borderBottom:'2px solid #e5e7eb'}}>
                            <th style={{padding:'12px 8px',textAlign:'left',fontWeight:'600',color:'#6b7280'}}>Month</th>
                            <th style={{padding:'12px 8px',textAlign:'center',fontWeight:'600',color:'#6b7280'}}>🏢 Car NPE</th>
                            <th style={{padding:'12px 8px',textAlign:'center',fontWeight:'600',color:'#6b7280'}}>🏢 Car Started</th>
                            <th style={{padding:'12px 8px',textAlign:'center',fontWeight:'600',color:'#6b7280'}}>🏖️ Apo NPE</th>
                            <th style={{padding:'12px 8px',textAlign:'center',fontWeight:'600',color:'#6b7280'}}>🏖️ Apo Started</th>
                            <th style={{padding:'12px 8px',textAlign:'center',fontWeight:'600',color:'#2563EB'}}>🎯 Conv %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, i) => {
                            // #3: Past months are read-only and greyed out
                            const isPast = isGoalYear && i < curMonth;
                            const isCurrent = isGoalYear && i === curMonth;
                            return (
                              <tr key={month} style={{
                                borderBottom:'1px solid #F5F5F5',
                                backgroundColor: isPast ? '#f9fafb' : isCurrent ? '#fffbeb' : 'white',
                                opacity: isPast ? 0.7 : 1
                              }}>
                                <td style={{padding:'12px 8px',fontWeight: isCurrent ? '700' : '500', color: isPast ? '#9ca3af' : isCurrent ? '#92400e' : '#202020'}}>
                                  {month}
                                  {isCurrent && <span style={{marginLeft:'6px',fontSize:'10px',fontWeight:'700',color:'#2563EB',backgroundColor:'#fed7aa',padding:'1px 6px',borderRadius:'3px'}}>NOW</span>}
                                  {isPast && <span style={{marginLeft:'6px',fontSize:'10px',color:'#d1d5db'}}>past</span>}
                                </td>
                                <td style={{padding:'8px',textAlign:'center'}}>
                                  <input type="number" value={goals.monthly[i].carNPE} readOnly={isPast}
                                    onChange={e => !isPast && setGoals({...goals, monthly: goals.monthly.map((m,j) => j===i ? {...m, carNPE: Number(e.target.value)} : m)})}
                                    style={{width:'60px',padding:'6px',border: isPast ? '1px solid #f3f4f6' : '1px solid #d1d5db',borderRadius:'4px',textAlign:'center', backgroundColor: isPast ? '#f3f4f6' : 'white', color: isPast ? '#9ca3af' : '#202020', cursor: isPast ? 'not-allowed' : 'auto'}} />
                                </td>
                                <td style={{padding:'8px',textAlign:'center'}}>
                                  <input type="number" value={goals.monthly[i].carStarted} readOnly={isPast}
                                    onChange={e => !isPast && setGoals({...goals, monthly: goals.monthly.map((m,j) => j===i ? {...m, carStarted: Number(e.target.value)} : m)})}
                                    style={{width:'60px',padding:'6px',border: isPast ? '1px solid #f3f4f6' : '1px solid #d1d5db',borderRadius:'4px',textAlign:'center', backgroundColor: isPast ? '#f3f4f6' : 'white', color: isPast ? '#9ca3af' : '#202020', cursor: isPast ? 'not-allowed' : 'auto'}} />
                                </td>
                                <td style={{padding:'8px',textAlign:'center'}}>
                                  <input type="number" value={goals.monthly[i].apoNPE} readOnly={isPast}
                                    onChange={e => !isPast && setGoals({...goals, monthly: goals.monthly.map((m,j) => j===i ? {...m, apoNPE: Number(e.target.value)} : m)})}
                                    style={{width:'60px',padding:'6px',border: isPast ? '1px solid #f3f4f6' : '1px solid #d1d5db',borderRadius:'4px',textAlign:'center', backgroundColor: isPast ? '#f3f4f6' : 'white', color: isPast ? '#9ca3af' : '#202020', cursor: isPast ? 'not-allowed' : 'auto'}} />
                                </td>
                                <td style={{padding:'8px',textAlign:'center'}}>
                                  <input type="number" value={goals.monthly[i].apoStarted} readOnly={isPast}
                                    onChange={e => !isPast && setGoals({...goals, monthly: goals.monthly.map((m,j) => j===i ? {...m, apoStarted: Number(e.target.value)} : m)})}
                                    style={{width:'60px',padding:'6px',border: isPast ? '1px solid #f3f4f6' : '1px solid #d1d5db',borderRadius:'4px',textAlign:'center', backgroundColor: isPast ? '#f3f4f6' : 'white', color: isPast ? '#9ca3af' : '#202020', cursor: isPast ? 'not-allowed' : 'auto'}} />
                                </td>
                                <td style={{padding:'8px',textAlign:'center'}}>
                                  <input type="number" value={goals.monthly[i].convGoal || 50} readOnly={isPast}
                                    onChange={e => !isPast && setGoals({...goals, monthly: goals.monthly.map((m,j) => j===i ? {...m, convGoal: Number(e.target.value)} : m)})}
                                    style={{width:'60px',padding:'6px',border: isPast ? '1px solid #f3f4f6' : '1px solid #fed7aa',borderRadius:'4px',textAlign:'center',color: isPast ? '#9ca3af' : '#2563EB',fontWeight:'600', backgroundColor: isPast ? '#f3f4f6' : 'white', cursor: isPast ? 'not-allowed' : 'auto'}} />
                                </td>
                              </tr>
                            );
                          })}
                          {/* #6: Annual totals row */}
                          <tr style={{borderTop:'2px solid #e5e7eb',backgroundColor:'#f0fdf4',fontWeight:'700'}}>
                            <td style={{padding:'12px 8px',color:'#166534',fontSize:'13px'}}>📊 YEAR TOTAL</td>
                            <td style={{padding:'8px',textAlign:'center',color:'#166534'}}>{totCarNPE}</td>
                            <td style={{padding:'8px',textAlign:'center',color:'#166534'}}>{totCarStarted}</td>
                            <td style={{padding:'8px',textAlign:'center',color:'#166534'}}>{totApoNPE}</td>
                            <td style={{padding:'8px',textAlign:'center',color:'#166534'}}>{totApoStarted}</td>
                            <td style={{padding:'8px',textAlign:'center',color:'#166534'}}>{totCarNPE + totApoNPE > 0 ? Math.round(((totCarStarted + totApoStarted) / (totCarNPE + totApoNPE)) * 100) : 0}%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Quarterly Goals — with monthly sum check (#5) */}
              <div>
                <h4 style={{fontSize:'18px',fontWeight:'bold',marginBottom:'16px',color:'#202020'}}>📊 Quarterly Goals - {new Date().getFullYear()} (Combined Locations)</h4>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(250px, 1fr))',gap:'16px'}}>
                  {[
                    {q: 'Q1', months: 'Jan-Mar', qi: 0, mRange: [0,1,2]},
                    {q: 'Q2', months: 'Apr-Jun', qi: 1, mRange: [3,4,5]},
                    {q: 'Q3', months: 'Jul-Sep', qi: 2, mRange: [6,7,8]},
                    {q: 'Q4', months: 'Oct-Dec', qi: 3, mRange: [9,10,11]}
                  ].map(quarter => {
                    // #5: compute sum of monthly goals for this quarter
                    const monthlyNPESum = quarter.mRange.reduce((s,i) => s + (goals.monthly[i].carNPE||0) + (goals.monthly[i].apoNPE||0), 0);
                    const monthlyStartedSum = quarter.mRange.reduce((s,i) => s + (goals.monthly[i].carStarted||0) + (goals.monthly[i].apoStarted||0), 0);
                    const qNPE = goals.quarterly[quarter.qi].npe;
                    const qStarted = goals.quarterly[quarter.qi].started;
                    const npeMatch = monthlyNPESum === qNPE;
                    const startedMatch = monthlyStartedSum === qStarted;
                    return (
                      <div key={quarter.q} style={{backgroundColor:'#f9fafb',padding:'16px',borderRadius:'8px',border:'1px solid #e5e7eb'}}>
                        <div style={{fontSize:'16px',fontWeight:'bold',marginBottom:'12px',color:'#202020'}}>{quarter.q} ({quarter.months})</div>
                        <div style={{display:'grid',gap:'8px'}}>
                          <div>
                            <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'2px'}}>Total NPE</label>
                            {/* #5: monthly sum hint */}
                            <div style={{fontSize:'11px',marginBottom:'4px',color: npeMatch ? '#10b981' : '#f59e0b'}}>
                              Monthly goals sum: <strong>{monthlyNPESum}</strong>{!npeMatch && ' ≠ quarterly goal'}
                            </div>
                            <input type="number" value={qNPE}
                              onChange={e => setGoals({...goals, quarterly: goals.quarterly.map((qq,j) => j===quarter.qi ? {...qq, npe: Number(e.target.value)} : qq)})}
                              style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
                          </div>
                          <div>
                            <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'2px'}}>Total Started</label>
                            <div style={{fontSize:'11px',marginBottom:'4px',color: startedMatch ? '#10b981' : '#f59e0b'}}>
                              Monthly goals sum: <strong>{monthlyStartedSum}</strong>{!startedMatch && ' ≠ quarterly goal'}
                            </div>
                            <input type="number" value={qStarted}
                              onChange={e => setGoals({...goals, quarterly: goals.quarterly.map((qq,j) => j===quarter.qi ? {...qq, started: Number(e.target.value)} : qq)})}
                              style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
                          </div>
                          <div>
                            <label style={{display:'block',fontSize:'12px',color:'#6b7280',marginBottom:'4px'}}>Target Conv %</label>
                            <input type="number" value={goals.quarterly[quarter.qi].conv}
                              onChange={e => setGoals({...goals, quarterly: goals.quarterly.map((qq,j) => j===quarter.qi ? {...qq, conv: Number(e.target.value)} : qq)})}
                              style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{marginTop:'24px',paddingTop:'24px',borderTop:'1px solid #e5e7eb',display:'flex',alignItems:'center',gap:'16px'}}>
                <button
                  onClick={async () => {
                    localStorage.setItem('npe-goals', JSON.stringify(goals));
                    await dbSaveSettings('goals', goals);
                    setGoalsSaveMsg('✅ Goals saved!');
                    setTimeout(() => setGoalsSaveMsg(''), 3000);
                  }}
                  style={{padding:'12px 32px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer',fontSize:'16px'}}>
                  💾 Save All Goals
                </button>
                {goalsSaveMsg && <span style={{color:'#10b981',fontWeight:'600',fontSize:'15px'}}>{goalsSaveMsg}</span>}
              </div>
            </div>

            {/* ── Support Inbox (admin only) ── */}
            {currentUser?.role === 'admin' && (
              <div style={{backgroundColor:'white',padding:'24px',borderRadius:'8px',boxShadow:'0 1px 3px rgba(0,0,0,0.1)',marginBottom:'24px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',flexWrap:'wrap',gap:'10px'}}>
                  <div>
                    <h3 style={{fontSize:'18px',fontWeight:'bold',color:'#202020',margin:0}}>🐛 Support Reports</h3>
                    <p style={{fontSize:'13px',color:'#9ca3af',marginTop:'4px'}}>Issues submitted by your team via the Report Issue button.</p>
                  </div>
                  <button
                    onClick={loadFeedback}
                    style={{padding:'8px 18px',backgroundColor:'#202020',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer',fontSize:'13px'}}
                  >
                    {feedbackListLoading ? '⏳ Loading...' : '🔄 Load Reports'}
                  </button>
                </div>
                {feedbackList.length === 0 && !feedbackListLoading && (
                  <div style={{textAlign:'center',padding:'28px',color:'#9ca3af',fontSize:'14px'}}>
                    No reports loaded yet — click "Load Reports" to fetch them.
                  </div>
                )}
                {feedbackList.length > 0 && (
                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                    {feedbackList.map(f => (
                      <div key={f.id} style={{padding:'14px 16px',backgroundColor: f.needs_review ? '#fffbeb' : '#f9fafb',borderRadius:'8px',border: f.needs_review ? '2px solid #f59e0b' : '1px solid #e5e7eb',display:'flex',gap:'14px',alignItems:'flex-start'}}>
                        <div style={{flex:1}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'5px',flexWrap:'wrap'}}>
                            {f.needs_review && (
                              <span style={{fontSize:'12px',fontWeight:'700',padding:'2px 8px',backgroundColor:'#fef3c7',color:'#92400e',borderRadius:'4px',border:'1px solid #f59e0b'}}>⚠️ Needs Decision</span>
                            )}
                            <span style={{fontSize:'12px',fontWeight:'700',padding:'2px 8px',backgroundColor: f.category==='Bug'?'#fee2e2':f.category==='Wrong Data'?'#fef3c7':'#eff6ff',color: f.category==='Bug'?'#991b1b':f.category==='Wrong Data'?'#92400e':'#1e40af',borderRadius:'4px'}}>{f.category || 'General'}</span>
                            <span style={{fontSize:'12px',color:'#6b7280',fontWeight:'600'}}>{f.tc_name}</span>
                            <span style={{fontSize:'12px',color:'#9ca3af'}}>· {f.view} ·</span>
                            <span style={{fontSize:'12px',color:'#9ca3af'}}>{new Date(f.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                          </div>
                          <p style={{fontSize:'14px',color:'#374151',margin:0,lineHeight:1.5}}>{f.description}</p>
                          {f.needs_review && (
                            <p style={{fontSize:'12px',color:'#b45309',marginTop:'6px',marginBottom:0,fontStyle:'italic'}}>The auto-fix agent flagged this — it needs your input before it can be resolved.</p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteFeedback(f.id)}
                          style={{padding:'4px 10px',backgroundColor:'white',border:'1px solid #e5e7eb',borderRadius:'4px',cursor:'pointer',fontSize:'12px',color:'#6b7280',flexShrink:0}}
                          title="Mark as resolved / delete"
                        >✓ Resolve</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* BENCHMARKS VIEW — demo only */}
        {currentView === 'benchmarks' && (() => {
          // Compute this practice's live stats from demo data
          const allPts = patients;
          const m = calculateMetrics(allPts);
          const convRate = m.overallConv;
          const sdsRate = m.sdsRate;
          const avgDP = m.avgDP || 0;

          // On-time rate across all patients
          let otCount = 0, otTotal = 0;
          allPts.forEach(p => (p.contact_log||[]).forEach(e => {
            if (e.date && e.scheduledDate) { otTotal++; if (e.date <= e.scheduledDate) otCount++; }
          }));
          const onTimeRate = otTotal > 0 ? Math.round((otCount / otTotal) * 100) : 78;

          // Benchmark dataset (anonymized — realistic ortho practice network)
          const benchmarkPractices = [
            { name:'Practice A', locations:3, npePerMo:142, conv:68, sds:82, onTime:91, avgDP:525 },
            { name:'Practice B', locations:2, npePerMo:98,  conv:61, sds:75, onTime:84, avgDP:490 },
            { name:'Practice C', locations:2, npePerMo:87,  conv:58, sds:71, onTime:79, avgDP:510 },
            { name:'Your Practice', locations:2, npePerMo: Math.max(m.total, 14), conv: convRate||54, sds: sdsRate||69, onTime: onTimeRate, avgDP: avgDP||475, isYou: true },
            { name:'Practice D', locations:1, npePerMo:52,  conv:52, sds:67, onTime:74, avgDP:455 },
            { name:'Practice E', locations:2, npePerMo:76,  conv:49, sds:63, onTime:68, avgDP:440 },
            { name:'Practice F', locations:1, npePerMo:41,  conv:43, sds:58, onTime:61, avgDP:420 },
            { name:'Practice G', locations:1, npePerMo:35,  conv:38, sds:51, onTime:55, avgDP:390 },
            { name:'Practice H', locations:1, npePerMo:29,  conv:31, sds:44, onTime:48, avgDP:350 },
          ].sort((a,b) => b.conv - a.conv);

          const networkAvgConv   = Math.round(benchmarkPractices.reduce((s,p)=>s+p.conv,0) / benchmarkPractices.length);
          const networkAvgSDS    = Math.round(benchmarkPractices.reduce((s,p)=>s+p.sds,0)  / benchmarkPractices.length);
          const networkAvgOnTime = Math.round(benchmarkPractices.reduce((s,p)=>s+p.onTime,0) / benchmarkPractices.length);
          const networkAvgDP     = Math.round(benchmarkPractices.reduce((s,p)=>s+p.avgDP,0) / benchmarkPractices.length);

          const youIdx = benchmarkPractices.findIndex(p => p.isYou);
          const youRank = youIdx + 1;
          const total  = benchmarkPractices.length;
          const pctile = Math.round(((total - youRank) / (total - 1)) * 100);

          const BenchRow = ({ label, yours, avg, top, unit='%', higherIsBetter=true }) => {
            const gap = yours - avg;
            const vsTop = yours - top;
            const ahead = higherIsBetter ? gap > 0 : gap < 0;
            const gapColor = ahead ? '#10b981' : '#ef4444';
            const barMax = higherIsBetter ? top * 1.05 : avg * 1.5;
            const yoursPct = Math.min(100, Math.round((yours / barMax) * 100));
            const avgPct   = Math.min(100, Math.round((avg   / barMax) * 100));
            const topPct   = Math.min(100, Math.round((top   / barMax) * 100));
            return (
              <div style={{padding:'18px 0',borderBottom:'1px solid #f3f4f6'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
                  <div style={{fontSize:'14px',fontWeight:'600',color:'#202020'}}>{label}</div>
                  <div style={{display:'flex',gap:'16px',textAlign:'right'}}>
                    <div>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'1px'}}>Yours</div>
                      <div style={{fontSize:'17px',fontWeight:'800',color:'#2563EB'}}>{unit==='$'?'$':''}{yours}{unit==='%'?'%':unit==='$'?'':unit}</div>
                    </div>
                    <div>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'1px'}}>Avg</div>
                      <div style={{fontSize:'17px',fontWeight:'700',color:'#6b7280'}}>{unit==='$'?'$':''}{avg}{unit==='%'?'%':''}</div>
                    </div>
                    <div>
                      <div style={{fontSize:'11px',color:'#9ca3af',marginBottom:'1px'}}>Top 25%</div>
                      <div style={{fontSize:'17px',fontWeight:'700',color:'#10b981'}}>{unit==='$'?'$':''}{top}{unit==='%'?'%':''}</div>
                    </div>
                  </div>
                </div>
                {/* Stacked bar */}
                <div style={{position:'relative',height:'10px',backgroundColor:'#f3f4f6',borderRadius:'5px',overflow:'visible',marginBottom:'8px'}}>
                  {/* avg marker */}
                  <div style={{position:'absolute',left:`${avgPct}%`,top:'-4px',width:'2px',height:'18px',backgroundColor:'#9ca3af',borderRadius:'1px'}} title={`Avg: ${avg}${unit==='%'?'%':''}`}/>
                  {/* top marker */}
                  <div style={{position:'absolute',left:`${topPct}%`,top:'-4px',width:'2px',height:'18px',backgroundColor:'#10b981',borderRadius:'1px'}} title={`Top: ${top}${unit==='%'?'%':''}`}/>
                  {/* yours bar */}
                  <div style={{height:'10px',borderRadius:'5px',backgroundColor:'#2563EB',width:`${yoursPct}%`,position:'relative'}}>
                    <div style={{position:'absolute',right:'-1px',top:'-3px',width:'16px',height:'16px',borderRadius:'50%',backgroundColor:'#2563EB',border:'3px solid white',boxShadow:'0 1px 4px rgba(0,0,0,0.25)'}}/>
                  </div>
                </div>
                <div style={{fontSize:'12px',color:gapColor,fontWeight:'600'}}>
                  {ahead ? '▲' : '▼'} {Math.abs(gap)}{unit==='%'?'%':unit==='$'?` avg $${Math.abs(gap)}`:''} {ahead ? 'above' : 'below'} network average
                  {vsTop < 0 && <span style={{color:'#9ca3af',fontWeight:'400',marginLeft:'8px'}}>({Math.abs(vsTop)}{unit==='%'?'%':''} behind top performers)</span>}
                </div>
              </div>
            );
          };

          const insightColor = (yours, avg) => yours >= avg ? '#f0fdf4' : '#fef2f2';
          const insightBorder = (yours, avg) => yours >= avg ? '#86efac' : '#fca5a5';
          const insightIcon = (yours, avg) => yours >= avg ? '✅' : '⚠️';

          return (
            <div>
              {/* Hero */}
              <div style={{background:'linear-gradient(135deg,#202020 0%,#1e3a5f 100%)',borderRadius:'16px',padding:'32px 36px',marginBottom:'28px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'20px'}}>
                <div>
                  <div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)',letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:'8px'}}>CadenceIQ Network — {total} Practices</div>
                  <h2 style={{fontSize:'28px',fontWeight:'900',color:'white',margin:'0 0 8px 0',letterSpacing:'-0.02em'}}>How Does Your Practice Compare?</h2>
                  <p style={{fontSize:'15px',color:'rgba(255,255,255,0.65)',margin:0,maxWidth:'480px',lineHeight:1.6}}>
                    Benchmarks are calculated across all CadenceIQ practices. Use these to identify where your team is excelling and where the biggest growth opportunities lie.
                  </p>
                </div>
                <div style={{textAlign:'center',backgroundColor:'rgba(255,255,255,0.08)',padding:'24px 32px',borderRadius:'14px',minWidth:'160px'}}>
                  <div style={{fontSize:'11px',color:'rgba(255,255,255,0.5)',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'6px'}}>Your Network Rank</div>
                  <div style={{fontSize:'52px',fontWeight:'900',color:'white',lineHeight:1}}>#{youRank}</div>
                  <div style={{fontSize:'13px',color:'rgba(255,255,255,0.55)',marginTop:'4px'}}>of {total} practices</div>
                  <div style={{marginTop:'10px',padding:'4px 12px',backgroundColor: pctile >= 60 ? '#10b981' : pctile >= 40 ? '#f59e0b' : '#ef4444',borderRadius:'20px',fontSize:'11px',fontWeight:'700',color:'white',display:'inline-block'}}>
                    {pctile}th percentile
                  </div>
                </div>
              </div>

              {/* Key Metric Benchmarks */}
              <div style={{backgroundColor:'white',borderRadius:'14px',padding:'28px 32px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',marginBottom:'24px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'4px'}}>
                  <h3 style={{fontSize:'18px',fontWeight:'800',color:'#202020',margin:0}}>Key Metrics vs. Network</h3>
                  <div style={{display:'flex',gap:'16px',fontSize:'12px',color:'#9ca3af'}}>
                    <span><span style={{display:'inline-block',width:'10px',height:'10px',borderRadius:'50%',backgroundColor:'#2563EB',marginRight:'4px',verticalAlign:'middle'}}/>Your Practice</span>
                    <span><span style={{display:'inline-block',width:'2px',height:'12px',backgroundColor:'#9ca3af',marginRight:'4px',verticalAlign:'middle'}}/>Avg</span>
                    <span><span style={{display:'inline-block',width:'2px',height:'12px',backgroundColor:'#10b981',marginRight:'4px',verticalAlign:'middle'}}/>Top 25%</span>
                  </div>
                </div>
                <div style={{fontSize:'12px',color:'#9ca3af',marginBottom:'20px'}}>Based on {total} practices using CadenceIQ across the network</div>
                <BenchRow label="Overall Conversion Rate" yours={convRate||54} avg={networkAvgConv} top={64} unit="%" />
                <BenchRow label="Same-Day Start Rate" yours={sdsRate||69} avg={networkAvgSDS} top={78} unit="%" />
                <BenchRow label="On-Time Follow-Up Rate" yours={onTimeRate} avg={networkAvgOnTime} top={88} unit="%" />
                <BenchRow label="Average Down Payment" yours={avgDP||475} avg={networkAvgDP} top={510} unit="$" />
              </div>

              {/* Practice Leaderboard */}
              <div style={{backgroundColor:'white',borderRadius:'14px',padding:'28px 32px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',marginBottom:'24px'}}>
                <h3 style={{fontSize:'18px',fontWeight:'800',color:'#202020',margin:'0 0 4px 0'}}>Network Leaderboard</h3>
                <div style={{fontSize:'12px',color:'#9ca3af',marginBottom:'20px'}}>Ranked by overall conversion rate. Practice names are anonymized.</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'14px'}}>
                    <thead>
                      <tr style={{borderBottom:'2px solid #e5e7eb'}}>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:'600',color:'#6b7280',width:'40px'}}>#</th>
                        <th style={{padding:'10px 12px',textAlign:'left',fontWeight:'600',color:'#6b7280'}}>Practice</th>
                        <th style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#6b7280'}}>Locations</th>
                        <th style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#6b7280'}}>NPEs / Mo</th>
                        <th style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#2563EB'}}>Conv %</th>
                        <th style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#6b7280'}}>SDS %</th>
                        <th style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#6b7280'}}>On-Time %</th>
                        <th style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#6b7280'}}>Avg DP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkPractices.map((p, i) => (
                        <tr key={p.name} style={{
                          borderBottom:'1px solid #f3f4f6',
                          backgroundColor: p.isYou ? '#eff6ff' : 'white',
                        }}>
                          <td style={{padding:'12px',fontWeight:'700',color: i===0?'#f59e0b':i===1?'#9ca3af':i===2?'#b45309':'#9ca3af', fontSize:'16px'}}>
                            {i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`}
                          </td>
                          <td style={{padding:'12px',fontWeight: p.isYou ? '800' : '500', color: p.isYou ? '#1d4ed8' : '#202020'}}>
                            {p.name} {p.isYou && <span style={{fontSize:'10px',backgroundColor:'#2563EB',color:'white',padding:'1px 6px',borderRadius:'4px',marginLeft:'4px',fontWeight:'700',letterSpacing:'0.05em'}}>YOU</span>}
                          </td>
                          <td style={{padding:'12px',textAlign:'center',color:'#6b7280'}}>{p.locations}</td>
                          <td style={{padding:'12px',textAlign:'center',color:'#6b7280'}}>{p.npePerMo}</td>
                          <td style={{padding:'12px',textAlign:'center'}}>
                            <span style={{fontWeight:'700', color: p.conv>=60?'#10b981':p.conv>=50?'#f59e0b':'#ef4444'}}>{p.conv}%</span>
                          </td>
                          <td style={{padding:'12px',textAlign:'center',color:'#6b7280'}}>{p.sds}%</td>
                          <td style={{padding:'12px',textAlign:'center',color:'#6b7280'}}>{p.onTime}%</td>
                          <td style={{padding:'12px',textAlign:'center',color:'#6b7280'}}>${p.avgDP}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{borderTop:'2px solid #e5e7eb',backgroundColor:'#f9fafb'}}>
                        <td colSpan="2" style={{padding:'10px 12px',fontWeight:'700',color:'#374151',fontSize:'13px'}}>Network Average</td>
                        <td style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#374151'}}>{Math.round(benchmarkPractices.reduce((s,p)=>s+p.locations,0)/total)}</td>
                        <td style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#374151'}}>{Math.round(benchmarkPractices.reduce((s,p)=>s+p.npePerMo,0)/total)}</td>
                        <td style={{padding:'10px 12px',textAlign:'center',fontWeight:'700',color:'#374151'}}>{networkAvgConv}%</td>
                        <td style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#374151'}}>{networkAvgSDS}%</td>
                        <td style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#374151'}}>{networkAvgOnTime}%</td>
                        <td style={{padding:'10px 12px',textAlign:'center',fontWeight:'600',color:'#374151'}}>${networkAvgDP}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Insights */}
              <div style={{marginBottom:'24px'}}>
                <h3 style={{fontSize:'18px',fontWeight:'800',color:'#202020',margin:'0 0 16px 0'}}>Personalized Insights</h3>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'14px'}}>
                  {[
                    {
                      metric:'Conversion Rate',
                      yours: convRate||54,
                      avg: networkAvgConv,
                      good:`Your conversion rate is above the network average — your TCs are closing well. Top performers are at 64%+. A targeted follow-up cadence for price-sensitive patients is the most common lever to close that gap.`,
                      bad:`Your conversion rate is below the network average of ${networkAvgConv}%. The most impactful fix: ensure every pending patient has a follow-up scheduled within 2 days of their exam. Practices that close this timing gap typically see a 6–10 point lift in conversion.`,
                    },
                    {
                      metric:'Same-Day Start Rate',
                      yours: sdsRate||69,
                      avg: networkAvgSDS,
                      good:`Strong same-day start rate. SDS patients have a significantly lower no-start rate — every SDS is a patient who won't need a follow-up cadence. Top practices pair a streamlined fee presentation with pre-built financing options to maintain this rate.`,
                      bad:`Your same-day start rate is below the ${networkAvgSDS}% network average. Practices that improve SDS focus on: (1) presenting fees at the end of the exam, not the beginning, and (2) having financing options ready to discuss before the patient asks.`,
                    },
                    {
                      metric:'On-Time Follow-Up',
                      yours: onTimeRate,
                      avg: networkAvgOnTime,
                      good:`Your team is completing follow-ups on schedule — a major driver of conversion. Practices in the top quartile (88%+) typically use a daily queue check-in at morning huddle to keep TCs on task.`,
                      bad:`Follow-ups are falling behind schedule. Research across the network shows that every day of delay past the optimal cadence window reduces conversion probability by ~3%. Consistent daily queue reviews are the single highest-leverage habit for TCs.`,
                    },
                    {
                      metric:'Average Down Payment',
                      yours: avgDP||475,
                      avg: networkAvgDP,
                      good:`Your average down payment is above the network average, indicating strong case acceptance at healthy fee levels. Monitor this monthly — a downward trend often signals TCs are discounting to close.`,
                      bad:`Your average down payment is below the ${networkAvgDP} network average. This can indicate fee pressure or financing confusion. Top practices address this with clear written fee summaries and in-house flex pay options that reduce sticker shock without discounting the case fee.`,
                    },
                  ].map(ins => {
                    const isGood = ins.yours >= ins.avg;
                    return (
                      <div key={ins.metric} style={{backgroundColor: insightColor(ins.yours,ins.avg), border:`1px solid ${insightBorder(ins.yours,ins.avg)}`, borderRadius:'12px',padding:'18px 20px'}}>
                        <div style={{fontSize:'11px',fontWeight:'700',color:'#6b7280',letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:'6px'}}>{ins.metric}</div>
                        <div style={{fontSize:'22px',fontWeight:'900',color: isGood?'#166534':'#991b1b',marginBottom:'10px'}}>{ins.metric==='Average Down Payment'?`$${ins.yours}`:`${ins.yours}%`} {insightIcon(ins.yours,ins.avg)}</div>
                        <p style={{fontSize:'13px',color:'#374151',lineHeight:1.6,margin:0}}>{isGood ? ins.good : ins.bad}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* What drives top performers */}
              <div style={{backgroundColor:'#202020',borderRadius:'14px',padding:'28px 32px'}}>
                <h3 style={{fontSize:'18px',fontWeight:'800',color:'white',margin:'0 0 6px 0'}}>What Top Practices Do Differently</h3>
                <p style={{fontSize:'13px',color:'rgba(255,255,255,0.5)',marginBottom:'20px'}}>Patterns observed across the top quartile of CadenceIQ practices</p>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:'14px'}}>
                  {[
                    { n:'01', title:'Daily Queue Huddles', body:'TCs review the follow-up queue every morning — 10 minutes, no exceptions. This alone accounts for 80% of the on-time rate difference between top and bottom quartiles.' },
                    { n:'02', title:'Obstacle-Specific Scripts', body:'Top TCs don\'t wing it. They have a short, practiced script for each obstacle type — Medicaid, spouse approval, price — so every call is confident and consistent.' },
                    { n:'03', title:'Same-Day Close Protocol', body:'The fee presentation happens inside the exam room, with a TC and a treatment plan in hand. Patients who leave before discussing fees start at half the rate of those who don\'t.' },
                    { n:'04', title:'Data-Driven Coaching', body:'Admins in top practices review conversion rates and on-time rates weekly by TC — not monthly. The faster you spot a dip, the easier it is to correct.' },
                  ].map(tip => (
                    <div key={tip.n} style={{backgroundColor:'rgba(255,255,255,0.06)',borderRadius:'10px',padding:'18px 20px'}}>
                      <div style={{fontSize:'11px',fontWeight:'800',color:'#4A90E2',letterSpacing:'0.15em',marginBottom:'8px'}}>{tip.n}</div>
                      <div style={{fontSize:'14px',fontWeight:'700',color:'white',marginBottom:'8px'}}>{tip.title}</div>
                      <p style={{fontSize:'13px',color:'rgba(255,255,255,0.55)',lineHeight:1.6,margin:0}}>{tip.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

      </main>

      {/* Floating Support Button */}
      <button
        onClick={() => setShowFeedbackModal(true)}
        style={{position:'fixed',bottom:'24px',left:'24px',zIndex:9000,backgroundColor:'#202020',color:'white',border:'none',borderRadius:'50px',padding:'10px 18px',fontSize:'13px',fontWeight:'600',cursor:'pointer',boxShadow:'0 4px 12px rgba(0,0,0,0.25)',display:'flex',alignItems:'center',gap:'7px',opacity:0.85}}
        title="Report an issue or give feedback"
      >
        🐛 Report Issue
      </button>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10000}}>
          <div style={{backgroundColor:'white',padding:'28px',borderRadius:'12px',maxWidth:'460px',width:'90%',boxShadow:'0 20px 40px rgba(0,0,0,0.3)'}}>
            <h3 style={{fontSize:'20px',fontWeight:'800',color:'#202020',marginBottom:'4px'}}>🐛 Report an Issue</h3>
            <p style={{fontSize:'13px',color:'#6b7280',marginBottom:'20px'}}>Describe what happened and we'll get it fixed. Your name and current view are captured automatically.</p>

            <div style={{marginBottom:'14px'}}>
              <label style={{fontSize:'13px',fontWeight:'600',display:'block',marginBottom:'6px',color:'#374151'}}>Category</label>
              <select
                value={feedbackForm.category}
                onChange={e => setFeedbackForm({...feedbackForm, category: e.target.value})}
                style={{width:'100%',padding:'9px 12px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'14px',color:'#374151'}}
              >
                <option value="">Select a category...</option>
                <option value="Bug">🐛 Bug — something isn't working</option>
                <option value="Wrong Data">📊 Wrong Data — numbers look off</option>
                <option value="Patient Issue">👤 Patient Issue — specific patient problem</option>
                <option value="Suggestion">💡 Suggestion — idea for improvement</option>
                <option value="General">💬 General — other question or comment</option>
              </select>
            </div>

            <div style={{marginBottom:'20px'}}>
              <label style={{fontSize:'13px',fontWeight:'600',display:'block',marginBottom:'6px',color:'#374151'}}>What happened? <span style={{color:'#ef4444'}}>*</span></label>
              <textarea
                value={feedbackForm.description}
                onChange={e => setFeedbackForm({...feedbackForm, description: e.target.value})}
                placeholder="e.g. I clicked Mark Started on Diana Contreras and the green toast appeared but she stayed in the queue..."
                rows={4}
                style={{width:'100%',padding:'9px 12px',border:'1px solid #d1d5db',borderRadius:'6px',fontSize:'14px',resize:'vertical',fontFamily:'inherit'}}
              />
            </div>

            <div style={{fontSize:'12px',color:'#9ca3af',marginBottom:'16px'}}>
              📍 Auto-captured: <strong>{currentUser?.name}</strong> · View: <strong>{currentView}</strong> · {new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
            </div>

            <div style={{display:'flex',gap:'10px'}}>
              <button
                onClick={handleSubmitFeedback}
                disabled={feedbackSubmitting}
                style={{flex:1,padding:'11px',backgroundColor: feedbackSubmitting ? '#9ca3af' : '#202020',color:'white',border:'none',borderRadius:'6px',fontWeight:'700',cursor: feedbackSubmitting ? 'default' : 'pointer',fontSize:'14px'}}
              >
                {feedbackSubmitting ? '⏳ Submitting...' : '📤 Submit Report'}
              </button>
              <button
                onClick={() => { setShowFeedbackModal(false); setFeedbackForm({ category: '', description: '' }); }}
                style={{padding:'11px 20px',backgroundColor:'white',color:'#374151',border:'1px solid #d1d5db',borderRadius:'6px',fontWeight:'600',cursor:'pointer',fontSize:'14px'}}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Started Modal */}
      {showStartedModal && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div style={{backgroundColor:'white',padding:'32px',borderRadius:'12px',maxWidth:'500px',width:'90%',boxShadow:'0 20px 25px -5px rgba(0,0,0,0.3)'}}>
            <h3 style={{fontSize:'22px',fontWeight:'bold',marginBottom:'4px',color:'#202020'}}>Mark {showStartedModal.name} as STARTED</h3>
            <p style={{fontSize:'13px',color:'#6b7280',marginBottom:'20px'}}>
              {showStartedModal.SCH ? '📅 Confirming scheduled bond appointment' : `NPE was ${new Date(showStartedModal.npeDate + 'T12:00:00').toLocaleDateString()} — SDS if start date matches`}
            </p>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
              <div>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>
                  Start Date {startedForm.startDate === showStartedModal.npeDate && <span style={{color:'#2563EB',fontWeight:'600'}}>(SDS — same day!)</span>}
                </label>
                <input type="date"
                  value={startedForm.startDate}
                  onChange={e => setStartedForm({...startedForm, startDate: e.target.value})}
                  style={{width:'100%',padding:'8px',border:'2px solid ' + (startedForm.startDate === showStartedModal.npeDate ? '#2563EB' : '#d1d5db'),borderRadius:'4px'}} />
              </div>
              <div>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Down Payment</label>
                <input type="text" placeholder="$500"
                  value={startedForm.dp}
                  onChange={e => setStartedForm({...startedForm, dp: e.target.value})}
                  style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
              </div>
            </div>

            <div style={{marginBottom:'16px'}}>
              <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'8px'}}>Treatment Type</label>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                {[['BR','Braces'],['INV','Invisalign'],['PH1','Phase 1'],['PH2','Phase 2'],['LTD','Limited']].map(([key, label]) => (
                  <label key={key} style={{display:'flex',alignItems:'center',cursor:'pointer',padding:'8px 12px',
                    border: `2px solid ${startedForm[key] ? '#3b82f6' : '#d1d5db'}`,
                    backgroundColor: startedForm[key] ? '#eff6ff' : 'white',
                    borderRadius:'6px'}}>
                    <input type="checkbox"
                      checked={startedForm[key]}
                      onChange={e => setStartedForm({...startedForm, [key]: e.target.checked})}
                      style={{marginRight:'6px'}} />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{marginBottom:'20px'}}>
              <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'8px'}}>Add-ons</label>
              <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                {[['R+','Retainers'],['W+','Whitening'],['PIF','Paid In Full']].map(([key, label]) => (
                  <label key={key} style={{display:'flex',alignItems:'center',cursor:'pointer',padding:'8px 12px',
                    border: `2px solid ${startedForm[key] ? '#10b981' : '#d1d5db'}`,
                    backgroundColor: startedForm[key] ? '#dcfce7' : 'white',
                    borderRadius:'6px'}}>
                    <input type="checkbox"
                      checked={startedForm[key]}
                      onChange={e => setStartedForm({...startedForm, [key]: e.target.checked})}
                      style={{marginRight:'6px'}} />
                    {label} <span style={{color:'#10b981',fontWeight:'600',marginLeft:'4px'}}>+${key === 'PIF' ? bonusRates.pif : key === 'R+' ? bonusRates.ret : bonusRates.white}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{display:'flex',gap:'12px'}}>
              <button
                onClick={() => confirmStarted(showStartedModal.id)}
                style={{flex:1,padding:'12px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer'}}
              >
                🎯 Confirm Started
              </button>
              <button
                onClick={() => setShowStartedModal(null)}
                style={{padding:'12px 24px',backgroundColor:'#e5e7eb',color:'#374151',border:'none',borderRadius:'6px',cursor:'pointer'}}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Patient Modal */}
      {showEditModal && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,overflowY:'auto',padding:'20px'}}>
          <div style={{backgroundColor:'white',padding:'32px',borderRadius:'12px',maxWidth:'700px',width:'100%',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 20px 25px -5px rgba(0,0,0,0.3)'}}>
            <h3 style={{fontSize:'22px',fontWeight:'bold',marginBottom:'20px',color:'#202020'}}>Edit Patient: {showEditModal.name}</h3>
            
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
              <div>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Patient Name</label>
                <input type="text" value={editForm.name || ''}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                  style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
              </div>
              <div>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Phone Number</label>
                <input type="tel" placeholder="(813) 555-0000" value={editForm.phone || ''}
                  onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                  style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
              <div>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>NPE Date</label>
                <input type="date" value={editForm.npeDate || ''}
                  onChange={(e) => {
                    const newNpeDate = e.target.value;
                    const updated = {...editForm, npeDate: newNpeDate};
                    // Recalculate nextTouchDate when NPE date changes
                    if ((editForm.PEN || editForm.MP) && (editForm.contactAttempts || 0) === 0) {
                      // Touch 1 is NPE-based — recalculate from new date
                      const effObstacle = editForm.obstacle || (editForm.MP ? 'Waiting to Hear from Medicaid' : '');
                      updated.nextTouchDate = calcNextTouchDate(newNpeDate, effObstacle, 0, '');
                    } else if (editForm.OBS) {
                      // OBS cadence is always NPE + 6 months
                      updated.nextTouchDate = addMonths(newNpeDate, 6);
                    }
                    setEditForm(updated);
                  }}
                  style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
              </div>
              <div>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Start Date</label>
                <input type="date" value={editForm.startDate || ''}
                  onChange={(e) => setEditForm({...editForm, startDate: e.target.value})}
                  style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} />
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'16px'}}>
              <div>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Location</label>
                <select 
                  value={editForm.location || 'Car'}
                  onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                  style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}}
                >
                  <option value="Car">Carrollwood</option>
                  <option value="Apo">Apollo Beach</option>
                </select>
              </div>
              <div>
                <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Down Payment</label>
                <input 
                  type="text" 
                  value={editForm.dp || ''}
                  onChange={(e) => setEditForm({...editForm, dp: e.target.value})}
                  placeholder="$500" 
                  style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} 
                />
              </div>
            </div>

            <div style={{marginBottom:'16px'}}>
              <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Obstacle</label>
              <select
                value={editForm.obstacle || ''}
                onChange={(e) => {
                  const newObstacle = e.target.value;
                  const updated = {...editForm, obstacle: newObstacle};
                  // Recalculate nextTouchDate if no contacts yet (touch 1 is NPE-based)
                  if ((editForm.PEN || editForm.MP) && (editForm.contactAttempts || 0) === 0) {
                    const effObstacle = newObstacle || (editForm.MP ? 'Waiting to Hear from Medicaid' : '');
                    updated.nextTouchDate = calcNextTouchDate(editForm.npeDate, effObstacle, 0, '');
                  }
                  setEditForm(updated);
                }}
                style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}}
              >
                <option value="">None</option>
                {OBSTACLE_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>

            {/* Cadence Preview Panel */}
            {(editForm.PEN || editForm.MP || editForm.OBS) && editForm.npeDate && (() => {
              const effObstacle = editForm.obstacle || (editForm.MP ? 'Waiting to Hear from Medicaid' : '');
              const attempts = editForm.contactAttempts || 0;
              const todayStr = new Date().toISOString().split('T')[0];

              if (editForm.OBS) {
                const nextCheck = addMonths(editForm.npeDate, 6);
                const overdue = nextCheck < todayStr;
                return (
                  <div style={{marginBottom:'16px',padding:'14px',backgroundColor:'#f0fdf4',borderRadius:'8px',border:'1px solid #86efac'}}>
                    <div style={{fontSize:'12px',fontWeight:'700',color:'#166534',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.06em'}}>📅 Observation Re-Check Schedule</div>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <div style={{width:'24px',height:'24px',borderRadius:'50%',backgroundColor:'#16a34a',display:'flex',alignItems:'center',justifyContent:'center',color:'white',fontSize:'12px',fontWeight:'700',flexShrink:0}}>1</div>
                      <span style={{fontSize:'13px',fontWeight:'700',color:'#166534'}}>
                        6-month re-check — {new Date(nextCheck + 'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}
                      </span>
                      {overdue && <span style={{backgroundColor:'#ef4444',color:'white',padding:'1px 7px',borderRadius:'10px',fontSize:'11px',fontWeight:'700'}}>OVERDUE</span>}
                    </div>
                  </div>
                );
              }

              const cadenceArr = CADENCES[effObstacle] || DEFAULT_CADENCE;
              const rows = [];
              let projBase = editForm.nextTouchDate || null;
              for (let i = 0; i < cadenceArr.length; i++) {
                const isDone = i < attempts;
                const isNext = i === attempts;
                const isFuture = i > attempts;
                let date = null;
                if (isNext) {
                  date = editForm.nextTouchDate || null;
                } else if (isFuture && projBase) {
                  const d = new Date(projBase + 'T12:00:00');
                  d.setDate(d.getDate() + cadenceArr[i]);
                  date = skipWeekend(d.toISOString().split('T')[0]);
                  projBase = date;
                }
                rows.push({ num: i+1, days: cadenceArr[i], date, isDone, isNext, isFuture });
              }
              const isMaxed = attempts >= cadenceArr.length;

              return (
                <div style={{marginBottom:'16px',padding:'14px',backgroundColor:'#f0f9ff',borderRadius:'8px',border:'1px solid #bae6fd'}}>
                  <div style={{fontSize:'12px',fontWeight:'700',color:'#0369a1',marginBottom:'10px',textTransform:'uppercase',letterSpacing:'0.06em'}}>
                    📅 Cadence Preview — {effObstacle || 'Default (No Obstacle)'}
                  </div>
                  {isMaxed && (
                    <div style={{fontSize:'13px',color:'#92400e',fontWeight:'600',backgroundColor:'#fff7ed',padding:'8px 10px',borderRadius:'6px',marginBottom:'8px'}}>
                      ⚠️ All {cadenceArr.length} touches completed — no more auto-scheduled follow-ups
                    </div>
                  )}
                  <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
                    {rows.map(row => (
                      <div key={row.num} style={{display:'flex',alignItems:'center',gap:'10px',opacity:row.isDone?0.45:1}}>
                        <div style={{
                          width:'22px',height:'22px',borderRadius:'50%',flexShrink:0,
                          display:'flex',alignItems:'center',justifyContent:'center',
                          fontSize:'11px',fontWeight:'700',
                          backgroundColor: row.isDone ? '#d1d5db' : row.isNext ? '#0ea5e9' : '#e0f2fe',
                          color: row.isDone ? '#6b7280' : row.isNext ? 'white' : '#0369a1'
                        }}>
                          {row.isDone ? '✓' : row.num}
                        </div>
                        <span style={{
                          fontSize:'13px',
                          fontWeight: row.isNext ? '700' : '400',
                          color: row.isDone ? '#9ca3af' : row.isNext ? '#0c4a6e' : '#374151',
                          textDecoration: row.isDone ? 'line-through' : 'none'
                        }}>
                          {row.isDone
                            ? `Touch ${row.num} — done`
                            : row.date
                              ? `Touch ${row.num} — ${new Date(row.date + 'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`
                              : `Touch ${row.num}`}
                          <span style={{fontSize:'11px',color:'#94a3b8',marginLeft:'5px'}}>+{row.days}d</span>
                          {row.isNext && <span style={{marginLeft:'8px',backgroundColor:'#0ea5e9',color:'white',padding:'1px 7px',borderRadius:'10px',fontSize:'11px',fontWeight:'700'}}>NEXT</span>}
                          {row.isNext && row.date && row.date < todayStr && <span style={{marginLeft:'4px',backgroundColor:'#ef4444',color:'white',padding:'1px 7px',borderRadius:'10px',fontSize:'11px',fontWeight:'700'}}>OVERDUE</span>}
                          {row.isFuture && <span style={{marginLeft:'4px',fontSize:'11px',color:'#94a3b8',fontStyle:'italic'}}>projected</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {editForm.SCH && (
              <div style={{marginBottom:'16px',padding:'16px',backgroundColor:'#fffbeb',borderRadius:'8px',border:'2px solid #f59e0b'}}>
                <label style={{display:'block',fontSize:'14px',fontWeight:'600',marginBottom:'4px',color:'#92400e'}}>🦷 Initial Bond Date</label>
                <input type="date"
                  value={editForm.bondDate || ''}
                  onChange={e => setEditForm({...editForm, bondDate: e.target.value})}
                  style={{width:'100%',padding:'8px',border:'2px solid #f59e0b',borderRadius:'4px',fontSize:'14px'}} />
                <div style={{fontSize:'12px',color:'#92400e',marginTop:'4px'}}>Bond check-in reminder appears the day after this date.</div>
              </div>
            )}

            <div style={{marginBottom:'16px'}}>
              <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'4px'}}>Notes</label>
              <textarea 
                value={editForm.notes || ''}
                onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                style={{width:'100%',padding:'8px',border:'1px solid #d1d5db',borderRadius:'4px'}} 
                rows={3} 
              />
            </div>

            <div style={{marginBottom:'16px'}}>
              <label style={{display:'block',fontSize:'14px',fontWeight:'500',marginBottom:'8px'}}>Status</label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:'8px'}}>
                {[
                  {value: 'ST', label: 'Started'},
                  {value: 'SCH', label: 'Scheduled'},
                  {value: 'PEN', label: 'Pending'},
                  {value: 'OBS', label: 'Observation'},
                  {value: 'MP', label: 'Medicaid Pending'},
                  {value: 'NOTX', label: 'No TX'}
                ].map(status => (
                  <label key={status.value} style={{display:'flex',alignItems:'center',cursor:'pointer'}}>
                    <input
                      type="checkbox"
                      checked={editForm[status.value] || false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const updated = {...editForm, [status.value]: checked};
                        if (status.value === 'MP' && checked) {
                          if (!updated.obstacle) updated.obstacle = 'Waiting to Hear from Medicaid';
                          if (updated.npeDate) {
                            updated.nextTouchDate = calcNextTouchDate(updated.npeDate, updated.obstacle, updated.contactAttempts || 0, updated.lastContactDate || '');
                          }
                        }
                        setEditForm(updated);
                      }}
                      style={{marginRight:'6px'}}
                    />
                    {status.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{display:'flex',gap:'12px'}}>
              <button
                onClick={async () => {
                  const original = patients.find(p => p.id === editForm.id);
                  const wasOBS = original?.OBS;
                  const isNowPendingNotOBS = (editForm.PEN || editForm.MP) && !editForm.OBS;
                  const saveForm = (wasOBS && isNowPendingNotOBS)
                    ? { ...editForm, contactAttempts: 0 }
                    : editForm;
                  setPatients(patients.map(p => p.id === saveForm.id ? saveForm : p));
                  await dbUpsert(saveForm);
                  setShowEditModal(null);
                  setEditForm({});
                }}
                style={{flex:1,padding:'12px',backgroundColor:'#10b981',color:'white',border:'none',borderRadius:'6px',fontWeight:'600',cursor:'pointer'}}
              >
                💾 Save Changes
              </button>
              <button
                onClick={() => {setShowEditModal(null); setEditForm({});}}
                style={{padding:'12px 24px',backgroundColor:'#e5e7eb',color:'#374151',border:'none',borderRadius:'6px',cursor:'pointer'}}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard = ({label, value, color, goal, goalLabel, sub, badge, badgeColor}) => {
  const pct = (goal && typeof value === 'number') ? Math.min(100, Math.round((value / goal) * 100)) : null;
  const barColor = pct === null ? null : pct >= 100 ? '#10b981' : pct >= 75 ? '#f59e0b' : '#ef4444';
  const defaultBadgeColor = pct === null ? null : pct >= 100 ? '#dcfce7' : pct >= 75 ? '#fef3c7' : '#fee2e2';
  const defaultBadgeText = pct === null ? null : pct >= 100 ? 'On Track' : pct >= 75 ? `${pct}%` : `${pct}%`;
  const showBadge = badge || defaultBadgeText;
  const badgeBg = badgeColor || defaultBadgeColor;
  const badgeFg = pct === null ? '#374151' : pct >= 100 ? '#166534' : pct >= 75 ? '#92400e' : '#991b1b';
  return (
    <div style={{backgroundColor:'white',padding:'18px 20px',borderRadius:'10px',boxShadow:'0 1px 3px rgba(0,0,0,0.08)',position:'relative',overflow:'hidden'}}>
      <div style={{fontSize:'11px',color:'#6b7280',fontWeight:'600',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:'4px'}}>{label}</div>
      <div style={{fontSize:'34px',fontWeight:'800',color: color || '#202020',lineHeight:1,marginBottom:'4px'}}>{value}</div>
      {goal && <div style={{fontSize:'12px',color:'#9ca3af'}}>Goal: <strong style={{color:'#374151'}}>{goal}</strong>{goalLabel ? <span style={{marginLeft:'6px',color:'#9ca3af'}}>{goalLabel}</span> : null}</div>}
      {sub && !goal && <div style={{fontSize:'12px',color:'#9ca3af'}}>{sub}</div>}
      {pct !== null && <div style={{height:'4px',backgroundColor:'#f3f4f6',borderRadius:'2px',marginTop:'8px'}}><div style={{height:'4px',borderRadius:'2px',backgroundColor:barColor,width:`${pct}%`,transition:'width 0.4s ease'}}></div></div>}
      {showBadge && <div style={{position:'absolute',top:'12px',right:'12px',fontSize:'10px',fontWeight:'700',padding:'2px 7px',borderRadius:'10px',backgroundColor:badgeBg,color:badgeFg}}>{showBadge}</div>}
    </div>
  );
};




export default App;
