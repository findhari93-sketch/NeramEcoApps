'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    Tawk_API?: Record<string, unknown> & {
      showWidget?: () => void;
      hideWidget?: () => void;
      onLoad?: () => void;
    };
    Tawk_LoadStart?: Date;
  }
}

export default function TawkToChat() {
  const loaded = useRef(false);

  useEffect(() => {
    const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID?.trim();
    const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID?.trim();

    if (!propertyId || !widgetId) {
      console.warn(
        'Tawk.to: Missing NEXT_PUBLIC_TAWK_PROPERTY_ID or NEXT_PUBLIC_TAWK_WIDGET_ID'
      );
      return;
    }

    // If Tawk was already loaded (e.g. client-side nav back to this page),
    // just show the widget instead of re-injecting the script
    if (window.Tawk_API && typeof window.Tawk_API.showWidget === 'function') {
      window.Tawk_API.showWidget();
      loaded.current = true;
      return () => {
        // Hide widget when leaving the page (don't destroy it)
        if (window.Tawk_API && typeof window.Tawk_API.hideWidget === 'function') {
          window.Tawk_API.hideWidget();
        }
      };
    }

    // First load — inject the Tawk.to script
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    // Hide by default — show once loaded (prevents flash on wrong pages)
    window.Tawk_API.onLoad = function () {
      if (window.Tawk_API && typeof window.Tawk_API.showWidget === 'function') {
        window.Tawk_API.showWidget();
      }
    };

    const existingScript = document.getElementById('tawk-to-script');
    if (existingScript) {
      // Script tag exists but Tawk_API.showWidget isn't ready yet — wait for it
      loaded.current = true;
      return () => {
        if (window.Tawk_API && typeof window.Tawk_API.hideWidget === 'function') {
          window.Tawk_API.hideWidget();
        }
      };
    }

    const script = document.createElement('script');
    script.id = 'tawk-to-script';
    script.async = true;
    script.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    script.charset = 'UTF-8';
    script.setAttribute('crossorigin', '*');
    document.head.appendChild(script);
    loaded.current = true;

    return () => {
      // On unmount: hide widget, don't remove script (Tawk doesn't support clean re-init)
      if (window.Tawk_API && typeof window.Tawk_API.hideWidget === 'function') {
        window.Tawk_API.hideWidget();
      }
    };
  }, []);

  return null;
}
