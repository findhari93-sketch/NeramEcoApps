// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  createMessageReply,
  markContactMessageAsReplied,
  sendEmail,
  sendWhatsAppTextMessage,
  isWhatsAppRepliesEnabled,
} from '@neram/database';
import type { ContactMessage, ReplyChannel } from '@neram/database';

const REPLY_FROM_EMAIL = process.env.EMAIL_REPLY_FROM || 'Neram Classes <info@neramclasses.com>';
const REPLY_FROM_PHONE = '9176137043';

// POST /api/messages/[id]/reply - Send a reply via email or whatsapp
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    const body = await request.json();
    const { channel, body: replyBody, adminId, adminName } = body as {
      channel: ReplyChannel;
      body: string;
      adminId: string;
      adminName: string;
    };

    // Validate inputs
    if (!channel || !['email', 'whatsapp'].includes(channel)) {
      return NextResponse.json(
        { success: false, error: 'channel must be "email" or "whatsapp"' },
        { status: 400 }
      );
    }
    if (!replyBody || replyBody.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Reply body is required' },
        { status: 400 }
      );
    }
    if (!adminId || !adminName) {
      return NextResponse.json(
        { success: false, error: 'adminId and adminName are required' },
        { status: 400 }
      );
    }

    // Fetch original message
    const supabase = getSupabaseAdminClient();
    const { data: message, error: fetchError } = await supabase
      .from('contact_messages')
      .select('*')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      return NextResponse.json(
        { success: false, error: 'Message not found' },
        { status: 404 }
      );
    }

    const msg = message as ContactMessage;
    let sendResult: { success: boolean; error?: string };
    let sentTo: string;
    let sentFrom: string;

    if (channel === 'email') {
      sentTo = msg.email;
      sentFrom = REPLY_FROM_EMAIL;

      const formattedDate = new Date(msg.created_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      sendResult = await sendEmail({
        from: REPLY_FROM_EMAIL,
        to: msg.email,
        subject: `Re: ${msg.subject}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <p style="white-space: pre-wrap; line-height: 1.6;">${replyBody.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
            <p style="color: #666; font-size: 13px;">
              Original message from <strong>${msg.name}</strong> on ${formattedDate}:<br/>
              <em>"${msg.message.substring(0, 500)}${msg.message.length > 500 ? '...' : ''}"</em>
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              Neram Classes<br/>
              <a href="https://neramclasses.com" style="color: #1565C0;">neramclasses.com</a>
            </p>
          </div>
        `,
        replyTo: 'info@neramclasses.com',
      });
    } else {
      // WhatsApp
      if (!isWhatsAppRepliesEnabled()) {
        return NextResponse.json(
          { success: false, error: 'WhatsApp replies are not enabled yet' },
          { status: 400 }
        );
      }
      if (!msg.phone) {
        return NextResponse.json(
          { success: false, error: 'This contact has no phone number' },
          { status: 400 }
        );
      }

      sentTo = msg.phone;
      sentFrom = REPLY_FROM_PHONE;

      const whatsappText = `Hi ${msg.name},\n\n${replyBody.trim()}\n\n- Neram Classes`;
      const waResult = await sendWhatsAppTextMessage(msg.phone, whatsappText);
      sendResult = { success: waResult.success, error: waResult.error };
    }

    // Log the reply
    const reply = await createMessageReply({
      message_id: messageId,
      channel,
      reply_body: replyBody.trim(),
      sent_to: sentTo,
      sent_from: sentFrom,
      sent_by: adminId,
      sent_by_name: adminName,
      status: sendResult.success ? 'sent' : 'failed',
      error_message: sendResult.error,
    });

    // Update message status to replied (if send was successful and not already replied)
    if (sendResult.success && msg.status !== 'replied') {
      await markContactMessageAsReplied(messageId, adminId);
    }

    if (!sendResult.success) {
      return NextResponse.json(
        { success: false, error: sendResult.error || 'Failed to send reply', reply },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, reply });
  } catch (error: any) {
    console.error('Error sending reply:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to send reply' },
      { status: 500 }
    );
  }
}

// GET /api/messages/[id]/reply - Get reply history for a message
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params;
    const { getMessageReplies } = await import('@neram/database');
    const replies = await getMessageReplies(messageId);
    return NextResponse.json({ success: true, data: replies });
  } catch (error: any) {
    console.error('Error fetching replies:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch replies' },
      { status: 500 }
    );
  }
}
