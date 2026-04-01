export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { adminBulkDeleteUsers, createAdminClient } from '@neram/database';
import { getFirebaseAdminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userIds, adminId } = body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'userIds array is required' },
        { status: 400 }
      );
    }

    if (!adminId) {
      return NextResponse.json(
        { error: 'adminId is required for audit trail' },
        { status: 400 }
      );
    }

    // Step 1: Fetch firebase_uid values for the users being deleted
    const supabase = createAdminClient();
    const { data: users } = await supabase
      .from('users')
      .select('id, firebase_uid')
      .in('id', userIds);

    const firebaseUids = (users || [])
      .map((u) => u.firebase_uid)
      .filter((uid): uid is string => !!uid);

    // Step 2: Delete Firebase auth accounts (if any exist)
    let firebaseDeleteResult: { successCount: number; failureCount: number } = {
      successCount: 0,
      failureCount: 0,
    };

    if (firebaseUids.length > 0) {
      try {
        const auth = getFirebaseAdminAuth();
        const result = await auth.deleteUsers(firebaseUids);
        firebaseDeleteResult = {
          successCount: result.successCount,
          failureCount: result.failureCount,
        };

        if (result.failureCount > 0) {
          console.warn(
            'Some Firebase accounts failed to delete:',
            result.errors.map((e) => ({ index: e.index, error: e.error.message }))
          );
        }
      } catch (firebaseError: any) {
        console.error('Firebase deletion error (proceeding with Supabase deletion):', firebaseError.message);
      }
    }

    // Step 3: Delete all Supabase records
    const result = await adminBulkDeleteUsers(userIds, adminId);

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${result.deletedUsers} user(s)`,
      firebaseAccountsDeleted: firebaseDeleteResult.successCount,
      firebaseAccountsFailed: firebaseDeleteResult.failureCount,
      ...result,
    });
  } catch (error: any) {
    console.error('Bulk delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete users' },
      { status: 500 }
    );
  }
}