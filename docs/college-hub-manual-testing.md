# College Hub: Manual Testing Walkthrough

This document walks you through testing the entire College Hub ecosystem on **staging** end-to-end. All testing should be done on staging. Never use production for testing, real users are on it.

## Test environment URLs

| Surface | URL |
|---|---|
| Public marketing + college pages | https://staging.neramclasses.com |
| A specific college page (example) | https://staging.neramclasses.com/en/colleges/tamil-nadu/measi-academy-architecture |
| College admin login | https://staging.neramclasses.com/college-dashboard/login |
| Neram staff login (for outreach) | https://staging.neramclasses.com/admin/staff-login |
| Neram staff colleges list | https://staging.neramclasses.com/admin/colleges |

## Test accounts

### Neram staff (you)

- Login URL: `/admin/staff-login`
- Staff secret: the value of `NERAM_STAFF_ADMIN_SECRET` in Vercel marketing preview env (ask Hari)
- Your name and email: whatever you want (this shows up as the sender in outreach emails and in the outreach log)
- Cookie is 7 days

### Test college admin (pre-created on staging)

| Field | Value |
|---|---|
| Login URL | `/college-dashboard/login` |
| Email | `testcollege@neram.test` |
| Password | `MeasiTest2026!` |
| Linked college | Measi Academy of Architecture (Chennai) |
| Current tier | `free` (upgrade it to `gold` from `/admin/colleges` to test phone unmasking) |

### Test student

Use any browser incognito window. No student account needed for the lead capture flow. The "I'm Interested" form is open to anyone.

## The three roles, and how they connect

```
           STUDENT                    COLLEGE ADMIN                NERAM STAFF (you)
  (public, no login needed)    (testcollege@neram.test)        (/admin/staff-login)
             |                           |                            |
             | 1. clicks "interested"    |                            |
             |    on a college page      |                            |
             v                           |                            |
       college_leads row          2. gets notification               |
       inserted in DB               email with lead details          |
             |                       (masked phone, unless            |
             |                        college tier >= gold)           |
             |                           |                            |
             |                    3. opens /college-dashboard        |
             |                       sees new lead in table          |
             |                       marks status as "contacted"     |
             |                           |                            |
             |                           |                     4. logs into /admin/staff-login
             |                           |                        sees all 32 TN colleges
             |                           |                        picks a college
             |                           |                        opens college page
             |                           |                        clicks "Send outreach" FAB
             |                           |                        college gets first-touch email
             |                           |                        contact_status = emailed_v1
             |                           |                            |
             |                           |                     5. can upgrade college tier
             |                           |                        from /admin/colleges
             |                           |                        (free -> gold unmasks phones)
```

---

## Scenario 1: Student submits an "interest" lead (end to end)

**As a student (incognito browser):**

1. Open https://staging.neramclasses.com/en/colleges/tamil-nadu/measi-academy-architecture
2. Scroll down past the hero section
3. Find and click the "I'm Interested" button
4. In the modal:
   - Name: `Test Student`
   - Phone: `9999999999` (use any valid-looking 10-digit number)
   - Email: your own gmail (optional)
   - NATA score: 120 (optional)
   - City: Chennai
   - Tick the consent checkbox
5. Click Submit
6. Expect: success message in the modal

**Verify in Supabase (as Hari):**

Run this in the staging SQL editor (or via MCP):

```sql
SELECT id, name, phone, email, city, nata_score, status, created_at
FROM college_leads
WHERE college_id = (SELECT id FROM colleges WHERE slug = 'measi-academy-architecture')
ORDER BY created_at DESC
LIMIT 3;
```

You should see the lead you just submitted, status = `new`.

**Verify email notification (Gmail):**

Check the Measi admissions inbox (or whatever email you seeded). If the college has `admissions_email` set, that inbox gets a "New student interest" email with the student details. The phone is masked because Measi is currently on `free` tier.

---

## Scenario 2: College admin sees and manages leads

**Log in as the test college:**

1. Open a fresh incognito or private window
2. Go to https://staging.neramclasses.com/college-dashboard/login
3. Email: `testcollege@neram.test`
4. Password: `MeasiTest2026!`
5. Click Sign in

**Verify:**

- You land on the college dashboard home
- Your college is "Measi Academy of Architecture"
- Click "Leads" in the nav
- You should see the lead from Scenario 1
- Phone should be masked (e.g., `99XXXXXX99`) because Measi is on `free` tier
- Change the status dropdown from "new" to "contacted"

**Verify the status change:**

```sql
SELECT status, updated_at FROM college_leads
WHERE phone = '9999999999'
ORDER BY created_at DESC LIMIT 1;
```

Should show `contacted`.

---

## Scenario 3: Neram staff sends outreach email to a college

**Log in as Neram staff (you):**

1. Open another incognito window (or use your main browser)
2. Go to https://staging.neramclasses.com/admin/staff-login
3. Fill in:
   - Your Name: `Hari`
   - Your Email: `findhari93@gmail.com`
   - Staff Secret: the value of `NERAM_STAFF_ADMIN_SECRET` from Vercel env
4. Click Sign in

**Verify FAB visibility:**

1. Open https://staging.neramclasses.com/en/colleges/tamil-nadu/measi-academy-architecture
2. You should see a dark floating button "Send outreach" in the bottom right
3. In another incognito window (not logged in as staff), open the same URL
4. The FAB should NOT appear

**Send an outreach email:**

1. Click "Send outreach"
2. Dialog opens with preview
3. Override the recipient to your own email: `findhari93@gmail.com`
4. Leave BCC checkbox ON
5. Click "Send via Neram"
6. Expect: toast at the bottom "Sent. Message id: ..."

