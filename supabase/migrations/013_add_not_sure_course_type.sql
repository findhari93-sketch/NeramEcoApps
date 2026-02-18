-- Add 'not_sure' to course_type enum
-- This value is used by the onboarding flow (migration 007) but was missing from the enum,
-- causing application form submission to fail with: invalid input value for enum course_type: "not_sure"
ALTER TYPE course_type ADD VALUE IF NOT EXISTS 'not_sure';
