# Payment watchers (Instant UPI)

Instant UPI confirms a student's fee the moment the bank tells us about the credit. Two
watchers carry the bank's word to the site; nothing else is trusted:

| Watcher | Carries | Runs on |
|---|---|---|
| **Office phone** | KVB credit **SMS** (`JD-KVBUPI-S` style sender, carries the 12-digit UTR) and the **Google Pay "paid you" notification** (payer + amount, the second channel) | a spare Android phone with the bank SIM, at the office, always on |
| **Gmail script** | KVB **email** alerts: NEFT inward, IMPS, cash deposits (UPI credits are never emailed) | `gmail-forwarder.gs` in the mailbox that receives the alerts, every minute |

Both post to the marketing site. Every post lands in `webhook_inbox` first; only a parsed
credit for our account becomes a `bank_credit_events` row, and the matcher decides what it
means (exact paise amount, inside the order window). In **shadow mode** students still see
"Pay by UPI, no screenshot needed", but every match is **held** for staff: one click in
Admin › Collections › Bank credits confirms it. Nothing enrols on its own until shadow is off.

No secrets live in this folder or in Admin. Secrets live in one place: the Vercel env
`PAYMENT_WATCHER_SECRETS` on the **marketing** project (Production and Preview), a JSON map of
device id to secret:

```json
{"office-phone-1":"<32+ random characters>","gmail-script":"<32+ random characters>"}
```

Generate a secret with `openssl rand -hex 24`. Add each device id in Admin › Settings ›
Instant UPI › Watcher device ids; posts from unknown ids get 401.

## Endpoints

All on the marketing origin (`https://neramclasses.com`, staging `https://staging.neramclasses.com`).

| Route | Body (JSON) | Notes |
|---|---|---|
| `POST /api/payments/ingest/sms` | `{ "sender": "JD-KVBUPI-S", "text": "<sms text>", "receivedAt": "<ISO>", "messageId": "<optional>", "source": "sms" \| "notification" }` | For Google Pay notifications send `"sender": "com.google.android.apps.nbu.paisa.user"` (the package name) and `"source": "notification"` |
| `POST /api/payments/ingest/email` | `{ "messageId", "from", "subject", "bodyText", "internalDate", "authResults" }` | `authResults` is Gmail's own topmost `Authentication-Results` header; the server reads the DKIM verdict from it (a client boolean is never trusted). A mail without `dkim=pass` for the bank's domain never becomes a credit |
| `POST /api/payments/ingest/heartbeat` | `{ "kind": "sms" \| "email", "appVersion": "<optional>" }` | Every few minutes. No heartbeat for the "hide after silence" window (Settings, default 10 min) hides Instant UPI and rings the staff bell |

### Authentication headers

Always `x-neram-device: <device id>`, plus **one** of:

- **HMAC** (the Gmail script, the YouPI observer app, anything that can compute a hash):
  `x-neram-timestamp` (unix seconds), `x-neram-nonce` (any unique string), and
  `x-neram-signature` = hex `HMAC-SHA256(secret, timestamp + "." + nonce + "." + rawBody)`.
  The timestamp must be within 5 minutes of the server clock.
- **Static token** (SMS forwarder apps that cannot sign): `x-neram-token: <the secret>`.
  TLS protects it in transit; rotate it if the phone is lost.

Responses are `200` with `{ ok, inbox: "new" | "duplicate", credited, match, skipped }`.
A `401 unknown device` means the id is not in `PAYMENT_WATCHER_SECRETS` yet.

## Office phone setup

1. **Phone**: any Android 8+ phone with the SIM that receives the KVB credit SMS. Charged,
   on Wi-Fi with mobile data as backup, screen lock set, battery optimisation **off** for the
   forwarder app, auto-start allowed. Install Google Pay signed in to the trust's account so
   the "paid you" notification arrives too.
2. **Forwarder**: either
   - **MacroDroid** (free): two macros.
     - *Credit alerts*: triggers "SMS Received" with the sender filter **contains `KVB`** (never
       forward every SMS: OTPs and personal texts must not leave the phone) and "Notification
       Received" for the Google Pay app only. Action "HTTP Request", method POST, URL
       `https://neramclasses.com/api/payments/ingest/sms`, content type `application/json`.
       Body for the SMS trigger, built with MacroDroid's Magic Text button (pick "SMS sender
       number" and "SMS message"; the exact token spelling depends on the MacroDroid version):
       `{"sender":"<SMS sender number>","text":"<SMS message>","source":"sms"}`.
       Body for the Google Pay trigger (pick "Notification title" and "Notification text"):
       `{"sender":"com.google.android.apps.nbu.paisa.user","text":"<Notification title> <Notification text>","source":"notification"}`.
       Headers on both: `x-neram-device: office-phone-1` and `x-neram-token: <secret>`.
       `receivedAt` is optional; the server stamps the arrival time.
     - *Heartbeat*: trigger "Regular Interval, 5 minutes", same HTTP action to
       `/api/payments/ingest/heartbeat` with body `{"kind":"sms","appVersion":"macrodroid"}`.
   - or the **YouPI-PG observer app** pointed at the same URLs with the HMAC headers.
3. **Check**: Admin › Collections › Bank credits shows `Phone office-phone-1 · just now`.
   Send yourself a test SMS; it appears in `webhook_inbox` (skipped as "not a credit"), which
   proves the path without moving money.

## Gmail setup

See the header of `gmail-forwarder.gs`. In short: paste the script, set Script Properties
`DEVICE_ID`, `SECRET`, `ENDPOINT`, run `setup` once, add a one-minute trigger. It labels
processed threads `neram-processed` and never re-sends them.

## The ₹1 live test (before leaving shadow mode)

1. In Admin › Settings › Instant UPI: on, shadow mode **on**, both watchers reporting.
2. Open any student-pays enrolment link as a test student, start "Pay instantly"; it shows a
   tagged amount such as ₹1.37 when the link's fee is ₹1 (use a test link with a ₹1 offer).
3. Pay it from a personal UPI app. Within a minute the order is **held** in Bank credits
   ("Needs your confirmation", reason: shadow mode) with the KVB SMS attached, and the
   Google Pay notification merges onto the same credit (`two_channel`). Confirm it with the
   statement tick; the test student is enrolled.
4. Repeat with the phone **off**: nothing arrives (UPI credits are not emailed), Instant UPI
   hides itself after the silence window, students see the QR path. Turn the phone back on.
5. After two weeks of real credits matching correctly (no false matches, uptime over 99%),
   switch shadow mode **off**. Keep the cap and the two-channel line.

## Rotation and loss

- Lost or replaced phone: add a new device id and secret to `PAYMENT_WATCHER_SECRETS`,
  configure the new phone, remove the old id, redeploy. Posts from the old id get 401.
- Gmail secret: change `SECRET` in Script Properties and in Vercel at the same time.

## Where things show up

- Admin › Collections › **Bank credits**: watcher heartbeats, held orders, unmatched credits,
  the daily tick list, disputes, shadow matches.
- Admin › Settings › **Instant UPI**: switches, policy, keywords, device ids, this guide in short.
- Supabase: `webhook_inbox` (every post), `bank_credit_events` (credits), `watcher_heartbeats`.
