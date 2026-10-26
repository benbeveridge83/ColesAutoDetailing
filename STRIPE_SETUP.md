# Stripe: individual-job checkout setup

Parker determines the price of each job. The website calculates payment amount on the server from the saved job price, minus offline and previously confirmed Stripe payments. A customer cannot change the amount.

## What is built

- Parker's dashboard > Jobs: choose a customer, enter the custom job price and optional offline payments.
- Create Stripe link: server verifies Parker's Supabase login and staff authorization. It creates one Stripe-hosted Checkout Session for that job's unpaid balance.
- Dashboard payment history: Copy link, Text link, Email link. The last two open customer message drafts; they do not send automatically.
- The Stripe webhook validates signature, records paid sessions idempotently, adjusts job Stripe paid totals and handles refund adjustments.
- Links expire in roughly 23 hours. The dashboard and database prevent duplicate active links for a job.
- Online payments are not active until secrets and a website URL are configured.

## Steps to activate

1. Configure GitHub Pages from main / root using the `CNAME` file, and point Bluehost DNS to GitHub Pages for `colesautodetailingtexas.com`. Confirm `https://colesautodetailingtexas.com/` works with HTTPS before enabling Stripe. Keep GitHub Pages as the public host; no Vercel deployment is needed.
2. Open Supabase Edge Function Secrets: https://supabase.com/dashboard/project/tubskesvgngmmgcicowq/functions/secrets
3. Add secret STRIPE_SECRET_KEY: the correct Stripe account secret key (start with a Stripe test key, sk_test_...). **Never put this in GitHub or ChatGPT.**
4. Add secret APP_BASE_URL: `https://colesautodetailingtexas.com` (without a trailing slash), only after the live HTTPS domain is working.
5. In Stripe Dashboard, create a webhook destination for:
https://tubskesvgngmmgcicowq.supabase.co/functions/v1/stripe-webhook
6. Subscribe to:
   - checkout.session.completed
   - checkout.session.async_payment_succeeded
   - checkout.session.async_payment_failed
   - checkout.session.expired
   - charge.refunded
7. Obtain the webhook signing secret (whsec_...) from Stripe and add it in Supabase as STRIPE_WEBHOOK_SECRET. Do not put it in the repo.
8. Supabase provides SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically to server functions. Keep them out of public code.
9. Invite colesautodetailingtx@gmail.com using Supabase Dashboard > Authentication > Users:
https://supabase.com/dashboard/project/tubskesvgngmmgcicowq/auth/users
10. Once the Auth user exists, in Supabase SQL Editor run the following to authorize the correct staff login:

    insert into public.staff_users(user_id)
    select id from auth.users where lower(email)=lower('colesautodetailingtx@gmail.com')
    on conflict do nothing;

11. Sign in at https://colesautodetailingtexas.com/dashboard.html, create a test customer and $35 job, then generate a test Stripe Checkout link.
12. Use a Stripe test card in test mode, confirm the test payment, and check the job's Stripe paid and status. Test duplicate webhook delivery, expiration and refunds.
13. When verified, replace with LIVE Stripe keys and the LIVE webhook's signing secret. Do a controlled live test only with the account owner's approval.

Before logging in, update Supabase Authentication > URL Configuration: set the Site URL to `https://colesautodetailingtexas.com` and allow redirects from `https://colesautodetailingtexas.com/**` (plus your www domain if using it). Test Supabase login and quote form after publishing.

## Security rules and notes

- The checkout endpoint has verify_jwt=false at Supabase gateway for compatibility with modern publishable keys; **its code authenticates the Supabase session and staff role** before creating any checkout.
- Webhook endpoint has verify_jwt=false because Stripe signs the webhook itself; raw payload signature verification is mandatory.
- A customer may only pay using the server-issued Stripe-hosted link, not by typing an arbitrary amount on this website.
- Payment success redirect is **not proof of payment**; only a valid Stripe event updates the ledger.
- Payment link emails and SMS texts are drafts that Parker must send.
- This is for one-time services, not recurring subscription billing.
- If Parker is under the age required for Stripe account ownership, the account must be properly owned or represented by an eligible parent/guardian under Stripe's rules.
- Do not share secret keys, bank information or account passwords in chat or GitHub.
