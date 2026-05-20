# Seed 24 NATA-Based B.Arch Counseling Systems — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert 24 new rows into the existing `counseling_systems` table covering all NATA-based state B.Arch counseling bodies from the research document `apps/app/Docs/compass_artifact_wf-255ed70a-4888-4d03-a4e2-bd9ac4d57372_text_markdown.md`.

**Architecture:** One idempotent SQL migration. Each `INSERT … ON CONFLICT (code) DO NOTHING`. No new tables, types, or queries — the schema and code path already exist (`counseling_systems`, `packages/database/src/queries/counseling.ts`).

**Tech Stack:** Supabase Postgres, MCP-applied migration via `mcp__supabase-staging__apply_migration` / `mcp__supabase-prod__apply_migration`, local migration file checked into `packages/database/supabase/migrations/`.

**Spec:** `docs/superpowers/specs/2026-05-20-counseling-bodies-foundation-design.md`

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql` | The 24 `INSERT … ON CONFLICT` statements; the only artifact this plan produces | Create |
| `counseling_systems` (live table) | Receives the rows | Modified data only, no DDL |

That's the whole footprint. No other files change.

---

## Constants used across tasks

The five-category placeholder used for every new row (per spec §5):

```json
[
  {"code":"GEN","name":"General Merit","description":"Open / Unreserved"},
  {"code":"OBC","name":"Other Backward Class"},
  {"code":"SC","name":"Scheduled Caste"},
  {"code":"ST","name":"Scheduled Tribe"},
  {"code":"EWS","name":"Economically Weaker Section"}
]
```

The five merit-formula shapes (per spec §3):

**The plan inserts 22 new rows.** Total in `counseling_systems` after migration: **23** (TNEA + 22).

Method distribution across the 22 new bodies:

| `merit_formula.method` | Count | Bodies |
|---|---|---|
| `raw_sum` (50:50 HSC + entrance, total 400) | 14 | KEAM, MAHACET, ACPC, CEPT, REAP, MPDTE, HPTU, IKGPTU, JKBOPEE, HSTES, GGSIPU, JMI, DTEGOA, UTU |
| `entrance_only` (rank on entrance alone, HSC is eligibility) | 3 | KCET, UPTAC, WBJEEB |
| `normalized_composite` (State Architecture Rank) | 2 | APSCHE, TSCHE |
| `jee_rank_primary` (JEE rank merit; NATA threshold) | 1 | OJEE |
| `jee_or_nata_merit` (best of JEE-P2 or NATA) | 1 | BCECEB |
| `nata_or_jee_p2` (NATA or JEE-P2 score) | 1 | CGDTE |
| **Total new rows** | **22** | |

After insert, including the existing TNEA row (which also uses `raw_sum`), the total count of `raw_sum` rows is 15.

---

## Task 1: Create the migration file with the header and the 14 `raw_sum` (50:50) bodies

**Files:**
- Create: `packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql`

- [ ] **Step 1: Create the migration file with header + first 14 INSERTs**

Create the file with this exact content (note: the BCECEB and CGDTE blocks below are NOT in this first 14; they go in Task 3):

```sql
-- Migration: Seed 22 NATA-based state B.Arch counseling bodies into counseling_systems
-- Source: apps/app/Docs/compass_artifact_wf-255ed70a-4888-4d03-a4e2-bd9ac4d57372_text_markdown.md
-- Existing row TNEA_BARCH is not modified. All inserts use ON CONFLICT (code) DO NOTHING.
-- Categories are seeded with a generic 5-row placeholder (GEN/OBC/SC/ST/EWS) per spec §5;
-- real state-specific categories (Gujarat SEBC, Maharashtra MS/AI, Karnataka A-O, etc.)
-- will be added when each body's cutoffs are ingested. TNEA's existing 7 categories stay.

