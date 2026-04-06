-- Drawing Foundation Checklist + Object Library

-- ============================================================
-- 1. Foundation Checklist Items (master list, seeded once)
-- ============================================================
CREATE TABLE drawing_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dci_category ON drawing_checklist_items(category);

ALTER TABLE drawing_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Checklist items readable by all" ON drawing_checklist_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role full access checklist items" ON drawing_checklist_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Per-student checklist progress
-- ============================================================
CREATE TABLE drawing_checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES drawing_checklist_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  student_marked_at TIMESTAMPTZ,
  tutor_verified BOOLEAN DEFAULT false,
  tutor_verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, checklist_item_id)
);

CREATE INDEX idx_dcp_student ON drawing_checklist_progress(student_id);
CREATE INDEX idx_dcp_item ON drawing_checklist_progress(checklist_item_id);

ALTER TABLE drawing_checklist_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read own checklist progress" ON drawing_checklist_progress
  FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Students update own progress" ON drawing_checklist_progress
  FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "Service role full access checklist progress" ON drawing_checklist_progress
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER set_dcp_updated_at
  BEFORE UPDATE ON drawing_checklist_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================================
-- 3. Object Library
-- ============================================================
CREATE TABLE drawing_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_name TEXT NOT NULL,
  family TEXT NOT NULL CHECK (family IN (
    'fruits', 'kitchen', 'travel', 'lighting', 'sports',
    'stationery', 'toiletries', 'nature', 'misc'
  )),
  reference_images JSONB NOT NULL DEFAULT '[]',
  basic_form TEXT,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tips TEXT,
  video_url TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_do_family ON drawing_objects(family);
CREATE INDEX idx_do_difficulty ON drawing_objects(difficulty);
CREATE INDEX idx_do_tags ON drawing_objects USING GIN(tags);

ALTER TABLE drawing_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Objects readable by all" ON drawing_objects
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Service role full access objects" ON drawing_objects
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 4. Seed checklist items (~60 items across 9 categories)
-- ============================================================
INSERT INTO drawing_checklist_items (category, skill_name, sort_order, description) VALUES
-- Hand Practice (5 items)
('hand_practice', 'Straight lines (horizontal, vertical, diagonal)', 1, 'Draw straight lines in all directions with consistent pressure'),
('hand_practice', 'Curved lines and arcs', 2, 'Practice smooth S-curves, arcs, and freehand curves'),
('hand_practice', 'Freehand circles (various sizes)', 3, 'Draw circles of different sizes without guides'),
('hand_practice', 'Spiral drawing', 4, 'Draw spirals with even spacing and smooth curves'),
('hand_practice', 'Pressure control (light to dark)', 5, 'Vary pencil pressure from light sketch to dark shading'),

-- 2D Shapes (10 items)
('shapes_2d', 'Circle', 10, 'Draw clean freehand circles'),
('shapes_2d', 'Square', 11, 'Draw squares with equal sides and right angles'),
('shapes_2d', 'Rectangle', 12, 'Draw rectangles with proper proportions'),
('shapes_2d', 'Triangle', 13, 'Draw equilateral, isosceles, and right triangles'),
('shapes_2d', 'Pentagon', 14, 'Draw five-sided polygons'),
('shapes_2d', 'Hexagon', 15, 'Draw six-sided polygons'),
('shapes_2d', 'Parallelogram', 16, 'Draw parallelograms with consistent angles'),
('shapes_2d', 'Trapezoid', 17, 'Draw trapezoids with parallel top and bottom'),
('shapes_2d', 'Semicircle', 18, 'Draw clean half-circles'),
('shapes_2d', 'Ellipse', 19, 'Draw ellipses at different angles'),

