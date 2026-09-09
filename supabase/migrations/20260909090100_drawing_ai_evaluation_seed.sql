-- Seed the three brief types and their criteria.
--
-- The criteria are safe to seed because Hari wrote them: they are the headings
-- of buildFeedbackPrompt in apps/nexus/src/lib/drawing-prompt-templates.ts, and
-- the graded history confirms every review uses them. Across the 108 completed
-- reviews with real feedback, proportion appears in 108, composition in 108,
-- tone or shading in 107, line in 100, and a design principle in 79 of the 2D
-- ones. Perspective appears in 31, effectively all 3D, so depth_perspective is
-- on still_life only.
--
-- band_descriptions are left as an empty object DELIBERATELY. They cannot be
-- mined from the existing reviews: 97 of those 108 still carry Gemini's
-- "Overall Impression" heading, so the prose is largely unedited model output
-- pasted back from the manual workflow, and sampled band-2 sheets read as
-- praise. Seeding wording from that corpus would launder generic art critique
-- straight back in, which is the failure the feature exists to fix.
--
-- Consequently every brief type is created is_active = false. The anchor screen
-- shows exactly what is still outstanding, and buildContext refuses to evaluate
-- an inactive brief type, so nothing can quietly run on placeholder text.
--
-- The three chosen are the ones with graded depth in production:
-- still_life 35 graded across 19 questions, geometric_shapes 31 across 11,
-- logo 10 across 3, which together are 76 of the 129 graded sheets.

INSERT INTO public.drawing_brief_type (key, category, sub_type, title, description, is_active)
VALUES
  ('3d_composition.still_life', '3d_composition', 'still_life', 'Still life',
   'An arrangement of everyday objects drawn from observation, judged on form, depth and tonal control.',
   false),
  ('2d_composition.geometric_shapes', '2d_composition', 'geometric_shapes', 'Geometric composition',
   'A flat composition built from geometric elements under a stated colour or principle constraint.',
   false),
  ('2d_composition.logo', '2d_composition', 'logo', 'Logo design',
   'A mark judged on legibility at size, balance, and the discipline of its construction.',
   false)
ON CONFLICT (key) DO NOTHING;

-- Criteria shared by all three.
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
  ('tonal_quality', 'Shading and tonal quality',
   '["There is a readable range from deep dark to clean light, not a uniform mid grey.","A single consistent light source explains every shadow in the drawing.","Pencil pressure is controlled, so gradients read as smooth rather than scratchy or patchy.","Cast shadows and form shadows are distinguished from each other."]',
   3),
  ('line_quality', 'Line quality',
   '["Outlines are confident single strokes rather than repeatedly sketched over.","Construction lines are either cleanly erased or deliberately kept as part of the drawing.","Line weight varies purposefully, heavier on near or shadowed edges.","Straight edges are straight and curves are continuous, without visible wobble."]',
   4)
) AS c(key, title, checks, sort_order)
WHERE b.key IN ('3d_composition.still_life', '2d_composition.geometric_shapes', '2d_composition.logo')
ON CONFLICT (brief_type_id, key) DO NOTHING;

-- Depth and perspective: the 3D brief only.
INSERT INTO public.drawing_criterion (brief_type_id, key, title, observable_checks, sort_order)
SELECT b.id, 'depth_perspective', 'Depth and perspective',
  '["Receding edges converge consistently towards a coherent vanishing point.","The eye level is consistent across every object in the scene.","Ellipses open and close correctly according to their height relative to eye level.","Overlap, scale and tone work together so nearer objects read as nearer."]'::jsonb,
  2
FROM public.drawing_brief_type b
WHERE b.key = '3d_composition.still_life'
ON CONFLICT (brief_type_id, key) DO NOTHING;

-- Design principle: the 2D briefs only.
INSERT INTO public.drawing_criterion (brief_type_id, key, title, observable_checks, sort_order)
SELECT b.id, 'design_principle', 'Design principle',
  '["A named principle (balance, rhythm, emphasis, hierarchy, proportion) is visibly driving the layout.","Negative space is used actively rather than being whatever is left over.","The composition avoids sitting dead centre unless symmetry is the stated intent.","Any colour or tone constraint set by the brief is respected throughout."]'::jsonb,
  2
FROM public.drawing_brief_type b
WHERE b.key IN ('2d_composition.geometric_shapes', '2d_composition.logo')
ON CONFLICT (brief_type_id, key) DO NOTHING;
