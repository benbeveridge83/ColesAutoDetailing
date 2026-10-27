# Parker account, recovery, and submission alerts

## Implemented
- Dashboard → Forgot password → reset email → set and confirm a password.
- Form submissions shown newest first, with full message, contact links, time, and follow-up status.
- Each saved lead creates an email and SMS queue entry. Row-level security limits visibility to staff.
- A database trigger dispatches alerts immediately; a one-minute cron drains pending entries after provider setup or a temporary dispatcher failure.
- Accepted means accepted by the delivery provider, **not confirmed inbox/handset delivery**. Failed and unknown rows require review; uncertain SMS deliveries are never automatically resent.
- Existing submission was retained and queued. No customer or owner notifications have been sent during implementation.

## Still required: create Parker's account and configure recovery
In Supabase project ColesAutoDetailing:
1. Authentication → URL Configuration: Site URL `https://colesautodetailingtexas.com/reset-password.html`; add that same URL to allowed Redirect URLs. This ensures invitation and recovery emails land on a page that can set the password.
2. Configure Auth SMTP (Resend SMTP can be used) so account invitations and recovery email can reach the business Gmail address. Supabase's default sender restricts recipients and is unsuitable as the production email service.
3. Authentication → Users → Add user → Send invitation to `colesautodetailingtx@gmail.com`. Parker follows the invitation and chooses his own password. Never put passwords in the repository or chat.
4. Authorize only this account using the existing staff table after verifying the invite exists:

```sql
insert into public.staff_users(user_id)
select id from auth.users where lower(email)='colesautodetailingtx@gmail.com'
on conflict do nothing;
```

Read the table schema if additional required fields have been added before running that insert. Password resets do not create an account or grant staff access.

## Connect email alerts with Resend
1. Create the Resend account; verify a sending domain such as `notifications.colesautodetailingtexas.com` using the exact DNS records Resend supplies. Do not replace the website DNS or existing mailbox records.
2. Create a sending API key.
3. In Supabase → Edge Functions → Secrets, add:
   - `RESEND_API_KEY`: the sending API key
   - `ALERT_FROM_EMAIL`: a verified sender, e.g. `Cole's Auto Detailing <alerts@notifications.colesautodetailingtexas.com>`
4. Alerts go to `colesautodetailingtx@gmail.com`. Configure Auth SMTP separately for invitations and reset emails: SMTP host `smtp.resend.com`, username `resend`, password the Resend API key, port per Resend SMTP instructions, and a verified From address.

## Connect SMS alerts with Twilio
1. Create the Twilio account and obtain a sending number approved for US messaging. Complete the provider's applicable sender verification/registration. Trial accounts may require verifying Parker's destination number.
2. In Supabase → Edge Functions → Secrets, add:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER`: Twilio sender in E.164 format (not Parker's receiving phone)
3. Alerts go to `+18328775556`. They contain a short notification and the secure dashboard link; detailed messages remain in the dashboard/email.

## Activation and verification
The deployed `lead-alerts` function reads provider configuration from server secrets. No browser code receives private credentials. After configuring the secrets, redeploy the function if needed, then allow the one-minute job to run. Pending alerts are delivered only for configured channels.

Test one clearly labeled submission and verify the row, queue status, Resend/Twilio logs, and actual email/text receipt. Test the recovery email link through saving a new password and signing in as authorized staff. These external delivery and real-user sign-in checks are **not yet completed**.

If an alert shows `unknown` or remains `processing`, check provider logs before retrying. Once an administrator establishes a failed alert was not accepted, set that queue row to `pending`. Do not retry all entries blindly.

## Verification performed
`node --test tests/*.test.mjs` covers email validation, recovery destination, password mismatch/session rejection, local sign-out, fixed notification recipients, missing provider configuration, and provider failure/timeout handling. Supabase checks confirm RLS, restricted RPC grants, the notification trigger, pending entries, and no security-advisor findings.