-- 1. KEAM (Kerala) ─── 50:50 NATA + Plus-Two
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'KEAM_BARCH',
  'KEAM B.Arch Counselling',
  'KEAM',
  'keam-barch',
  'Kerala',
  'CEE Kerala',
  'Commissioner for Entrance Examinations, Government of Kerala',
  'https://cee.kerala.gov.in/keam2025/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Plus-Two Aggregate","source":"board_marks","max_marks":200,"description":"HSC/Plus-Two aggregate, normalized to 200 per Council of Architecture guideline"},{"key":"entrance_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"NATA score"}],"total_marks":400,"notes":"Council of Architecture 50:50 default formula"}'::jsonb,
  ARRAY['NATA']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'July-August',
  3,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 2. MAHACET (Maharashtra) ─── 50:50 NATA or JEE-P2 + HSC, dual-stream
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'MAHACET_BARCH',
  'Maharashtra CAP B.Arch',
  'MAHACET',
  'mahacet-barch',
  'Maharashtra',
  'State CET Cell',
  'State Common Entrance Test Cell, Government of Maharashtra (DTE)',
  'https://cetcell.mahacet.org/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"HSC Aggregate","source":"board_marks","max_marks":200,"description":"HSC aggregate normalized to 200 per COA guideline"},{"key":"entrance_score","name":"NATA / JEE Main Paper 2","source":"entrance_exam","max_marks":200,"description":"NATA score or JEE Main Paper 2 score (whichever the candidate applied with)"}],"total_marks":400,"separate_lists":true,"notes":"Separate inter-se merit lists prepared for NATA-stream and JEE-Main-Paper-2-stream candidates. Tie-break: higher entrance percentile -> higher SSC Maths -> higher SSC aggregate. MHT-CET score is NOT valid for B.Arch admission."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'August-September',
  4,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 3. ACPC Gujarat ─── 50:50 dual-stream with SEBC + Home-State reservations
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'ACPC_GUJ_BARCH',
  'ACPC Gujarat B.Arch',
  'ACPC Gujarat',
  'acpc-guj-barch',
  'Gujarat',
  'ACPC Gujarat',
  'Admission Committee for Professional Courses, Education Department, Government of Gujarat',
  'https://gujacpc.admissions.nic.in/b-arch/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Qualifying Exam Aggregate","source":"board_marks","max_marks":200,"description":"Class 12 aggregate normalized to 200 per COA guideline"},{"key":"entrance_score","name":"NATA / JEE Main Paper 2","source":"entrance_exam","max_marks":200,"description":"NATA score or JEE Main Paper 2 score"}],"total_marks":400,"separate_lists":true,"notes":"Separate merit lists for NATA-stream and JEE-Main-Paper-2-stream candidates. ACPC publishes Closure Rank PDFs annually for both streams."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  '[{"code":"SEBC","name":"Socially & Economically Backward Class","percentage":27.0,"notes":"Creamy-layer-excluded"},{"code":"HS","name":"Home-State (Gujarat / D&D / DNH)","percentage":null,"notes":"Home-state quota for school-qualified candidates from Gujarat / Daman & Diu / Dadra & Nagar Haveli"}]'::jsonb,
  'June-August',
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 4. CEPT University ─── 50:50 NATA + 12th, 75% AI / 25% via ACPC
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'CEPT_BARCH',
  'CEPT University B.Arch (All-India Quota)',
  'CEPT',
  'cept-barch',
  'Gujarat',
  'CEPT University',
  'CEPT University, Ahmedabad (state-act university under Gujarat State Legislature Act 2005)',
  'https://cept.ac.in/programs/barch/admissions',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Class 12 Aggregate","source":"board_marks","max_marks":200,"description":"Class 12 aggregate (all subjects), normalized to 200"},{"key":"entrance_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"NATA score. CEPT does NOT accept JEE Main Paper 2."}],"total_marks":400,"notes":"75% seats filled by CEPT direct All-India admission; 25% by ACPC Gujarat. This row represents the CEPT direct AI pipeline; the ACPC Gujarat pipeline is covered by ACPC_GUJ_BARCH."}'::jsonb,
  ARRAY['NATA']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'June-July',
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 5. REAP Rajasthan ─── 50:50 NATA or JEE-P2 + 12th
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'REAP_BARCH',
  'REAP Rajasthan B.Arch',
  'REAP',
  'reap-barch',
  'Rajasthan',
  'CEG Jaipur / RTU',
  'Centre for Electronic Governance, Jaipur (on behalf of Rajasthan Technical University, Kota)',
  'https://reap2025.com/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Qualifying Exam Aggregate","source":"board_marks","max_marks":200,"description":"Class 12 aggregate (Mathematics compulsory) normalized to 200"},{"key":"entrance_score","name":"NATA / JEE Main Paper 2","source":"entrance_exam","max_marks":200,"description":"NATA score or JEE Main Paper 2 score"}],"total_marks":400,"separate_lists":true,"notes":"50:50 NATA + qualifying exam. Up to 8 counseling rounds in some cycles (TFWS / out-of-state / KM / PwD / Rajasthan-domicile rounds)."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'July-August',
  3,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 6. MP DTE ─── 50:50 dual-stream, 90% MP domicile + 5% AI + 5% other
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'MPDTE_BARCH',
  'MP DTE B.Arch',
  'MPDTE',
  'mpdte-barch',
  'Madhya Pradesh',
  'DTE MP',
  'Directorate of Technical Education, Madhya Pradesh',
  'https://dte.mponline.gov.in/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Qualifying Exam Aggregate","source":"board_marks","max_marks":200,"description":"Class 12 aggregate normalized to 200"},{"key":"entrance_score","name":"NATA / JEE Main Paper 2","source":"entrance_exam","max_marks":200,"description":"NATA score or JEE Main Paper 2 score"}],"total_marks":400,"separate_lists":true,"notes":"50:50 with equal importance; separate merit lists for JEE-stream and NATA-stream. CLC (college-level counseling) rounds after centralized counseling."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  '[{"code":"DOM","name":"MP Domicile","percentage":90.0},{"code":"AI","name":"All India","percentage":5.0},{"code":"OTHER","name":"Other","percentage":5.0}]'::jsonb,
  'July-August',
  3,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 7. HPTU Himachal Pradesh ─── 50:50 NATA or JEE-P2 + 12th
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'HPTU_BARCH',
  'HPTU Himachal Pradesh B.Arch',
  'HPTU',
  'hptu-barch',
  'Himachal Pradesh',
  'HPTU Hamirpur',
  'Himachal Pradesh Technical University, Hamirpur (HPTU / HIMTU)',
  'https://www.himtu.ac.in/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Class 12 Aggregate","source":"board_marks","max_marks":200,"description":"Class 12 aggregate normalized to 200"},{"key":"entrance_score","name":"NATA / JEE Main Paper 2","source":"entrance_exam","max_marks":200,"description":"NATA percentile or JEE Main Paper 2 percentile"}],"total_marks":400,"notes":"HPCET does not test for B.Arch directly; B.Arch admission is on NATA/JEE-P2 + 10+2 merit. Information per HPTU notices and secondary summaries; reconfirm against 2026 prospectus."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  NULL,
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 8. IKGPTU Punjab ─── NATA + 12th merit, 85% Punjab domicile + 15% AI
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'IKGPTU_BARCH',
  'IKGPTU Punjab B.Arch',
  'IKGPTU',
  'ikgptu-barch',
  'Punjab',
  'IKGPTU',
  'I.K. Gujral Punjab Technical University, Kapurthala',
  'https://ptu.ac.in/admission-2025-26/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Class 12 Aggregate","source":"board_marks","max_marks":200,"description":"Class 12 aggregate (Mathematics compulsory) normalized to 200"},{"key":"entrance_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"NATA score; minimum 80/200 per IKGPTU norms"}],"total_marks":400,"notes":"Two rounds of centralized online counseling. NATA minimum 80/200."}'::jsonb,
  ARRAY['NATA']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  '[{"code":"DOM","name":"Punjab Domicile","percentage":85.0},{"code":"AI","name":"All India","percentage":15.0}]'::jsonb,
  NULL,
  2,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 9. JKBOPEE J&K / Ladakh ─── merit-cum-preference on NATA/JEE-P2
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'JKBOPEE_BARCH',
  'JKBOPEE J&K B.Arch',
  'JKBOPEE',
  'jkbopee-barch',
  'Jammu & Kashmir',
  'JKBOPEE',
  'Jammu & Kashmir Board of Professional Entrance Examinations',
  'https://jkbopee.gov.in/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Class 12 Aggregate","source":"board_marks","max_marks":200,"description":"Class 12 aggregate (PCM 45%) normalized to 200"},{"key":"entrance_score","name":"NATA / JEE Main Paper 2","source":"entrance_exam","max_marks":200,"description":"NATA or JEE Main Paper 2 score"}],"total_marks":400,"notes":"Merit-cum-preference. 80 seats total: 40 at GCET Kot Bhalwal (Jammu), 40 at GCET Safapora, Ganderbal (Kashmir). Counts can change per JKBOPEE annual notification."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  NULL,
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 10. HSTES Haryana ─── 50:50 NATA percentile + 12th
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'HSTES_BARCH',
  'Haryana HSTES B.Arch',
  'HSTES',
  'hstes-barch',
  'Haryana',
  'HSTES',
  'Haryana State Technical Education Society, Department of Technical Education',
  'https://techadmissionshry.gov.in/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Qualifying Exam Percentage","source":"board_marks","max_marks":200,"description":"Percentage of marks of qualifying exam normalized to 200"},{"key":"entrance_score","name":"NATA / JEE Main Paper 2 Percentile","source":"entrance_exam","max_marks":200,"description":"Percentile of NATA-2025 score or any other aptitude test recognized by COA"}],"total_marks":400,"separate_lists":true,"notes":"Combined merit = NATA percentile and qualifying exam % in 50:50. PPP ID (Parivar Pehchan Patra) mandatory for Haryana candidates."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'June-August',
  2,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 11. GGSIPU Delhi ─── 50:50 NATA + qualifying exam, 85% Delhi region
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'GGSIPU_BARCH',
  'GGSIPU Delhi B.Arch',
  'GGSIPU',
  'ggsipu-barch',
  'Delhi',
  'GGSIPU',
  'Guru Gobind Singh Indraprastha University, Delhi',
  'https://ipu.admissions.nic.in/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Qualifying Exam Aggregate","source":"board_marks","max_marks":200,"description":"Percentage of aggregate marks in qualifying examination, normalized to 200"},{"key":"entrance_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"NATA score"}],"total_marks":400,"notes":"NATA-based merit for B.Arch (no GGSIPU CET for B.Arch). 80 seats total."}'::jsonb,
  ARRAY['NATA']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  '[{"code":"DR","name":"Delhi Region","percentage":85.0},{"code":"OD","name":"Outside Delhi","percentage":15.0}]'::jsonb,
  'July',
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 12. JMI Delhi ─── NATA, central university admit-direct
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'JMI_BARCH',
  'Jamia Millia Islamia B.Arch',
  'JMI',
  'jmi-barch',
  'Delhi',
  'Jamia Millia Islamia',
  'Jamia Millia Islamia, Faculty of Architecture & Ekistics (Central University)',
  'https://www.jmi.ac.in/fae',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Class 12 Aggregate","source":"board_marks","max_marks":200,"description":"Class 12 aggregate normalized to 200"},{"key":"entrance_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"NATA score per 2025-26 prospectus. JEE Main Paper 2 was referenced in 2024 cycle - re-verify each annual prospectus."}],"total_marks":400,"notes":"Central university; does NOT use Delhi state counseling. ~80 seats (regular + self-financing combined). 2024 cycle referenced JEE-P2 + NATA 50:50; 2025-26 prospectus is authoritative - re-parse annually."}'::jsonb,
  ARRAY['NATA']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  NULL,
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 13. DTE Goa / GCA ─── 50:50 NATA + HSSC, sole institute GCA Panaji
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'DTEGOA_BARCH',
  'DTE Goa B.Arch (GCA Panaji)',
  'DTE Goa',
  'dtegoa-barch',
  'Goa',
  'DTE Goa',
  'Directorate of Technical Education, Goa (Goa College of Architecture)',
  'https://gcarch.goa.gov.in/b-arch-admissions/',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"HSSC Aggregate","source":"board_marks","max_marks":200,"description":"HSSC aggregate normalized to 200"},{"key":"entrance_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"NATA score. GCA does NOT accept JEE Main Paper 2."}],"total_marks":400,"notes":"Merit = NATA : HSSC in ratio 1:1. Tie-break: higher NATA, then higher Maths marks, then earlier DOB. 40 (+4) seats per official GCA prospectus; COA approved increase to 60 with conditions per Herald Goa but prospectus retains 40."}'::jsonb,
  ARRAY['NATA']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'July',
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 14. UTU Uttarakhand ─── NATA + 12th merit, no published 50:50 weighting
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'UTU_BARCH',
  'UTU Uttarakhand B.Arch',
  'UTU',
  'utu-barch',
  'Uttarakhand',
  'UTU Dehradun',
  'Veer Madho Singh Bhandari Uttarakhand Technical University, Dehradun',
  'https://uktech.ac.in/en',
  '{"method":"raw_sum","components":[{"key":"hsc_aggregate","name":"Class 12 Aggregate","source":"board_marks","max_marks":200,"description":"Class 12 (Mathematics compulsory) normalized to 200"},{"key":"entrance_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"Valid NATA score"}],"total_marks":400,"notes":"UKSEE was scrapped in 2023. Admission is merit-based on Class 12 (Mathematics compulsory) + valid NATA. No published 50:50 weighting; institute-level merit determination during centralized counseling. Mapped to 50:50 for predictor consistency until UTU publishes the actual formula."}'::jsonb,
  ARRAY['NATA']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  NULL,
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2: Run a SQL syntax dry-check (no DB execution)**

Inspect the file visually for:
- Every `INSERT` ends with `ON CONFLICT (code) DO NOTHING;`
- Every `jsonb` cast is on a valid JSON string (single-quoted, properly escaped)
- Array literals use `ARRAY[…]::text[]`
- No trailing commas inside JSONB array elements

This is a visual check, not a tool run. If anything looks suspect, fix it in this same step.

- [ ] **Step 3: Commit the partial migration**

```bash
git add packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql
git commit -m "$(cat <<'EOF'
feat(database): seed 14 weighted-50:50 NATA B.Arch counseling systems

Adds first 14 of 22 counseling_systems rows from research doc. Existing
TNEA_BARCH row not modified. Idempotent via ON CONFLICT (code) DO NOTHING.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(If user prefers to batch commits at the end of all tasks, skip this commit and combine at Task 6.)

---

## Task 2: Append the 3 `entrance_only` (NATA-only merit) bodies

**Files:**
- Modify: `packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql`

- [ ] **Step 1: Append the three INSERTs**

Append this block to the end of the migration file (after the UTU block):

```sql
-- 15. KCET Karnataka ─── NATA-only merit (engineering KCET uses 50:50, but B.Arch is NATA-only)
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'KCET_BARCH',
  'KCET B.Arch',
  'KCET',
  'kcet-barch',
  'Karnataka',
  'KEA',
  'Karnataka Examinations Authority',
  'https://cetonline.karnataka.gov.in/kea/',
  '{"method":"entrance_only","components":[{"key":"nata_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"Karnataka KCET B.Arch ranks purely on NATA score; 10+2 PCM is eligibility only. JEE Main Paper 2 also accepted per recent KEA notifications."}],"total_marks":200,"notes":"Differs from KCET engineering 50:50 PUC+KCET formula. Karnataka domicile rules: 7-year study in Karnataka OR parental domicile; codes A-O define quotas."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'July-September',
  3,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 16. UPTAC Uttar Pradesh ─── NATA / JEE-P2 rank-based, ~7 rounds
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'UPTAC_BARCH',
  'UPTAC B.Arch',
  'UPTAC',
  'uptac-barch',
  'Uttar Pradesh',
  'AKTU',
  'Dr A.P.J. Abdul Kalam Technical University, Lucknow (UPTAC)',
  'https://uptac.admissions.nic.in/',
  '{"method":"entrance_only","components":[{"key":"nata_score","name":"NATA / JEE Main Paper 2","source":"entrance_exam","max_marks":200,"description":"Admission on NATA score or JEE Main Paper 2. Class 12 with PCM is eligibility only."}],"total_marks":200,"notes":"Class 12 PCM is eligibility threshold; merit ranks on NATA / JEE-P2 directly. Up to 7 rounds (R1-R7) in 2025 cycle."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'June-August',
  7,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 17. WBJEEB West Bengal ─── NATA / JEE-P2 merit
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'WBJEEB_BARCH',
  'WBJEEB B.Arch',
  'WBJEEB',
  'wbjeeb-barch',
  'West Bengal',
  'WBJEEB',
  'West Bengal Joint Entrance Examinations Board',
  'https://wbjeeb.nic.in/wbjee/',
  '{"method":"entrance_only","components":[{"key":"nata_score","name":"NATA / JEE Main Paper 2","source":"entrance_exam","max_marks":200,"description":"B.Arch seats filled via NATA-based merit list. JEE Main Paper 2 also accepted. WBJEE rank is used for B.Tech, not B.Arch."}],"total_marks":200,"separate_lists":true,"notes":"Three rounds: Allotment, Upgradation, Mop-up. Notable colleges: Jadavpur University, IIEST Shibpur (separate), GCECT (NATA-route under WBJEEB), private colleges."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'August-September',
  3,
  TRUE
) ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2: Commit (optional, batch at Task 6 if preferred)**