-- Color Theory (6 items)
('color_theory', 'Primary colors identification', 20, 'Identify and use red, blue, yellow correctly'),
('color_theory', 'Secondary colors mixing', 21, 'Mix and identify green, orange, purple'),
('color_theory', 'Analogous colors', 22, 'Understand and apply adjacent color wheel colors'),
('color_theory', 'Complementary colors', 23, 'Understand and apply opposite color wheel colors'),
('color_theory', 'Warm vs Cool colors', 24, 'Distinguish warm (red/orange/yellow) from cool (blue/green/purple)'),
('color_theory', 'Monochromatic shading', 25, 'Create value range using single color'),

-- 3D Basic Forms (6 items)
('forms_3d', 'Sphere (with shading)', 30, 'Draw sphere with highlight, core shadow, cast shadow, reflected light'),
('forms_3d', 'Cube (with perspective)', 31, 'Draw cube showing 2-3 faces with correct perspective'),
('forms_3d', 'Cylinder', 32, 'Draw cylinder with elliptical top and shading'),
('forms_3d', 'Cone', 33, 'Draw cone with proper tapering and shadow'),
('forms_3d', 'Pyramid', 34, 'Draw pyramid with visible edges and shading'),
('forms_3d', 'Combined forms', 35, 'Combine basic 3D forms into complex objects'),

-- Shading Techniques (7 items)
('shading_techniques', 'Hatching', 40, 'Parallel lines for tonal values'),
('shading_techniques', 'Cross-hatching', 41, 'Overlapping line sets for darker values'),
('shading_techniques', 'Blending/smudging', 42, 'Smooth gradients using blending techniques'),
('shading_techniques', 'Stippling', 43, 'Dots for tonal variation'),
('shading_techniques', 'Light direction understanding', 44, 'Identify and render consistent light source direction'),
('shading_techniques', 'Cast shadow', 45, 'Draw accurate cast shadows based on light source'),
('shading_techniques', 'Reflected light', 46, 'Show subtle light bouncing from nearby surfaces'),

-- Textures (5 items)
('textures', 'Smooth surface (glass/metal)', 50, 'Render shiny, reflective surfaces'),
('textures', 'Rough surface (wood/stone)', 51, 'Render grainy, rough textures'),
('textures', 'Organic texture (fruit skin)', 52, 'Render natural, organic surface patterns'),
('textures', 'Woven/fabric texture', 53, 'Render woven basket, cloth folds, fabric patterns'),
('textures', 'Transparent/translucent', 54, 'Render glass, water, transparent materials'),

-- Composition (5 items)
('composition', 'Rule of thirds', 60, 'Place focal points at third intersections'),
('composition', 'Overlapping objects', 61, 'Create depth by overlapping forms'),
('composition', 'Size variation for depth', 62, 'Use smaller objects for distance, larger for foreground'),
('composition', 'Negative space', 63, 'Use empty space intentionally in compositions'),
('composition', 'Visual balance', 64, 'Distribute visual weight evenly across composition'),

-- Design Principles (9 items)
('design_principles', 'Symmetry', 70, 'Create balanced, mirrored compositions'),
('design_principles', 'Emphasis', 71, 'Draw attention to focal point through contrast/size/color'),
('design_principles', 'Contrast', 72, 'Use opposing elements (light/dark, large/small)'),
('design_principles', 'Rhythm', 73, 'Create visual flow through repeated elements'),
('design_principles', 'Repetition', 74, 'Use repeated motifs for pattern and unity'),
('design_principles', 'Dynamism', 75, 'Convey energy and movement in static compositions'),
('design_principles', 'Movement', 76, 'Guide viewer eye through the composition'),
('design_principles', 'Flow', 77, 'Create smooth visual transitions between elements'),
('design_principles', 'Balance', 78, 'Achieve visual equilibrium (symmetrical or asymmetrical)'),

-- Special Topics (7 items)
('special_topics', 'Human figure (basic proportions)', 80, '8-head proportion system for human body'),
('special_topics', 'Hand drawing', 81, 'Draw hands in basic poses'),
('special_topics', 'Tree and nature', 82, 'Draw trees, leaves, flowers, natural forms'),
('special_topics', 'Perspective (1-point)', 83, 'Draw scenes with single vanishing point'),
('special_topics', 'Perspective (2-point)', 84, 'Draw objects with two vanishing points'),
('special_topics', 'Lettering', 85, 'Draw clean, readable text and typography'),
('special_topics', 'Anthropometry basics', 86, 'Understand human body measurements for design');

