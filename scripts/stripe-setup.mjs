#!/usr/bin/env node
// Sets up the Stripe side of practice sign-up: products, prices, the billing portal and
// payment methods. Safe to run again; it reuses what already exists and fixes what differs.
//
//   node scripts/stripe-setup.mjs
//
// It asks for a Stripe key with typing hidden, so the key never lands in shell history or
// any file. Test keys only (sk_test_ / rk_test_): it refuses live keys until we go live.
// Writes the resulting IDs (not secret) to scripts/stripe-test-ids.json.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLANS, SURCHARGE_BPS } from '../src/signup/workflow.mjs';

const API_VERSION = '2026-09-30.endive';
// Opaque Stripe tax codes from docs.stripe.com/tax/tax-codes. Prices are tax-exclusive so
// Stripe Tax can be switched on later (once we register in a state) without changing prices.
const TAX = { saas: 'txcd_10103001', setup: 'txcd_20120002' };

const PRODUCTS = [
  { id: 'cadenceiq_subscription', name: 'CadenceIQ subscription', tax_code: TAX.saas, description: 'Practice reporting and new-patient follow-up, priced per practice.' },
  { id: 'cadenceiq_setup', name: 'CadenceIQ setup and onboarding', tax_code: TAX.setup, description: 'One-time data connection and onboarding.' },
  // The two pass-through fees are priced at checkout from the plan amount (see chargeSummary).
  { id: 'cadenceiq_card_surcharge', name: `Credit-card surcharge (${SURCHARGE_BPS / 100}%)`, tax_code: TAX.saas },
  { id: 'cadenceiq_ach_processing', name: 'ACH processing cost (0.8%, $5 maximum)', tax_code: TAX.saas },
];
const PRICES = [
  { lookup_key: 'cadenceiq_foundation_monthly', product: 'cadenceiq_subscription', nickname: PLANS.foundation.name, unit_amount: PLANS.foundation.monthlyFeeCents, recurring: 'month' },
  { lookup_key: 'cadenceiq_standard_monthly', product: 'cadenceiq_subscription', nickname: PLANS.standard.name, unit_amount: PLANS.standard.monthlyFeeCents, recurring: 'month' },
  { lookup_key: 'cadenceiq_setup_fee', product: 'cadenceiq_setup', nickname: 'One-time setup', unit_amount: PLANS.standard.setupFeeCents },
];

function askHidden(question) {
  return new Promise(resolve => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding('utf8');
    let value = '';
    const onData = ch => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode?.(false); stdin.pause(); stdin.off('data', onData); stdout.write('\n'); resolve(value.trim());
      } else if (ch === '\u0003') { stdout.write('\n'); process.exit(1); }
      else if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
      else value += ch;
    };
    stdin.on('data', onData);
  });
}

// Stripe takes form-encoded bodies with bracketed keys: a[b][0]=c.
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

