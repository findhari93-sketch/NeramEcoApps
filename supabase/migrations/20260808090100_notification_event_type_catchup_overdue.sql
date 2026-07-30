-- ============================================
-- A STUDENT-FACING EVENT FOR A MISSED CLASS PAST ITS DEADLINE
--
-- Separate from `catchup_behind_pace`, which is the late joiner's weekly quota
-- slipping. This one is a specific class, on a specific date, that the course
-- has now moved past. Different copy, different urgency, and a teacher filtering
-- their notifications needs to be able to tell the two apart.
--
-- Its own file because ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction that added it, so this cannot be folded into 20260808090000.
-- ============================================

ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'catchup_overdue';