-- ============================================================
-- 5. Seed object library (~70 objects)
-- ============================================================
INSERT INTO drawing_objects (object_name, family, basic_form, difficulty, tips, tags) VALUES
-- Fruits (11)
('Orange', 'fruits', 'sphere', 'easy', 'Start with a circle. Add a dimpled texture using small dots. The stem area has a slight depression.', ARRAY['sphere', 'citrus', 'round']),
('Apple', 'fruits', 'sphere', 'easy', 'Slightly flatten the top and bottom. The stem creates a small indentation.', ARRAY['sphere', 'round']),
('Mango', 'fruits', 'ellipsoid', 'easy', 'Egg-like shape with a slight curve. The skin has a smooth gradient.', ARRAY['ellipsoid', 'tropical']),
('Melon', 'fruits', 'sphere', 'easy', 'Large sphere with subtle line patterns on the skin.', ARRAY['sphere', 'large', 'round']),
('Muskmelon', 'fruits', 'sphere', 'easy', 'Sphere with net-like texture pattern on the surface.', ARRAY['sphere', 'textured']),
('Pomegranate', 'fruits', 'sphere', 'medium', 'Sphere with a crown-like top. Show the distinctive calyx.', ARRAY['sphere', 'crowned']),
('Papaya', 'fruits', 'ellipsoid', 'medium', 'Large elongated ellipse. Show the smooth skin with subtle color variation.', ARRAY['ellipsoid', 'elongated']),
('Grapes', 'fruits', 'cluster of spheres', 'medium', 'Each grape is a small sphere. Arrange in a triangular bunch with overlapping.', ARRAY['cluster', 'small_spheres']),
('Pineapple', 'fruits', 'cylinder+cone+texture', 'hard', 'Cylinder body with diamond pattern texture. Crown of spiky leaves at top.', ARRAY['cylinder', 'textured', 'complex']),
('Kiwi', 'fruits', 'ellipsoid', 'easy', 'Small egg shape with fuzzy brown skin texture.', ARRAY['ellipsoid', 'small']),
('Strawberry', 'fruits', 'cone+texture', 'medium', 'Inverted cone shape with seed dimples on surface. Leafy cap at top.', ARRAY['cone', 'textured']),

-- Kitchen (10)
('Woven Basket', 'kitchen', 'cylinder+texture', 'medium', 'Start with an ellipse for the opening. Build the basket shape with woven crosshatch texture.', ARRAY['cylinder', 'woven', 'texture']),
('Glass Tumbler', 'kitchen', 'cylinder', 'easy', 'Simple cylinder with elliptical top. Show transparency with subtle reflections.', ARRAY['cylinder', 'transparent']),
('Ceramic Bowl', 'kitchen', 'hemisphere', 'easy', 'Half-sphere with a rim. Show the interior shadow and smooth surface.', ARRAY['hemisphere', 'smooth']),
('Spoon Set', 'kitchen', 'varied', 'medium', 'Different spoon sizes. Each has an elliptical bowl and elongated handle.', ARRAY['elongated', 'varied']),
('Fork', 'kitchen', 'elongated', 'easy', 'Elongated handle with prongs at the end. Show the slight curve.', ARRAY['elongated', 'prongs']),
('Plate', 'kitchen', 'ellipse', 'easy', 'Wide ellipse with a subtle rim edge. Show perspective foreshortening.', ARRAY['ellipse', 'flat']),
('Napkin Ring', 'kitchen', 'torus', 'easy', 'Ring/torus shape. Show the circular cross-section and hole.', ARRAY['torus', 'ring']),
('Earthen Pot', 'kitchen', 'sphere+cylinder', 'medium', 'Rounded body with a narrow neck. Show the rough clay texture.', ARRAY['sphere', 'cylinder', 'textured']),
('Laundry Basket', 'kitchen', 'truncated cone+texture', 'medium', 'Wider at top, narrower at base. Woven texture throughout.', ARRAY['cone', 'woven']),
('Cloth/Fabric', 'kitchen', 'freeform folds', 'hard', 'Practice soft folds and draping. Focus on shadow in the creases.', ARRAY['freeform', 'folds', 'soft']),