**Verify in your inbox:**

- You should receive an email with subject like "Measi Academy of Architecture is featured on Neram College Hub..."
- Check: bullets list (established year, NAAC, fees, seats) render correctly
- Check: no literal `{{...}}` anywhere
- Check: no em dashes or `--` in the text

**Verify in Supabase:**

```sql
SELECT contact_status, outreach_count, last_outreach_at
FROM colleges WHERE slug = 'measi-academy-architecture';

SELECT subject, sent_to, sent_bcc, status, resend_message_id, sent_by_email
FROM college_outreach_log
ORDER BY sent_at DESC LIMIT 1;
```

Should show: `contact_status = emailed_v1`, `outreach_count = 1`, log row with Resend id.

**Verify duplicate-send guard:**

1. Immediately click "Send outreach" again
2. Click "Send via Neram"
3. Expect: warning with "Send anyway" button (HTTP 409 internally)
4. Click "Send anyway"
5. Expect: second send succeeds, `outreach_count` becomes 2

---

## Scenario 4: Neram staff upgrades a college from free to gold

**As Neram staff:**

1. Go to https://staging.neramclasses.com/admin/colleges
2. Find Measi Academy in the table
3. Current tier chip shows `free`
4. Click the "Tier" button in the Actions column
5. In the dialog, select "Gold (lead phone unmasked)"
6. Leave amount blank
7. Click Save
8. Expect: table refreshes, tier chip now shows `gold`

**Verify phone unmasking for the college admin:**

1. Switch back to the college-dashboard tab (still logged in as `testcollege@neram.test`)
2. Refresh the Leads page
3. The phone number for the Scenario 1 lead should now show fully (e.g., `9999999999` not `99XXXXXX99`)
4. If a new lead comes in, the notification email will also include the full phone

**Downgrade back to free (clean up):**

Same dialog, choose Free, Save.

---

## Scenario 5: Outlook mailto: fallback for outreach

**As Neram staff:**

1. Open a college page
2. Click "Send outreach"
3. Edit the recipient to your gmail
4. In the dialog, instead of "Send via Neram", click "Open in Outlook"
5. Expect: Outlook desktop opens (Windows) with subject and body pre-filled, BCC field set
6. This path does NOT go through Resend, so no log row is created. Useful for one-off personal sends.

---

## Quick QA checklist (go/no-go before promoting to prod)

### Outreach feature
- [ ] Staff login works at `/admin/staff-login`
- [ ] FAB visible for staff on every college page
- [ ] FAB hidden for non-staff visitors
- [ ] Preview dialog shows rendered HTML and plain text
- [ ] No literal `{{...}}` in rendered email
- [ ] No em dashes or `--` in rendered text
- [ ] Send via Resend delivers the email
- [ ] `college_outreach_log` gets a row with `resend_message_id`
- [ ] `colleges.contact_status` moves from `never_contacted` to `emailed_v1`
- [ ] `outreach_count` increments by 1 on each send
- [ ] Duplicate-send within 30s returns 409, "Send anyway" works
- [ ] Outlook mailto: opens Outlook with body pre-filled
- [ ] BCC to info@neramclasses.com works when enabled

### Lead capture feature
- [ ] Student sees "I'm Interested" button on college pages
- [ ] Modal form collects all fields with validation
- [ ] Submitting creates a `college_leads` row
- [ ] College admin sees the lead at `/college-dashboard/leads`
- [ ] Phone is masked for free/silver tier colleges
- [ ] Phone is fully visible for gold/platinum tier colleges
- [ ] Lead status dropdown updates (new, contacted, qualified, dropped)
- [ ] College receives an email notification about the new lead

### Staff admin feature
- [ ] `/admin/colleges` lists all colleges (filterable by state, tier, status)
- [ ] Stats chips at top update with filters
- [ ] Tier button opens dialog, save updates `neram_tier`
- [ ] Tier change reflects immediately in the table

### Mobile (375px viewport)
- [ ] College detail page usable on iPhone SE width (no horizontal scroll)
- [ ] Outreach dialog renders as full-screen on mobile
- [ ] Staff login form, buttons are at least 48px tall
- [ ] Admin colleges table scrolls horizontally where needed but no page-level horizontal scroll

---

## How to create additional college admin accounts (for real colleges)

When a real college wants dashboard access, run this on staging first (then production):

```sql
DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  target_college_id UUID;
BEGIN
  -- Change slug to match the target college
  SELECT id INTO target_college_id FROM colleges WHERE slug = 'measi-academy-architecture';

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated', 'authenticated',
    'admissions@example-college.edu',          -- CHANGE: college's real email
    crypt('ChangeMe123!SecurePassword', gen_salt('bf')),  -- CHANGE: secure temp password
    NOW(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Admissions Officer Name"}'::jsonb,
    NOW(), NOW()
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id, new_user_id::text,
    format('{"sub":"%s","email":"admissions@example-college.edu"}', new_user_id)::jsonb,
    'email', NOW(), NOW(), NOW()
  );

  INSERT INTO college_admins (college_id, email, name, role, supabase_uid, is_active)
  VALUES (target_college_id, 'admissions@example-college.edu', 'Admissions Officer', 'admin', new_user_id, true);
END $$;
```

Then email the college their email + temporary password, and tell them to log in at `/college-dashboard/login` and change the password from their profile.

## If something breaks

- Check Vercel logs for the marketing app (function logs show all API errors)
- Check Resend dashboard for email delivery status (bounces, rejections)
- Check `college_outreach_log.status` and `error_message` for failed sends
- Check `supabase-staging` logs via the Supabase dashboard
