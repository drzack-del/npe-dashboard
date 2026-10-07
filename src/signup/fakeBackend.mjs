// Stand-in for the AWS sign-up function so the /signup page can be clicked through locally.
// Everything lives in this browser's localStorage; nothing is sent anywhere and nothing is charged.
// Same actions and response shape the real function will have.
import { AGREEMENT_VERSION } from './documents.mjs';
import { planFor, practiceDetailErrors } from './workflow.mjs';

const KEY = 'cadenceiq-signup-test';
const read = () => { try { return JSON.parse(window.localStorage.getItem(KEY)); } catch { return null; } };
const write = record => { try { window.localStorage.setItem(KEY, JSON.stringify(record)); } catch {} return record; };
const fail = message => { throw new Error(message); };

const company = { legalName: 'CadenceIQ LLC', state: 'Florida', noticeEmail: 'billing@trycadenceiq.com' };
// The test setup pretends 2 Foundation Partner spots are already taken.
const FOUNDATION_TAKEN = 2;

export const fakeBackend = {
  testMode: true,
  async get() { return read(); },
  async start(details) {
    const plan = planFor(FOUNDATION_TAKEN);
    return write({ id: 'test-signup', stage: 'started', testMode: true, plan, company,
      foundationSpotsLeft: Math.max(0, 5 - FOUNDATION_TAKEN), details: details || {},
      cardAvailable: true, cardSurchargeAvailable: false, cardSurchargeBps: 0, createdAt: new Date().toISOString() });
  },
  async saveDetails(details) {
    const r = read() || await this.start();
    if (!['started', 'information_complete'].includes(r.stage)) fail('Practice information is locked after signing.');
    if (Object.keys(practiceDetailErrors(details)).length) fail('Required practice information is incomplete.');
    return write({ ...r, details, stage: 'information_complete' });
  },
  async sign(signatureName, planKey) {
    const r = read();
    if (r?.stage !== 'information_complete') fail('Complete the practice information first.');
    if (signatureName.trim().toLowerCase() !== String(r.details.signerName).trim().toLowerCase()) fail('Signature must match the authorized signer.');
    if (planKey && planKey !== r.plan.key) fail('The price changed. Please review the Order Form and sign again.');
    return write({ ...r, stage: 'signed', signatureName: signatureName.trim(), signedAt: new Date().toISOString(), agreementVersion: AGREEMENT_VERSION });
  },
  // The real function returns a Stripe Checkout link; the test pretends payment cleared.
  async checkout(paymentMethodType) {
    const r = read();
    if (!['signed', 'payment_pending'].includes(r?.stage)) fail('Sign the agreements before payment.');
    const now = new Date().toISOString();
    return { record: write({ ...r, stage: 'provisioned', paymentMethodType, paidAt: now, provisionedAt: now }) };
  },
  async reset() { try { window.localStorage.removeItem(KEY); } catch {} return null; },
};