-- Travel (9)
('Travel Bag', 'travel', 'cuboid+straps', 'medium', 'Rectangular base with rounded corners. Add straps, zippers, and buckles.', ARRAY['cuboid', 'straps']),
('Rolling Suitcase', 'travel', 'cuboid+handle', 'medium', 'Upright rectangle with telescoping handle and wheels at base.', ARRAY['cuboid', 'wheels']),
('Hat', 'travel', 'cylinder+brim', 'medium', 'Cylindrical crown with a wide brim. Show the curve of the brim.', ARRAY['cylinder', 'brim']),
('Walking Stick', 'travel', 'cylinder', 'easy', 'Long thin cylinder with a curved handle at top.', ARRAY['cylinder', 'long']),
('Water Bottle', 'travel', 'cylinder', 'easy', 'Cylinder with a cap. Show the label area and slight taper.', ARRAY['cylinder', 'cap']),
('Binoculars', 'travel', 'dual cylinders', 'medium', 'Two parallel cylinders connected by a bridge. Show the eyepiece detail.', ARRAY['cylinder', 'dual', 'optics']),
('Neck Pillow', 'travel', 'torus', 'medium', 'U-shaped torus. Show the soft, plush texture.', ARRAY['torus', 'soft']),
('Backpack', 'travel', 'cuboid+straps', 'medium', 'Rounded rectangle with shoulder straps, pockets, and zippers.', ARRAY['cuboid', 'straps', 'pockets']),
('Toiletries Bag', 'travel', 'cuboid+zip', 'medium', 'Small rectangular pouch with zipper. Show the soft material folds.', ARRAY['cuboid', 'zip']),

-- Lighting (7)
('Street Lamp', 'lighting', 'complex multi-part', 'hard', 'Tall pole with decorative lamp housing at top. Multiple curved elements.', ARRAY['pole', 'decorative', 'tall']),
('Garden Lamp', 'lighting', 'multi-part', 'medium', 'Short post with lantern-style housing. Show the glass panels.', ARRAY['post', 'lantern']),
('Oil Lamp', 'lighting', 'organic+glass', 'medium', 'Rounded base with glass chimney. Show the wick and flame.', ARRAY['organic', 'glass', 'flame']),
('Candle', 'lighting', 'cylinder+flame', 'easy', 'Simple cylinder with melting wax drips and a teardrop flame.', ARRAY['cylinder', 'flame', 'wax']),
('Desk Clamp Lamp', 'lighting', 'multi-joint', 'hard', 'Articulated arm with clamp base and conical shade. Multiple joints.', ARRAY['articulated', 'clamp', 'shade']),
('Pedestal Lamp', 'lighting', 'multi-part', 'medium', 'Base, stem, and shade assembly. Show the shade curvature.', ARRAY['pedestal', 'shade']),
('Flood Lamp', 'lighting', 'cone+mount', 'medium', 'Conical reflector with mounting bracket. Industrial appearance.', ARRAY['cone', 'mount', 'industrial']),

