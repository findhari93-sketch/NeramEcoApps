-- Backfilled demos made existing students look newly active in the User CRM.
--
-- Staff record demos that happened weeks ago ("Record held demo"). The
-- demo_attended funnel stage was dated by attendance_marked_at, which is the
-- moment staff clicked, so the nightly refresh_user_meaningful_activity() saw
-- a fresh "app_event" and showed "Used the app, Yesterday" for students who
-- had done nothing new. The stage now takes the earlier of the demo's own time
-- and the marking time, and rows already written are re-dated.

CREATE OR REPLACE FUNCTION public.tg_funnel_stage_demo_attended()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.claim_funnel_stage(
    NEW.user_id,
    'demo_attended',
    jsonb_build_object('demo_registration_id', NEW.id, 'value_inr', 0),
    NULL,
    -- When the demo happened, never later than when it was marked or now.
    LEAST(
      COALESCE(NEW.scheduled_start, NEW.attendance_marked_at, now()),
      COALESCE(NEW.attendance_marked_at, now()),
      now()
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_funnel_stage_demo_attended() FROM PUBLIC, anon, authenticated;

-- Re-date the rows already claimed: only where the demo clearly happened before
-- the stamp (an hour of slack keeps a demo marked straight after class as is).
UPDATE public.user_funnel_events e
   SET created_at = d.scheduled_start
  FROM public.demo_class_registrations d
 WHERE e.event = 'demo_attended'
   AND d.id = NULLIF(e.metadata->>'demo_registration_id', '')::uuid
   AND d.scheduled_start IS NOT NULL
   AND d.scheduled_start < e.created_at - interval '1 hour';

-- Recompute "Last active" now rather than at 02:45 IST.
SELECT public.refresh_user_meaningful_activity();
