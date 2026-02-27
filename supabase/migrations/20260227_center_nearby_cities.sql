-- Migration: Add nearby_cities column to offline_centers
-- Stores nearby towns/cities for local SEO (areaServed, content sections)

ALTER TABLE offline_centers ADD COLUMN IF NOT EXISTS nearby_cities jsonb DEFAULT '[]';

-- Populate nearby cities
UPDATE offline_centers SET nearby_cities = '["Thanjavur", "Karaikudi", "Sivaganga", "Dindigul", "Aranthangi", "Iluppoor"]'::jsonb
WHERE slug IN ('pudukkottai-main', 'pudukkottai-nata');

UPDATE offline_centers SET nearby_cities = '["Thanjavur", "Pudukkottai", "Karur", "Perambalur", "Namakkal", "Musiri"]'::jsonb
WHERE slug = 'trichy';

UPDATE offline_centers SET nearby_cities = '["Tiruppur", "Erode", "Pollachi", "Palani", "Dharapuram", "Mettupalayam"]'::jsonb
WHERE slug = 'coimbatore';

UPDATE offline_centers SET nearby_cities = '["Dindigul", "Sivaganga", "Theni", "Virudhunagar", "Ramanathapuram"]'::jsonb
WHERE slug = 'madurai';

UPDATE offline_centers SET nearby_cities = '["Kanchipuram", "Chengalpattu", "Tambaram", "Mahabalipuram", "Sriperumbudur"]'::jsonb
WHERE slug = 'chennai';

UPDATE offline_centers SET nearby_cities = '["Chennai", "Chengalpattu", "Kanchipuram", "Mahabalipuram", "Guduvancheri"]'::jsonb
WHERE slug = 'tambaram';

UPDATE offline_centers SET nearby_cities = '["Chennai", "Tambaram", "Chengalpattu", "Vellore", "Arakkonam"]'::jsonb
WHERE slug = 'kanchipuram';

UPDATE offline_centers SET nearby_cities = '["Coimbatore", "Erode", "Dharapuram", "Palladam", "Avinashi"]'::jsonb
WHERE slug = 'tiruppur';

UPDATE offline_centers SET nearby_cities = '["Electronic City", "Hosur", "Whitefield", "Marathahalli", "Anekal"]'::jsonb
WHERE slug = 'bangalore-hq';