```bash
git add packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql
git commit -m "$(cat <<'EOF'
feat(database): add 3 NATA-only counseling systems (KCET, UPTAC, WBJEEB)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Append the remaining 5 bodies (APSCHE, TSCHE, OJEE, BCECEB, CGDTE)

**Files:**
- Modify: `packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql`

- [ ] **Step 1: Append the five INSERTs**

Append this block to the end of the migration file:

```sql
-- 18. APSCHE Andhra Pradesh ─── SAR normalized composite
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'APSCHE_BARCH',
  'AP EAPCET B.Arch',
  'APSCHE',
  'apsche-barch',
  'Andhra Pradesh',
  'APSCHE',
  'Andhra Pradesh State Council of Higher Education (exam by JNTU Kakinada)',
  'https://cets.apsche.ap.gov.in/EAPCET/',
  '{"method":"normalized_composite","components":[{"key":"nata_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"NATA score"},{"key":"jee_p2_score","name":"JEE Main Paper 2 Score","source":"entrance_exam","max_marks":200,"description":"JEE Main Paper 2 score"}],"total_marks":200,"notes":"State Architecture Rank (SAR) computed via APSCHE normalisation procedure; formula not publicly published. Historical rank-vs-score mapping required for predictions."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'July-August',
  3,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 19. TSCHE Telangana ─── SAR normalized composite
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'TSCHE_BARCH',
  'TG EAPCET B.Arch',
  'TSCHE',
  'tsche-barch',
  'Telangana',
  'TSCHE',
  'Telangana State Council of Higher Education (exam by JNTU Hyderabad)',
  'https://tgeapcet.nic.in/',
  '{"method":"normalized_composite","components":[{"key":"nata_score","name":"NATA Score","source":"entrance_exam","max_marks":200,"description":"NATA score"},{"key":"jee_p2_score","name":"JEE Main Paper 2 Score","source":"entrance_exam","max_marks":200,"description":"JEE Main Paper 2 score"}],"total_marks":200,"notes":"State Architecture Rank computed from NATA and JEE Main Paper 2. Phase counseling (three rounds + spot)."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'June-August',
  3,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 20. OJEE Odisha ─── JEE-Main rank primary, NATA threshold
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'OJEE_BARCH',
  'OJEE B.Arch',
  'OJEE',
  'ojee-barch',
  'Odisha',
  'OJEE Board',
  'Odisha Joint Entrance Examination Board',
  'https://ojee.nic.in/',
  '{"method":"jee_rank_primary","components":[{"key":"jee_p2_rank","name":"JEE Main Paper 2 All-India Rank","source":"entrance_exam","max_marks":null,"description":"Final merit list ranks candidates by JEE Main 2025 rank; NATA serves as additional eligibility threshold per Council of Architecture mandate."}],"total_marks":0,"notes":"Per OJEE 2025 brochure: candidates must appear and qualify in JEE Main; NATA is additional eligibility for B.Arch. total_marks=0 signals rank-based (not score-based) merit."}'::jsonb,
  ARRAY['JEE_Main_Paper_2','NATA']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  'July-August',
  3,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 21. BCECEB Bihar ─── JEE-Main 2025 OR NATA merit, GEC Gaya only
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'BCECEB_BARCH',
  'BCECEB UGEAC B.Arch (GEC Gaya)',
  'BCECEB',
  'bceceb-barch',
  'Bihar',
  'BCECEB',
  'Bihar Combined Entrance Competitive Examination Board',
  'https://bceceboard.bihar.gov.in/',
  '{"method":"jee_or_nata_merit","components":[{"key":"jee_p2_score_or_nata_score","name":"JEE Main 2025 OR NATA 2025","source":"entrance_exam","max_marks":200,"description":"Candidate''s best of JEE Main Paper 2 or NATA score; Bihar domicile required."}],"total_marks":200,"notes":"GEC Gaya is the sole B.Arch college under BCECEB. Separate B.Arch advertisement published after main UGEAC notification."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  NULL,
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;

