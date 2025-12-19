-- ============================================
-- NERAM CLASSES - SEED DATA
-- ============================================

-- Seed courses
INSERT INTO courses (name, slug, course_type, duration_months, regular_fee, discounted_fee, short_description, features, is_featured, display_order) VALUES
('NATA Preparation', 'nata-preparation', 'nata', 6, 25000, 22000, 'Complete preparation for National Aptitude Test in Architecture', ARRAY['Live online classes', 'Drawing & sketching practice', 'Mock tests with feedback', 'Study materials included', 'Doubt clearing sessions'], true, 1),
('JEE Paper 2 Preparation', 'jee-paper2-preparation', 'jee_paper2', 8, 30000, 27000, 'Focused coaching for JEE Main Paper 2 (B.Arch/B.Planning)', ARRAY['Math & aptitude coaching', 'Drawing techniques', 'Previous year solutions', 'Doubt clearing sessions', 'Weekly tests'], true, 2),
('NATA + JEE Combined', 'nata-jee-combined', 'both', 10, 45000, 40000, 'Best value package for both exams', ARRAY['All NATA features', 'All JEE Paper 2 features', 'Combined study plan', 'Maximum practice', 'Priority support'], true, 3),
('Revit Architecture', 'revit-architecture', 'revit', 2, 10000, 8000, 'Learn industry-standard BIM software', ARRAY['Hands-on projects', 'Industry workflows', 'Certificate provided', 'Portfolio building'], false, 4);

-- Seed email templates
INSERT INTO email_templates (name, slug, subject, body_html, variables) VALUES
('Application Received', 'application-received',
  '{"en": "Application Received - Neram Classes", "ta": "விண்ணப்பம் பெறப்பட்டது - நேரம் வகுப்புகள்"}',
  '{"en": "<h1>Thank you for your application!</h1><p>Dear {{name}},</p><p>We have received your application for {{course}}. Our team will review it and get back to you within 24-48 hours.</p>", "ta": "<h1>உங்கள் விண்ணப்பத்திற்கு நன்றி!</h1><p>அன்புள்ள {{name}},</p><p>{{course}} க்கான உங்கள் விண்ணப்பத்தைப் பெற்றோம்.</p>"}',
  ARRAY['name', 'course']),

('Application Approved', 'application-approved',
  '{"en": "Congratulations! Your Application is Approved - Neram Classes", "ta": "வாழ்த்துக்கள்! உங்கள் விண்ணப்பம் அங்கீகரிக்கப்பட்டது"}',
  '{"en": "<h1>Your application has been approved!</h1><p>Dear {{name}},</p><p>We are pleased to inform you that your application for {{course}} has been approved.</p><p><strong>Fee Details:</strong></p><p>Course Fee: ₹{{fee}}</p><p>Discount: ₹{{discount}}</p><p>Final Amount: ₹{{final_amount}}</p><p><a href=\"{{payment_link}}\">Click here to complete payment</a></p>", "ta": "..."}',
  ARRAY['name', 'course', 'fee', 'discount', 'final_amount', 'payment_link']),

('Application Rejected', 'application-rejected',
  '{"en": "Application Update - Neram Classes", "ta": "விண்ணப்ப புதுப்பிப்பு"}',
  '{"en": "<h1>Application Update</h1><p>Dear {{name}},</p><p>We regret to inform you that your application could not be approved at this time.</p><p><strong>Reason:</strong> {{reason}}</p><p>If you have any questions, please contact us.</p>", "ta": "..."}',
  ARRAY['name', 'reason']),

('Payment Confirmed', 'payment-confirmed',
  '{"en": "Payment Confirmed - Welcome to Neram Classes!", "ta": "பணம் செலுத்தப்பட்டது - நேரம் வகுப்புகளுக்கு வரவேற்கிறோம்!"}',
  '{"en": "<h1>Welcome to Neram Classes!</h1><p>Dear {{name}},</p><p>Your payment of ₹{{amount}} has been confirmed.</p><p><strong>Receipt Number:</strong> {{receipt_number}}</p><p><strong>Course:</strong> {{course}}</p><p><strong>Batch:</strong> {{batch}}</p><p>You will receive your Microsoft Teams login credentials shortly.</p>", "ta": "..."}',
  ARRAY['name', 'amount', 'receipt_number', 'course', 'batch']);

