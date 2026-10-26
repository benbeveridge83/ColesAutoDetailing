# Cole's Auto Detailing

Parker's **Midnight Shine** website and customer-management dashboard. GitHub source is backed by a separate Supabase project.

**Supabase project:** [ColesAutoDetailing](https://supabase.com/dashboard/project/tubskesvgngmmgcicowq)

## Status

- Public website: services, gallery, customer inquiries, Google review-link placeholder, and customer-specific payment guidance.
- Dashboard: password login with staff authorization; leads, customers, appointments, manually recorded offline payments, services, and photos.
- **Stripe custom-job checkout is implemented**, including authenticated Checkout link generation, record of outstanding balance, payment-history actions, webhook-backed payment settlement, refunds, and duplicate-event protection.
- **Not accepting real card payments yet:** Stripe account secrets, signing secret, and live website URL must be supplied through Supabase Edge Function Secrets. Read [STRIPE_SETUP.md](STRIPE_SETUP.md).
- Voice/text: basic confirmed commands; a general-purpose AI editor is not yet implemented.
- The project has not been deployed publicly to Vercel, and the login for colesautodetailingtx@gmail.com must still be invited and authorized.

## Deployment

Deploy this repository as a static site with Vercel, then follow [STRIPE_SETUP.md](STRIPE_SETUP.md). The site root is index.html and the private interface is dashboard.html (data is protected with login plus database Row-Level Security).

## Security

- Public Supabase publishable key is included as expected; **no Stripe secret key, webhook signing secret, password or service-role key belongs in this repository**.
- Individual custom Checkout amounts are determined on the server from job records. Never rely on browser amounts or redirect pages to confirm a transaction.
- The site opens text and email drafts; it does not automatically transmit customer messages.
- The public quote form should receive CAPTCHA/rate limiting and privacy notices before active promotion.
- Review and photograph rights, Stripe account eligibility, and tax treatment before processing real payments.

## Database

Supabase migrations already applied: initial_site_and_business_tables, isolate_staff_check_from_public_rpc, stripe_per_job_checkout_ledger. Initial schema reference is in [supabase/schema.sql](supabase/schema.sql).
