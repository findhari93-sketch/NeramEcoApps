# Contact Message Reply System: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable admins to reply to contact messages directly from the admin panel via Email (Resend) and WhatsApp (Meta Cloud API), with full reply history logging.

**Architecture:** New `message_replies` DB table logs every reply. A new API route `POST /api/messages/[id]/reply` sends via Resend or WhatsApp and logs the result. The admin dialog gets a reply text area, channel selector buttons, and reply history display.

**Tech Stack:** Next.js API routes, Resend (email), Meta WhatsApp Cloud API, Supabase (PostgreSQL), MUI (admin UI)

---

## Task 1: Database Migration (message_replies table)

**Files:**
- Create: `supabase/migrations/20260407_message_replies.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Message replies: logs every reply sent from admin panel
CREATE TABLE IF NOT EXISTS message_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  reply_body TEXT NOT NULL,
  sent_to TEXT NOT NULL,
  sent_from TEXT NOT NULL,
  sent_by TEXT NOT NULL,
  sent_by_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_replies_message_id ON message_replies(message_id);

-- RLS: service role only (admin API routes use service role client)
ALTER TABLE message_replies ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply migration to staging**

Use MCP tool: `mcp__supabase-staging__apply_migration` with name `message_replies` and the SQL above.

- [ ] **Step 3: Verify table exists on staging**

Use MCP tool: `mcp__supabase-staging__execute_sql` with:
```sql
SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'message_replies' ORDER BY ordinal_position;
```

- [ ] **Step 4: Apply migration to production**

Use MCP tool: `mcp__supabase-prod__apply_migration` with same SQL.

- [ ] **Step 5: Verify table exists on production**

Use MCP tool: `mcp__supabase-prod__execute_sql` with same verification query.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260407_message_replies.sql
git commit -m "feat: add message_replies table for contact message reply tracking"
```

---

## Task 2: TypeScript Types (MessageReply)

**Files:**
- Modify: `packages/database/src/types/index.ts` (after ContactMessage interface, ~line 830)

- [ ] **Step 1: Add MessageReply interface and ReplyChannel type**

Add after the `ContactMessage` interface (line 830):

```typescript
export type ReplyChannel = 'email' | 'whatsapp';
export type ReplyStatus = 'sent' | 'failed';

export interface MessageReply {
  id: string;
  message_id: string;
  channel: ReplyChannel;
  reply_body: string;
  sent_to: string;
  sent_from: string;
  sent_by: string;
  sent_by_name: string;
  status: ReplyStatus;
  error_message: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Add to Database type definition**

Add after the `contact_messages` table entry (~line 3813):

```typescript
      message_replies: {
        Row: MessageReply;
        Insert: Omit<MessageReply, 'id' | 'created_at'> & { id?: string };
        Update: Partial<Omit<MessageReply, 'id' | 'created_at'>>;
      };
```

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/types/index.ts
git commit -m "feat: add MessageReply type and ReplyChannel enum"
```

---

## Task 3: Query Functions (message-replies.ts)

**Files:**
- Create: `packages/database/src/queries/message-replies.ts`
- Modify: `packages/database/src/queries/index.ts` (add export)

- [ ] **Step 1: Create message-replies.ts with CRUD functions**

```typescript
/**
 * Message Replies Queries
 *
 * CRUD operations for contact message replies.
 */

import type { TypedSupabaseClient } from '../client';
import { getSupabaseAdminClient } from '../client';
import type { MessageReply, ReplyChannel, ReplyStatus } from '../types';

export interface CreateMessageReplyInput {
  message_id: string;
  channel: ReplyChannel;
  reply_body: string;
  sent_to: string;
  sent_from: string;
  sent_by: string;
  sent_by_name: string;
  status: ReplyStatus;
  error_message?: string;
}

/**
 * Create a message reply log entry
 */
export async function createMessageReply(
  input: CreateMessageReplyInput,
  client?: TypedSupabaseClient
): Promise<MessageReply> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await (supabase
    .from('message_replies') as any)
    .insert({
      message_id: input.message_id,
      channel: input.channel,
      reply_body: input.reply_body,
      sent_to: input.sent_to,
      sent_from: input.sent_from,
      sent_by: input.sent_by,
      sent_by_name: input.sent_by_name,
      status: input.status,
      error_message: input.error_message || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as MessageReply;
}

/**
 * Get all replies for a contact message, newest first
 */
export async function getMessageReplies(
  messageId: string,
  client?: TypedSupabaseClient
): Promise<MessageReply[]> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('message_replies')
    .select('*')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as MessageReply[];
}
```

- [ ] **Step 2: Add export to queries/index.ts**

Add to `packages/database/src/queries/index.ts`:

