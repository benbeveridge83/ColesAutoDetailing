# Google Business Profile: automatic reviews setup

The Midnight Shine homepage now has an optional live **Google Places UI Kit** reviews panel. It uses Google's official user interface, so Google is responsible for showing reviews, ratings, source attribution, and Google links. Review content is **not copied into our Supabase database or cached**.

**The reviews do not appear until Parker connects the exact Google Maps listing and a restricted Google Maps JavaScript browser API key.** If you enable nothing, there are no Google review API requests or charges.

## Step 1 — Find Parker's exact business listing

Sign into the Google account that manages Cole's Auto Detailing. Open the business profile in Google Search or Maps.

- Confirm the listing is **Parker's Alvin, Texas business**. Another company with a very similar name operates elsewhere in the U.S.
- If the listing is unverified, missing from Maps, or doesn't yet have public reviews, complete Google Business Profile verification first.
- Use **Ask for reviews / Get more reviews** in his Google Business Profile to copy the **direct review link**. Save this to the dashboard **Website settings → Direct review link**. Customers clicking the site's **Leave a Google Review** button will open Google's review form.

## Step 2 — Get a Google Maps Place ID

Use the official [Google Place ID finder](https://developers.google.com/maps/documentation/places/web-service/place-id) to search the exact public business listing. Copy the Place ID, generally beginning with `ChIJ`, not a URL and not a Google Business Profile management ID.

If Google can't find his listing yet, **do not use a similarly named business's Place ID**. Wait until Parker's verified profile is published and searchable.

## Step 3 — Create a Google Cloud browser API key

Google Business Profile ownership and Google Maps API access are separate products.

1. Sign into [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project for Cole's Auto Detailing and enable **billing** for Maps Platform.
3. Follow [Google's Places UI Kit setup](https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started). Enable **Places UI Kit** and **Maps JavaScript API** as required.
4. Open [Google Maps Platform Keys & Credentials](https://console.cloud.google.com/google/maps-apis/credentials) and create an API key for **web browser** use.
5. Set application restriction **Websites (HTTP referrers)** and add:
   - `https://colesautodetailingtexas.com/*`
   - `https://www.colesautodetailingtexas.com/*`
6. Set API restrictions to **Maps JavaScript API and any Places UI Kit API Google specifically requires**; do not allow unrelated Google APIs.
7. Set a conservative **billing budget alert and quota limits** in Google Cloud. API use may incur charges, including as website traffic grows.

This is a **browser key**, intended to be visible to site visitors while restricted to this domain and the necessary API. **Do not use a private server key, Stripe secret key, service-role key, or unrestricted Google key.**

## Step 4 — Activate the website (Parker's dashboard)

Open https://colesautodetailingtexas.com/dashboard.html, sign in, select **Website settings**, and fill:

- **Google direct-review link:** the URL from the Google Business Profile's "Ask for reviews" control.
- **Google Maps Place ID:** the exact Place ID of Parker's Alvin-area listing.
- **Google Maps JavaScript browser API key:** your restricted key from Step 3.

Click **Save website settings** and refresh https://colesautodetailingtexas.com/#reviews.

The page loads Google's current Place Details / review UI when visited. The customer sees ratings and Google's selected reviews. Google's data availability and review ordering are controlled by Google; this is not a guaranteed display of **every** review or an instantaneous push notification. If no key or Place ID is set, the existing "coming soon" message remains.

## Compliance and verification

- The UI Kit includes Google Maps' reviews and attributions. Do not remove or cover them.
- Only review excerpts provided by Google are shown; none are invented, copied, or saved.
- Google Maps content is displayed without showing Parker's private home address because only the name, rating, reviews, and attribution components are requested.
- Public [Privacy Policy](privacy.html) and [Terms of Use](terms.html) pages have been added. The owner should review these drafts for accuracy before promoting the website.
- Test using a private/incognito window at the live domain and verify **the name, avatar attribution, rating, and review text belong to Parker's business**, not a similarly named business.
- For Google API credential errors, inspect the browser console and Google Cloud API key/referrer restrictions.

### Official documentation
- [Place Details UI components](https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details)
- [Get Started with Places UI Kit](https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started)
- [Google Maps Platform API key restrictions](https://developers.google.com/maps/documentation/javascript/get-api-key)
- [Attribution requirements](https://developers.google.com/maps/documentation/places/web-service/policies)
