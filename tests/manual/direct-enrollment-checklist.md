# Direct Enrollment — Manual Testing Checklist

Use this checklist when testing the full direct enrollment flow with real Firebase auth.
Automated E2E tests cover API validation and cross-app integration, but the actual
student enrollment (Google sign-in + phone OTP) must be tested manually.

---

## Prerequisites

- [ ] All apps running: `pnpm dev` (ports 3010, 3011, 3012, 3013)
- [ ] Firebase staging project has test phone `+919999900001` → OTP `123456`
- [ ] You have a Google account for testing (not a production student account)
- [ ] Admin user exists in Supabase (with valid `ms_oid`)

---

## 1. Admin Creates Enrollment Link

**URL:** http://localhost:3013/direct-enrollment

- [ ] Page loads without errors
- [ ] Click "Generate New Link"
- [ ] Fill student name: `Manual Test Student`
- [ ] Fill phone: `9000000001`
- [ ] Select course: NATA
- [ ] Select learning mode: Hybrid
- [ ] Set total fee: `25000`
- [ ] Set discount: `5000`
- [ ] Verify final fee auto-calculates to `20000`
- [ ] Set amount paid: `20000`
- [ ] Set payment method: Bank Transfer
- [ ] Add transaction reference: `MANUAL-TEST-001`
- [ ] (Optional) Upload payment proof image
- [ ] Click "Generate"
- [ ] **Verify:** Link URL is displayed with a token
- [ ] **Verify:** Link appears in the table with status "Active"
- [ ] Copy the enrollment link URL

---

## 2. Student Completes Enrollment

**URL:** Paste the enrollment link (e.g., http://localhost:3010/en/enroll?token=...)

- [ ] Page loads, shows "Validating your enrollment link..." then loads the form
- [ ] **Verify:** Student name shows `Manual Test Student`
- [ ] **Verify:** Course shows NATA
- [ ] **Verify:** Fee summary: Total ₹25,000 / Discount ₹5,000 / Final ₹20,000 / Paid ₹20,000
- [ ] Click "Sign in with Google" — sign in with test Google account
- [ ] After sign-in, 3-step wizard appears

### Step 1: Personal Details
- [ ] First name field is visible (may be pre-filled)
- [ ] Enter father name, date of birth, gender
- [ ] Enter country, state, city, district, pincode
- [ ] Enter address
- [ ] Click "Next"

### Step 2: Academic Details
- [ ] Select applicant category
- [ ] Select school type
- [ ] Select target exam year
- [ ] **Phone Verification:** Enter `+919999900001`
- [ ] Enter OTP: `123456`
- [ ] **Verify:** Green checkmark appears after verification
- [ ] Click "Next"

### Step 3: Review & Confirm
- [ ] All entered data is displayed correctly
- [ ] Fee summary is correct
- [ ] Phone verified status shows ✓
- [ ] Accept terms checkbox
- [ ] Click "Complete Enrollment"
- [ ] **Verify:** Success page appears with:
  - [ ] Application number (e.g., NR-xxxx)
  - [ ] Student ID
  - [ ] Course name
  - [ ] Fee paid amount
  - [ ] Onboarding checklist steps

---

## 3. Post-Enrollment Verification

### Revisit the enrollment link
- [ ] Open the same enrollment link again
- [ ] **Verify:** Shows "Already Used" page with enrollment summary
- [ ] If signed in as the same Google account: shows "View/Edit" mode
- [ ] Can view (but not change) fee/course data

### Student App
- [ ] Go to http://localhost:3011 (student app)
- [ ] Sign in with the same Google account
- [ ] **Verify:** Onboarding checklist is visible on dashboard
- [ ] **Verify:** Steps include: Join WhatsApp, Install Teams, Join MS Teams, Complete Profile
- [ ] Click "Mark as Complete" on a manual step
- [ ] **Verify:** Step shows as completed with timestamp
- [ ] Click "Undo" on the completed step
- [ ] **Verify:** Step returns to incomplete

---

## 4. Admin Verification

### Direct Enrollment Page
- [ ] Go to http://localhost:3013/direct-enrollment
- [ ] **Verify:** The test link now shows status "Used" (or "Completed")
- [ ] **Verify:** Shows student name and used timestamp
- [ ] Click on the link to view details
- [ ] **Verify:** Shows lead_profile_id and student_profile_id

### Student Directory
- [ ] Go to http://localhost:3013/students
- [ ] Search for `Manual Test Student`
- [ ] **Verify:** Student appears in the directory
- [ ] **Verify:** Shows correct course, batch, payment status
- [ ] **Verify:** Enrollment date matches today

### Student Onboarding Page
- [ ] Go to http://localhost:3013/student-onboarding
- [ ] Switch to "Student Progress" tab
- [ ] Search for `Manual Test Student`
- [ ] **Verify:** Shows onboarding progress (X/Y steps completed)
- [ ] Click to view individual progress
- [ ] **Verify:** Steps match what the student completed in the app

---

## 5. Edge Cases

### Expired Link
- [ ] Create a new link, then wait for it to expire (or manually set expires_at in DB to past date)
- [ ] Visit the link
- [ ] **Verify:** Shows "Link Expired" page
- [ ] **Verify:** "Request New Link" button is visible

### Cancelled Link
- [ ] Create a new link, cancel it from admin
- [ ] Visit the link
- [ ] **Verify:** Shows "Link Cancelled" error

### Regenerated Link
- [ ] Create a link, then regenerate it from admin
- [ ] **Verify:** Old link becomes "Cancelled" with system note
- [ ] **Verify:** New link has different token but same student data
- [ ] Visit old link → should show error
- [ ] Visit new link → should show the enrollment form

### Duplicate Enrollment
- [ ] Try to complete enrollment with the same Google account that already enrolled
- [ ] **Verify:** Shows appropriate error (already enrolled or link already used)

---

## 6. Cleanup

After testing, clean up test data:

1. Go to admin direct-enrollment page → delete the test link
2. If a student_profile was created, you may want to remove it from Supabase:
   ```sql
   -- Find and delete test data (use with caution!)
   DELETE FROM student_onboarding_progress WHERE user_id = '<test-user-id>';
   DELETE FROM post_enrollment_details WHERE student_profile_id = '<test-profile-id>';
   DELETE FROM payments WHERE student_profile_id = '<test-profile-id>';
   DELETE FROM student_profiles WHERE id = '<test-profile-id>';
   DELETE FROM lead_profiles WHERE id = '<test-lead-id>';
   ```

---

## Quick Reference: Test Phone Numbers

| Phone | OTP | Environment |
|-------|-----|-------------|
| +919999900001 | 123456 | Staging only |
| +919999900002 | 123456 | Staging only |
| +919999900003 | 123456 | Staging only |
| +916380194614 | 880743 | Production |
