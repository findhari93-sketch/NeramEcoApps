-- Add Application Form document templates for NATA and JEE
-- These are shown during onboarding when a student has applied

INSERT INTO nexus_document_templates (name, description, category, applicable_standards, is_required, linked_exam, exam_state_threshold, sort_order, is_active)
VALUES
  ('NATA Application Summary', 'NATA application confirmation page / acknowledgement', 'exam', ARRAY['11th','12th','gap_year'], false, 'nata', 'applied', 15, true),
  ('JEE Application Form', 'JEE Main application form PDF / confirmation page', 'exam', ARRAY['11th','12th','gap_year'], false, 'jee', 'applied', 16, true)
ON CONFLICT DO NOTHING;
