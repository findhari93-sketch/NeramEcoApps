-- ============================================================
-- Nexus QB: real maths chapters, the NCERT catalog, and "What to study"
--
-- The founder filtered Trigonometry in class and found it misleading: "the
-- domain of sqrt(2x-3) + sin x + sqrt(x-1)" sat there because `sin x` appears,
-- though it is a Functions question. Every maths question carried exactly one
-- chapter, picked by spotting symbols, and `trigonometry` had no sub-chapters,
-- so Heights and Distances or Inverse Trig had nowhere else to go.
--
-- This migration:
--   1. Completes the maths chapter tree in nexus_qb_tags (trigonometry gets
--      children; calculus gets limits, methods of differentiation and area
--      under curves; algebra gets logarithms).
--   2. Adds nexus_ncert_sections: NCERT Mathematics chapters and sections,
--      Classes 10 to 12, copied from the contents pages of the Reprint 2026-27
--      textbooks on ncert.nic.in. Keyed by a stable ref ('c11.2.4') so data
--      written on one environment means the same thing on the other.
--   3. Adds nexus_qb_tag_ncert: each chapter tag's default NCERT reading.
--   4. Adds nexus_qb_question_study: per question, the primary chapter, the
--      chapters it also uses, and the concepts to study, each pointing at an
--      NCERT section or a Foundation book section.
--
-- The filter keeps reading categories[]. Only the primary chapter goes there,
-- so filtering Trigonometry shows questions that are about trigonometry, and
-- "also uses" chapters are shown, not filtered on.
--
-- Slug keyed and idempotent throughout: tag ids differ between environments.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Maths chapter tags
-- ------------------------------------------------------------
INSERT INTO nexus_qb_tags (group_type, slug, label, is_system, sort_order) VALUES
  ('subject', 'trigonometric_ratios',    'Trigonometric Ratios & Identities', true, 531),
  ('subject', 'trigonometric_equations', 'Trigonometric Equations',           true, 532),
  ('subject', 'inverse_trigonometry',    'Inverse Trigonometric Functions',   true, 533),
  ('subject', 'properties_of_triangles', 'Properties of Triangles',           true, 534),
  ('subject', 'heights_and_distances',   'Heights & Distances',               true, 535),
  ('subject', 'limits',                  'Limits',                            true, 520),
  ('subject', 'differentiation',         'Methods of Differentiation',        true, 522),
  ('subject', 'area_under_curves',       'Area Under Curves',                 true, 528),
  ('subject', 'logarithms',              'Logarithms',                        true, 511)
ON CONFLICT (slug) DO NOTHING;

WITH m(child_slug, parent_slug, ord) AS (
  VALUES
    ('trigonometric_ratios',    'trigonometry', 531),
    ('trigonometric_equations', 'trigonometry', 532),
    ('inverse_trigonometry',    'trigonometry', 533),
    ('properties_of_triangles', 'trigonometry', 534),
    ('heights_and_distances',   'trigonometry', 535),
    ('limits',                  'calculus',     520),
    ('differentiation',         'calculus',     522),
    ('area_under_curves',       'calculus',     528),
    ('logarithms',              'algebra',      511)
)
UPDATE nexus_qb_tags c
SET parent_id = p.id, sort_order = m.ord, is_active = true, updated_at = now()
FROM m
JOIN nexus_qb_tags p ON p.slug = m.parent_slug AND p.group_type = 'subject'
WHERE c.slug = m.child_slug AND c.group_type = 'subject';

-- Limits has its own chapter now.
UPDATE nexus_qb_tags SET label = 'Continuity', updated_at = now()
WHERE slug = 'continuity' AND group_type = 'subject';

-- ------------------------------------------------------------
-- 2. NCERT catalog
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nexus_ncert_sections (
  ref           text PRIMARY KEY,                 -- 'c11.2' (chapter) or 'c11.2.4' (section)
  subject       text NOT NULL DEFAULT 'mathematics',
  class_level   smallint NOT NULL CHECK (class_level BETWEEN 6 AND 12),
  chapter_no    smallint NOT NULL,
  chapter_title text NOT NULL,
  section_no    text,                             -- NULL = the whole chapter
  section_title text,
  pdf_file      text NOT NULL,                    -- https://ncert.nic.in/textbook/pdf/<pdf_file>.pdf
  edition       text NOT NULL DEFAULT 'Reprint 2026-27',
  sort_order    int NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true
);

