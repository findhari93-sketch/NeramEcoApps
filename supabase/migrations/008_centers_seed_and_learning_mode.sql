-- Migration 008: Seed offline centers data + add learning_mode to lead_profiles
-- This migration populates the offline_centers table with all 7 Neram Google Business locations
-- and adds a learning_mode preference column to lead_profiles.

-- ============================================================
-- 1. Add learning_mode enum and column to lead_profiles
-- ============================================================

DO $$ BEGIN
  CREATE TYPE learning_mode AS ENUM ('hybrid', 'online_only');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS learning_mode learning_mode DEFAULT 'hybrid';

-- ============================================================
-- 2. Seed offline centers data
-- ============================================================

-- Clear existing seed data (idempotent)
DELETE FROM offline_centers WHERE slug IN (
  'pudukkottai-main',
  'pudukkottai-nata',
  'trichy',
  'coimbatore',
  'tambaram',
  'madurai',
  'chennai',
  'tiruppur'
);

-- Center 1: Pudukkottai Main Branch
INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order
) VALUES (
  'Neram NEET | JEE | NATA Coaching Center - Pudukkottai',
  'pudukkottai-main',
  '1595, North 2nd Street, Pudukkottai',
  'Pudukkottai', 'Tamil Nadu', 'IN', '622001',
  10.3833, 78.8001,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=Neram+NEET+JEE+NATA+Coaching+Center+Pudukkottai+1595+North+2nd+Street',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables', 'Projector'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  50, 0,
  true, 1
);

-- Center 2: Pudukkottai NATA Branch
INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order
) VALUES (
  'Neram Classes - NATA Coaching Center Pudukkottai',
  'pudukkottai-nata',
  '10-11 Deivanai Nagar Near, Balannagar Near, Karuvappillayan Gate, Nathampannai, Pudukkottai, Near Ganapathy Floor Mill',
  'Pudukkottai', 'Tamil Nadu', 'IN', '622003',
  10.3810, 78.8150,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=NeramClasses+NATA+Coaching+center+Pudukkottai+Nathampannai',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  40, 0,
  true, 2
);

-- Center 3: Trichy
INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order
) VALUES (
  'Neram - NATA Coaching Centre Trichy',
  'trichy',
  '76-O, Sri Jothi Complex, 2nd Floor, NEE Road, Thillai Nagar',
  'Tiruchirapalli', 'Tamil Nadu', 'IN', '620018',
  10.8050, 78.6856,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=Neram+NATA+coaching+centre+trichy+Sri+Jothi+Complex+Thillai+Nagar',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables', 'Projector'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  40, 0,
  true, 3
);

-- Center 4: Coimbatore
INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order
) VALUES (
  'Neram - NATA Coaching Centre Coimbatore',
  'coimbatore',
  '10/31, Bharathi Park, 5th Cross, Saibaba Colony',
  'Coimbatore', 'Tamil Nadu', 'IN', '641011',
  11.0168, 76.9558,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=Neram+NATA+Coaching+centre+coimbatore+Bharathi+Park+Saibaba+Colony',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  35, 0,
  true, 4
);

-- Center 5: Tambaram (Chennai)
INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order
) VALUES (
  'Neram - NATA Coaching Center Tambaram',
  'tambaram',
  'FC, Block 10, Jain Alpine Meadows, Thiruneermalai',
  'Chennai', 'Tamil Nadu', 'IN', '600044',
  12.9516, 80.1462,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=Neram+NATA+coaching+center+Tambaram+Jain+Alpine+Meadows+Thiruneermalai',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  30, 0,
  true, 5
);

-- Center 6: Madurai
INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order
) VALUES (
  'Neram Classes - NATA Coaching Madurai',
  'madurai',
  '2/401, IInd Floor, Vasanth Nagar, Palangantham',
  'Madurai', 'Tamil Nadu', 'IN', '625003',
  9.9252, 78.1198,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=Neram+classes+NATA+coaching+Madurai+Vasanth+Nagar+Palangantham',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  35, 0,
  true, 6
);

-- Center 7: Chennai (Ashok Nagar)
INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order
) VALUES (
  'Neram - NATA Coaching Center Chennai',
  'chennai',
  '2nd Floor, PT Rajan Rd, Sector 13, Ashok Nagar, Near Lakshmi Shruthi Signal',
  'Chennai', 'Tamil Nadu', 'IN', '600078',
  13.0382, 80.2120,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=Nata+Coaching+center+Chennai+neramClasses+PT+Rajan+Rd+Ashok+Nagar',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  30, 0,
  true, 7
);

-- Center 8: Tiruppur
INSERT INTO offline_centers (
  name, slug, address, city, state, country, pincode,
  latitude, longitude,
  google_business_url, google_maps_url, google_place_id,
  photos, facilities,
  operating_hours, preferred_visit_times,
  contact_phone, contact_email,
  capacity, current_students,
  is_active, display_order
) VALUES (
  'Neram - NATA Coaching Center Tiruppur',
  'tiruppur',
  '7/1, 4th St Ramaiah Colony, Ram Nagar, Ganga Nagar, West',
  'Tiruppur', 'Tamil Nadu', 'IN', '641602',
  11.1085, 77.3411,
  NULL,
  'https://www.google.com/maps/search/?api=1&query=Neram+NATA+coaching+center+Tiruppur+Ramaiah+Colony+Ram+Nagar',
  NULL,
  '[]'::jsonb,
  ARRAY['AC', 'WiFi', 'Drawing Tables'],
  '{"monday": {"open": "09:00", "close": "18:00"}, "tuesday": {"open": "09:00", "close": "18:00"}, "wednesday": {"open": "09:00", "close": "18:00"}, "thursday": {"open": "09:00", "close": "18:00"}, "friday": {"open": "09:00", "close": "18:00"}, "saturday": {"open": "09:00", "close": "14:00"}, "sunday": null}'::jsonb,
  ARRAY['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'],
  '+919176137043',
  'info@neramclasses.com',
  35, 0,
  true, 8
);
