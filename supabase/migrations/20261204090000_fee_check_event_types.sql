-- Fee checks and second-installment reminders. Its own file: a new enum value
-- cannot be used in the same transaction that adds it.
--
-- notification_event_type is shared by admin_notifications (staff bell) and
-- user_notifications (student bell), so each value is added once.

-- To the student, sent by Neram Assistant through sendNudge
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'fee_details_check';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'fee_installment_reminder';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'fee_correction_resolved';

-- To staff, in the Admin bell (and a phone push for the first one and the due ones)
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'fee_correction_reported';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'fee_details_confirmed';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'fee_installment_due';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'fee_installment_overdue';
