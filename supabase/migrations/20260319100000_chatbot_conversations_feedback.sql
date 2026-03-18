ALTER TABLE chatbot_conversations
  ADD COLUMN IF NOT EXISTS thumbs_up BOOLEAN,
  ADD COLUMN IF NOT EXISTS admin_correction TEXT,
  ADD COLUMN IF NOT EXISTS promoted_to_kb BOOLEAN NOT NULL DEFAULT false;
