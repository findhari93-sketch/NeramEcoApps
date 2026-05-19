CREATE TABLE ask_seniors_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year        INTEGER NOT NULL,
  title       TEXT NOT NULL,
  event_date  DATE,
  event_time  TIME,
  event_link  TEXT,
  status      TEXT NOT NULL DEFAULT 'upcoming'
                CHECK (status IN ('upcoming', 'active', 'completed')),
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ask_seniors_registrations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            UUID NOT NULL REFERENCES ask_seniors_events(id),
  name                TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,
  city                TEXT,
  state               TEXT,
  nata_attempts       INTEGER NOT NULL CHECK (nata_attempts IN (1, 2)),
  nata_score_1        NUMERIC(5,2) NOT NULL,
  nata_score_2        NUMERIC(5,2),
  board_score         NUMERIC(5,2) NOT NULL,
  final_cutoff        NUMERIC(5,2),
  college_preferences UUID[],
  registered_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ask_seniors_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public insert" ON ask_seniors_registrations FOR INSERT WITH CHECK (true);

INSERT INTO ask_seniors_events (year, title, status, description)
VALUES (
  2026,
  'AskSeniors 2026',
  'upcoming',
  'Annual free online event where current B.Arch students from 50+ colleges answer questions from aspirants before TNEA counselling.'
);
