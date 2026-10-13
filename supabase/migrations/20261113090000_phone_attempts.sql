-- Every phone number a student types into a phone-OTP dialog, saved the moment
-- they tap Send OTP: signed in or not, and whether or not the OTP goes out.
-- Staff can call a student who got stuck at phone sign-in (reCAPTCHA failed,
-- OTP never arrived), and see all numbers a student tried, the verified one
-- ticked. users.phone stays the one primary number.
--
-- Written only by the service role (capture-phone and verify-phone routes).

CREATE TABLE IF NOT EXISTS phone_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The account, once known. Signed-out attempts carry the visitor's
  -- anonymous id instead and are moved onto the account at sign-up.
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  anonymous_id text,
  -- E.164, as typed in the dialog (+919876543210).
  phone text NOT NULL,
  -- Last 10 digits, to match a number however it was stored elsewhere.
  phone_last10 text GENERATED ALWAYS AS (right(regexp_replace(phone, '\D', '', 'g'), 10)) STORED,
  -- entered: Send OTP tapped. otp_sent: Firebase accepted it. failed: sending
  -- or verifying failed (see last_error_*). verified: the OTP was confirmed.
  status text NOT NULL DEFAULT 'entered'
    CHECK (status IN ('entered', 'otp_sent', 'failed', 'verified')),
  -- How many times Send OTP (or Resend) was tapped for this number.
  attempts integer NOT NULL DEFAULT 1,
  -- Page the dialog was on (/demo-class, /apply, /tools/...).
  source text,
  source_app text,
  last_error_code text,
  last_error_message text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  CONSTRAINT phone_attempts_owner CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

COMMENT ON TABLE phone_attempts IS
  'Every number typed into a phone-OTP dialog, saved before the OTP is sent. One row per (account or visitor, number).';

CREATE UNIQUE INDEX IF NOT EXISTS phone_attempts_user_phone
  ON phone_attempts (user_id, phone) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS phone_attempts_anon_phone
  ON phone_attempts (anonymous_id, phone) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS phone_attempts_last10 ON phone_attempts (phone_last10);
CREATE INDEX IF NOT EXISTS phone_attempts_unverified_recent
  ON phone_attempts (last_attempt_at DESC) WHERE status <> 'verified';
-- The "stuck at phone sign-in" view checks verified accounts by number.
CREATE INDEX IF NOT EXISTS idx_users_verified_phone_last10
  ON users ((right(regexp_replace(phone, '\D', '', 'g'), 10)))
  WHERE phone_verified = true AND phone IS NOT NULL;

ALTER TABLE phone_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE phone_attempts FROM public, anon, authenticated;
GRANT ALL ON TABLE phone_attempts TO service_role;

-- ---------------------------------------------------------------------------
-- record_phone_attempt: one event for one number. 'entered' counts an attempt;
-- the other events only move the status. A verified number never goes back.
-- A signed-out visitor is capped at 10 numbers, so the public endpoint cannot
-- be used to fill the table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_phone_attempt(
  p_user_id uuid,
  p_anonymous_id text,
  p_phone text,
  p_event text,
  p_source text DEFAULT NULL,
  p_source_app text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_event NOT IN ('entered', 'otp_sent', 'failed', 'verified') THEN
    RAISE EXCEPTION 'unknown phone attempt event %', p_event;
  END IF;
  IF p_user_id IS NULL AND p_anonymous_id IS NULL THEN
    RETURN;
  END IF;

  FOR i IN 1..2 LOOP
    IF p_user_id IS NOT NULL THEN
      SELECT id INTO v_id FROM phone_attempts
       WHERE user_id = p_user_id AND phone = p_phone FOR UPDATE;
    ELSE
      SELECT id INTO v_id FROM phone_attempts
       WHERE user_id IS NULL AND anonymous_id = p_anonymous_id AND phone = p_phone FOR UPDATE;
    END IF;

    IF v_id IS NOT NULL THEN
      UPDATE phone_attempts SET
        attempts = attempts + CASE WHEN p_event = 'entered' THEN 1 ELSE 0 END,
        status = CASE WHEN status = 'verified' THEN 'verified' ELSE p_event END,
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
        last_error_code, last_error_message, verified_at
      ) VALUES (
        p_user_id, p_anonymous_id, p_phone, p_event, 1, p_source, p_source_app,
        CASE WHEN p_event = 'failed' THEN p_error_code END,
        CASE WHEN p_event = 'failed' THEN left(p_error_message, 300) END,
        CASE WHEN p_event = 'verified' THEN now() END
      );
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      -- A parallel call inserted the same row; update it on the second pass.
      v_id := NULL;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- link_phone_attempts: move a visitor's signed-out attempts onto the account
-- they then signed in to. A number already on the account absorbs the
-- visitor's row (attempts added, the newer status kept, verified kept).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION link_phone_attempts(p_anonymous_id text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r phone_attempts%ROWTYPE;
  v_existing phone_attempts%ROWTYPE;
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
      UPDATE phone_attempts SET
        attempts = v_existing.attempts + r.attempts,
        first_seen_at = least(v_existing.first_seen_at, r.first_seen_at),
        last_attempt_at = greatest(v_existing.last_attempt_at, r.last_attempt_at),
        status = CASE
          WHEN v_existing.status = 'verified' OR r.status = 'verified' THEN 'verified'
          WHEN r.last_attempt_at > v_existing.last_attempt_at THEN r.status
          ELSE v_existing.status END,
        last_error_code = CASE
          WHEN r.last_attempt_at > v_existing.last_attempt_at THEN r.last_error_code
          ELSE v_existing.last_error_code END,
        last_error_message = CASE
          WHEN r.last_attempt_at > v_existing.last_attempt_at THEN r.last_error_message
          ELSE v_existing.last_error_message END,
        verified_at = coalesce(v_existing.verified_at, r.verified_at),
        anonymous_id = coalesce(v_existing.anonymous_id, r.anonymous_id)
      WHERE id = v_existing.id;
      DELETE FROM phone_attempts WHERE id = r.id;
    END IF;
    v_existing := NULL;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION record_phone_attempt(uuid, text, text, text, text, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_phone_attempt(uuid, text, text, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION link_phone_attempts(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION link_phone_attempts(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Numbers nobody has verified yet: not on any verified attempt and not the
-- verified phone of any account. Admin's "Stuck at phone sign-in" list.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW phone_attempts_unverified
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
   );

REVOKE ALL ON TABLE phone_attempts_unverified FROM public, anon, authenticated;
GRANT SELECT ON TABLE phone_attempts_unverified TO service_role;
