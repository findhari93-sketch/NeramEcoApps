# Contact Message Reply System: Design Spec

## Context

The admin panel at `admin.neramclasses.com/messages` displays contact messages from leads (16 so far). Admins can view and mark messages as read/replied, but there is no way to actually send a reply from the admin panel. The current "Reply via Email" button just opens a mailto: link.

This feature adds the ability to reply directly from the admin panel via **Email** (from `info@neramclasses.com` using Resend) and **WhatsApp** (from `9176137043` using Meta WhatsApp Cloud API, pending Meta Business approval).

## Requirements

1. Admin can type a reply in the message detail dialog and send via Email or WhatsApp
2. Pick one channel per reply (can reply again via the other channel)
3. Reply history is saved in DB with audit trail (who sent, when, via which channel)
4. Email sends from `info@neramclasses.com` (domain already verified in Resend)
5. WhatsApp sends from `9176137043` (toggleable via env var until Meta approves)
6. WhatsApp button disabled when contact has no phone number
7. Status auto-updates to "replied" after successful send

## Architecture

```
Admin UI (Dialog)
  │
  ├── Type reply text
  ├── Click "Send via Email" or "Send via WhatsApp"
  │
  ▼
POST /api/messages/[id]/reply
  │
  ├── Fetch original message (get contact email/phone)
  ├── Send via Resend (email) or WhatsApp Cloud API (whatsapp)
  ├── Log reply in message_replies table
  ├── Update contact_messages.status = 'replied'
  │
  ▼
Return success/failure to UI
```

## Database Changes

### New table: `message_replies`

```sql
CREATE TABLE message_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  reply_body TEXT NOT NULL,
  sent_to TEXT NOT NULL,          -- email address or phone number
  sent_from TEXT NOT NULL,        -- 'info@neramclasses.com' or '9176137043'
  sent_by TEXT NOT NULL,          -- admin user ID (MS OID)
  sent_by_name TEXT NOT NULL,     -- admin display name
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error_message TEXT,             -- null on success, error details on failure
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_message_replies_message_id ON message_replies(message_id);
```

RLS: Service role only (admin API routes use service role client).

### No changes to `contact_messages` table

Existing `status`, `replied_by`, `replied_at` fields are sufficient. They get updated when the first reply is sent.

## API Route

### POST `/api/messages/[id]/reply`

**Request:**
```typescript
{
  channel: 'email' | 'whatsapp';
  body: string;        // reply text, min 1 char
  adminId: string;     // MS OID of admin
  adminName: string;   // display name
}
```

**Response (success):**
```typescript
{ success: true, reply: MessageReply }
```

**Response (failure):**
```typescript
{ success: false, error: string }
```

**Server logic:**
1. Validate inputs (channel, body not empty)
2. Fetch the original `contact_message` by ID
3. If channel is `email`: send via Resend to message.email
4. If channel is `whatsapp`: check `WHATSAPP_REPLIES_ENABLED` env var, send via WhatsApp Cloud API to message.phone
5. Insert into `message_replies` with status `sent` or `failed`
6. If sent successfully and message status is not already `replied`, update contact_messages status
7. Return result

## Email Format

```
From: Neram Classes <info@neramclasses.com>
To: {contact.email}
Subject: Re: {contact.subject}

{admin's reply text}

---
Original message from {contact.name} on {formatted date}:
"{contact.message}"

Neram Classes
neramclasses.com
```

## WhatsApp Format

Plain text message (not a pre-approved template, since this is a business-initiated conversation):

```
Hi {contact.name},

{admin's reply text}

- Neram Classes
```

Note: Meta WhatsApp Business approval is pending. The feature is built but gated behind `WHATSAPP_REPLIES_ENABLED=true` env var. WhatsApp button shows "Coming soon" tooltip when disabled.

## Admin UI Changes

### Message Detail Dialog (updated)

```
┌──────────────────────────────────────────────┐
│  Message from: Anju Solanki            [X]   │
│  Email: anjusolanki300@gmail.com             │
│  Phone: 81692 87887                          │
│  Subject: Nata offline classes               │
│  Source: Contact Page    Status: Read        │
├──────────────────────────────────────────────┤
│  Message:                                    │
│  "I'm interested in NATA offline..."         │
├──────────────────────────────────────────────┤
│  Reply History:                              │
│  (Shows previous replies if any)             │
│  ┌─ 07 Apr 12:30pm via Email by Hari ─────┐ │
│  │ "Thank you for your interest in..."     │ │
│  └─────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│  Reply:                                      │
│  ┌─────────────────────────────────────────┐ │
│  │ Type your reply here...                 │ │
│  │                                         │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  [Send via Email]  [Send via WhatsApp]       │
│                                              │
│  * WhatsApp disabled if no phone number      │
│  * WhatsApp shows "Coming soon" if env off   │
└──────────────────────────────────────────────┘
```

**Behaviors:**
- Reply text area appears below the message content
- Two send buttons: Email (primary) and WhatsApp (secondary)
- WhatsApp button disabled with tooltip if contact has no phone or feature is off
- Loading spinner on the active send button while sending
- Success: toast notification, reply appears in history, status updates to "Replied"
- Failure: error toast with message from API
- Reply history section fetched alongside message details (joined query or separate call)

## Files to Create/Modify

### New files:
- `supabase/migrations/YYYYMMDD_message_replies.sql` (migration)
- `packages/database/src/queries/message-replies.ts` (CRUD functions)
- `apps/admin/src/app/api/messages/[id]/reply/route.ts` (API route)

### Modified files:
- `packages/database/src/types/index.ts` (add MessageReply type)
- `packages/database/src/queries/index.ts` (export new query functions)
- `apps/admin/src/app/(dashboard)/messages/page.tsx` (reply UI in dialog)

### Existing services reused:
- `packages/database/src/services/email.ts` (Resend, sendEmail function)
- `packages/database/src/services/whatsapp.ts` (WhatsApp Cloud API)

## Environment Variables

### New:
- `EMAIL_REPLY_FROM=Neram Classes <info@neramclasses.com>` (from address for replies)
- `WHATSAPP_REPLIES_ENABLED=false` (toggle, set to true after Meta approval)

### Existing (already configured):
- `RESEND_API_KEY` (Resend)
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp Cloud API)

## Verification Plan

1. **Email reply**: Open a contact message in admin, type a reply, click "Send via Email". Verify email arrives at the contact's address from `info@neramclasses.com`.
2. **Reply history**: After sending, verify the reply appears in the dialog's reply history section.
3. **Status update**: After sending, verify the message status changes to "Replied" in the table.
4. **WhatsApp disabled state**: Verify WhatsApp button is disabled when `WHATSAPP_REPLIES_ENABLED=false` or when contact has no phone.
5. **Error handling**: Test with invalid email to verify error is caught and displayed.
6. **DB audit**: Check `message_replies` table has the correct entry after sending.
7. **Multiple replies**: Send a second reply to the same message, verify both appear in history.