-- 22. CG DTE Chhattisgarh ─── NATA or JEE-P2
INSERT INTO counseling_systems (
  code, name, short_name, slug, state, conducting_body, conducting_body_full, official_website,
  merit_formula, exams_accepted, categories, special_reservations, typical_counseling_months, typical_rounds, is_active
) VALUES (
  'CGDTE_BARCH',
  'DTE Chhattisgarh B.Arch',
  'CGDTE',
  'cgdte-barch',
  'Chhattisgarh',
  'DTE Chhattisgarh',
  'Directorate of Technical Education, Chhattisgarh',
  'https://cgdte.admissions.nic.in/',
  '{"method":"nata_or_jee_p2","components":[{"key":"nata_or_jee_p2_score","name":"NATA Score or JEE Main Paper 2 Score","source":"entrance_exam","max_marks":200,"description":"Admission on NATA score or JEE Main Paper 2 score. CG-PET does NOT include B.Arch."}],"total_marks":200,"notes":"Eligibility: 10+2 with PM + one more, 50% PCM (45% reserved). NIT Raipur B.Arch is JoSAA-only, not under CG-DTE."}'::jsonb,
  ARRAY['NATA','JEE_Main_Paper_2']::text[],
  '[{"code":"GEN","name":"General Merit","description":"Open / Unreserved"},{"code":"OBC","name":"Other Backward Class"},{"code":"SC","name":"Scheduled Caste"},{"code":"ST","name":"Scheduled Tribe"},{"code":"EWS","name":"Economically Weaker Section"}]'::jsonb,
  NULL,
  NULL,
  NULL,
  TRUE
) ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2: Final file sanity scan**

