'use client';

import Script from 'next/script';

const GA_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const GA_ADS_CALL_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_CALL_LABEL;

export default function GoogleAdsTag() {
  if (!GA_ADS_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ADS_ID}`}
        strategy="lazyOnload"
      />
      <Script id="google-ads-init" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ADS_ID}');
          ${GA_ADS_CALL_LABEL ? `
          gtag('config', '${GA_ADS_ID}/${GA_ADS_CALL_LABEL}', {
            'phone_conversion_number': '+919176137043'
          });
          document.addEventListener('click', function(e) {
            var link = e.target.closest('a[href^="tel:"]');
            if (link) {
              gtag('event', 'conversion', {
                'send_to': '${GA_ADS_ID}/${GA_ADS_CALL_LABEL}'
              });
            }
          });
          ` : ''}
        `}
      </Script>
    </>
  );
}
