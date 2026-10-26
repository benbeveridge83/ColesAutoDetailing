# Cole's Auto Detailing

Parker's Midnight Shine website and business dashboard, backed by a dedicated Supabase project.

## Status
- Public website: services, photo gallery, quote requests, payment placeholder, reviews area.
- Supabase project: `tubskesvgngmmgcicowq` (separate from other projects).
- Quote form submits to `public.leads` with insert-only anonymous permissions.
- Dashboard: login plus staff authorization; customers, appointments, payments recorded manually, services and photos.
- Card payments are **not active** until the business connects a Stripe account or provides a Stripe Payment Link. Never enter credit-card details into the site.
- Voice/text editing supports simple commands, not a fully autonomous website-editing agent.

## Setup
1. Deploy the repository as a static site on Vercel, using `index.html` at the root.
2. In Supabase Dashboard > Authentication > Users, create/invite an authorized admin login, then run `insert into public.staff_users(user_id) select id from auth.users where email = 'YOUR_EMAIL_ADDRESS' on conflict do nothing;` in SQL Editor. Replace the email before running; do not enter credentials in GitHub.
3. In Supabase Auth > URL Configuration, set Site URL and Redirect URLs to the eventual website URL.
4. Log in at `/dashboard.html` and configure services, photos, review link, and a **verified Stripe Payment Link** when ready.
5. Google review display requires a supported integration; no reviews are fabricated.

## Security notes
- Supabase publishable key is public by design; it is not a secret.
- RLS restricts business records to authorized staff.
- Customer contact information must not be written to a public repository or stored without authentication.
- Public form has basic constraints but should get CAPTCHA/rate limiting before major promotion.
- Public repository is currently visible to all; no passwords or private keys are committed.

## Database
See `supabase/schema.sql` for an implementation reference. Migration was applied in Supabase under `initial_site_and_business_tables`.