ALTER TABLE nexus_ncert_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_ncert_sections" ON nexus_ncert_sections;
CREATE POLICY "service_role_ncert_sections" ON nexus_ncert_sections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO nexus_ncert_sections
  (ref, class_level, chapter_no, chapter_title, section_no, section_title, pdf_file, sort_order)
VALUES
  ('c10.8', 10, 8, 'Introduction to Trigonometry', NULL, NULL, 'jemh108', 20),
  ('c10.8.2', 10, 8, 'Introduction to Trigonometry', '8.2', 'Trigonometric Ratios', 'jemh108', 21),
  ('c10.8.3', 10, 8, 'Introduction to Trigonometry', '8.3', 'Trigonometric Ratios of Some Specific Angles', 'jemh108', 22),
  ('c10.8.4', 10, 8, 'Introduction to Trigonometry', '8.4', 'Trigonometric Identities', 'jemh108', 23),
  ('c10.9', 10, 9, 'Some Applications of Trigonometry', NULL, NULL, 'jemh109', 40),
  ('c10.9.1', 10, 9, 'Some Applications of Trigonometry', '9.1', 'Heights and Distances', 'jemh109', 41),
  ('c11.1', 11, 1, 'Sets', NULL, NULL, 'kemh101', 60),
  ('c11.1.2', 11, 1, 'Sets', '1.2', 'Sets and their Representations', 'kemh101', 61),
  ('c11.1.3', 11, 1, 'Sets', '1.3', 'The Empty Set', 'kemh101', 62),
  ('c11.1.4', 11, 1, 'Sets', '1.4', 'Finite and Infinite Sets', 'kemh101', 63),
  ('c11.1.5', 11, 1, 'Sets', '1.5', 'Equal Sets', 'kemh101', 64),
  ('c11.1.6', 11, 1, 'Sets', '1.6', 'Subsets', 'kemh101', 65),
  ('c11.1.7', 11, 1, 'Sets', '1.7', 'Universal Set', 'kemh101', 66),
  ('c11.1.8', 11, 1, 'Sets', '1.8', 'Venn Diagrams', 'kemh101', 67),
  ('c11.1.9', 11, 1, 'Sets', '1.9', 'Operations on Sets', 'kemh101', 68),
  ('c11.1.10', 11, 1, 'Sets', '1.10', 'Complement of a Set', 'kemh101', 69),
  ('c11.2', 11, 2, 'Relations and Functions', NULL, NULL, 'kemh102', 80),
  ('c11.2.2', 11, 2, 'Relations and Functions', '2.2', 'Cartesian Product of Sets', 'kemh102', 81),
  ('c11.2.3', 11, 2, 'Relations and Functions', '2.3', 'Relations', 'kemh102', 82),
  ('c11.2.4', 11, 2, 'Relations and Functions', '2.4', 'Functions', 'kemh102', 83),
  ('c11.3', 11, 3, 'Trigonometric Functions', NULL, NULL, 'kemh103', 100),
  ('c11.3.2', 11, 3, 'Trigonometric Functions', '3.2', 'Angles', 'kemh103', 101),
  ('c11.3.3', 11, 3, 'Trigonometric Functions', '3.3', 'Trigonometric Functions', 'kemh103', 102),
  ('c11.3.4', 11, 3, 'Trigonometric Functions', '3.4', 'Trigonometric Functions of Sum and Difference of Two Angles', 'kemh103', 103),
  ('c11.4', 11, 4, 'Complex Numbers and Quadratic Equations', NULL, NULL, 'kemh104', 120),
  ('c11.4.2', 11, 4, 'Complex Numbers and Quadratic Equations', '4.2', 'Complex Numbers', 'kemh104', 121),
  ('c11.4.3', 11, 4, 'Complex Numbers and Quadratic Equations', '4.3', 'Algebra of Complex Numbers', 'kemh104', 122),
  ('c11.4.4', 11, 4, 'Complex Numbers and Quadratic Equations', '4.4', 'The Modulus and the Conjugate of a Complex Number', 'kemh104', 123),
  ('c11.4.5', 11, 4, 'Complex Numbers and Quadratic Equations', '4.5', 'Argand Plane and Polar Representation', 'kemh104', 124),
  ('c11.5', 11, 5, 'Linear Inequalities', NULL, NULL, 'kemh105', 140),
  ('c11.5.2', 11, 5, 'Linear Inequalities', '5.2', 'Inequalities', 'kemh105', 141),
  ('c11.5.3', 11, 5, 'Linear Inequalities', '5.3', 'Algebraic Solutions of Linear Inequalities in One Variable and their Graphical Representation', 'kemh105', 142),
  ('c11.6', 11, 6, 'Permutations and Combinations', NULL, NULL, 'kemh106', 160),
  ('c11.6.2', 11, 6, 'Permutations and Combinations', '6.2', 'Fundamental Principle of Counting', 'kemh106', 161),
  ('c11.6.3', 11, 6, 'Permutations and Combinations', '6.3', 'Permutations', 'kemh106', 162),
  ('c11.6.4', 11, 6, 'Permutations and Combinations', '6.4', 'Combinations', 'kemh106', 163),
  ('c11.7', 11, 7, 'Binomial Theorem', NULL, NULL, 'kemh107', 180),
  ('c11.7.2', 11, 7, 'Binomial Theorem', '7.2', 'Binomial Theorem for Positive Integral Indices', 'kemh107', 181),
  ('c11.8', 11, 8, 'Sequences and Series', NULL, NULL, 'kemh108', 200),
  ('c11.8.2', 11, 8, 'Sequences and Series', '8.2', 'Sequences', 'kemh108', 201),
  ('c11.8.3', 11, 8, 'Sequences and Series', '8.3', 'Series', 'kemh108', 202),
  ('c11.8.4', 11, 8, 'Sequences and Series', '8.4', 'Geometric Progression (G.P.)', 'kemh108', 203),
  ('c11.8.5', 11, 8, 'Sequences and Series', '8.5', 'Relationship Between A.M. and G.M.', 'kemh108', 204),
  ('c11.9', 11, 9, 'Straight Lines', NULL, NULL, 'kemh109', 220),
  ('c11.9.2', 11, 9, 'Straight Lines', '9.2', 'Slope of a Line', 'kemh109', 221),
  ('c11.9.3', 11, 9, 'Straight Lines', '9.3', 'Various Forms of the Equation of a Line', 'kemh109', 222),
  ('c11.9.4', 11, 9, 'Straight Lines', '9.4', 'Distance of a Point From a Line', 'kemh109', 223),
  ('c11.10', 11, 10, 'Conic Sections', NULL, NULL, 'kemh110', 240),
  ('c11.10.2', 11, 10, 'Conic Sections', '10.2', 'Sections of a Cone', 'kemh110', 241),
  ('c11.10.3', 11, 10, 'Conic Sections', '10.3', 'Circle', 'kemh110', 242),
  ('c11.10.4', 11, 10, 'Conic Sections', '10.4', 'Parabola', 'kemh110', 243),
  ('c11.10.5', 11, 10, 'Conic Sections', '10.5', 'Ellipse', 'kemh110', 244),
  ('c11.10.6', 11, 10, 'Conic Sections', '10.6', 'Hyperbola', 'kemh110', 245),
  ('c11.11', 11, 11, 'Introduction to Three Dimensional Geometry', NULL, NULL, 'kemh111', 260),
  ('c11.11.2', 11, 11, 'Introduction to Three Dimensional Geometry', '11.2', 'Coordinate Axes and Coordinate Planes in Three Dimensional Space', 'kemh111', 261),
  ('c11.11.3', 11, 11, 'Introduction to Three Dimensional Geometry', '11.3', 'Coordinates of a Point in Space', 'kemh111', 262),
  ('c11.11.4', 11, 11, 'Introduction to Three Dimensional Geometry', '11.4', 'Distance between Two Points', 'kemh111', 263),
  ('c11.12', 11, 12, 'Limits and Derivatives', NULL, NULL, 'kemh112', 280),
  ('c11.12.2', 11, 12, 'Limits and Derivatives', '12.2', 'Intuitive Idea of Derivatives', 'kemh112', 281),
  ('c11.12.3', 11, 12, 'Limits and Derivatives', '12.3', 'Limits', 'kemh112', 282),
  ('c11.12.4', 11, 12, 'Limits and Derivatives', '12.4', 'Limits of Trigonometric Functions', 'kemh112', 283),
  ('c11.12.5', 11, 12, 'Limits and Derivatives', '12.5', 'Derivatives', 'kemh112', 284),
  ('c11.13', 11, 13, 'Statistics', NULL, NULL, 'kemh113', 300),
  ('c11.13.2', 11, 13, 'Statistics', '13.2', 'Measures of Dispersion', 'kemh113', 301),
  ('c11.13.3', 11, 13, 'Statistics', '13.3', 'Range', 'kemh113', 302),
  ('c11.13.4', 11, 13, 'Statistics', '13.4', 'Mean Deviation', 'kemh113', 303),
  ('c11.13.5', 11, 13, 'Statistics', '13.5', 'Variance and Standard Deviation', 'kemh113', 304),
  ('c11.14', 11, 14, 'Probability', NULL, NULL, 'kemh114', 320),
  ('c11.14.1', 11, 14, 'Probability', '14.1', 'Event', 'kemh114', 321),
  ('c11.14.2', 11, 14, 'Probability', '14.2', 'Axiomatic Approach to Probability', 'kemh114', 322),
  ('c12.1', 12, 1, 'Relations and Functions', NULL, NULL, 'lemh101', 340),
  ('c12.1.2', 12, 1, 'Relations and Functions', '1.2', 'Types of Relations', 'lemh101', 341),
  ('c12.1.3', 12, 1, 'Relations and Functions', '1.3', 'Types of Functions', 'lemh101', 342),
  ('c12.1.4', 12, 1, 'Relations and Functions', '1.4', 'Composition of Functions and Invertible Function', 'lemh101', 343),
  ('c12.2', 12, 2, 'Inverse Trigonometric Functions', NULL, NULL, 'lemh102', 360),
  ('c12.2.2', 12, 2, 'Inverse Trigonometric Functions', '2.2', 'Basic Concepts', 'lemh102', 361),
  ('c12.2.3', 12, 2, 'Inverse Trigonometric Functions', '2.3', 'Properties of Inverse Trigonometric Functions', 'lemh102', 362),
  ('c12.3', 12, 3, 'Matrices', NULL, NULL, 'lemh103', 380),
  ('c12.3.2', 12, 3, 'Matrices', '3.2', 'Matrix', 'lemh103', 381),
  ('c12.3.3', 12, 3, 'Matrices', '3.3', 'Types of Matrices', 'lemh103', 382),
  ('c12.3.4', 12, 3, 'Matrices', '3.4', 'Operations on Matrices', 'lemh103', 383),
  ('c12.3.5', 12, 3, 'Matrices', '3.5', 'Transpose of a Matrix', 'lemh103', 384),
  ('c12.3.6', 12, 3, 'Matrices', '3.6', 'Symmetric and Skew Symmetric Matrices', 'lemh103', 385),
  ('c12.3.7', 12, 3, 'Matrices', '3.7', 'Invertible Matrices', 'lemh103', 386),
  ('c12.4', 12, 4, 'Determinants', NULL, NULL, 'lemh104', 400),
  ('c12.4.2', 12, 4, 'Determinants', '4.2', 'Determinant', 'lemh104', 401),
  ('c12.4.3', 12, 4, 'Determinants', '4.3', 'Area of a Triangle', 'lemh104', 402),
  ('c12.4.4', 12, 4, 'Determinants', '4.4', 'Minors and Cofactors', 'lemh104', 403),
  ('c12.4.5', 12, 4, 'Determinants', '4.5', 'Adjoint and Inverse of a Matrix', 'lemh104', 404),
  ('c12.4.6', 12, 4, 'Determinants', '4.6', 'Applications of Determinants and Matrices', 'lemh104', 405),
  ('c12.5', 12, 5, 'Continuity and Differentiability', NULL, NULL, 'lemh105', 420),
  ('c12.5.2', 12, 5, 'Continuity and Differentiability', '5.2', 'Continuity', 'lemh105', 421),
  ('c12.5.3', 12, 5, 'Continuity and Differentiability', '5.3', 'Differentiability', 'lemh105', 422),
  ('c12.5.4', 12, 5, 'Continuity and Differentiability', '5.4', 'Exponential and Logarithmic Functions', 'lemh105', 423),
  ('c12.5.5', 12, 5, 'Continuity and Differentiability', '5.5', 'Logarithmic Differentiation', 'lemh105', 424),
  ('c12.5.6', 12, 5, 'Continuity and Differentiability', '5.6', 'Derivatives of Functions in Parametric Forms', 'lemh105', 425),
  ('c12.5.7', 12, 5, 'Continuity and Differentiability', '5.7', 'Second Order Derivative', 'lemh105', 426),
  ('c12.6', 12, 6, 'Application of Derivatives', NULL, NULL, 'lemh106', 440),
  ('c12.6.2', 12, 6, 'Application of Derivatives', '6.2', 'Rate of Change of Quantities', 'lemh106', 441),
  ('c12.6.3', 12, 6, 'Application of Derivatives', '6.3', 'Increasing and Decreasing Functions', 'lemh106', 442),
  ('c12.6.4', 12, 6, 'Application of Derivatives', '6.4', 'Maxima and Minima', 'lemh106', 443),
  ('c12.7', 12, 7, 'Integrals', NULL, NULL, 'lemh201', 460),
  ('c12.7.2', 12, 7, 'Integrals', '7.2', 'Integration as an Inverse Process of Differentiation', 'lemh201', 461),
  ('c12.7.3', 12, 7, 'Integrals', '7.3', 'Methods of Integration', 'lemh201', 462),
  ('c12.7.4', 12, 7, 'Integrals', '7.4', 'Integrals of Some Particular Functions', 'lemh201', 463),
  ('c12.7.5', 12, 7, 'Integrals', '7.5', 'Integration by Partial Fractions', 'lemh201', 464),
  ('c12.7.6', 12, 7, 'Integrals', '7.6', 'Integration by Parts', 'lemh201', 465),
  ('c12.7.7', 12, 7, 'Integrals', '7.7', 'Definite Integral', 'lemh201', 466),
  ('c12.7.8', 12, 7, 'Integrals', '7.8', 'Fundamental Theorem of Calculus', 'lemh201', 467),
  ('c12.7.9', 12, 7, 'Integrals', '7.9', 'Evaluation of Definite Integrals by Substitution', 'lemh201', 468),
  ('c12.7.10', 12, 7, 'Integrals', '7.10', 'Some Properties of Definite Integrals', 'lemh201', 469),
  ('c12.8', 12, 8, 'Application of Integrals', NULL, NULL, 'lemh202', 480),
  ('c12.8.2', 12, 8, 'Application of Integrals', '8.2', 'Area under Simple Curves', 'lemh202', 481),
  ('c12.9', 12, 9, 'Differential Equations', NULL, NULL, 'lemh203', 500),
  ('c12.9.2', 12, 9, 'Differential Equations', '9.2', 'Basic Concepts', 'lemh203', 501),
  ('c12.9.3', 12, 9, 'Differential Equations', '9.3', 'General and Particular Solutions of a Differential Equation', 'lemh203', 502),
  ('c12.9.4', 12, 9, 'Differential Equations', '9.4', 'Methods of Solving First Order, First Degree Differential Equations', 'lemh203', 503),
  ('c12.10', 12, 10, 'Vector Algebra', NULL, NULL, 'lemh204', 520),
  ('c12.10.2', 12, 10, 'Vector Algebra', '10.2', 'Some Basic Concepts', 'lemh204', 521),
  ('c12.10.3', 12, 10, 'Vector Algebra', '10.3', 'Types of Vectors', 'lemh204', 522),
  ('c12.10.4', 12, 10, 'Vector Algebra', '10.4', 'Addition of Vectors', 'lemh204', 523),
  ('c12.10.5', 12, 10, 'Vector Algebra', '10.5', 'Multiplication of a Vector by a Scalar', 'lemh204', 524),
  ('c12.10.6', 12, 10, 'Vector Algebra', '10.6', 'Product of Two Vectors', 'lemh204', 525),
  ('c12.11', 12, 11, 'Three Dimensional Geometry', NULL, NULL, 'lemh205', 540),
  ('c12.11.2', 12, 11, 'Three Dimensional Geometry', '11.2', 'Direction Cosines and Direction Ratios of a Line', 'lemh205', 541),
  ('c12.11.3', 12, 11, 'Three Dimensional Geometry', '11.3', 'Equation of a Line in Space', 'lemh205', 542),
  ('c12.11.4', 12, 11, 'Three Dimensional Geometry', '11.4', 'Angle between Two Lines', 'lemh205', 543),
  ('c12.11.5', 12, 11, 'Three Dimensional Geometry', '11.5', 'Shortest Distance between Two Lines', 'lemh205', 544),
  ('c12.12', 12, 12, 'Linear Programming', NULL, NULL, 'lemh206', 560),
  ('c12.12.2', 12, 12, 'Linear Programming', '12.2', 'Linear Programming Problem and its Mathematical Formulation', 'lemh206', 561),
  ('c12.13', 12, 13, 'Probability', NULL, NULL, 'lemh207', 580),
  ('c12.13.2', 12, 13, 'Probability', '13.2', 'Conditional Probability', 'lemh207', 581),
  ('c12.13.3', 12, 13, 'Probability', '13.3', 'Multiplication Theorem on Probability', 'lemh207', 582),
  ('c12.13.4', 12, 13, 'Probability', '13.4', 'Independent Events', 'lemh207', 583),
  ('c12.13.5', 12, 13, 'Probability', '13.5', 'Bayes'' Theorem', 'lemh207', 584)
