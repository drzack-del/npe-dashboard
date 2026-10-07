// Self-serve sign-up for new practices: stages, plans, field checks and fee math.
// Shared by the /signup page and (later) the AWS sign-up function, so the numbers a
// practice sees before paying are the numbers Stripe charges.

export const SIGNUP_STAGES = ['started', 'information_complete', 'signed', 'payment_pending', 'paid', 'provisioned'];

export const stageLabel = stage => ({
  started: 'Getting started', information_complete: 'Information complete',
  signed: 'Agreements signed', payment_pending: 'Payment pending', paid: 'Paid',
  provisioned: 'Active',
}[stage] || stage);

export const signupProgress = stage => {
  const index = SIGNUP_STAGES.indexOf(stage);
  return index < 0 ? 0 : Math.round((index / (SIGNUP_STAGES.length - 1)) * 100);
};

// From CadenceIQ_Pricing.docx. Foundation Partner is for the first 5 practices only and they
// keep the rate while active; the server decides which plan a new practice gets.
export const FOUNDATION_SPOTS = 5;
export const PLANS = {
  foundation: { key: 'foundation', name: 'Foundation Partner', monthlyFeeCents: 25000, setupFeeCents: 50000 },
  standard: { key: 'standard', name: 'CadenceIQ Standard', monthlyFeeCents: 40000, setupFeeCents: 50000 },
};
// Per-practice pricing covers one legal entity (one tax ID) with up to this many offices.
export const MAX_LOCATIONS = 3;
export const planFor = foundationTaken => foundationTaken < FOUNDATION_SPOTS ? PLANS.foundation : PLANS.standard;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const practiceDetailErrors = (details = {}) => {
  const value = key => String(details[key] || '').trim();
  const errors = {};
  if (value('legalName').length < 2) errors.legalName = 'Enter the complete legal practice name.';
  if (value('officeAddress').length < 5) errors.officeAddress = 'Enter the practice street address.';
  if (value('city').length < 2) errors.city = 'Enter the city.';
  if (!/^[A-Za-z]{2}$/.test(value('state'))) errors.state = 'Use the two-letter state code, such as FL.';
  if (!/^\d{5}(?:-\d{4})?$/.test(value('postalCode'))) errors.postalCode = 'Enter a 5-digit ZIP code or ZIP+4.';
  if (value('signerName').split(/\s+/).length < 2) errors.signerName = 'Enter the authorized signer’s first and last name.';
  if (value('signerTitle').length < 2) errors.signerTitle = 'Enter the signer’s title.';
  if (!emailPattern.test(value('signerEmail'))) errors.signerEmail = 'Enter a valid signer email address.';
  if (!emailPattern.test(value('billingEmail'))) errors.billingEmail = 'Enter a valid billing email address.';
  const offices = Array.isArray(details.locations) ? details.locations.filter(x => String(x).trim()) : [];
  if (!offices.length) errors.locations = 'Add at least one office location.';
  else if (offices.length > MAX_LOCATIONS) errors.locations = `Online sign-up covers up to ${MAX_LOCATIONS} locations. For larger groups, contact us for custom pricing.`;
  return errors;
};

export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((Number(cents) || 0) / 100);

// Card: credit cards only, and only in states cleared for surcharging. The surcharge is our
// processing cost (Stripe's 2.9% + 30 cents), never more than 3% (card-network rules cap it at
// both the merchant's cost and 3%).
export const SURCHARGE_BPS = 300;
export const CARD_COST_BPS = 290;
export const CARD_COST_FIXED_CENTS = 30;
export const surchargeCents = (cents, bps = SURCHARGE_BPS) => {
  const c = Number(cents) || 0;
  return Math.min(Math.round(c * bps / 10000), Math.round(c * CARD_COST_BPS / 10000) + CARD_COST_FIXED_CENTS);
};
// ACH fee pass-through: no longer charged (kept for the Stripe setup script's existing prices).
export const ACH_FEE_BPS = 80;
export const ACH_FEE_CAP_CENTS = 500;
export const achFeeCents = (cents, bps = ACH_FEE_BPS, capCents = ACH_FEE_CAP_CENTS) =>
  Math.min(capCents, Math.ceil((Number(cents) || 0) * bps / (10000 - bps)));

// What a practice pays at checkout and then each month, for one payment method.
export const chargeSummary = (plan, method, surchargeBps = SURCHARGE_BPS) => {
  // Bank account (ACH) payments carry no fee (Dr. Miller dropped the ACH pass-through, 2026-10-07).
  const extra = cents => method === 'card' ? surchargeCents(cents, surchargeBps) : 0;
  const monthlyExtra = extra(plan.monthlyFeeCents), setupExtra = extra(plan.setupFeeCents);
  return {
    monthlyExtra, setupExtra,
    monthlyTotal: plan.monthlyFeeCents + monthlyExtra,
    dueToday: plan.setupFeeCents + setupExtra + plan.monthlyFeeCents + monthlyExtra,
  };
};
