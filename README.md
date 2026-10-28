# Cole's Auto Detailing

Parker's **Midnight Shine** website and customer-management dashboard. GitHub source is backed by a separate Supabase project.

**Supabase project:** [ColesAutoDetailing](https://supabase.com/dashboard/project/tubskesvgngmmgcicowq)

## Status

- Public website: services, gallery, customer inquiries, customer-specific payment guidance, and an optional official Google Maps Places UI Kit live reviews component. Google reviews stay dormant until Parker saves his exact Place ID and a restricted browser key. See [GOOGLE_REVIEWS_SETUP.md](GOOGLE_REVIEWS_SETUP.md).
- Dashboard: password login with staff authorization; leads, customers, appointments, manually recorded offline payments, services, and photos.
- **Stripe custom-job checkout is implemented**, including authenticated Checkout link generation, record of outstanding balance, payment-history actions, webhook-backed payment settlement, refunds, and duplicate-event protection.
- **Not accepting real card payments yet:** Stripe account secrets, signing secret, and live website URL must be supplied through Supabase Edge Function Secrets. Read [STRIPE_SETUP.md](STRIPE_SETUP.md).
- Voice/text: basic confirmed commands; a general-purpose AI editor is not yet implemented.
- GitHub Pages is configured to publish from the main branch at the repository root, and a CNAME file has been added for colesautodetailingtexas.com. Bluehost DNS still needs to point to GitHub Pages before the domain will work. The login for colesautodetailingtx@gmail.com must still be invited and authorized.

## Deployment

Publish the `main` branch from `/ (root)` using **GitHub Pages**. The custom domain in the repository-root CNAME file is `colesautodetailingtexas.com`. In Bluehost DNS add four apex `A` records pointing `@` to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`; add a `www` CNAME pointing to `benbeveridge83.github.io`. Remove only conflicting default web-site A / CNAME records, **not MX/TXT email records**. See [GitHub's custom-domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site). When DNS and HTTPS are live, follow [STRIPE_SETUP.md](STRIPE_SETUP.md). The site root is `index.html`, and the staff interface is `dashboard.html` (customer data is protected with login plus database Row-Level Security).

## Security

- Public Supabase publishable key is included as expected; **no Stripe secret key, webhook signing secret, password or service-role key belongs in this repository**.
- Individual custom Checkout amounts are determined on the server from job records. Never rely on browser amounts or redirect pages to confirm a transaction.
- The site opens text and email drafts; it does not automatically transmit customer messages.
- The public quote form should receive CAPTCHA/rate limiting and privacy notices before active promotion.
- Review and photograph rights, Stripe account eligibility, Google Maps Platform billing and API terms, and tax treatment before processing real payments.

## Calendar and customer messages

Parker's dashboard now includes a built-in Central-time job calendar, month/week navigation, edit/schedule jobs, repeat-visit suggestions, upcoming reminders and downloadable calendar alerts. The Jobs and Calendar views also offer a single customer text composer that can combine a job reminder, Stripe link, and honest Google review link into one message.

Customers' separate service-text and review-invitation opt-in records are enforced. The website **opens SMS drafts** and provides Copy Message; actual sending still requires Parker to press Send. Fully automatic sending requires a configured SMS provider, A2P registration where applicable, and opt-out handling.

The Photos tab automatically resizes/compresses overlarge images with crop preview and strips embedded GPS metadata.

**Setup and testing details:** [CALENDAR_AND_TEXT_SETUP.md](CALENDAR_AND_TEXT_SETUP.md). Run Node 22 tests via `npm test`; GitHub Actions now checks date and image-crop logic on pushes.

## Database

Supabase migrations already applied: initial_site_and_business_tables, isolate_staff_check_from_public_rpc, stripe_per_job_checkout_ledger. Initial schema reference is in [supabase/schema.sql](supabase/schema.sql).


## Password recovery and alerts

See [ACCOUNT_AND_ALERTS_SETUP.md](ACCOUNT_AND_ALERTS_SETUP.md) for the remaining account, authentication email, Resend, and Twilio configuration. Form submissions are saved even while alert services are awaiting setup.