Open the migration file and confirm:
- 22 `INSERT` statements total.
- All 22 end with `ON CONFLICT (code) DO NOTHING;`.
- No duplicate `code` values across the file.
- Every JSONB column value is wrapped `'…'::jsonb` and parses as valid JSON.
- The escaped apostrophe in BCECEB notes (`Candidate''s`) is the only single-quote escape (SQL `''` for literal `'`).

Run:
```bash
grep -c "ON CONFLICT (code) DO NOTHING" packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql
```
Expected: `22`.

- [ ] **Step 3: Commit (optional)**

```bash
git add packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql
git commit -m "$(cat <<'EOF'
feat(database): complete 22-body NATA counseling_systems seed migration

Adds APSCHE, TSCHE, OJEE, BCECEB, CGDTE rows. Migration now has all 22
NATA-based state B.Arch counseling bodies from the research doc.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Apply the migration to staging via MCP

**Files:** none (live DB operation)

- [ ] **Step 1: Read the full migration file contents**

Use the Read tool on `packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql` so its contents are in context for the next step.

- [ ] **Step 2: Apply via MCP**

Call `mcp__supabase-staging__apply_migration` with:

- `name`: `counseling_systems_seed_22_bodies` (no leading timestamp — Supabase MCP adds one)
- `query`: the entire migration file content as a single string (do NOT include the header comment lines that begin with `--` if Supabase MCP refuses leading comments; if it accepts them, include the whole file).

Expected: success status. If it fails on a syntax error, jump to Step 4 to diagnose.

- [ ] **Step 3: Run the verification queries on staging**

Call `mcp__supabase-staging__execute_sql` for each:

```sql
-- 3a. Total row count
SELECT COUNT(*) AS total FROM counseling_systems;
-- Expected: 23 (TNEA + 22 new)

