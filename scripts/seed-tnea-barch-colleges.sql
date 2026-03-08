-- ============================================
-- Seed TNEA B.Arch College Directory
-- College codes and names from TNEA counseling (Tamil Nadu)
-- Source: COA Approved Institutions list
-- ============================================

-- Insert colleges using the TNEA_BARCH counseling system
-- Uses ON CONFLICT to upsert (update name/city if code already exists)

INSERT INTO counseling_college_directory (counseling_system_id, college_code, college_name, city)
SELECT cs.id, v.college_code, v.college_name, v.city
FROM counseling_systems cs
CROSS JOIN (VALUES
  ('3',    'School of Architecture and Planning, Anna University', 'Chennai'),
  ('1127', 'School of Architecture, St Peter''s College of Engineering and Technology', 'Chennai'),
  ('1129', 'Jaya School of Architecture', 'Chennai'),
  ('1130', 'MARG Institute of Design & Architecture Swarnabhoomi (MIDAS)', 'Kanchipuram'),
  ('1132', 'Rajalakshmi School of Architecture', 'Chennai'),
  ('1135', 'Aalim Muhammed Salegh Academy of Architecture', 'Chennai'),
  ('1144', 'RVS Padmavathy School of Architecture', 'Tiruvalluvar'),
  ('1146', 'Misrimal Navajee Munoth Jain School of Architecture', 'Chennai'),
  ('1152', 'CAAD-Chennai Academy of Architecture and Design', 'Chennai'),
  ('1308', 'Measi Academy of Architecture', 'Chennai'),
  ('1400', 'Mohamed Sathak A.J. Academy of Architecture', 'Kancheepuram'),
  ('1425', 'Surya School of Architecture', 'Villupuram'),
  ('1509', 'Meenakshi College of Engineering', 'Chennai'),
  ('1530', 'Papni School of Architecture', 'Kancheepuram'),
  ('2344', 'Kongu School of Architecture, Kongu Engineering College', 'Erode'),
  ('2348', 'San Academy of Architecture', 'Coimbatore'),
  ('2361', 'Sasi Creative School of Architecture', 'Coimbatore'),
  ('2364', 'School of Architecture, Coimbatore Institute of Engineering and Technology', 'Coimbatore'),
  ('2365', 'Nehru School of Architecture', 'Coimbatore'),
  ('2372', 'Park Institute of Architecture', 'Coimbatore'),
  ('2373', 'Hindusthan School of Architecture', 'Coimbatore'),
  ('2379', 'PSG Institute of Architecture and Planning', 'Coimbatore'),
  ('2601', 'Adhiyamaan College of Engineering (Autonomous)', 'Krishnagiri'),
  ('2667', 'EXCEL College of Architecture and Planning', 'Namakkal'),
  ('2684', 'Rathinam School of Architecture and Design', 'Coimbatore'),
  ('2728', 'Tamilnadu School of Architecture', 'Coimbatore'),
  ('2737', 'Sri Sai Ranganathan Engineering College', 'Coimbatore'),
  ('2759', 'McGan''s Ooty School of Architecture', 'The Nilgiris'),
  ('3446', 'Prime College of Architecture and Planning', 'Nagapattinam'),
  ('3467', 'Prime Nest College of Architecture and Planning', 'Tiruchirappalli'),
  ('3784', 'C.A.R.E. School of Architecture', 'Trichy'),
  ('4671', 'Sigma College of Architecture', 'Kanyakumari'),
  ('4679', 'Arul Tharum VPMM College of Architecture', 'Virudhunagar'),
  ('4935', 'Immanuel Arasar College of Architecture', 'Kanyakumari'),
  ('4960', 'Mepco Schlenk Engineering College (Autonomous)', 'Virudhunagar'),
  ('5008', 'Thiagarajar College of Engineering (Autonomous)', 'Madurai'),
  ('5863', 'R V S Educational Trust''s Group of Institutions', 'Dindigul'),
  ('5907', 'Mohamed Sathak Engineering College', 'Ramanathapuram')
) AS v(college_code, college_name, city)
WHERE cs.code = 'TNEA_BARCH'
ON CONFLICT (counseling_system_id, college_code)
DO UPDATE SET
  college_name = EXCLUDED.college_name,
  city = EXCLUDED.city,
  updated_at = now();
