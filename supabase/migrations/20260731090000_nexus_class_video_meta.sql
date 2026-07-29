-- ============================================================
-- Class video metadata: the YouTube upload record for a class
-- ============================================================
-- Every class recording from now on goes to the channel as an unlisted video.
-- The teacher authors the title, description, tags and chapters in Nexus (with
-- help from the Teams transcript), pastes them into YouTube Studio, uploads,
-- then comes back and pastes the video URL. That is a two-visit job, so the
-- draft has to persist somewhere.
--
-- It cannot live on library_videos: that table's youtube_video_id is NOT NULL
-- UNIQUE, and the video does not exist yet when the metadata is written. So the
-- draft gets its own row per class, and flows into library_videos on publish
-- via syncClassToLibrary().
--
-- Topic tags are NOT duplicated here. They stay in nexus_class_tags pointing at
-- the canonical nexus_qb_tags registry, so one vocabulary serves the question
-- bank, the class and the Library.

CREATE TABLE IF NOT EXISTS nexus_class_video_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID NOT NULL UNIQUE
    REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,

  -- What gets pasted into YouTube Studio
  yt_title TEXT,
  yt_description TEXT,
  yt_tags TEXT[] NOT NULL DEFAULT '{}',

  -- [{ "t": 134, "label": "Horizon line and vanishing point" }, ...]
  -- Seconds, ascending, first entry must be 0 so YouTube builds real chapters.
  chapters JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Alias / synonym expansion. Goes into the description's "Search terms" line,
  -- into the YouTube tags field, and into library_videos.key_concepts where the
  -- search_vector picks it up at weight B.
  search_terms TEXT[] NOT NULL DEFAULT '{}',

  -- Facts the Library filter chips need. These are the exact vocabularies
  -- library_videos already uses, so the bridge can copy them straight across.
  language TEXT CHECK (language IN ('ta', 'en', 'ta_en')),
  exam TEXT CHECK (exam IN ('nata', 'jee_barch', 'both', 'general')),
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'mixed')),
  category TEXT CHECK (category IN (
    'drawing', 'aptitude', 'mathematics',
    'general_knowledge', 'exam_preparation', 'orientation'
  )),

  -- Optional override for YouTube's auto-generated thumbnail, which for a
  -- screen-shared class is usually a grid of participant avatars.
  thumbnail_url TEXT,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'published')),

  generated_at TIMESTAMPTZ,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Drives the "needs YouTube metadata" filter on the teacher recordings page.
CREATE INDEX IF NOT EXISTS idx_class_video_meta_status
  ON nexus_class_video_meta(status);

-- Authorization is enforced in the API layer with the service-role client, the
-- same convention as nexus_class_tags and nexus_class_images.
ALTER TABLE nexus_class_video_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_class_video_meta" ON nexus_class_video_meta;
CREATE POLICY "service_role_full_access_class_video_meta"
  ON nexus_class_video_meta FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- Tag aliases: the single highest-leverage change for search
-- ============================================================
-- A student types "vanishing point", "1 point perspective" or "eye level".
-- None of those strings are the tag label "Perspective". Aliases collapse all
-- of them onto one canonical tag, which is used in three places:
--   1. the AI prompt, so the model maps loose phrasing onto a real tag
--   2. the generated description's "Search terms" line
--   3. query expansion inside the library_search RPC

ALTER TABLE nexus_qb_tags
  ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';

-- Trigram index over the aliases so query expansion stays cheap as the
-- vocabulary grows.
CREATE INDEX IF NOT EXISTS idx_nexus_qb_tags_aliases
  ON nexus_qb_tags USING gin (aliases);

-- --- Seed aliases for the high-traffic tags -----------------------------------
-- Only tags students actually search for. Everything else keeps an empty array
-- and still matches on its own label. Re-running is safe: this overwrites the
-- seeded set rather than appending duplicates.

