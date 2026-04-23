# College Hub: Manual Testing Walkthrough

End-to-end manual test guide for the three user roles in the Neram College Hub. Always test on **staging**. Never use production for testing, real users are on it.

## Three user roles and where they live

| Role | Login URL | Auth | App |
|---|---|---|---|
| **Student (public)** | no login | Firebase optional | marketing (`neramclasses.com`) |
| **College admin** | `/college-dashboard/login` | Supabase email + password | marketing |
| **Neram staff** | `/login` (Microsoft Entra ID) | MSAL (Microsoft 365 account) | admin (`admin.neramclasses.com`) |

## Test environment URLs

| Surface | URL |
|---|---|
| Public marketing site | https://staging.neramclasses.com |
| Specific college page (example) | https://staging.neramclasses.com/en/colleges/tamil-nadu/measi-academy-architecture |
| College admin dashboard | https://staging.neramclasses.com/college-dashboard/login |
| Neram staff admin app | https://staging-admin.neramclasses.com |
| Neram staff college outreach page | https://staging-admin.neramclasses.com/college-outreach |

## Test accounts

### Neram staff (you)

Sign into `staging-admin.neramclasses.com` with your Microsoft 365 account (the same one you use for everything else internally). After login you land on the admin dashboard. Click **College Hub → Outreach** in the sidebar to open the outreach page.

### Test college admin (pre-seeded on staging)

| Field | Value |
|---|---|
| Login URL | `https://staging.neramclasses.com/college-dashboard/login` |
| Email | `testcollege@neram.test` |
| Password | `MeasiTest2026!` |
| Linked college | Measi Academy of Architecture (Chennai, free tier by default) |

### Test student

Use any browser incognito window. No student account needed for the lead capture flow.

## How the three roles connect

```
           STUDENT                    COLLEGE ADMIN                NERAM STAFF (you)
  (public, no login needed)    (testcollege@neram.test)      (admin.neramclasses.com)
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
             |                       marks status "contacted"        |
             |                           |                            |
             |                           |                     4. opens admin app
             |                           |                        /college-outreach
             |                           |                        picks a college
             |                           |                        clicks "Outreach"
             |                           |                        preview + send email
             |                           |                        contact_status = emailed_v1
             |                           |                            |
             |                           |                     5. clicks "Tier"
             |                           |                        upgrades college to gold
             |                           |                        (free -> gold unmasks phones)
```

---

## Scenario 1: Student submits an "interest" lead

**As a student (incognito browser):**

1. Open https://staging.neramclasses.com/en/colleges/tamil-nadu/measi-academy-architecture
2. Scroll down past the hero section
3. Find and click the "I'm Interested" button
4. In the modal:
   - Name: `Test Student`
   - Phone: `9999999999`
   - Email: your own gmail (optional)
   - NATA score: 120 (optional)
   - City: Chennai
   - Tick the consent checkbox
5. Click Submit
6. Expect: success message

**Verify in Supabase (via MCP or SQL editor):**

```sql
SELECT id, name, phone, email, city, nata_score, status, created_at
FROM college_leads
WHERE college_id = (SELECT id FROM colleges WHERE slug = 'measi-academy-architecture')
ORDER BY created_at DESC
LIMIT 3;
```

Expect: one row with status = `new`.

**Verify email notification:**

Check the Measi admissions inbox (admin@measiarch.in if seeded, or override). Phone should be masked (e.g. `99XXXXXX99`) because Measi is on free tier.

---

## Scenario 2: College admin views + manages leads

**Log in as test college (fresh incognito):**

1. https://staging.neramclasses.com/college-dashboard/login
2. Email: `testcollege@neram.test`
3. Password: `MeasiTest2026!`
4. Click Sign in

**Verify:**

- Dashboard home shows "Measi Academy of Architecture"
- Click **Leads** in the nav
- The lead from Scenario 1 appears with masked phone (free tier)
- Change status dropdown from "new" to "contacted"

**Verify in SQL:**

```sql
SELECT status, updated_at FROM college_leads
WHERE phone = '9999999999'
ORDER BY created_at DESC LIMIT 1;
```

Should show `contacted`.

---

## Scenario 3: Neram staff sends outreach to a college

**Log in as Neram staff:**

1. Open https://staging-admin.neramclasses.com (no special secret, uses your MS 365 account)
2. You land on the admin dashboard
3. In the left sidebar, click **College Hub → Outreach**

**Verify the outreach page:**

1. Page title: "College Outreach"
2. Stats chips at top show breakdown by status / tier
3. Table rows for all 32 Tamil Nadu colleges
4. Each row has two buttons: **Outreach** (blue, filled) and **Tier** (outlined)

**Send an outreach email:**

