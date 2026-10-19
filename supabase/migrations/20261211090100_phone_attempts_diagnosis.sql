-- Why someone got stuck at phone sign-in, and an alert so staff can act.
--
-- 1. Diagnosis: the dialog now also reports what the student did after the
--    OTP went out (typed a code, closed the dialog, skipped, opened help,
--    closed the tab), and the server stamps the device and browser. With the
--    error code this tells "the student stopped" from "our sign-in broke"
--    (Admin > Stuck at phone sign-in labels each person).
-- 2. A person who verified ANY number is no longer stuck. Before, a typo
--    (96500 24559) corrected to the right number (96002 45596) and verified a
--    minute later stayed on the list for good, because the view only checked
--    the typed number.
-- 3. alerted_at / handled_at: the phone-stuck cron alerts once per episode
--    (bell + phone push), staff mark a person done. A new Send OTP starts a
--    new episode and clears both.

ALTER TABLE phone_attempts
  -- Codes the student typed and sent for checking (right or wrong).
  ADD COLUMN IF NOT EXISTS otp_tries integer NOT NULL DEFAULT 0,
  -- How they left without verifying: closed the dialog, skipped, closed the tab.
  ADD COLUMN IF NOT EXISTS left_via text
    CHECK (left_via IN ('closed', 'skipped', 'tab_closed')),
  ADD COLUMN IF NOT EXISTS left_at timestamptz,
  -- The last 25 events for this number: {"e": event, "at": time, "c": error code}.
  ADD COLUMN IF NOT EXISTS events jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- From the request's user agent: "Android phone", "iPhone", "Desktop";
  -- "Chrome", "Safari", "Instagram in-app browser".
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS handled_at timestamptz,
  ADD COLUMN IF NOT EXISTS handled_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS phone_attempts_anonymous_id
  ON phone_attempts (anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS phone_attempts_user_id
  ON phone_attempts (user_id) WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- record_phone_attempt, with the new events and the device. Status events
-- (entered, otp_sent, failed, verified) move the status as before. Signals
-- (otp_checked, help, closed, skipped, tab_closed) only annotate an existing
-- row, never create one, and match a visitor's row even after sign-in, since
-- a closing tab sends no token.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS record_phone_attempt(uuid, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION record_phone_attempt(
  p_user_id uuid,
  p_anonymous_id text,
  p_phone text,
  p_event text,
  p_source text DEFAULT NULL,
  p_source_app text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_device text DEFAULT NULL,
  p_browser text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status_event boolean := p_event IN ('entered', 'otp_sent', 'failed', 'verified');
  v_left boolean := p_event IN ('closed', 'skipped', 'tab_closed');
  v_entry jsonb;
BEGIN
  IF NOT v_status_event AND p_event NOT IN ('otp_checked', 'help', 'closed', 'skipped', 'tab_closed') THEN
    RAISE EXCEPTION 'unknown phone attempt event %', p_event;
  END IF;
  IF p_user_id IS NULL AND p_anonymous_id IS NULL THEN
    RETURN;
  END IF;

  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'e', p_event,
    'at', now(),
    'c', CASE WHEN p_event = 'failed' THEN left(p_error_code, 80) END
  ));

  FOR i IN 1..2 LOOP
    v_id := NULL;
    IF p_user_id IS NOT NULL THEN
      SELECT id INTO v_id FROM phone_attempts
       WHERE user_id = p_user_id AND phone = p_phone FOR UPDATE;
    ELSIF v_status_event THEN
      SELECT id INTO v_id FROM phone_attempts
       WHERE user_id IS NULL AND anonymous_id = p_anonymous_id AND phone = p_phone FOR UPDATE;
    END IF;

    IF v_id IS NULL AND NOT v_status_event THEN
      IF p_anonymous_id IS NOT NULL THEN
        SELECT id INTO v_id FROM phone_attempts
         WHERE anonymous_id = p_anonymous_id AND phone = p_phone
         ORDER BY last_attempt_at DESC
         LIMIT 1
         FOR UPDATE;
      END IF;
      IF v_id IS NULL THEN
        RETURN;
      END IF;
    END IF;

    IF v_id IS NOT NULL THEN
      UPDATE phone_attempts SET
        attempts = attempts + CASE WHEN p_event = 'entered' THEN 1 ELSE 0 END,
        status = CASE WHEN status = 'verified' OR NOT v_status_event THEN status ELSE p_event END,
        last_error_code = CASE
          WHEN p_event = 'failed' THEN p_error_code
          WHEN p_event IN ('otp_sent', 'verified') THEN NULL
          ELSE last_error_code END,
        last_error_message = CASE
          WHEN p_event = 'failed' THEN left(p_error_message, 300)
          WHEN p_event IN ('otp_sent', 'verified') THEN NULL
          ELSE last_error_message END,
        last_attempt_at = CASE WHEN p_event = 'entered' THEN now() ELSE last_attempt_at END,
        verified_at = CASE WHEN p_event = 'verified' THEN coalesce(verified_at, now()) ELSE verified_at END,
        otp_tries = otp_tries + CASE WHEN p_event = 'otp_checked' THEN 1 ELSE 0 END,
        left_via = CASE WHEN v_left THEN p_event WHEN p_event IN ('entered', 'verified') THEN NULL ELSE left_via END,
        left_at = CASE WHEN v_left THEN now() WHEN p_event IN ('entered', 'verified') THEN NULL ELSE left_at END,
        -- A new Send OTP is a new episode: alert again if it sticks, back on the list.
        alerted_at = CASE WHEN p_event = 'entered' THEN NULL ELSE alerted_at END,
        handled_at = CASE WHEN p_event = 'entered' THEN NULL ELSE handled_at END,
        handled_by = CASE WHEN p_event = 'entered' THEN NULL ELSE handled_by END,
        events = (CASE WHEN jsonb_array_length(events) >= 25 THEN events - 0 ELSE events END)
                 || jsonb_build_array(v_entry),
        device = coalesce(p_device, device),
        browser = coalesce(p_browser, browser),
        source = coalesce(p_source, source),
        source_app = coalesce(p_source_app, source_app),
        anonymous_id = coalesce(anonymous_id, p_anonymous_id)
      WHERE id = v_id;
      RETURN;
    END IF;

    IF p_user_id IS NULL AND (
      SELECT count(*) FROM phone_attempts
       WHERE user_id IS NULL AND anonymous_id = p_anonymous_id
    ) >= 10 THEN
      RETURN;
    END IF;

    BEGIN
      INSERT INTO phone_attempts (
        user_id, anonymous_id, phone, status, attempts, source, source_app,
        last_error_code, last_error_message, verified_at, events, device, browser
      ) VALUES (
        p_user_id, p_anonymous_id, p_phone, p_event, 1, p_source, p_source_app,
        CASE WHEN p_event = 'failed' THEN p_error_code END,
        CASE WHEN p_event = 'failed' THEN left(p_error_message, 300) END,
        CASE WHEN p_event = 'verified' THEN now() END,
        jsonb_build_array(v_entry), p_device, p_browser
      );
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- A parallel call inserted the same row; update it on the second pass.
      v_id := NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION record_phone_attempt(uuid, text, text, text, text, text, text, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_phone_attempt(uuid, text, text, text, text, text, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- link_phone_attempts, now also merging the diagnosis columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_phone_attempts(p_anonymous_id text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r phone_attempts%ROWTYPE;
  v_existing phone_attempts%ROWTYPE;
  v_newer boolean;
BEGIN
  IF p_anonymous_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM phone_attempts
     WHERE user_id IS NULL AND anonymous_id = p_anonymous_id
     FOR UPDATE
  LOOP
    SELECT * INTO v_existing FROM phone_attempts
     WHERE user_id = p_user_id AND phone = r.phone FOR UPDATE;

    IF v_existing.id IS NULL THEN
      UPDATE phone_attempts SET user_id = p_user_id WHERE id = r.id;
    ELSE
      v_newer := r.last_attempt_at > v_existing.last_attempt_at;
      UPDATE phone_attempts SET
        attempts = v_existing.attempts + r.attempts,
        otp_tries = v_existing.otp_tries + r.otp_tries,
        first_seen_at = least(v_existing.first_seen_at, r.first_seen_at),
        last_attempt_at = greatest(v_existing.last_attempt_at, r.last_attempt_at),
        status = CASE
          WHEN v_existing.status = 'verified' OR r.status = 'verified' THEN 'verified'
          WHEN v_newer THEN r.status
          ELSE v_existing.status END,
        last_error_code = CASE WHEN v_newer THEN r.last_error_code ELSE v_existing.last_error_code END,
        last_error_message = CASE WHEN v_newer THEN r.last_error_message ELSE v_existing.last_error_message END,
        left_via = CASE WHEN v_newer THEN r.left_via ELSE v_existing.left_via END,
        left_at = CASE WHEN v_newer THEN r.left_at ELSE v_existing.left_at END,
        verified_at = coalesce(v_existing.verified_at, r.verified_at),
        events = (
          SELECT coalesce(jsonb_agg(s.x ORDER BY s.x->>'at'), '[]'::jsonb)
            FROM (
              SELECT x FROM jsonb_array_elements(v_existing.events || r.events) AS x
               ORDER BY x->>'at' DESC
               LIMIT 25
            ) s
        ),
        device = CASE WHEN v_newer THEN coalesce(r.device, v_existing.device) ELSE coalesce(v_existing.device, r.device) END,
        browser = CASE WHEN v_newer THEN coalesce(r.browser, v_existing.browser) ELSE coalesce(v_existing.browser, r.browser) END,
        alerted_at = coalesce(v_existing.alerted_at, r.alerted_at),
        handled_at = coalesce(v_existing.handled_at, r.handled_at),
        handled_by = coalesce(v_existing.handled_by, r.handled_by),
        anonymous_id = coalesce(v_existing.anonymous_id, r.anonymous_id)
      WHERE id = v_existing.id;
      DELETE FROM phone_attempts WHERE id = r.id;
    END IF;
    v_existing := NULL;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION link_phone_attempts(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION link_phone_attempts(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Stuck = a number nobody verified, typed by a person who has not verified
-- any number. Dropped as before when any account verified the number; now
-- also when the same account or visitor verified another one (a corrected
-- typo), or the account's phone is verified by any route.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS phone_attempts_unverified;

CREATE VIEW phone_attempts_unverified
WITH (security_invoker = true) AS
SELECT pa.*
  FROM phone_attempts pa
 WHERE pa.status <> 'verified'
   AND NOT EXISTS (
     SELECT 1 FROM phone_attempts v
      WHERE v.status = 'verified' AND v.phone_last10 = pa.phone_last10
   )
   AND NOT EXISTS (
     SELECT 1 FROM users u
      WHERE u.phone_verified = true
        AND u.phone IS NOT NULL
        AND right(regexp_replace(u.phone, '\D', '', 'g'), 10) = pa.phone_last10
   )
   AND NOT EXISTS (
     SELECT 1 FROM phone_attempts v
      WHERE v.status = 'verified'
        AND (
          (pa.user_id IS NOT NULL AND v.user_id = pa.user_id)
          OR (pa.anonymous_id IS NOT NULL AND v.anonymous_id = pa.anonymous_id)
        )
   )
   AND NOT EXISTS (
     SELECT 1 FROM users u
      WHERE pa.user_id IS NOT NULL AND u.id = pa.user_id AND u.phone_verified = true
   );

REVOKE ALL ON TABLE phone_attempts_unverified FROM public, anon, authenticated;
GRANT SELECT ON TABLE phone_attempts_unverified TO service_role;