let KEY;
async function stripe(method, path, params) {
  const query = method === 'GET' && params ? '?' + form(params) : '';
  const res = await fetch(`https://api.stripe.com/v1${path}${query}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Stripe-Version': API_VERSION,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: method === 'POST' ? form(params || {}) : undefined,
  });
  const body = await res.json();
  if (!res.ok) {
    const e = new Error(`${method} ${path}: ${body.error?.message || res.status}`);
    e.status = res.status; e.code = body.error?.code; throw e;
  }
  return body;
}

const log = (mark, text) => console.log(`  ${mark} ${text}`);

async function ensureProduct(p) {
  try {
    const found = await stripe('GET', `/products/${p.id}`);
    const changes = {};
    if (found.name !== p.name) changes.name = p.name;
    if (found.tax_code !== p.tax_code) changes.tax_code = p.tax_code;
    if (p.description && found.description !== p.description) changes.description = p.description;
    if (!found.active) changes.active = true;
    if (Object.keys(changes).length) { await stripe('POST', `/products/${p.id}`, changes); log('~', `${p.name} (updated)`); }
    else log('✓', `${p.name} (already set up)`);
  } catch (e) {
    if (e.status !== 404) throw e;
    await stripe('POST', '/products', p);
    log('+', `${p.name} (created)`);
  }
}

async function ensurePrice(p) {
  const { data } = await stripe('GET', '/prices', { lookup_keys: [p.lookup_key], active: true });
  const found = data[0];
  const same = found && found.unit_amount === p.unit_amount && found.product === p.product &&
    (found.recurring?.interval || null) === (p.recurring || null) && found.tax_behavior === 'exclusive';
  if (same) { log('✓', `${p.nickname}: $${p.unit_amount / 100}${p.recurring ? '/' + p.recurring : ''} (already set up)`); return found.id; }
  // Prices can't change amount; make a new one, move the lookup key to it, retire the old one.
  const created = await stripe('POST', '/prices', {
    product: p.product, currency: 'usd', unit_amount: p.unit_amount, nickname: p.nickname,
    lookup_key: p.lookup_key, transfer_lookup_key: true, tax_behavior: 'exclusive',
    recurring: p.recurring ? { interval: p.recurring } : undefined,
  });
  if (found) await stripe('POST', `/prices/${found.id}`, { active: false });
  log(found ? '~' : '+', `${p.nickname}: $${p.unit_amount / 100}${p.recurring ? '/' + p.recurring : ''} (${found ? 'replaced' : 'created'})`);
  return created.id;
}

// Practices manage their own billing here: card/bank account, invoices, cancel at period end.
// No plan switching: the Foundation Partner rate is only for the first 5 practices.
async function ensurePortal() {
  const config = {
    name: 'CadenceIQ practices',
    default_return_url: 'https://trycadenceiq.com/app',
    metadata: { cadenceiq: 'practice-billing' },
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none',
        cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] } },
      subscription_update: { enabled: false },
    },
  };
  const { data } = await stripe('GET', '/billing_portal/configurations', { limit: 100 });
  const found = data.find(c => c.metadata?.cadenceiq === 'practice-billing');
  if (found) { await stripe('POST', `/billing_portal/configurations/${found.id}`, config); log('✓', 'Billing portal (updated)'); return found.id; }
  const created = await stripe('POST', '/billing_portal/configurations', config);
  log('+', 'Billing portal (created)');
  return created.id;
}

// Each checkout offers exactly one method (allowed_payment_method_types) because card and
// ACH carry different fee lines, so both must be switched on in the account's default set.
async function ensurePaymentMethods() {
  const { data } = await stripe('GET', '/payment_method_configurations', { limit: 100 });
  const def = data.find(c => c.is_default && !c.parent) || data.find(c => c.is_default);
  if (!def) { log('!', 'No default payment-method settings found; turn on Cards and ACH Direct Debit in the Dashboard.'); return null; }
  const want = ['card', 'us_bank_account'];
  const off = want.filter(m => def[m]?.display_preference?.value !== 'on');
  if (off.length) {
    await stripe('POST', `/payment_method_configurations/${def.id}`,
      Object.fromEntries(off.map(m => [m, { display_preference: { preference: 'on' } }])));
  }
  const after = await stripe('GET', `/payment_method_configurations/${def.id}`);
  for (const m of want) {
    const label = m === 'card' ? 'Cards' : 'ACH Direct Debit';
    if (after[m]?.display_preference?.value === 'on') log(off.includes(m) ? '+' : '✓', `${label} on`);
    else log('!', `${label} could not be turned on${after[m]?.available === false ? ' (not available on this account yet; check Settings → Payment methods)' : ''}`);
  }
  return def.id;
}

async function main() {
  console.log('\nCadenceIQ Stripe setup (test mode)\n');
  const typed = process.env.STRIPE_SETUP_KEY || await askHidden('Paste your Stripe SANDBOX secret key (sk_test_…), then Enter: ');
  // Terminals wrap pasted text in invisible markers (ESC[200~ … ESC[201~); keep just the key.
  KEY = (typed.match(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+/) || [typed.replace(/\x1b\[[0-9;~]*/g, '').trim()])[0];
  if (/^(sk|rk)_live_/.test(KEY)) { console.error('\nThat is a LIVE key. This script only runs on test keys for now.'); process.exit(1); }
  if (!/^(sk|rk)_test_/.test(KEY)) { console.error('\nThat does not look like a Stripe test key (sk_test_… or rk_test_…).'); process.exit(1); }

  let account = null;
  try { account = await stripe('GET', '/account'); } catch {}
  console.log(`\nAccount: ${account?.settings?.dashboard?.display_name || account?.business_profile?.name || '(name hidden for this key)'}${account?.id ? ` (${account.id})` : ''}\n`);

  console.log('Products');
  for (const p of PRODUCTS) await ensureProduct(p);
  console.log('\nPrices');
  const prices = {};
  for (const p of PRICES) prices[p.lookup_key] = await ensurePrice(p);
  console.log('\nBilling portal');
  const portal = await ensurePortal();
  console.log('\nPayment methods');
  const pmc = await ensurePaymentMethods();

  const out = { note: 'Stripe TEST mode IDs for practice sign-up. Not secret. Written by scripts/stripe-setup.mjs.',
    account: account?.id || null, apiVersion: API_VERSION, products: PRODUCTS.map(p => p.id), prices, portalConfiguration: portal,
    paymentMethodConfiguration: pmc, updatedAt: new Date().toISOString() };
  const file = fileURLToPath(new URL('./stripe-test-ids.json', import.meta.url));
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nDone. IDs saved to scripts/stripe-test-ids.json\n`);
}

main().catch(e => { console.error(`\nStopped: ${e.message}`); process.exit(1); });
