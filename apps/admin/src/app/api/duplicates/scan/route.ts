export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { runDuplicateDetection, detectEntraDuplicates } from '@neram/database';
import { findUserOidByEmail } from '@neram/auth';

/**
 * POST /api/duplicates/scan - "Scan now" on the Duplicates page.
 * Runs the SQL pass (strong keys) and a bounded Microsoft directory pass.
 */
export async function POST() {
  try {
    const sqlAdded = await runDuplicateDetection();
    const entra = await detectEntraDuplicates((email) => findUserOidByEmail(email), { maxLookups: 40 }).catch(
      (error) => {
        console.warn('Duplicate scan: Microsoft directory pass skipped:', error?.message);
        return { checked: 0, added: 0, skipped: true };
      },
    );
    return NextResponse.json({ added: sqlAdded + entra.added, sqlAdded, entra });
  } catch (error) {
    console.error('Duplicate scan error:', error);
    return NextResponse.json({ error: 'The scan did not complete.' }, { status: 500 });
  }
}
