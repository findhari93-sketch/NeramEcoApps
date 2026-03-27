-- WhatsApp Template Categories
CREATE TABLE public.wa_template_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WhatsApp Templates
CREATE TABLE public.wa_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.wa_template_categories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  placeholders TEXT[] NOT NULL DEFAULT '{}',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_wa_templates_category_active ON public.wa_templates(category_id, sort_order) WHERE NOT is_archived;
CREATE INDEX idx_wa_template_categories_sort ON public.wa_template_categories(sort_order);

-- RLS
ALTER TABLE public.wa_template_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read categories"
  ON public.wa_template_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage categories"
  ON public.wa_template_categories FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read templates"
  ON public.wa_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage templates"
  ON public.wa_templates FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- Seed categories
INSERT INTO public.wa_template_categories (name, slug, sort_order) VALUES
  ('First Enquiry', 'first-enquiry', 1),
  ('Follow-up', 'follow-up', 2),
  ('Fee Discussion', 'fee-discussion', 3),
  ('Objection Handling', 'objection-handling', 4),
  ('General', 'general', 5);

-- Seed templates
-- First Enquiry: Template 1
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'First Enquiry — Parent',
  E'Hi! Thank you for reaching out to Neram Classes.\n\nI''m Hari, the founder. I''m a B.Arch graduate from NIT Trichy and I personally train every student here.\n\nA quick snapshot of what we do:\n• Our student scored AIR 1 in JEE B.Arch 2024\n• We consistently produce 99.9 percentile results\n• Complete coaching for Mathematics, Drawing & Aptitude\n\nWhat makes us different is that we''ve built a full digital learning platform (app.neramclasses.com) specifically for architecture entrance preparation — with practice question banks, tools, and a parent tracking portal. No other NATA/JEE coaching in India has this.\n\nCould I know {{student_name}}''s current class and which exam they''re targeting? I''d be happy to walk you through how the program works — takes just 5 minutes on a call.',
  ARRAY['student_name'],
  1,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'first-enquiry';

-- First Enquiry: Template 2
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'First Enquiry — Student',
  E'Hi! Welcome to Neram Classes.\n\nI''m Hari — NIT Trichy B.Arch graduate, and I''ll be your trainer. Our 2024 batch produced AIR 1 in JEE B.Arch, and we''ve been consistently hitting 99.9 percentile every year.\n\nWe cover Maths, Drawing & Aptitude end-to-end, and you''ll also get access to our own learning app with a question bank, drawing tools, and progress tracking that no other coaching offers.\n\nWhich exam are you targeting — NATA, JEE, or both? And which class are you in currently? I can explain the right program for you.',
  ARRAY[]::TEXT[],
  2,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'first-enquiry';

-- Follow-up: Template 3
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'Follow-up — No Response (24-48 hrs)',
  E'Hi {{student_name}}, just following up on your enquiry about NATA/JEE coaching.\n\nI thought you might find this useful — you can explore some of our free architecture entrance tools here: app.neramclasses.com\n\nIt has an exam center locator, college approval checker, and more. Built by us specifically for architecture aspirants.\n\nWhenever you''re ready to discuss, I''m here. No rush at all.',
  ARRAY['student_name'],
  1,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'follow-up';

-- Follow-up: Template 4
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'Follow-up — After Call (Program Details)',
  E'Hi {{parent_name}}, great speaking with you!\n\nAs discussed, here''s a summary of the {{program}} program for {{student_name}}:\n\n• Complete NATA + JEE B.Arch preparation\n• Mathematics, Drawing & Aptitude — taught by me personally\n• Access to our learning app with question banks & practice tools\n• Parent portal to track your child''s progress\n• Regular mock tests and performance reviews\n\nFee: ₹{{fee}} for the year (single payment)\nOr ₹{{installment_fee}} + ₹{{installment_fee}} in two installments\n\nClasses are already running, so {{student_name}} can join anytime and we''ll help them catch up.\n\nLet me know if you have any questions!',
  ARRAY['parent_name', 'program', 'student_name', 'fee', 'installment_fee'],
  2,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'follow-up';

-- Fee Discussion: Template 5
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'Fee Justification — Value Positioning',
  E'I completely understand — fees are an important factor.\n\nHere''s what I''d like you to consider: at ₹{{fee}}/year, we''re actually among the most affordable year-long programs for NATA/JEE B.Arch in India.\n\nBut beyond the fee, here''s what {{student_name}} gets that no other institute offers:\n• Training from an NIT Trichy B.Arch graduate (not just any tutor)\n• Our own learning app with practice question banks\n• A parent portal where you can track progress anytime\n• Proven results — AIR 1 in 2024, 99.9 percentile consistently\n\nMost institutes only give you live classes and a WhatsApp group. We''ve built an entire digital ecosystem for your child''s preparation.\n\nI''d be happy to show you a quick walkthrough of the app so you can see the difference firsthand.',
  ARRAY['fee', 'student_name'],
  1,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'fee-discussion';

-- Objection Handling: Template 6
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'Objection — Other Institutes More Established',
  E'That''s a fair point — some institutes have been around longer.\n\nBut I''d ask you to look at two things: results and infrastructure.\n\nOur 2024 batch produced the AIR 1 rank holder in JEE B.Arch. That''s not just good — that''s the best result in the country. And we do this consistently.\n\nOn infrastructure — we''re the only NATA/JEE coaching in India that has built its own learning platform. {{student_name}} gets app-based practice, and you as a parent get visibility into their progress. Older institutes are still running on WhatsApp groups and PDF materials.\n\nI''d love to give you a 5-minute demo of how it works. Would that be helpful?',
  ARRAY['student_name'],
  1,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'objection-handling';

-- Objection Handling: Template 7
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'Objection — Still Exploring Options',
  E'Absolutely, take your time — this is an important decision.\n\nIn the meanwhile, {{student_name}} can start exploring our free tools at app.neramclasses.com — there''s a question bank with previous year JEE questions, a college approval checker, exam center locator, and more. No login needed.\n\nThis way they can get a feel for how we approach preparation. And whenever you''re ready to discuss further, I''m just a message away.',
  ARRAY['student_name'],
  2,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'objection-handling';

-- General: Template 8
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'Quick Intro — For Referrals',
  E'Hi {{parent_name}}! I''m Hari from Neram Classes — {{student_name}}''s friend/family suggested you reach out to us for NATA/JEE B.Arch coaching.\n\nQuick intro: I''m an NIT Trichy B.Arch graduate and I personally train every student. Our student scored AIR 1 in JEE B.Arch 2024.\n\nWould you like to know more about our program? I can share details or set up a quick call — whatever works best for you.',
  ARRAY['parent_name', 'student_name'],
  1,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'general';

-- General: Template 9
INSERT INTO public.wa_templates (category_id, title, body, placeholders, sort_order, created_by, updated_by)
SELECT c.id,
  'Enrollment Confirmation',
  E'Welcome to Neram Classes, {{student_name}}! 🎉\n\nWe''re excited to have you on board. Here''s what happens next:\n\n1. You''ll be added to our classroom batch\n2. You''ll receive access to our learning app: app.neramclasses.com\n3. Your parent will get Nexus portal access for progress tracking\n4. Class schedule and materials will be shared shortly\n\nIf you have any questions at all, just message here. Looking forward to working with you!',
  ARRAY['student_name'],
  2,
  'system',
  'system'
FROM public.wa_template_categories c WHERE c.slug = 'general';
