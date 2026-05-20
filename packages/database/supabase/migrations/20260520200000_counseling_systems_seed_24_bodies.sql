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
