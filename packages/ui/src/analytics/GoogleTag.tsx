'use client';

import Script from 'next/script';
import { callLabel, ga4Id, gadsId, isTrackableBuild, PROD_HOSTS } from './env';

/** The number Google Ads shows for call conversions from the site. */
const PHONE_CONVERSION_NUMBER = '+919176137043';

/**
 * The inline bootstrap. It defines gtag, then loads gtag.js and configures the
 * tag only on a production hostname, so a preview (`*.vercel.app`), staging or
 * localhost page never requests gtag.js and never records a conversion, even if
 * a build carries the production env vars by mistake.
 */
export function buildGoogleTagScript(opts: {
  adsId: string;
  ga4Id?: string;
  callLabel?: string;
  hosts?: readonly string[];
}): string {
  const hosts = JSON.stringify(opts.hosts ?? PROD_HOSTS);
  const adsId = JSON.stringify(opts.adsId);
  const ga4 = opts.ga4Id ? JSON.stringify(opts.ga4Id) : '';
  const call = opts.callLabel ? JSON.stringify(`${opts.adsId}/${opts.callLabel}`) : '';
  return `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
if (${hosts}.indexOf(location.hostname) !== -1) {
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(${adsId});
  document.head.appendChild(s);
  gtag('consent', 'default', { ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', ${adsId}, { allow_enhanced_conversions: true });
  ${ga4 ? `gtag('config', ${ga4});` : ''}
  ${
    call
      ? `gtag('config', ${call}, { phone_conversion_number: '${PHONE_CONVERSION_NUMBER}' });
  document.addEventListener('click', function (e) {
    var t = e.target;
    var link = t && t.closest ? t.closest('a[href^="tel:"]') : null;
    if (link) gtag('event', 'conversion', { send_to: ${call} });
  });`
      : ''
  }
}
`;
}

/**
 * The Google tag (Google Ads + optional GA4). Mount exactly once per root
 * layout. Renders nothing without NEXT_PUBLIC_GOOGLE_ADS_ID (set on Vercel
 * Production only) or in a preview/development build.
 */
export function GoogleTag({ strategy = 'afterInteractive' }: { strategy?: 'afterInteractive' | 'lazyOnload' }) {
  const adsId = gadsId();
  if (!adsId || !isTrackableBuild()) return null;
  return (
    <Script id="neram-google-tag" strategy={strategy}>
      {buildGoogleTagScript({ adsId, ga4Id: ga4Id(), callLabel: callLabel() })}
    </Script>
  );
}
