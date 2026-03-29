// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const transactionId = formData.get('transactionId') as string;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const fileExt = file.name.split('.').pop();
    const fileName = `${transactionId || Date.now()}_${Date.now()}.${fileExt}`;
    const filePath = `receipts/${fileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from('expense-receipts')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('expense-receipts')
      .getPublicUrl(filePath);

    if (transactionId) {
      await supabase
        .from('financial_transactions')
        .update({ receipt_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', transactionId);
    }

    return NextResponse.json({ url: publicUrl });
  } catch (error: any) {
    console.error('Receipt upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