ON CONFLICT (ref) DO UPDATE SET
  chapter_title = EXCLUDED.chapter_title,
  section_no    = EXCLUDED.section_no,
  section_title = EXCLUDED.section_title,
  pdf_file      = EXCLUDED.pdf_file,
  sort_order    = EXCLUDED.sort_order;

-- ------------------------------------------------------------
-- 3. Each chapter tag's default NCERT reading
--    Some JEE chapters are no longer in NCERT after the rationalisation:
--    trigonometric equations, properties of triangles, mean value theorems,
--    mathematical logic and locus get the nearest NCERT section and
--    beyond_ncert = true, so the student is told to go further.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nexus_qb_tag_ncert (
  tag_slug     text NOT NULL,
  ncert_ref    text NOT NULL REFERENCES nexus_ncert_sections(ref) ON DELETE CASCADE,
  beyond_ncert boolean NOT NULL DEFAULT false,
  sort_order   smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (tag_slug, ncert_ref)
);

ALTER TABLE nexus_qb_tag_ncert ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_qb_tag_ncert" ON nexus_qb_tag_ncert;
CREATE POLICY "service_role_qb_tag_ncert" ON nexus_qb_tag_ncert
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO nexus_qb_tag_ncert (tag_slug, ncert_ref, beyond_ncert, sort_order) VALUES
  -- Algebra
  ('sets_and_relations',          'c11.1',    false, 1),
  ('sets_and_relations',          'c12.1.2',  false, 2),
  ('functions',                   'c11.2.4',  false, 1),
  ('functions',                   'c12.1.3',  false, 2),
  ('complex_numbers',             'c11.4',    false, 1),
  ('quadratic_equations',         'c11.4',    true,  1),
  ('sequences_and_series',        'c11.8',    false, 1),
  ('permutations_combinations',   'c11.6',    false, 1),
  ('binomial_theorem',            'c11.7',    false, 1),
  ('matrices',                    'c12.3',    false, 1),
  ('determinants',                'c12.4',    false, 1),
  ('mathematical_logic',          'c11.1',    true,  1),
  ('logarithms',                  'c12.5.4',  true,  1),
  -- Coordinate geometry
  ('straight_lines',              'c11.9',    false, 1),
  ('circles',                     'c11.10.3', false, 1),
  ('parabola',                    'c11.10.4', false, 1),
  ('ellipse',                     'c11.10.5', false, 1),
  ('hyperbola',                   'c11.10.6', false, 1),
  ('conic_sections',              'c11.10',   false, 1),
  ('locus',                       'c11.9',    true,  1),
  ('areas_of_triangles',          'c12.4.3',  false, 1),
  -- Trigonometry
  ('trigonometric_ratios',        'c11.3',    false, 1),
  ('trigonometric_ratios',        'c10.8.4',  false, 2),
  ('trigonometric_equations',     'c11.3',    true,  1),
  ('inverse_trigonometry',        'c12.2',    false, 1),
  ('properties_of_triangles',     'c11.3.4',  true,  1),
  ('heights_and_distances',       'c10.9.1',  false, 1),
  ('trigonometry',                'c11.3',    false, 1),
  -- Calculus
  ('limits',                      'c11.12.3', false, 1),
  ('limits',                      'c11.12.4', false, 2),
  ('continuity',                  'c12.5.2',  false, 1),
  ('differentiability',           'c12.5.3',  false, 1),
  ('differentiation',             'c11.12.5', false, 1),
  ('differentiation',             'c12.5',    false, 2),
  ('applications_of_derivatives', 'c12.6',    false, 1),
  ('mean_value_theorems',         'c12.5.3',  true,  1),
  ('indefinite_integrals',        'c12.7.3',  false, 1),
  ('definite_integrals',          'c12.7.7',  false, 1),
  ('definite_integrals',          'c12.7.10', false, 2),
  ('area_under_curves',           'c12.8',    false, 1),
  ('differential_equations',      'c12.9',    false, 1),
  -- Vectors & 3D
  ('vectors',                     'c12.10',   false, 1),
  ('3d_geometry',                 'c12.11',   false, 1),
  ('3d_geometry',                 'c11.11',   false, 2),
  -- Probability & statistics
  ('probability',                 'c11.14',   false, 1),
  ('probability',                 'c12.13',   false, 2),
  ('statistics',                  'c11.13',   false, 1)
