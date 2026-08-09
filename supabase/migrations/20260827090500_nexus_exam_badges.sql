-- Badges for scheduled exams.
--
-- The gamification tables have existed since 20260429 with rarity tiers, a
-- weekly and monthly leaderboard, and three live crons. Nothing has ever
-- written a test-related event to any of them: 'quiz_completed' is already in
-- the gamification_point_events CHECK constraint, unused. This adds the badge
-- definitions; the publish route does the writing.
--
-- `category` is a CHECK, not an enum, so widening it CAN share a file with the
-- inserts that use the new value. That is the difference from the ALTER TYPE
-- rule that forced the exam enums into their own migration.

ALTER TABLE gamification_badge_definitions
  DROP CONSTRAINT IF EXISTS gamification_badge_definitions_category_check;
ALTER TABLE gamification_badge_definitions
  ADD CONSTRAINT gamification_badge_definitions_category_check
  CHECK (category IN ('attendance', 'checklist', 'growth', 'leaderboard', 'exam'));

-- A new category rather than filing these under 'growth'. The badge shelf groups
-- by category, and "Growth: Exam Topper" is a label that ends up in a screenshot.
INSERT INTO gamification_badge_definitions
  (id, display_name, description, criteria_description, category, rarity_tier, points_bonus, sort_order, is_active)
VALUES
  ('exam_topper', 'Exam Topper', 'First place in a scheduled exam',
   'Finish first in your classroom on a scheduled exam that at least 5 students sat.',
   'exam', 'legendary', 100, 300, true),
  ('exam_podium', 'On the Podium', 'Top three in a scheduled exam',
   'Finish in the top three in your classroom on a scheduled exam that at least 5 students sat.',
   'exam', 'epic', 50, 301, true),
  ('exam_regular', 'Always There', 'Sat three scheduled exams',
   'Sit three scheduled exams.',
   'exam', 'rare', 25, 302, true),
  ('exam_personal_best', 'Personal Best', 'Beat your own exam record',
   'Score higher than your best previous scheduled exam.',
   'exam', 'common', 10, 303, true)
ON CONFLICT (id) DO NOTHING;