1. Find Measi Academy of Architecture in the table
2. Click the **Outreach** button
3. Dialog opens with preview (iframe showing the rendered email HTML)
4. In the **Recipient email** field, replace with your own email (e.g. `findhari93@gmail.com`)
5. Leave **BCC info@neramclasses.com** checked
6. Click **Send via Neram**
7. Expect: toast at bottom "Sent. Message id: ..."
8. Dialog closes, table refreshes, Measi's contact status becomes "Emailed", outreach count becomes 1

**Verify email arrived:**

Check your inbox. You should receive a warm outreach email with Measi's details. Check:
- No literal `{{...}}` anywhere
- No em dashes (—) or double dashes (--)
- Bullets list correctly populated (established year, NAAC if set, seats, fees)

**Verify in Supabase:**

```sql
SELECT contact_status, outreach_count, last_outreach_at
FROM colleges WHERE slug = 'measi-academy-architecture';

SELECT subject, sent_to, sent_bcc, status, resend_message_id, sent_by_name, sent_by_email
FROM college_outreach_log
ORDER BY sent_at DESC LIMIT 1;
```

Expect: `contact_status = emailed_v1`, `outreach_count = 1`, and a log row with Resend message id and your name/email as sender.

**Duplicate-send guard:**

1. Click **Outreach** again immediately on the same college
2. Click **Send via Neram**
3. Expect: warning "Last outreach sent Xs ago. Pass force: true to override." with a "Send anyway" action
4. Click **Send anyway**
5. Second send succeeds, outreach_count becomes 2

---

## Scenario 4: Upgrade a college tier (free -> gold)

**Still in admin app at /college-outreach:**

1. Find Measi Academy row
2. Click the **Tier** button
3. Dialog shows current tier
4. Select **Gold (lead phone unmasked)**
5. Leave amount blank
6. Click **Save**
7. Table refreshes, tier chip now shows `gold`

**Verify the college admin sees unmasked phones:**

1. Switch back to college-dashboard tab (logged in as `testcollege@neram.test`)
2. Refresh the Leads page
3. The lead phone from Scenario 1 should now show in full (`9999999999`, not masked)

**Downgrade back (cleanup):**

Open the Tier dialog again, select **Free**, Save.

---

## Scenario 5: Outlook mailto fallback

Instead of sending through our Resend account, send via your Outlook client manually. Useful when:
- You want a more personal touch on a single send
- Resend is down
- You want the sent email to appear in your Outlook Sent folder

1. Open the Outreach dialog for any college
2. Edit recipient to your own email
3. Click **Open in Outlook**
4. Outlook desktop opens with subject and body pre-filled, BCC set
5. This does NOT create a `college_outreach_log` row (no tracking). Use sparingly.

---

## Quick QA checklist

### Outreach feature (admin app)
- [ ] MS 365 login works at staging-admin.neramclasses.com
- [ ] "College Hub → Outreach" link visible in sidebar
- [ ] Table loads 32 TN colleges by default
- [ ] Filters (state, tier, status, search) work
- [ ] "Outreach" button opens preview dialog with rendered HTML
- [ ] Preview has no `{{...}}` or em dashes
- [ ] Send via Neram delivers email
- [ ] `college_outreach_log` row created with Resend message id
- [ ] `contact_status` moves from `never_contacted` to `emailed_v1`
- [ ] `outreach_count` increments on each send
- [ ] Duplicate-send within 30s returns 409, "Send anyway" works
- [ ] "Open in Outlook" opens mailto with body pre-filled

### Tier management (admin app)
- [ ] Tier dialog shows current tier
- [ ] Changing tier updates table immediately
- [ ] Downgrade back to free works
- [ ] `tier_start_date` and `tier_end_date` set correctly in DB

### Lead capture (marketing + college dashboard)
- [ ] Student sees "I'm Interested" button on college pages
- [ ] Submitting creates a `college_leads` row
- [ ] College admin sees the lead at `/college-dashboard/leads`
- [ ] Phone masked for free/silver tier, full for gold/platinum
- [ ] Lead status dropdown updates

### Marketing hygiene (public-facing)
- [ ] No "Send outreach" button or any staff UI on college detail pages
- [ ] No `/admin` routes exist on `neramclasses.com` or `staging.neramclasses.com`
- [ ] `/college-dashboard/*` still works for college admins

---

## Creating additional college admin accounts

When a real college wants dashboard access, run this on staging first (then production):

```sql
DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  target_college_id UUID;
BEGIN
  -- CHANGE this slug to match the target college
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

Then email the college their email + temporary password, and tell them to log in at `/college-dashboard/login`.

## If something breaks

- Check Vercel function logs for the admin app (at `admin.vercel.com`)
- Check Resend dashboard for email delivery status (bounces, rejections)
- Check `college_outreach_log.status` and `error_message` for failed sends
- Check Supabase staging logs via the Supabase dashboard