-- Seed some sample colleges for tools
INSERT INTO colleges (name, slug, city, state, type, nirf_rank, rating, annual_fee_min, annual_fee_max, courses_offered) VALUES
('IIT Kharagpur', 'iit-kharagpur', 'Kharagpur', 'West Bengal', 'government', 1, 4.8, 200000, 300000, ARRAY['B.Arch']),
('IIT Roorkee', 'iit-roorkee', 'Roorkee', 'Uttarakhand', 'government', 2, 4.7, 200000, 300000, ARRAY['B.Arch', 'B.Planning']),
('NIT Trichy', 'nit-trichy', 'Tiruchirappalli', 'Tamil Nadu', 'government', 5, 4.5, 150000, 200000, ARRAY['B.Arch']),
('SPA Delhi', 'spa-delhi', 'New Delhi', 'Delhi', 'government', 3, 4.6, 100000, 150000, ARRAY['B.Arch', 'B.Planning']),
('CEPT University', 'cept-university', 'Ahmedabad', 'Gujarat', 'deemed', 4, 4.5, 400000, 500000, ARRAY['B.Arch']);

-- Seed sample cutoff data
INSERT INTO cutoff_data (college_id, year, exam_type, round, general_cutoff, obc_cutoff, sc_cutoff, st_cutoff)
SELECT id, 2024, 'JEE_PAPER_2', 1, 150, 140, 120, 100 FROM colleges WHERE slug = 'iit-kharagpur';

INSERT INTO cutoff_data (college_id, year, exam_type, round, general_cutoff, obc_cutoff, sc_cutoff, st_cutoff)
SELECT id, 2024, 'JEE_PAPER_2', 1, 145, 135, 115, 95 FROM colleges WHERE slug = 'iit-roorkee';

INSERT INTO cutoff_data (college_id, year, exam_type, round, general_cutoff, obc_cutoff, sc_cutoff, st_cutoff)
SELECT id, 2024, 'JEE_PAPER_2', 1, 130, 120, 100, 80 FROM colleges WHERE slug = 'nit-trichy';

INSERT INTO cutoff_data (college_id, year, exam_type, round, general_cutoff, obc_cutoff, sc_cutoff, st_cutoff)
SELECT id, 2024, 'NATA', 1, 140, 130, 110, 90 FROM colleges WHERE slug = 'spa-delhi';

INSERT INTO cutoff_data (college_id, year, exam_type, round, general_cutoff, obc_cutoff, sc_cutoff, st_cutoff)
SELECT id, 2024, 'NATA', 1, 135, 125, 105, 85 FROM colleges WHERE slug = 'cept-university';

-- Seed sample exam centers
INSERT INTO exam_centers (name, code, city, state, address, pincode, exam_types, capacity) VALUES
('Chennai Center 1', 'CHE001', 'Chennai', 'Tamil Nadu', 'IIT Madras Campus, Guindy', '600036', ARRAY['NATA', 'JEE_PAPER_2']::exam_type[], 200),
('Bangalore Center 1', 'BLR001', 'Bangalore', 'Karnataka', 'UVCE Campus, K.R. Circle', '560001', ARRAY['NATA', 'JEE_PAPER_2']::exam_type[], 150),
('Mumbai Center 1', 'MUM001', 'Mumbai', 'Maharashtra', 'IIT Bombay Campus, Powai', '400076', ARRAY['NATA', 'JEE_PAPER_2']::exam_type[], 250),
('Delhi Center 1', 'DEL001', 'New Delhi', 'Delhi', 'SPA Delhi Campus, IP Estate', '110002', ARRAY['NATA', 'JEE_PAPER_2']::exam_type[], 180),
('Hyderabad Center 1', 'HYD001', 'Hyderabad', 'Telangana', 'JNTU Campus, Kukatpally', '500085', ARRAY['NATA', 'JEE_PAPER_2']::exam_type[], 175);

-- Seed a sample coupon
INSERT INTO coupons (code, discount_type, discount_value, valid_until, max_uses, applicable_courses) VALUES
('WELCOME10', 'percentage', 10, NOW() + INTERVAL '90 days', 100, ARRAY['nata', 'jee_paper2', 'both']::course_type[]),
('EARLY2025', 'fixed', 2000, NOW() + INTERVAL '60 days', 50, ARRAY['nata', 'jee_paper2', 'both']::course_type[]);
