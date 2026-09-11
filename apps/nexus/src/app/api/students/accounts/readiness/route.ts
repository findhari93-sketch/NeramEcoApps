import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getRequestUser, assertCapability } from '@/lib/study-materials';
import { errorResponse } from '@/lib/api-errors';
import { listSubscribedSkus, readAppRoles } from '@/lib/entra-accounts';
import { detectStudentLicense, readStudentAccountDefaults } from '@/lib/student-account-defaults';
import { freeSeats, readinessFromRoles, skuDisplayName } from '@/lib/student-account-rules';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * GET /api/students/accounts/readiness
 *
 * Can Nexus create a student's Microsoft account right now, and what would they
 * get? Reads the permissions granted to the Nexus app from its own token (no
 * request, no side effects), the license seats, and the student license: the
 * saved one, or the one the students already enrolled hold.
 *
 * The form asks this first, so a missing Azure permission is explained up front
 * by name rather than failing half way through creating someone.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await getRequestUser(request.headers.get('Authorization'));
    assertCapability(caller, 'structure.student.account');

    const supabase = getSupabaseAdminClient() as any;
    const [roles, stored] = await Promise.all([readAppRoles(), readStudentAccountDefaults(supabase)]);

    if (!roles.ok) {
      return NextResponse.json(
        {
          ready: false,
          canResetPassword: false,
          connection: roles.error,
          missing: [],
          optionalMissing: [],
          domain: stored.defaults.domain,
          license: null,
          skus: [],
        },
        { headers: NO_STORE },
      );
    }

    let defaults = stored.defaults;
    let source: 'saved' | 'detected' | null = stored.saved && defaults.sku_id ? 'saved' : null;

    const skuResult = readinessFromRoles(roles.value).abilities.seats ? await listSubscribedSkus() : null;
    const skus = skuResult?.ok ? skuResult.value : [];

    if (!defaults.sku_id) {
      const detected = await detectStudentLicense(supabase);
      if (detected) {
        defaults = {
          ...defaults,
          sku_id: detected.skuId,
          license_mode: detected.mode,
          license_group_id: detected.groupId,
          sku_part_number: skus.find((sku) => sku.skuId === detected.skuId)?.skuPartNumber ?? null,
        };
        source = 'detected';
      }
    }

    const readiness = readinessFromRoles(roles.value, defaults.license_mode);
    const sku = skus.find((entry) => entry.skuId === defaults.sku_id);
    const partNumber = sku?.skuPartNumber ?? defaults.sku_part_number;

    return NextResponse.json(
      {
        ready: readiness.canCreate,
        canResetPassword: readiness.canResetPassword,
        connection: null,
        missing: readiness.missing,
        optionalMissing: readiness.optionalMissing,
        domain: defaults.domain,
        license: defaults.sku_id
          ? {
              skuId: defaults.sku_id,
              skuPartNumber: partNumber,
              name: skuDisplayName(partNumber),
              mode: defaults.license_mode,
              groupId: defaults.license_group_id,
              free: sku ? freeSeats(sku) : null,
              source,
            }
          : null,
        skus: skus.map((entry) => ({
          skuId: entry.skuId,
          skuPartNumber: entry.skuPartNumber,
          name: skuDisplayName(entry.skuPartNumber),
          free: freeSeats(entry),
        })),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return errorResponse(err, 'Could not check the account setup');
  }
}
