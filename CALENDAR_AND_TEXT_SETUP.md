# Parker's calendar, photos and customer texts

## Job calendar

Open https://colesautodetailingtexas.com/dashboard.html and choose **Calendar**.

- Month and week views display job appointments in America/Chicago (Central) time.
- Click any day, select customer and service, enter start time, duration, custom price and notes; click Schedule job.
- Edit an appointment, mark it completed, or download an ICS calendar invitation with a reminder alarm for Parker's own calendar.
- Choose a reminder 30 minutes, 1 or 2 hours, or 1 or 2 days before a visit. The dashboard shows reminders that are due, with a button to mark handled **manually**.
- For repeat customers, choose weekly, biweekly, 30-day, 60-day or 90-day intervals and click Schedule next visit after a completed appointment. New visits require confirmation; no automatic charge or unlimited repeating booking is created.
- Appointments are stored on the existing jobs records in Supabase; no duplicate booking database.

## Combined customer text composer

Choose Send Text on a job in the Calendar or Jobs tab. Check any combination of:
- Appointment reminder.
- Secure Stripe payment link for the unpaid balance.
- Google review invitation (honest review; no incentives).

The preview combines these in ONE text. Add a personal note. Click Open texting app or Copy message. **Opening a text does not send it automatically.** Parker must press Send. The private message log records copied and opened drafts, never falsely claims delivery.

The job must have a valid customer mobile number and the relevant recorded opt-in:
- Service/payment/reminder texts require service opt-in.
- Review invitations require separate review-request opt-in.
- On the public quote form, customers may opt in to either or both without requiring consent to request service.
- The Customers tab has a Text preferences button to record consent, how it was obtained, and STOP opt-outs.
- When a website inquiry becomes a customer, the inquiry's opt-ins are carried over.
- The composer disables unavailable options when Stripe hasn't produced an active job checkout or Parker hasn't saved his Google review link.
- A job-specific Stripe checkout can be generated from the composer once Stripe is configured.

## Automated delivery: NOT ACTIVE

To send scheduled reminders automatically or send SMS from the dashboard without opening a messaging app, the business will need a provider such as Twilio Programmable Messaging, an eligible messaging number, US A2P 10DLC registration where applicable, appropriate opt-in records, and Supabase server-side secrets.

A follow-up implementation should add a provider send endpoint, an outbound queue and scheduled dispatcher, STOP/START inbound handling, verified delivery status callbacks, and anti-duplicate safeguards. It should not begin sending customers messages merely because provider credentials were added.

## Oversized photo uploads

In Photos, select a JPG/PNG/WebP or browser-compatible phone image, even if it is over 5 MiB. The browser automatically resizes it (default maximum dimension 1600 pixels), crops if selected, and compresses it to JPEG below Supabase's 5 MiB upload limit. Use the preview, square/landscape/portrait/wide crop selector, and crop-position sliders. EXIF metadata including GPS coordinates is removed. Some HEIC files are not supported by browsers and may need to be exported as JPG first.

## Tests and security

- Calendar date calculations handle Central Time and daylight saving; invalid local DST times are rejected.
- Photo cropping stays within source image bounds.
- Unit tests run via Node 22 npm test; GitHub Actions checks run on pushes.
- Customer records and message-preparation logs require authorized Supabase staff access.
- The existing payment webhook is the authoritative Stripe receipt; manually opened SMS drafts do not mark jobs paid.
- Review the public Privacy Policy and Terms before launching large-scale texting.
