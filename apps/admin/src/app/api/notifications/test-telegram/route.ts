export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { sendTelegramMessage, isTelegramConfigured } from '@neram/database';

// GET /api/notifications/test-telegram - Test Telegram connectivity
export async function GET() {
  try {
    const configured = isTelegramConfigured();
    if (!configured) {
      return NextResponse.json({
        success: false,
        error: 'Telegram env vars not configured',
        hasToken: !!process.env.TELEGRAM_BOT_TOKEN,
        hasChatId: !!process.env.TELEGRAM_CHAT_ID,
      });
    }

    const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const result = await sendTelegramMessage(
      `<b>Telegram Test</b>\n\nThis is a test message from Neram Admin.\nTimestamp: ${timestamp}`,
      { parseMode: 'HTML' }
    );

    return NextResponse.json({
      success: result.success,
      error: result.error,
      timestamp,
    });
  } catch (error) {
    console.error('Test Telegram error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
