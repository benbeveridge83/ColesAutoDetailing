/*
 * Official Google Maps Places UI Kit review display.
 * Loads ONLY after a restricted Maps JavaScript browser key and exact Place ID
 * have been saved by an authorized dashboard user.
 * Google retrieves/attributes reviews itself. Reviews are never copied to our DB.
 *
 * https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details
 * https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started
 */
const CALLBACK_NAME = '__colesAutoDetailingMapsReady';

function loadMapsJavascript(browserKey) {
  if (globalThis.google?.maps?.importLibrary) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    function done(error) {
      if (settled) return;
      settled = true;
      delete window[CALLBACK_NAME];
      if (error) reject(error);
      else resolve();
    }
    window[CALLBACK_NAME] = () => done();
    const url = new URL('https://maps.googleapis.com/maps/api/js');
    url.searchParams.set('key', browserKey);
    url.searchParams.set('v', 'weekly');
    url.searchParams.set('loading', 'async');
    url.searchParams.set('callback', CALLBACK_NAME);
    script.async = true;
    script.referrerPolicy = 'strict-origin-when-cross-origin';
    script.src = url.toString();
    script.onerror = () => done(new Error('Google Maps JavaScript failed to load.'));
    document.head.append(script);
  });
}

export async function showGoogleReviews({ placeId, browserKey }) {
  const panel = document.getElementById('googleReviewsPanel');
  const widgetRoot = document.getElementById('googleReviewsWidget');
  const waiting = document.getElementById('googleReviewsFallback');
  if (!panel || !widgetRoot || !waiting) return;
  if (!placeId || !browserKey) return;
  // Do not allow accidental pasted URLs or scripts as Place IDs or API keys.
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(placeId)
    || !/^AIza[A-Za-z0-9_-]{30,}$/.test(browserKey)) {
    console.warn('Google reviews configuration is incomplete.');
    return;
  }
  try {
    await loadMapsJavascript(browserKey);
    await google.maps.importLibrary('places');

    // The UI Kit renders the rating, review text, author attribution, Google Maps
    // attribution, and Google source links according to Google's own UI rules.
    const details = document.createElement('gmp-place-details');
    details.style.cssText = 'display:block;width:100%;height:420px;border-radius:10px;overflow:auto;color-scheme:light;';
    details.setAttribute('aria-label', 'Google Maps business rating and customer reviews');

    const request = document.createElement('gmp-place-details-place-request');
    request.setAttribute('place', placeId);
    details.append(
      request,
      document.createElement('gmp-place-name'),
      document.createElement('gmp-place-rating'),
      document.createElement('gmp-place-reviews'),
      document.createElement('gmp-place-attribution')
    );
    widgetRoot.replaceChildren(details);
    panel.hidden = false;
    waiting.hidden = true;
  } catch (error) {
    // Never invent or fall back to static reviews if Google is unavailable.
    console.warn('Google reviews are temporarily unavailable:', error);
  }
}