```typescript
export * from './message-replies';
```

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/queries/message-replies.ts packages/database/src/queries/index.ts
git commit -m "feat: add message reply query functions"
```

---

## Task 4: WhatsApp Free-Form Text Message Support

**Files:**
- Modify: `packages/database/src/services/whatsapp.ts` (add `sendWhatsAppTextMessage` function)

The existing WhatsApp service only supports template messages. Contact message replies need free-form text. Add a new function after the existing `sendWhatsAppTemplate` function (~line 115).

- [ ] **Step 1: Add sendWhatsAppTextMessage function**

Add after `sendWhatsAppTemplate` function (around line 115):

```typescript
/**
 * Send a free-form text message via WhatsApp Cloud API
 * Used for replying to contact messages (not a template).
 * Note: Business-initiated conversations require the user to have
 * messaged within the last 24 hours, or this will open a new conversation.
 */
export async function sendWhatsAppTextMessage(
  to: string,
  text: string
): Promise<WhatsAppSendResult> {
  try {
    const phoneNumberId = getPhoneNumberId();
    const accessToken = getAccessToken();

    const body = {
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'text',
      text: { body: text },
    };

    const response = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      const errorMsg = result?.error?.message || `WhatsApp API error (${response.status})`;
      console.error('WhatsApp text send error:', result);
      return { success: false, error: errorMsg };
    }

    return {
      success: true,
      messageId: result?.messages?.[0]?.id,
    };
  } catch (err: any) {
    console.error('WhatsApp text send exception:', err);
    return { success: false, error: err.message || 'Failed to send WhatsApp message' };
  }
}

/**
 * Check if WhatsApp replies are enabled
 */
export function isWhatsAppRepliesEnabled(): boolean {
  return process.env.WHATSAPP_REPLIES_ENABLED === 'true' && isWhatsAppConfigured();
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/database/src/services/whatsapp.ts
git commit -m "feat: add WhatsApp free-form text message and replies toggle"
```

---

## Task 5: Reply API Route

**Files:**
- Create: `apps/admin/src/app/api/messages/[id]/reply/route.ts`

- [ ] **Step 1: Create the reply API route**

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  createMessageReply,
  markContactMessageAsReplied,
} from '@neram/database';
import { sendEmail } from '@neram/database/src/services/email';
import { sendWhatsAppTextMessage, isWhatsAppRepliesEnabled } from '@neram/database/src/services/whatsapp';
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
```

- [ ] **Step 2: Create GET route for reply history in the same file**

Add to the same file, after the POST handler:

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/app/api/messages/[id]/reply/route.ts
git commit -m "feat: add reply API route for sending email/whatsapp replies"
```

---

## Task 6: Admin UI (Reply in Message Detail Dialog)

**Files:**
- Modify: `apps/admin/src/app/(dashboard)/messages/page.tsx`

This task modifies the existing messages page to add:
1. Reply text area and send buttons in the dialog
2. Reply history display
3. WhatsApp status check API call

- [ ] **Step 1: Add new imports and state variables**

Add to imports (after existing imports, ~line 38):

```typescript
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EmailIcon from '@mui/icons-material/Email';
import SendIcon from '@mui/icons-material/Send';
import TextField from '@mui/material/TextField';
import Snackbar from '@mui/material/Snackbar';
```

Add new interface after the existing `ContactMessage` interface (~line 56):

```typescript
interface MessageReply {
  id: string;
  message_id: string;
  channel: 'email' | 'whatsapp';
  reply_body: string;
  sent_to: string;
  sent_from: string;
  sent_by: string;
  sent_by_name: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Add reply-related state variables**

Add after the `actionLoading` state (~line 182):

```typescript
  // Reply
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState<'email' | 'whatsapp' | null>(null);
  const [replies, setReplies] = useState<MessageReply[]>([]);
  const [repliesLoading, setRepliesLoading] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
```

- [ ] **Step 3: Add fetchReplies and handleSendReply functions**

Add after `handleCloseDialog` function (~line 260):

```typescript
  const fetchReplies = useCallback(async (messageId: string) => {
    setRepliesLoading(true);
    try {
      const res = await fetch(`/api/messages/${messageId}/reply`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data.data || []);
      }
    } catch {
      // Silently fail
    } finally {
      setRepliesLoading(false);
    }
  }, []);

  const handleSendReply = async (channel: 'email' | 'whatsapp') => {
    if (!selectedMessage || !replyText.trim() || !supabaseUserId) return;

    setReplySending(channel);
    try {
      const res = await fetch(`/api/messages/${selectedMessage.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          body: replyText.trim(),
          adminId: supabaseUserId,
          adminName: supabaseName || 'Admin',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setSnackbar({
          open: true,
          message: data.error || 'Failed to send reply',
          severity: 'error',
        });
        return;
      }

      // Success
      setSnackbar({
        open: true,
        message: `Reply sent via ${channel === 'email' ? 'Email' : 'WhatsApp'}`,
        severity: 'success',
      });
      setReplyText('');

      // Refresh replies list
      fetchReplies(selectedMessage.id);

      // Update message status locally
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === selectedMessage.id ? { ...msg, status: 'replied' as const } : msg
        )
      );
      setSelectedMessage((prev) => (prev ? { ...prev, status: 'replied' as const } : null));
      fetchUnreadCount();
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.message || 'Failed to send reply',
        severity: 'error',
      });
    } finally {
      setReplySending(null);
    }
  };
