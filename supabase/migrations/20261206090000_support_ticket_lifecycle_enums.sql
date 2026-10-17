-- Support tickets (Admin inbox): the enum values the new lifecycle needs.
--
-- Kept in a file of its own because Postgres cannot use an enum value inside
-- the same transaction that adds it. 20261206090100 uses these values.
--
--   waiting_on_student     staff asked the requester for more, their turn
--   awaiting_confirmation  staff resolved, the requester confirms or it closes in 3 days
--
-- 'resolved' stays in the enum as a legacy value. Nothing writes it any more,
-- and 20261206090100 moves the existing rows to 'closed'.

ALTER TYPE support_ticket_status ADD VALUE IF NOT EXISTS 'waiting_on_student' AFTER 'in_progress';
ALTER TYPE support_ticket_status ADD VALUE IF NOT EXISTS 'awaiting_confirmation' AFTER 'waiting_on_student';

-- Requester side (bell in the Tools App). ticket_resolved already exists.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'ticket_reply';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'ticket_info_requested';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'ticket_closed';

-- Staff side (bell in Admin). ticket_created already exists.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'ticket_student_replied';
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'ticket_reopened';

NOTIFY pgrst, 'reload schema';
