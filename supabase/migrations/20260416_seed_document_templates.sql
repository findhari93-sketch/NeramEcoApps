-- ============================================
-- SEED DEFAULT DOCUMENT TEMPLATES
-- ============================================

INSERT INTO nexus_document_templates (name, description, category, applicable_standards, is_required, linked_exam, exam_state_threshold, sort_order)
VALUES
  ('Aadhaar Card', 'Upload a clear scan or photo of your Aadhaar card (front and back).', 'identity', '{10th,11th,12th,gap_year}', true, NULL, NULL, 1),
  ('Passport Photo', 'Recent passport-size photo with white background.', 'photo', '{10th,11th,12th,gap_year}', true, NULL, NULL, 2),
  ('10th Marksheet', 'Upload your 10th standard marksheet.', 'academic', '{10th,11th,12th,gap_year}', true, NULL, NULL, 10),
  ('11th Marksheet', 'Upload your 11th standard marksheet.', 'academic', '{11th,12th,gap_year}', true, NULL, NULL, 11),
  ('12th Marksheet', 'Upload your 12th standard marksheet.', 'academic', '{12th,gap_year}', true, NULL, NULL, 12),
  ('NATA Hall Ticket', 'Upload your NATA exam hall ticket after applying.', 'exam', '{11th,12th,gap_year}', false, 'nata', 'applied', 20),
  ('JEE Hall Ticket', 'Upload your JEE Paper 2 exam hall ticket after applying.', 'exam', '{11th,12th,gap_year}', false, 'jee', 'applied', 21),
  ('NATA Score Card', 'Upload your NATA score card after receiving results.', 'exam', '{12th,gap_year}', false, 'nata', 'completed', 30),
  ('JEE Score Card', 'Upload your JEE Paper 2 score card after receiving results.', 'exam', '{12th,gap_year}', false, 'jee', 'completed', 31)
ON CONFLICT DO NOTHING;
