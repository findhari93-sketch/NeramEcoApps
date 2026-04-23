-- Add tool_calls column to chatbot_conversations for Aintra tool-call telemetry.
-- Stores an array of { name, args, latency_ms, success, error? } per user turn.
-- Nullable so existing rows remain valid.

ALTER TABLE public.chatbot_conversations
  ADD COLUMN IF NOT EXISTS tool_calls jsonb;

COMMENT ON COLUMN public.chatbot_conversations.tool_calls IS
  'Array of tool invocations (name, args, latency_ms, success, error?) performed while generating the AI response. Aintra college hub tools.';