-- 3b. List all rows with key fields
SELECT code, short_name, state, exams_accepted, merit_formula->>'method' AS method
FROM counseling_systems
ORDER BY state, code;
-- Expected: 23 rows. Method distribution: raw_sum (15 incl. TNEA), entrance_only (3),
-- normalized_composite (2), jee_rank_primary (1), jee_or_nata_merit (1), nata_or_jee_p2 (1).

-- 3c. Distinct states
SELECT COUNT(DISTINCT state) FROM counseling_systems;
-- Expected: 21

-- 3d. Bodies accepting JEE Main Paper 2
SELECT code FROM counseling_systems
WHERE 'JEE_Main_Paper_2' = ANY(exams_accepted)
ORDER BY code;
-- Expected: 15 bodies (MAHACET, ACPC, REAP, MPDTE, HPTU, JKBOPEE, HSTES, KCET, UPTAC,
-- WBJEEB, APSCHE, TSCHE, OJEE, BCECEB, CGDTE). TNEA should NOT appear.

-- 3e. TNEA row not touched
SELECT short_name, name, jsonb_array_length(categories) AS cat_count
FROM counseling_systems WHERE code = 'TNEA_BARCH';
-- Expected: TNEA / "TNEA B.Arch Counseling" / cat_count=7
```

If 3e shows `cat_count=5`, the TNEA row was overwritten — stop and investigate. The migration uses `ON CONFLICT (code) DO NOTHING` so this should be impossible, but verify.

- [ ] **Step 4: If apply failed — diagnose**

Common failure modes:
- **JSONB parse error**: Look for a misplaced quote in the affected INSERT. Re-emit just that one INSERT via `mcp__supabase-staging__execute_sql`.
- **`ON CONFLICT` constraint missing**: confirm `counseling_systems` has a UNIQUE index/constraint on `code`. Run `\d counseling_systems` equivalent: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='counseling_systems';` — if no unique on code, the migration cannot use ON CONFLICT (code). In that case, fix the migration to use `WHERE NOT EXISTS (SELECT 1 FROM counseling_systems WHERE code = '<code>')` per insert.
- **Slug uniqueness**: if `slug` is also UNIQUE on the table, two rows with same slug would collide. Confirm via the same `pg_indexes` query.

