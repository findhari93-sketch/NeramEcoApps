-- Tag assignments with a brief type, add perspective construction, and record
-- who switched a brief type on.
--
-- WHY
-- 69 of the 81 drawings waiting in production are assignment drawings, and none
-- of them resolves to a brief type: an assignment's backing question carries
-- sub_type = 'assignment', which is a marker that keeps those rows out of the
-- student practice bank, not a brief. So they can never be anchored, scored on
-- a fifth criterion, or drafted.
--
-- The fix is one explicit field on the assignment, NOT changing that sub_type.
-- drawings.ts documents sub_type = 'assignment' as the thing keeping 69
-- assignment briefs out of the practice list; rewriting it would leak them into
-- what students browse, with a symptom nobody would trace back here.
--
-- The field is optional and settable any time, including after submissions
-- arrive. Only the fifth rubric criterion depends on it, so retagging keeps the
-- other four scores.
--
-- PERSPECTIVE CONSTRUCTION is the most common assignment brief (one and two
-- point perspective of blocks, stairs and interiors) and had no brief type. It
-- is created inactive with the same observable checks as still life, and like
-- every brief type it stays off until its band wording is written by hand and
-- five anchors are set. The activation route enforces both.

INSERT INTO public.drawing_brief_type (key, category, sub_type, title, description, is_active)
VALUES
  ('3d_composition.perspective_construction', '3d_composition', 'perspective_construction',
   'Perspective construction',
   'Blocks, steps and interiors built in one, two or three point perspective, judged on construction, convergence and line.',
   false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.drawing_criterion (brief_type_id, key, title, observable_checks, sort_order)
SELECT b.id, c.key, c.title, c.checks::jsonb, c.sort_order
FROM public.drawing_brief_type b
CROSS JOIN (VALUES
  ('composition', 'Composition',
   '["The subject sits within the sheet with deliberate margins, not crowded into a corner or floating in empty space.","There is one clear focal point rather than several competing ones.","Objects overlap or are grouped to create depth, instead of being spaced evenly like a catalogue.","The arrangement is grounded, with a surface or base line rather than the subject hanging in white space."]',
   0),
  ('proportion', 'Proportion accuracy',
   '["Objects are correctly sized relative to one another.","Each object is internally consistent: a circular rim reads as an ellipse of the right width for its viewing angle.","Repeated elements keep a consistent size as they recede.","Symmetrical objects are symmetrical about their own axis."]',
   1),
  ('depth_perspective', 'Depth and perspective',
   '["Receding edges converge consistently towards a coherent vanishing point.","The eye level is consistent across every object in the scene.","Ellipses open and close correctly according to their height relative to eye level.","Overlap, scale and tone work together so nearer objects read as nearer."]',
   2),
  ('tonal_quality', 'Shading and tonal quality',
   '["There is a readable range from deep dark to clean light, not a uniform mid grey.","A single consistent light source explains every shadow in the drawing.","Pencil pressure is controlled, so gradients read as smooth rather than scratchy or patchy.","Cast shadows and form shadows are distinguished from each other."]',
   3),
  ('line_quality', 'Line quality',
   '["Outlines are confident single strokes rather than repeatedly sketched over.","Construction lines are either cleanly erased or deliberately kept as part of the drawing.","Line weight varies purposefully, heavier on near or shadowed edges.","Straight edges are straight and curves are continuous, without visible wobble."]',
   4)
) AS c(key, title, checks, sort_order)
WHERE b.key = '3d_composition.perspective_construction'
ON CONFLICT (brief_type_id, key) DO NOTHING;

-- Who switched a brief type on, and when. is_active alone cannot say.
ALTER TABLE public.drawing_brief_type
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- The assignment's brief. NULL means "not tagged": the shared four criteria.
ALTER TABLE public.nexus_class_assignments
  ADD COLUMN IF NOT EXISTS brief_type_id UUID REFERENCES public.drawing_brief_type(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nexus_class_assignments_brief_type
  ON public.nexus_class_assignments (brief_type_id)
  WHERE brief_type_id IS NOT NULL;

COMMENT ON COLUMN public.nexus_class_assignments.brief_type_id IS
  'The drawing brief this assignment sets. Optional, settable after submissions arrive; only the fifth rubric criterion depends on it. Never inferred from drawing_questions.sub_type.';