-- Sports (10)
('Football', 'sports', 'sphere+pentagons', 'medium', 'Sphere with pentagon/hexagon panel pattern. Show the stitching.', ARRAY['sphere', 'panels', 'stitching']),
('Cricket Ball', 'sports', 'sphere+seam', 'medium', 'Sphere with a prominent raised seam running around it.', ARRAY['sphere', 'seam']),
('Tennis Ball', 'sports', 'sphere+line', 'easy', 'Sphere with the characteristic curved line pattern. Fuzzy texture.', ARRAY['sphere', 'fuzzy']),
('Racket', 'sports', 'ellipse+handle', 'medium', 'Elliptical head with string pattern and elongated handle with grip.', ARRAY['ellipse', 'strings', 'handle']),
('Tennis Net', 'sports', 'mesh texture', 'hard', 'Diamond mesh pattern stretched between posts. Show the sag.', ARRAY['mesh', 'stretched']),
('Goal Net', 'sports', 'mesh texture', 'hard', 'Square mesh pattern attached to frame. Show depth and perspective.', ARRAY['mesh', 'frame']),
('Skateboard', 'sports', 'cuboid+wheels', 'medium', 'Flat deck with curved nose/tail and four wheels on trucks.', ARRAY['flat', 'wheels', 'curved']),
('Cycle Wheel', 'sports', 'circle+spokes', 'medium', 'Circle with hub center and radiating spokes. Show the tire profile.', ARRAY['circle', 'spokes', 'tire']),
('Helmet', 'sports', 'hemisphere', 'medium', 'Dome shape with visor and chin strap. Show the smooth surface.', ARRAY['hemisphere', 'visor']),
('Cleats/Shoes', 'sports', 'complex form', 'hard', 'Complex organic form with laces, sole studs, and material panels.', ARRAY['organic', 'complex', 'laces']),

-- Stationery (7)
('Pencil', 'stationery', 'hexagonal prism', 'easy', 'Hexagonal cross-section body with sharpened tip. Show the wood grain at tip.', ARRAY['hexagonal', 'long']),
('Eraser', 'stationery', 'cuboid', 'easy', 'Small rectangular block with rounded edges from use.', ARRAY['cuboid', 'small']),
('Sharpener', 'stationery', 'small cuboid', 'easy', 'Tiny rectangular block with a conical hole and blade.', ARRAY['cuboid', 'tiny']),
('Stapler', 'stationery', 'complex', 'medium', 'Hinged mechanism with top lever and base. Show the spring detail.', ARRAY['hinged', 'mechanical']),
('Paint Tube', 'stationery', 'cylinder', 'easy', 'Squeezable cylinder with a cap. Show the crimped bottom.', ARRAY['cylinder', 'squeezable']),
('Paint Bottle', 'stationery', 'cylinder', 'easy', 'Round bottle with label and cap. Show the liquid level inside.', ARRAY['cylinder', 'bottle']),
('Brush', 'stationery', 'cylinder+bristles', 'easy', 'Thin handle cylinder with bristle head. Show the bristle spread.', ARRAY['cylinder', 'bristles']),

-- Toiletries (8)
('Comb', 'toiletries', 'flat+teeth', 'easy', 'Flat body with evenly spaced teeth. Show the slight curve.', ARRAY['flat', 'teeth']),
('Lipstick', 'toiletries', 'cylinder', 'easy', 'Cylindrical case with angled product tip. Show the twist mechanism.', ARRAY['cylinder', 'angled']),
('Shampoo Bottle', 'toiletries', 'cylinder', 'easy', 'Curved bottle shape with pump or flip cap. Show the label.', ARRAY['cylinder', 'pump']),
('Talcum Powder', 'toiletries', 'cylinder', 'easy', 'Round container with a perforated cap. Show the label and cap detail.', ARRAY['cylinder', 'perforated']),
('Vanity Box', 'toiletries', 'cuboid+handle', 'medium', 'Rectangular case with handle, clasp, and mirror inside.', ARRAY['cuboid', 'handle', 'clasp']),
('Sunglasses', 'toiletries', 'complex curves', 'medium', 'Two lens frames connected by a bridge with temple arms.', ARRAY['curves', 'frames', 'lenses']),
('Headphone', 'toiletries', 'complex', 'medium', 'Headband with two ear cups. Show the padding and adjustment mechanism.', ARRAY['band', 'cups', 'padded']),
('Umbrella', 'toiletries', 'cone+handle', 'medium', 'Conical canopy with radiating ribs and curved handle.', ARRAY['cone', 'ribs', 'handle']);
