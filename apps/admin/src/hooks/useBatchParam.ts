'use client';

import { useState } from 'react';

/**
 * Owns a page's selected exam-year batch (defaults to 'current'). The value is
 * passed straight to APIs as ?batch= — the API resolves 'current' to the registry
 * current batch server-side, so there is nothing to resolve on the client.
 *
 * Centralising the 'current' default here keeps the "every list defaults to the
 * current batch" rule consistent across pages.
 */
export function useBatchParam(initial: string = 'current') {
  const [batch, setBatch] = useState<string>(initial);
  return { batch, setBatch };
}