UPDATE nexus_qb_tags t
SET aliases = s.aliases
FROM (VALUES
  -- Drawing
  ('drawing', ARRAY['sketching','freehand','pencil drawing','sketch','rendering','shading']),
  ('perspective', ARRAY['one point perspective','1 point perspective','two point perspective','2 point perspective','vanishing point','eye level','horizon line','vp','foreshortening','depth in drawing']),
  ('visualization_3d', ARRAY['3d visualization','3d','isometric','isometric drawing','solid geometry drawing','building 3d forms','volume drawing']),
  ('orthographic_projection', ARRAY['orthographic','plan elevation section','top view front view side view','first angle projection','third angle projection','projection']),
  ('design_fundamentals', ARRAY['principles of design','elements of design','composition','colour theory','color theory','balance','proportion','texture']),

  -- Aptitude and reasoning
  ('aptitude', ARRAY['reasoning','logical reasoning','mental ability','general aptitude']),
  ('spatial_visualization', ARRAY['spatial ability','spatial reasoning','visual perception','mental rotation','block counting']),
  ('pattern_recognition', ARRAY['patterns','series','figure series','sequence of figures','next in series']),
  ('analogy', ARRAY['analogies','figure analogy','verbal analogy','relationship questions']),
  ('counting_figures', ARRAY['count the figures','number of triangles','number of squares','figure counting']),
  ('odd_one_out', ARRAY['find the odd one','classification','which does not belong']),
  ('surface_counting', ARRAY['count the surfaces','number of surfaces','faces of a solid','cube counting']),
  ('mirror_image', ARRAY['mirror images','water image','reflection questions']),
  ('embedded_figure', ARRAY['embedded figures','hidden figure','find the figure inside']),
  ('puzzle', ARRAY['puzzles','brain teaser','logical puzzle']),

  -- Architecture knowledge
  ('history_of_architecture', ARRAY['architectural history','ancient architecture','indian architecture','styles of architecture','historic buildings']),
  ('famous_architects', ARRAY['architects','le corbusier','zaha hadid','charles correa','pritzker','famous buildings']),
  ('architecture_gk', ARRAY['architecture general knowledge','architecture awareness','architectural terms']),
  ('building_materials', ARRAY['materials','concrete','steel','timber','brick','glass','construction materials']),
  ('building_services', ARRAY['services','plumbing','hvac','electrical','lighting','acoustics','fire safety']),
  ('building_science', ARRAY['climate and architecture','thermal comfort','daylighting','ventilation']),
  ('planning', ARRAY['town planning','urban planning','site planning','space planning','zoning']),
  ('sustainability', ARRAY['green building','sustainable architecture','griha','leed','energy efficient']),
  ('general_knowledge', ARRAY['gk','general awareness','static gk']),
  ('current_affairs', ARRAY['current events','news','recent developments']),

  -- Mathematics, the ones that get searched by name
  ('mathematics', ARRAY['maths','math','quantitative']),
  ('trigonometry', ARRAY['trig','sine cosine tangent','trigonometric identities','heights and distances']),
  ('probability', ARRAY['chance','bayes','conditional probability']),
  ('matrices', ARRAY['matrix','matrix algebra']),
  ('determinants', ARRAY['determinant','cramers rule']),
  ('complex_numbers', ARRAY['iota','argand plane','modulus argument']),
  ('vectors', ARRAY['vector algebra','dot product','cross product']),
  ('3d_geometry', ARRAY['three dimensional geometry','direction cosines','plane and line in space']),
  ('conic_sections', ARRAY['parabola','ellipse','hyperbola','conics']),
  ('sequences_and_series', ARRAY['ap gp','arithmetic progression','geometric progression','series and sequences']),
  ('permutations_combinations', ARRAY['permutation','combination','ncr npr','counting principle']),
  ('definite_integrals', ARRAY['integration','definite integration','area under curve']),
  ('indefinite_integrals', ARRAY['integration','antiderivative','indefinite integration']),
  ('differential_equations', ARRAY['differential equation','order and degree']),
  ('applications_of_derivatives', ARRAY['maxima minima','tangent normal','rate of change','derivatives application']),
  ('quadratic_equations', ARRAY['quadratic','roots of equation','discriminant']),
  ('functions', ARRAY['domain and range','types of functions','composite function']),
  ('sets_and_relations', ARRAY['sets','relations','venn diagram'])
) AS s(slug, aliases)
WHERE t.slug = s.slug;
