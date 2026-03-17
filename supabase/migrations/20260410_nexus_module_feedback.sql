-- Module item reactions (like/dislike) and issues (report issue)
-- Mirrors foundation tables for feature parity

CREATE TABLE IF NOT EXISTS nexus_module_item_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  module_item_id UUID NOT NULL REFERENCES nexus_module_items(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, module_item_id)
);

CREATE TABLE IF NOT EXISTS nexus_module_item_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  module_item_id UUID NOT NULL REFERENCES nexus_module_items(id) ON DELETE CASCADE,
  section_id UUID REFERENCES nexus_module_item_sections(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assigned_to UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