ON CONFLICT (tag_slug, ncert_ref) DO UPDATE SET
  beyond_ncert = EXCLUDED.beyond_ncert,
  sort_order   = EXCLUDED.sort_order;

-- ------------------------------------------------------------
-- 4. Per-question "What to study"
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nexus_qb_question_study (
  question_id  uuid PRIMARY KEY REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  primary_slug text,                     -- the chapter the question is about; mirrors categories[]
  also_uses    text[] NOT NULL DEFAULT '{}',
  -- [{ name, why?, ncert_ref?, foundation_section_id? }]. Refs are resolved at
  -- read time; an unknown one is dropped, never shown broken.
  concepts     jsonb NOT NULL DEFAULT '[]'::jsonb,
  source       text NOT NULL CHECK (source IN ('ai', 'staff')),
  model        text,
  confidence   real,
  rationale    text,
  reviewed_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Students see a row once a teacher wrote or approved it, or the model was sure.
-- getQBQuestionDetail applies the same rule (qbStudyIsVisible).
CREATE INDEX IF NOT EXISTS idx_qb_question_study_unreviewed
  ON nexus_qb_question_study(confidence)
  WHERE reviewed_at IS NULL AND source = 'ai';

ALTER TABLE nexus_qb_question_study ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_qb_question_study" ON nexus_qb_question_study;
CREATE POLICY "service_role_qb_question_study" ON nexus_qb_question_study
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE nexus_qb_question_study IS
  'What a student needs to study for a QB question: primary chapter (mirrored into categories[]), chapters it also uses, and concepts pointing at nexus_ncert_sections.ref or nexus_foundation_sections.id.';

NOTIFY pgrst, 'reload schema';
