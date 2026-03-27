-- Add onboarding_type to nexus_classrooms to differentiate onboarding flows
-- 'full' = current flow (documents, info, review) for school students (NATA/JEE)
-- 'lite' = simplified onboarding (future use)
-- 'none' = skip onboarding entirely, e.g. college students (Revit)
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS onboarding_type TEXT NOT NULL DEFAULT 'full'
  CHECK (onboarding_type IN ('full', 'lite', 'none'));
