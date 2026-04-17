-- College Hub v2: Add placement salary, brochure, and city slug columns
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS brochure_url TEXT;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS avg_placement_salary INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS min_placement_salary INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS max_placement_salary INTEGER;
ALTER TABLE colleges ADD COLUMN IF NOT EXISTS city_slug TEXT;

-- Backfill city_slug from city name (lowercase, replace spaces with hyphens)
UPDATE colleges
SET city_slug = LOWER(REGEXP_REPLACE(TRIM(city), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE city IS NOT NULL AND city_slug IS NULL;

-- Index for city-based queries
CREATE INDEX IF NOT EXISTS idx_colleges_city_slug ON colleges (city_slug) WHERE city_slug IS NOT NULL;

-- Index for type-based queries
CREATE INDEX IF NOT EXISTS idx_colleges_type ON colleges (type) WHERE type IS NOT NULL;