After diagnosing, fix the local migration file, redo Step 2.

- [ ] **Step 5: Commit verification result (optional, in conversation only)**

Report row counts back to the user. No code change.

---

## Task 5: (Out of band — user-triggered) Apply to production

**Files:** none.

- [ ] **Step 1: Wait for explicit user instruction.**

Per the project's auto-memory and CLAUDE.md, **never apply to production without explicit user command**. The migration sits in `packages/database/supabase/migrations/` and is idempotent.

When user says "apply to production" (or similar):

- [ ] **Step 2: Apply via `mcp__supabase-prod__apply_migration`**

Same name (`counseling_systems_seed_22_bodies`), same migration content.

- [ ] **Step 3: Run the same verification queries from Task 4 Step 3 against `mcp__supabase-prod__execute_sql`**

Expected results identical to staging.

---

## Task 6: Final cleanup + regenerate types (optional)

**Files:** possibly `packages/database/src/types/database.generated.ts` (regenerated, not hand-edited).

- [ ] **Step 1: (Optional) Run `pnpm supabase:gen:types`**

Only schema-level changes regenerate the types file. Since this migration is data-only (no new columns), the generated types file should be unchanged. Skip unless you want to confirm: `git diff packages/database/src/types/database.generated.ts` should show no diff.

- [ ] **Step 2: Final commit if not already batched**

