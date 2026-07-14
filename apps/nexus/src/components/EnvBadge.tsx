'use client';

import { useEffect, useState } from 'react';

/**
 * Dev-only badge showing which database this locally-running Nexus instance is
 * pointed at. It renders ONLY on localhost, so it never appears on the deployed
 * Vercel site. Red = PROD DB (real writes, be careful), green = STAGING DB.
 *
 * Supports the "prod for reads, staging for writes" workflow: a glance tells you
 * whether the instance in front of you is safe to mutate. The backend is
 * detected from NEXT_PUBLIC_SUPABASE_URL using the same host checks as
 * scripts/switch-env.sh.
 */
export default function EnvBadge() {
  const [mounted, setMounted] = useState(false);

  // Only decide what to render after mount, so the server (which has no window)
  // and the first client paint agree, avoiding a hydration mismatch.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const host = window.location.hostname;
  const isLocalhost = host === 'localhost' || host === '127.0.0.1';
  if (!isLocalhost) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const isProd =
    supabaseUrl.includes('db.neramclasses.com') && !supabaseUrl.includes('db-staging');
  const isStaging = supabaseUrl.includes('db-staging.neramclasses.com');

  const label = isProd
    ? 'LOCAL / PROD DB'
    : isStaging
      ? 'LOCAL / STAGING DB'
      : 'LOCAL / UNKNOWN DB';
  const background = isProd ? '#dc2626' : isStaging ? '#16a34a' : '#6b7280';

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        zIndex: 2147483647,
        pointerEvents: 'none',
        padding: '4px 10px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        color: '#ffffff',
        background,
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        userSelect: 'none',
      }}
    >
      {label}
    </div>
  );
}