```

- [ ] **Step 4: Update handleRowClick to fetch replies**

Modify the `handleRowClick` function (~line 247) to also fetch replies when a message is opened:

Replace:
```typescript
  const handleRowClick = (message: ContactMessage) => {
    setSelectedMessage(message);
    setDialogOpen(true);

    // Auto-mark as read if currently unread
    if (message.status === 'unread' && supabaseUserId) {
      handleUpdateStatus(message.id, 'read', false);
    }
  };
```

With:
```typescript
  const handleRowClick = (message: ContactMessage) => {
    setSelectedMessage(message);
    setDialogOpen(true);
    setReplyText('');
    setReplies([]);
    fetchReplies(message.id);

    // Auto-mark as read if currently unread
    if (message.status === 'unread' && supabaseUserId) {
      handleUpdateStatus(message.id, 'read', false);
    }
  };
```

- [ ] **Step 5: Update useAdminProfile destructuring**

The `useAdminProfile` hook (defined in `apps/admin/src/contexts/AdminProfileContext.tsx`) returns `{ supabaseUserId, supabaseName, msUser, loading, error }`. The existing page only destructures `supabaseUserId`. Update it (~line 164):

```typescript
  const { supabaseUserId, supabaseName } = useAdminProfile();
```

Then in `handleSendReply`, use `supabaseName` for the admin name:

```typescript
        adminName: supabaseName || 'Admin',
