# CadenceIQ practice sign-up launch checklist

> Carried over from Codex's Sep 27 draft. Since 2026-10-05 the database is on AWS, so the
> "Supabase deployment" section below will be replaced by the AWS sign-up and Stripe webhook
> functions. Sign-up is self-serve at /signup (no invite link). Pricing comes from
> CadenceIQ_Pricing.docx: Foundation Partner $250/month for the first 5 practices, then
> CadenceIQ Standard $400/month, $500 one-time setup on both.

The application contains a complete technical workflow, but the agreement text is intentionally marked **DRAFT** until reviewed by counsel. Do not use the live link for a paying office until the legal and payment configuration below is complete.

## After the LLC is filed

- Confirm the exact legal name, formation state, principal business address, registered-agent details, EIN, and business bank account.
- Have a healthcare/SaaS attorney approve the Master Services Agreement, Order Form, Business Associate Agreement, recurring-payment authorization, privacy policy, and data-retention/offboarding language.
- Decide the production plan name, implementation fee, monthly fee, notice period, governing law, venue, support commitment, and any service-level commitment.
- Replace the draft `AGREEMENT_VERSION` in `src/signup/documents.mjs` with a new immutable agreement version after counsel approves the language. Existing signatures must remain tied to their original version.

## Supabase deployment

1. Apply `supabase/migrations/20260928013000_office_onboarding.sql`.
2. Deploy the `office-onboarding`, `stripe-onboarding-webhook`, and `billing` Edge Functions. Configure the Stripe webhook function with JWT verification disabled; keep JWT verification enabled for the other two.
3. Configure these Edge Function secrets:
   - `STRIPE_SECRET_KEY` (use a Stripe test key first)
   - `STRIPE_WEBHOOK_SECRET`
   - `APP_URL`
   - `CADENCE_LEGAL_NAME`
   - `CADENCE_FORMATION_STATE`
   - `CADENCE_BUSINESS_ADDRESS`
   - `CARD_FUNDING_BLOCK_CONFIRMED` — leave unset until Stripe/Radar is configured and tested to block debit and prepaid cards from the surcharge checkout
4. Keep Supabase's automatically supplied URL, anonymous key, and service-role key in the Edge Function environment. Never expose the service-role key to the browser.

## Stripe test

- Create a Stripe account under the LLC and complete business verification.
- In Stripe test mode, register the deployed webhook URL ending in `/functions/v1/stripe-onboarding-webhook`.
- Subscribe it to `checkout.session.completed`, `checkout.session.async_payment_failed`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, and subscription created/updated/paused/resumed/deleted events.
- Test both payment choices: credit card includes separate 3% recurring and setup-fee surcharge lines; ACH includes a separate processor-cost recovery line based on Stripe's current 0.8% fee, capped at $5 per debit.
- Start a test sign-up at /signup.
- Complete the office information and signature steps.
- Use Stripe's successful test card `4242 4242 4242 4242`, any future expiration, and any CVC.
- Confirm exactly one practice and one administrator membership are created.
- Repeat with Stripe's declined test card and confirm no practice is created.
- Replay the successful webhook and confirm it does not create a duplicate practice.
- Confirm a failed renewal enters the 7-day grace period and a cancellation or unpaid subscription suspends protected app access.

## Card surcharge launch gate

- Get counsel's approval for each state where an office is located, complete any card-network/acquirer notice, and document both dates.
- Configure Stripe/Radar so the surcharge checkout accepts credit cards only and rejects debit and prepaid cards. Set `CARD_FUNDING_BLOCK_CONFIRMED=true` only after a test proves this behavior.
- Add an enabled row for each approved state to `billing_surcharge_rules`; there is intentionally no nationwide default.
- Verify the exact 3% surcharge and total are disclosed before confirmation and appear as separate Stripe invoice and receipt line items.
- If any card-surcharge requirement is incomplete, leave card checkout disabled and offer ACH with its separately disclosed processing-cost recovery amount.

## Production cutover

- Replace the Stripe test key and webhook secret with live-mode values.
- Confirm Stripe branding, receipt emails, billing portal, statement descriptor, bank account, tax settings, and dispute notifications.
- Run one low-dollar internal live transaction, refund it, and confirm the full audit trail.
- Archive the final signed agreement package outside the operational database according to the attorney-approved retention policy.