```bash
git status
# If there are uncommitted changes from Tasks 1-3:
git add packages/database/supabase/migrations/20260520200000_counseling_systems_seed_24_bodies.sql
git commit -m "$(cat <<'EOF'
feat(database): seed 22 NATA-based B.Arch counseling_systems rows

Adds rows for KEAM, MAHACET, ACPC, CEPT, REAP, MPDTE, HPTU, IKGPTU,
JKBOPEE, HSTES, GGSIPU, JMI, DTEGOA, UTU, KCET, UPTAC, WBJEEB, APSCHE,
TSCHE, OJEE, BCECEB, CGDTE. Existing TNEA_BARCH unchanged.

Schema unchanged; data-only migration. Generic 5-category placeholder
(GEN/OBC/SC/ST/EWS) seeded per body; real state-specific categories land
with cutoff ingestion. merit_formula reshaped to existing
{method, components, total_marks} convention.

Spec: docs/superpowers/specs/2026-05-20-counseling-bodies-foundation-design.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Report final state**

In the conversation reply to the user, summarize:
- Migration file path
- Number of new rows on staging (expect 22 inserts → 23 total)
- Confirmation TNEA row is untouched
- Reminder that production apply requires explicit user command

---

## Self-review checklist (for the executor)

After Task 4 succeeds on staging, run one final sanity pass:

1. **Spec coverage:**
   - §2 field mapping → handled in every INSERT ✓
   - §3 merit_formula five strategies → 14 raw_sum, 3 entrance_only, 2 normalized_composite, 1 jee_rank_primary, 1 jee_or_nata_merit, 1 nata_or_jee_p2 ✓
   - §4 exams_accepted mapping → applied per body ✓
   - §5 generic categories → embedded in every INSERT ✓
   - §6 special_reservations only where explicit → ACPC, MPDTE, IKGPTU, GGSIPU populated; rest NULL ✓
   - §7 typical_counseling_months → populated per spec table, NULL where unclear ✓
   - §9 verification queries → encoded in Task 4 Step 3 ✓
   - §10 rollout (staging-first, prod on user command) → Tasks 4 + 5 ✓

2. **No new tables/types/queries added.** ✓

3. **TNEA row not touched.** Verified by `ON CONFLICT DO NOTHING` and Task 4 Step 3e check.

4. **Idempotency.** Re-running the migration is a no-op.

---

## Anti-patterns to avoid (specific to this task)

- **Don't use `ON CONFLICT (code) DO UPDATE`** — that would overwrite the curated TNEA row.
- **Don't hand-roll JSONB string concatenation in SQL** — write the JSON literal directly, properly escaped.
- **Don't regenerate `database.generated.ts` and commit it as part of this migration** — the schema didn't change. If regeneration shows a diff, that's a clue something unexpected happened.
- **Don't apply to production until user explicitly asks** — Task 5 is gated.
- **Don't add new columns (`body_type`, etc.) as part of this migration** — that was an option deliberately rejected in brainstorming.

---

**End of plan.**