```

- [ ] **Step 6: Replace the DialogActions section**

Replace the entire `<DialogActions>` block (lines 672-711) with the new reply UI:

```tsx
            <Divider />

            <DialogContent sx={{ pt: 2, pb: 0 }}>
              {/* Reply History */}
              {repliesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={20} />
                </Box>
              ) : replies.length > 0 ? (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Reply History
                  </Typography>
                  {replies.map((reply) => (
                    <Paper
                      key={reply.id}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        mb: 1,
                        borderRadius: 1,
                        bgcolor: reply.status === 'sent' ? '#E8F5E9' : '#FFEBEE',
                        border: '1px solid',
                        borderColor: reply.status === 'sent' ? '#C8E6C9' : '#FFCDD2',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        {reply.channel === 'email' ? (
                          <EmailIcon sx={{ fontSize: 16, color: '#1565C0' }} />
                        ) : (
                          <WhatsAppIcon sx={{ fontSize: 16, color: '#25D366' }} />
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(reply.created_at)} via {reply.channel === 'email' ? 'Email' : 'WhatsApp'} by {reply.sent_by_name}
                        </Typography>
                        {reply.status === 'failed' && (
                          <Chip label="Failed" size="small" color="error" sx={{ height: 18, fontSize: '0.7rem' }} />
                        )}
                      </Box>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {reply.reply_body}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              ) : null}

              {/* Reply Input */}
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Reply
              </Typography>
              <TextField
                multiline
                minRows={3}
                maxRows={8}
                fullWidth
                placeholder="Type your reply here..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={!!replySending}
                sx={{ mb: 1.5 }}
              />
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
              <Button
                variant="contained"
                startIcon={replySending === 'email' ? <CircularProgress size={16} color="inherit" /> : <EmailIcon />}
                onClick={() => handleSendReply('email')}
                disabled={!replyText.trim() || !!replySending}
              >
                Send via Email
              </Button>
              <Tooltip
                title={
                  !selectedMessage?.phone
                    ? 'No phone number available'
                    : 'WhatsApp (coming soon, pending Meta approval)'
                }
              >
                <span>
                  <Button
                    variant="outlined"
                    color="success"
                    startIcon={replySending === 'whatsapp' ? <CircularProgress size={16} color="inherit" /> : <WhatsAppIcon />}
                    onClick={() => handleSendReply('whatsapp')}
                    disabled={!replyText.trim() || !!replySending || !selectedMessage?.phone}
                  >
                    Send via WhatsApp
                  </Button>
                </span>
              </Tooltip>
              <Box sx={{ flexGrow: 1 }} />
              <Button onClick={handleCloseDialog} color="inherit">
                Close
              </Button>
            </DialogActions>
```

- [ ] **Step 7: Add Snackbar at the end of the component**

Add before the closing `</Box>` of the component (before line 716):

```tsx
      {/* Snackbar for reply feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
```

- [ ] **Step 8: Commit**

```bash
git add apps/admin/src/app/(dashboard)/messages/page.tsx
git commit -m "feat: add reply UI with email/whatsapp send and reply history"
```

---

## Task 7: Email Service (support custom from address)

**Files:**
- Modify: `packages/database/src/services/email.ts` (~line 32)

The existing `sendEmail` function always uses `FROM_EMAIL` (noreply@). The reply route needs to send from `info@`. Add optional `from` parameter.

- [ ] **Step 1: Add optional `from` field to EmailData interface**

Modify the `EmailData` interface (~line 18):

```typescript
export interface EmailData {
  from?: string;      // Override sender (default: noreply@neramclasses.com)
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}
```

- [ ] **Step 2: Use `data.from` in sendEmail if provided**

In the `sendEmail` function (~line 36), change:

```typescript
      from: FROM_EMAIL,
```

to:

```typescript
      from: data.from || FROM_EMAIL,
```

- [ ] **Step 3: Update reply route to pass from address**

In `apps/admin/src/app/api/messages/[id]/reply/route.ts`, update the `sendEmail` call to include `from`:

```typescript
      sendResult = await sendEmail({
        from: REPLY_FROM_EMAIL,
        to: msg.email,
        subject: `Re: ${msg.subject}`,
        html: `...`,
        replyTo: 'info@neramclasses.com',
      });
```

- [ ] **Step 4: Commit**

```bash
git add packages/database/src/services/email.ts apps/admin/src/app/api/messages/[id]/reply/route.ts
git commit -m "feat: support custom from address in email service for reply emails"
```

---

## Task 8: Environment Variables Setup

**Files:** No code files, Vercel CLI commands only.

- [ ] **Step 1: Add EMAIL_REPLY_FROM to admin app on Vercel (production)**

```bash
cd apps/admin && echo "Neram Classes <info@neramclasses.com>" | vercel env add EMAIL_REPLY_FROM production
```

- [ ] **Step 2: Add EMAIL_REPLY_FROM to admin app on Vercel (preview/staging)**

```bash
cd apps/admin && echo "Neram Classes <info@neramclasses.com>" | vercel env add EMAIL_REPLY_FROM preview
```

- [ ] **Step 3: Add WHATSAPP_REPLIES_ENABLED=false to admin app (production)**

```bash
cd apps/admin && echo "false" | vercel env add WHATSAPP_REPLIES_ENABLED production
```

- [ ] **Step 4: Add WHATSAPP_REPLIES_ENABLED=false to admin app (preview/staging)**

```bash
cd apps/admin && echo "false" | vercel env add WHATSAPP_REPLIES_ENABLED preview
```

- [ ] **Step 5: Add to local .env.local**

Add to `apps/admin/.env.local`:

```
EMAIL_REPLY_FROM=Neram Classes <info@neramclasses.com>
WHATSAPP_REPLIES_ENABLED=false
```

- [ ] **Step 6: Commit env example updates (if .env.example exists)**

Update `.env.example` or `.env.staging.example` if they exist in the admin app.

---

## Task 9: Verify Import Paths and Build

**Files:** None (verification only)

- [ ] **Step 1: Check that `sendEmail` and `sendWhatsAppTextMessage` can be imported in the admin app**

The reply route imports from `@neram/database/src/services/email` and `@neram/database/src/services/whatsapp`. Verify these paths work with the monorepo setup. If not, the services may need to be re-exported from `packages/database/src/index.ts`.

Run:
```bash
cd apps/admin && pnpm build
```

If import errors occur, add re-exports to `packages/database/src/index.ts`:
```typescript
export { sendEmail } from './services/email';
export { sendWhatsAppTextMessage, isWhatsAppRepliesEnabled } from './services/whatsapp';
```

- [ ] **Step 2: Fix any TypeScript or build errors**

- [ ] **Step 3: Commit any fixes**

---

## Task 10: Manual Testing and Verification

- [ ] **Step 1: Start admin dev server**

```bash
pnpm dev:admin
```

- [ ] **Step 2: Open admin panel, go to Messages page**

Navigate to `http://localhost:3013/messages`

- [ ] **Step 3: Click on a message to open the detail dialog**

Verify:
- Reply text area appears below the message
- "Send via Email" and "Send via WhatsApp" buttons appear
- WhatsApp button is disabled (since WHATSAPP_REPLIES_ENABLED=false)
- Reply history section shows (empty initially)

- [ ] **Step 4: Send a test email reply**

Type a test reply and click "Send via Email". Verify:
- Loading spinner shows on the button
- Success toast appears
- Reply appears in the reply history section
- Message status changes to "Replied"
- Email arrives at the contact's email from `info@neramclasses.com`

- [ ] **Step 5: Send a second reply to the same message**

Verify both replies show in history with correct timestamps and admin names.

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "feat: contact message reply system with email and whatsapp support"
```
