-- Migration: Backfill missing data + add new colleges + dedup/deactivate for TN/KL/AP/KA
-- Scope: Tamil Nadu, Kerala, Andhra Pradesh, Karnataka (Neram's home-market states)
-- Sources: NIRF 2024, official college websites, KEAM 2024 fee notification, TNEA 2024 brochure
-- Idempotent: UPDATEs are slug-scoped; INSERT uses ON CONFLICT (slug) DO NOTHING

-- ============================================================
-- SECTION 1: BACKFILL existing rows
-- ============================================================

-- ---------- TAMIL NADU ----------

-- High-priority government / NIRF-ranked
UPDATE colleges SET established_year = 1964, total_barch_seats = 40, annual_fee_approx = 145000,
  website = 'https://www.nitt.edu', courses_offered = ARRAY['B.Arch','M.Arch','PhD'],
  nirf_rank_architecture = 8, nirf_year = 2024, data_completeness = 100, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'nit-trichy-architecture';

UPDATE colleges SET established_year = 1951, website = 'https://www.psgtech.edu',
  courses_offered = ARRAY['B.Arch'], data_completeness = 64, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'psg-college-architecture';

UPDATE colleges SET established_year = 1997, website = 'https://www.periyaruniversity.ac.in',
  data_completeness = 55, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'periyar-university-architecture';

-- Tier-1 deemed universities
UPDATE colleges SET established_year = 1984, total_barch_seats = 80, annual_fee_approx = 200000,
  website = 'https://crescent.education', courses_offered = ARRAY['B.Arch','M.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'crescent-architecture';

UPDATE colleges SET established_year = 1984, total_barch_seats = 120, annual_fee_approx = 198000,
  website = 'https://vit.ac.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'vit-vellore-architecture';

UPDATE colleges SET established_year = 1987, total_barch_seats = 80, annual_fee_approx = 235000,
  website = 'https://www.sathyabama.ac.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'sathyabama-architecture';

UPDATE colleges SET established_year = 1985, total_barch_seats = 120, annual_fee_approx = 275000,
  website = 'https://www.srmist.edu.in', courses_offered = ARRAY['B.Arch','M.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'srm-architecture';

UPDATE colleges SET established_year = 1988, total_barch_seats = 80, annual_fee_approx = 175000,
  website = 'https://www.drmgrdu.ac.in', courses_offered = ARRAY['B.Arch'],
  nirf_rank_architecture = 22, nirf_year = 2024,
  data_completeness = 100, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'dr-mgr-architecture';

UPDATE colleges SET established_year = 1985, total_barch_seats = 80, annual_fee_approx = 187500,
  website = 'https://www.hindustanuniv.ac.in', courses_offered = ARRAY['B.Arch','M.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'hits-architecture';

UPDATE colleges SET established_year = 1984, total_barch_seats = 60, annual_fee_approx = 125000,
  website = 'https://kalasalingam.ac.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'kalasalingam-architecture';

UPDATE colleges SET established_year = 2005, total_barch_seats = 60, annual_fee_approx = 200000,
  website = 'https://www.saveetha.com', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'scad-saveetha-architecture';

UPDATE colleges SET established_year = 1985, total_barch_seats = 40, annual_fee_approx = 120000,
  website = 'https://www.prist.ac.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'prist-architecture';

UPDATE colleges SET established_year = 2005, total_barch_seats = 40, annual_fee_approx = 185000,
  website = 'https://www.chettinadhealthcity.com', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'chettinad-architecture';

UPDATE colleges SET established_year = 1988, total_barch_seats = 40, annual_fee_approx = 85000,
  website = 'https://pmu.edu', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'pmist-thanjavur-architecture';

-- Private (smaller)
UPDATE colleges SET established_year = 2009, total_barch_seats = 40, annual_fee_approx = 55000,
  website = 'https://dscat.ac.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'dhanalakshmi-srinivasan-architecture';

UPDATE colleges SET established_year = 2010, total_barch_seats = 80, annual_fee_approx = 145000,
  website = 'https://www.jayasoa.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'jaya-architecture';

UPDATE colleges SET established_year = 2009, total_barch_seats = 60, annual_fee_approx = 125000,
  website = 'https://kpriet.ac.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'kpr-architecture';

UPDATE colleges SET established_year = 1984, total_barch_seats = 40, annual_fee_approx = 110000,
  website = 'https://www.kct.ac.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'kumaraguru-architecture';

UPDATE colleges SET established_year = 2010, total_barch_seats = 40, annual_fee_approx = 55000,
  website = 'https://www.mamsoa.com', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'mam-architecture';

UPDATE colleges SET established_year = 2008, total_barch_seats = 40, annual_fee_approx = 55000,
  website = 'https://periyarsoa.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'periyar-namakkal-architecture';

UPDATE colleges SET established_year = 2018, total_barch_seats = 40, annual_fee_approx = 55000,
  courses_offered = ARRAY['B.Arch'],
  data_completeness = 82, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'prime-nest-architecture';

UPDATE colleges SET established_year = 2002, total_barch_seats = 80, annual_fee_approx = 55000,
  website = 'https://www.rvsschoolofarchitecture.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'rvs-coimbatore-architecture';

UPDATE colleges SET established_year = 1998, total_barch_seats = 40, annual_fee_approx = 55000,
  website = 'https://www.sonatech.ac.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'sona-architecture';

UPDATE colleges SET established_year = 2009, total_barch_seats = 40, annual_fee_approx = 50000,
  website = 'https://www.suryagroups.org', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'surya-architecture';

UPDATE colleges SET established_year = 2009, total_barch_seats = 40, annual_fee_approx = 55000,
  website = 'https://svsarch.in', courses_offered = ARRAY['B.Arch'],
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'svs-architecture';

-- ---------- KERALA (KEAM self-financing colleges) ----------
-- Default KEAM self-financing tuition: ₹65,000/year (where no specific source)

UPDATE colleges SET established_year = 2010, annual_fee_approx = 65000,
  website = 'https://abatearchitecture.org',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'abate-kerala-architecture';

UPDATE colleges SET established_year = 2015, annual_fee_approx = 85000,
  website = 'https://avani.edu.in',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'avani-kerala-architecture';

UPDATE colleges SET established_year = 2009, annual_fee_approx = 65000,
  website = 'https://www.bji.edu.in',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'bishop-jerome-kerala-architecture';

UPDATE colleges SET established_year = 2005, annual_fee_approx = 65000,
  website = 'https://iesarch.org',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'ies-kerala-architecture';

UPDATE colleges SET established_year = 2010, annual_fee_approx = 65000,
  website = 'https://kmeacoa.org',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'kmea-kerala-architecture';

UPDATE colleges SET established_year = 2008, annual_fee_approx = 65000,
  website = 'https://www.mariancollegekuttikkanam.org',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'marian-kerala-architecture';

UPDATE colleges SET established_year = 2010, annual_fee_approx = 65000,
  website = 'https://www.scmskerala.org',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'scms-kerala-architecture';

UPDATE colleges SET established_year = 2010, annual_fee_approx = 65000,
  website = 'https://www.thejus.org',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'thejus-kerala-architecture';

UPDATE colleges SET established_year = 2002, annual_fee_approx = 65000,
  website = 'https://tkmsa.ac.in',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'tkm-kerala-architecture';

-- Remaining 13 Kerala KEAM rows: set annual_fee default; year/website left NULL
UPDATE colleges SET annual_fee_approx = 65000,
  data_completeness = 73, updated_by = 'gap_fill_2026_05'
  WHERE slug IN (
    'asian-school-kerala-architecture',
    'dc-school-vagamon-kerala-architecture',
    'devaki-amma-kerala-architecture',
    'dc-school-kinfra-kerala-architecture',
    'eranad-kerala-architecture',
    'kmct-poolakode-kerala-architecture',
    'mes-kakkodi-kerala-architecture',
    'mangalam-kerala-architecture',
    'mes-kuttippuram-kerala-architecture',
    'kmct-manassery-kerala-architecture',
    'nehru-kerala-architecture',
    'vellanad-kerala-architecture',
    'seed-apj-kerala-architecture'
  );

-- ---------- ANDHRA PRADESH ----------
UPDATE colleges SET established_year = 2008, total_barch_seats = 170, annual_fee_approx = 120000,
  website = 'https://spav.ac.in', courses_offered = ARRAY['B.Arch','M.Arch','M.Plan','PhD'],
  nirf_rank_architecture = 16, nirf_year = 2024, type = 'Government',
  data_completeness = 100, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'spa-vijayawada-architecture';

-- ---------- KARNATAKA ----------
UPDATE colleges SET established_year = 2017, total_barch_seats = 60, annual_fee_approx = 325000,
  website = 'https://christuniversity.in', courses_offered = ARRAY['B.Arch','M.Arch'],
  type = 'Deemed',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'christ-university-architecture';

UPDATE colleges SET established_year = 2014, total_barch_seats = 80, annual_fee_approx = 255000,
  website = 'https://www.dsu.edu.in', courses_offered = ARRAY['B.Arch'],
  type = 'Private',
  data_completeness = 91, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'dayananda-sagar-architecture';

UPDATE colleges SET established_year = 2014, total_barch_seats = 80, annual_fee_approx = 290000,
  website = 'https://msruas.ac.in', courses_offered = ARRAY['B.Arch','M.Arch'],
  type = 'Private', nirf_rank_architecture = 21, nirf_year = 2024,
  data_completeness = 100, updated_by = 'gap_fill_2026_05'
  WHERE slug = 'ms-ramaiah-architecture';

-- ============================================================
-- SECTION 2: INSERT new verified COA-approved B.Arch colleges
-- ============================================================

INSERT INTO colleges (
  name, slug, short_name,
  state, state_slug, city, city_slug,
  type, established_year,
  accepted_exams, courses_offered,
  total_barch_seats, annual_fee_approx,
  website, coa_approved,
  neram_tier, is_active, verified,
  data_source, data_completeness,
  contact_status, outreach_count
) VALUES

-- Tamil Nadu (4 new)
('Easwari Engineering College School of Architecture', 'easwari-architecture', 'Easwari',
 'Tamil Nadu', 'tamil-nadu', 'Chennai', 'chennai',
 'Private', 1996,
 ARRAY['NATA','JEE Main','TNEA'], ARRAY['B.Arch'],
 40, 110000,
 'https://www.eec.srmrmp.edu.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('Vels Institute of Science Technology and Advanced Studies', 'vels-architecture', 'VISTAS',
 'Tamil Nadu', 'tamil-nadu', 'Chennai', 'chennai',
 'Deemed', 2008,
 ARRAY['NATA','JEE Main'], ARRAY['B.Arch'],
 60, 145000,
 'https://www.velsuniv.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('Bharath Institute of Higher Education and Research', 'bharath-architecture', 'BIHER',
 'Tamil Nadu', 'tamil-nadu', 'Chennai', 'chennai',
 'Deemed', 1984,
 ARRAY['NATA','JEE Main'], ARRAY['B.Arch'],
 60, 145000,
 'https://www.bharathuniv.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('Tagore Engineering College School of Architecture', 'tagore-architecture', 'Tagore',
 'Tamil Nadu', 'tamil-nadu', 'Chennai', 'chennai',
 'Private', 1999,
 ARRAY['NATA','JEE Main','TNEA'], ARRAY['B.Arch'],
 40, 95000,
 'https://tagore-engg.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

-- Kerala (3 new)
('Government Engineering College Thrissur Department of Architecture', 'gec-thrissur-architecture', 'GEC Thrissur',
 'Kerala', 'kerala', 'Thrissur', 'thrissur',
 'Government', 1957,
 ARRAY['KEAM','JEE Main','NATA'], ARRAY['B.Arch'],
 40, 43250,
 'https://gectcr.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('Cochin University of Science and Technology Department of Architecture', 'cusat-architecture', 'CUSAT',
 'Kerala', 'kerala', 'Kochi', 'kochi',
 'Government', 1979,
 ARRAY['KEAM','JEE Main'], ARRAY['B.Arch'],
 40, 36000,
 'https://cusat.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('TKM College of Engineering Department of Architecture', 'tkm-engineering-architecture', 'TKMCE',
 'Kerala', 'kerala', 'Kollam', 'kollam',
 'Government', 1958,
 ARRAY['KEAM','JEE Main'], ARRAY['B.Arch'],
 40, 45000,
 'https://tkmce.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

-- Andhra Pradesh (5 new)
('K L University School of Architecture', 'kl-university-architecture', 'KLU',
 'Andhra Pradesh', 'andhra-pradesh', 'Vaddeswaram', 'vaddeswaram',
 'Deemed', 2009,
 ARRAY['NATA','JEE Main'], ARRAY['B.Arch'],
 60, 200000,
 'https://www.kluniversity.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('SRM University AP School of Architecture', 'srm-ap-architecture', 'SRM AP',
 'Andhra Pradesh', 'andhra-pradesh', 'Amaravati', 'amaravati',
 'Private', 2017,
 ARRAY['NATA','JEE Main'], ARRAY['B.Arch'],
 60, 250000,
 'https://srmap.edu.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('Vignans Foundation for Science Technology and Research', 'vignan-architecture', 'Vignan',
 'Andhra Pradesh', 'andhra-pradesh', 'Guntur', 'guntur',
 'Deemed', 1997,
 ARRAY['NATA','JEE Main'], ARRAY['B.Arch'],
 60, 150000,
 'https://www.vignan.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('Gayatri Vidya Parishad College of Engineering', 'gvpce-architecture', 'GVPCE',
 'Andhra Pradesh', 'andhra-pradesh', 'Visakhapatnam', 'visakhapatnam',
 'Private', 1996,
 ARRAY['AP EAPCET','NATA'], ARRAY['B.Arch'],
 40, 110000,
 'https://www.gvpce.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('Vaishnavi School of Architecture and Planning', 'vaishnavi-ap-architecture', 'VSAP',
 'Andhra Pradesh', 'andhra-pradesh', 'Hyderabad', 'hyderabad',
 'Private', 2008,
 ARRAY['NATA'], ARRAY['B.Arch'],
 60, 90000,
 'https://vsap.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

-- Karnataka (5 new)
('Acharyas NRV School of Architecture', 'acharya-nrv-architecture', 'Acharya NRV',
 'Karnataka', 'karnataka', 'Bangalore', 'bangalore',
 'Private', 2007,
 ARRAY['NATA','KCET'], ARRAY['B.Arch'],
 80, 215000,
 'https://www.acharya.ac.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('REVA University School of Architecture', 'reva-architecture', 'REVA',
 'Karnataka', 'karnataka', 'Bangalore', 'bangalore',
 'Private', 2012,
 ARRAY['NATA','KCET'], ARRAY['B.Arch'],
 60, 285000,
 'https://www.reva.edu.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('PES University Faculty of Architecture', 'pes-architecture', 'PES',
 'Karnataka', 'karnataka', 'Bangalore', 'bangalore',
 'Deemed', 1972,
 ARRAY['NATA','KCET'], ARRAY['B.Arch'],
 60, 350000,
 'https://pes.edu', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('Nitte School of Architecture Bangalore', 'nitte-architecture', 'NSAB',
 'Karnataka', 'karnataka', 'Bangalore', 'bangalore',
 'Private', 2016,
 ARRAY['NATA','KCET'], ARRAY['B.Arch'],
 60, 195000,
 'https://nsab.edu.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0),

('Mysore School of Architecture', 'msa-mysore-architecture', 'MSA Mysore',
 'Karnataka', 'karnataka', 'Mysuru', 'mysuru',
 'Private', 2014,
 ARRAY['NATA','KCET'], ARRAY['B.Arch'],
 80, 175000,
 'https://msa.edu.in', TRUE,
 'free', TRUE, FALSE, 'gap_fill_2026_05', 91, 'never_contacted', 0)

ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- SECTION 3: DEACTIVATE duplicates and polytechnics
-- ============================================================

-- Soft-deactivate duplicate rows (keep the one with more data)
UPDATE colleges SET is_active = FALSE, updated_by = 'gap_fill_2026_05'
  WHERE slug IN (
    'karpagam-academy-architecture',
    'thiagarajar-college-architecture',
    'prime-nagapattinam-architecture'
  );

-- Soft-deactivate polytechnic colleges (not B.Arch institutions)
UPDATE colleges SET is_active = FALSE, updated_by = 'gap_fill_2026_05'
  WHERE slug IN (
    'ayyanadar-janakiammal-architecture',
    'mohamed-sathak-polytechnic-keelakarai'
  );
