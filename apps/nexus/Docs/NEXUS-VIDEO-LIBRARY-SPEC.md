# NEXUS-VIDEO-LIBRARY-SPEC.md

> **Module**: Video Library (Class Archive)
> **App**: nexus.neramclasses.com
> **Stack**: Next.js + Fluent UI v9 + Supabase + YouTube Data API v3
> **Author**: Hari (Neram Classes)
> **Status**: Spec Ready — Phase 1 Implementation
> **Last Updated**: March 2026

---

## 1. Context & Problem

Neram Classes has **1000+ recorded class sessions** uploaded to YouTube as **unlisted videos** over the past 10 years. These recordings were used purely as cloud storage — most have no proper titles, descriptions, or organization. They cover NATA, JEE B.Arch, and related coaching content.

**The problem**: This is a goldmine of educational content sitting unused. Students have no way to discover, browse, or learn from these historical classes. There is no categorization, no search, no structure.

**The solution**: Build a **Video Library module** inside Nexus that pulls all unlisted video metadata from YouTube, auto-classifies them using AI transcript analysis, and presents them as a structured, browsable, filterable library. Videos stay hosted on YouTube (zero bandwidth cost), Nexus is the discovery and viewing layer.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      ONE-TIME SYNC PIPELINE                  │
│                                                              │
│  YouTube Data API v3    youtube-transcript-api (Python)       │
│  ──────────────────     ──────────────────────────────        │
│  Pull video metadata    Pull auto-generated captions          │
│  (id, title, duration,  (Tamil/English transcripts,           │
│   thumbnail, date)       timestamps)                          │
│         │                        │                            │
│         └───────┬────────────────┘                            │
│                 ▼                                             │
│        Claude API (Batch)                                    │
│        ─────────────────                                     │
│        Read transcript → Return structured JSON tags:        │
│        language, category, subcategory, topics,              │
│        suggested_title, difficulty, exam_relevance           │
│                 │                                            │
│                 ▼                                             │
│           Supabase                                           │
│           ────────                                           │
│           Store video metadata + tags + transcript           │
│                 │                                            │
│                 ▼                                             │
│        Admin Review UI (Nexus)                               │
│        ───────────────────────                               │
│        Teacher/admin reviews auto-tags,                      │
│        corrects, approves (~30 sec/video)                    │
│                 │                                            │
│                 ▼                                             │
│        Student Library UI (Nexus)                            │
│        ──────────────────────────                            │
│        Browse, filter, search, watch                         │
└──────────────────────────────────────────────────────────────┘
```

### Why YouTube stays as the host

- Zero storage/bandwidth cost for 1000+ videos
- Adaptive bitrate streaming (auto quality adjustment)
- Works on all devices and network conditions
- Unlisted videos are embeddable with video ID
- No migration needed — videos are already there

---

## 3. YouTube API Integration

### 3.1 Authentication

Use **OAuth 2.0** with the Neram Classes YouTube channel owner account. Required scopes:

```
https://www.googleapis.com/auth/youtube.readonly
https://www.googleapis.com/auth/youtube.force-ssl  (for captions)
```

### 3.2 Fetching All Unlisted Videos

YouTube Data API v3 does not have a direct "list all unlisted videos" endpoint. The approach:

1. **List all uploads playlist**: Every channel has a hidden "uploads" playlist
2. **Paginate through all videos**: Use `playlistItems.list` with `maxResults=50` per page
3. **Get video details**: Use `videos.list` for each batch to get full metadata including `privacyStatus`
4. **Filter**: Keep only videos where `status.privacyStatus === 'unlisted'`

```javascript
// Step 1: Get the channel's uploads playlist ID
const channelResponse = await youtube.channels.list({
  part: 'contentDetails',
  mine: true
});
const uploadsPlaylistId = channelResponse.data.items[0]
  .contentDetails.relatedPlaylists.uploads;

// Step 2: Paginate through all uploads
let nextPageToken = null;
const allVideoIds = [];

do {
  const playlistResponse = await youtube.playlistItems.list({
    part: 'contentDetails',
    playlistId: uploadsPlaylistId,
    maxResults: 50,
    pageToken: nextPageToken
  });

  const videoIds = playlistResponse.data.items
    .map(item => item.contentDetails.videoId);
  allVideoIds.push(...videoIds);

  nextPageToken = playlistResponse.data.pageToken;
} while (nextPageToken);

// Step 3: Get full details in batches of 50
for (let i = 0; i < allVideoIds.length; i += 50) {
  const batch = allVideoIds.slice(i, i + 50);
  const videosResponse = await youtube.videos.list({
    part: 'snippet,contentDetails,status',
    id: batch.join(',')
  });

  // Step 4: Filter unlisted only
  const unlistedVideos = videosResponse.data.items
    .filter(v => v.status.privacyStatus === 'unlisted');

  // Store each video's metadata
  for (const video of unlistedVideos) {
    await storeVideoMetadata(video);
  }
}
```

### 3.3 API Quota Management

YouTube Data API has a **10,000 units/day** default quota.

| Operation | Cost | For 1000 videos |
|-----------|------|-----------------|
| `channels.list` | 1 unit | 1 unit (once) |
| `playlistItems.list` (per page of 50) | 1 unit | ~20 units |
| `videos.list` (per batch of 50) | 1 unit | ~20 units |
| `captions.list` (per video) | 50 units | 50,000 units ⚠️ |
| `captions.download` (per video) | 200 units | 200,000 units ⚠️ |

**Important**: The Captions API is too expensive for bulk use. Use `youtube-transcript-api` (Python) instead — it does NOT consume API quota and works for unlisted videos you have the ID for.

### 3.4 Transcript Extraction (No API Key Needed)

Use the open-source `youtube-transcript-api` Python library. It works for:
- Public videos ✅
- Unlisted videos (if you have the video ID) ✅
- Auto-generated captions ✅
- Tamil auto-captions ✅
- English auto-captions ✅

```python
from youtube_transcript_api import YouTubeTranscriptApi

ytt_api = YouTubeTranscriptApi()

def get_transcript(video_id: str) -> dict:
    """
    Attempt to fetch transcript in priority order:
    1. Manual Tamil transcript
    2. Auto-generated Tamil
    3. Manual English
    4. Auto-generated English
    """
    try:
        transcript_list = ytt_api.list_transcripts(video_id)

        # Try Tamil first, then English
        for lang in ['ta', 'en']:
            try:
                transcript = transcript_list.find_transcript([lang])
                segments = transcript.fetch()
                return {
                    'video_id': video_id,
                    'language': lang,
                    'is_generated': transcript.is_generated,
                    'segments': segments,
                    'full_text': ' '.join([s['text'] for s in segments]),
                    'status': 'success'
                }
            except Exception:
                continue

        return {
            'video_id': video_id,
            'status': 'no_transcript',
            'segments': [],
            'full_text': ''
        }

    except Exception as e:
        return {
            'video_id': video_id,
            'status': 'error',
            'error': str(e),
            'segments': [],
            'full_text': ''
        }
```

### 3.5 Handling Missing Transcripts

For the ~10-20% of videos where auto-captions are unavailable:

| Scenario | Solution |
|----------|----------|
| Very old recordings (pre-2016) | Flag for manual review |
| Poor audio quality | Flag for manual review |
| Screen-share only (no speech) | Tag as "visual-only", skip classification |
| Music/ambient only | Tag as "non-class", exclude from library |
| Tamil with poor auto-caption | Try English fallback, then flag |

These flagged videos go into a separate "needs manual tagging" queue in the admin UI.

---

## 4. AI Classification Pipeline

### 4.1 Taxonomy

Define the classification taxonomy before running the pipeline.

#### Language

| Code | Label |
|------|-------|
| `ta` | Tamil |
| `en` | English |
| `ta_en` | Bilingual (Tamil + English) |

#### Exam

| Code | Label |
|------|-------|
| `nata` | NATA |
| `jee_barch` | JEE B.Arch (Paper 2) |
| `both` | Applicable to both |
| `general` | General / not exam-specific |

#### Category → Subcategory

```
drawing
├── freehand_sketching
├── perspective_drawing
├── 2d_composition
├── 3d_composition
├── imagination_drawing
├── poster_design
├── color_theory
├── shading_techniques
├── human_figure
├── landscape_drawing
├── object_drawing
└── memory_drawing

aptitude
├── spatial_reasoning
├── visual_perception
├── pattern_recognition
├── mental_ability
├── aesthetic_sensitivity
├── observation_skills
├── logical_reasoning
└── figure_completion

mathematics
├── algebra
├── trigonometry
├── coordinate_geometry
├── 3d_geometry
├── calculus
├── matrices_determinants
├── probability_statistics
├── sets_relations
└── sequences_series

general_knowledge
├── architecture_history
├── famous_architects
├── famous_buildings
├── architectural_styles
├── indian_architecture
├── sustainability
├── urban_planning
├── building_materials
└── current_affairs

exam_preparation
├── mock_test_review
├── exam_strategy
├── time_management
├── previous_year_discussion
├── doubt_clearing
└── revision_class

orientation
├── course_intro
├── exam_overview
├── career_guidance
└── student_interaction
```

#### Difficulty

| Code | Label | Description |
|------|-------|-------------|
| `beginner` | Beginner | Foundation concepts, new students |
| `intermediate` | Intermediate | Building on basics |
| `advanced` | Advanced | Complex problems, exam-level |
| `mixed` | Mixed | Multiple difficulty levels in one class |

### 4.2 Claude Classification Prompt

For each video, send the transcript to Claude API with this system prompt:

```
You are a classifier for Neram Classes, a NATA and JEE B.Arch coaching institute.
Given a class recording transcript, analyze it and return ONLY a JSON object with
the following fields. No other text.

{
  "suggested_title": "A clear, descriptive title for this class (max 100 chars)",
  "suggested_description": "2-3 sentence summary of what the class covers",
  "language": "ta" | "en" | "ta_en",
  "exam": "nata" | "jee_barch" | "both" | "general",
  "category": "<from taxonomy>",
  "subcategories": ["<primary>", "<secondary if applicable>"],
  "topics": ["topic1", "topic2", "topic3"],
  "difficulty": "beginner" | "intermediate" | "advanced" | "mixed",
  "key_concepts": ["concept1", "concept2"],
  "is_practical_demo": true/false,
  "confidence": 0.0 to 1.0
}

Category taxonomy:
- drawing: freehand_sketching, perspective_drawing, 2d_composition, 3d_composition,
  imagination_drawing, poster_design, color_theory, shading_techniques, human_figure,
  landscape_drawing, object_drawing, memory_drawing
- aptitude: spatial_reasoning, visual_perception, pattern_recognition, mental_ability,
  aesthetic_sensitivity, observation_skills, logical_reasoning, figure_completion
- mathematics: algebra, trigonometry, coordinate_geometry, 3d_geometry, calculus,
  matrices_determinants, probability_statistics, sets_relations, sequences_series
- general_knowledge: architecture_history, famous_architects, famous_buildings,
  architectural_styles, indian_architecture, sustainability, urban_planning,
  building_materials, current_affairs
- exam_preparation: mock_test_review, exam_strategy, time_management,
  previous_year_discussion, doubt_clearing, revision_class
- orientation: course_intro, exam_overview, career_guidance, student_interaction

Rules:
- If the transcript is mostly Tamil, set language to "ta"
- If mixed Tamil-English (code-switching), set to "ta_en"
- A class can have multiple subcategories (e.g., a drawing class covering both
  perspective and shading)
- Set confidence lower if the transcript is noisy/incomplete
- If you truly cannot classify, set category to "unclassified" and confidence to 0
```

### 4.3 Batch Processing Script

```python
import json
import anthropic
from supabase import create_client

client = anthropic.Anthropic()
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

CLASSIFICATION_PROMPT = """..."""  # System prompt from above

def classify_video(video_id: str, transcript_text: str) -> dict:
    """Send transcript to Claude for classification."""

    # Truncate very long transcripts (1-hour class ~8000 words)
    # Claude can handle this easily, but trim if > 15000 words
    words = transcript_text.split()
    if len(words) > 15000:
        # Take first 5000, middle 5000, last 5000
        trimmed = ' '.join(words[:5000]) + ' [...] ' + \
                  ' '.join(words[len(words)//2 - 2500 : len(words)//2 + 2500]) + \
                  ' [...] ' + ' '.join(words[-5000:])
    else:
        trimmed = transcript_text

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        system=CLASSIFICATION_PROMPT,
        messages=[{
            "role": "user",
            "content": f"Classify this class recording transcript:\n\n{trimmed}"
        }]
    )

    text = response.content[0].text
    # Strip markdown fences if present
    text = text.replace('```json', '').replace('```', '').strip()
    return json.loads(text)


def process_all_videos():
    """Main pipeline: fetch unclassified videos, classify, store."""

    # Get all videos that haven't been classified yet
    result = supabase.table('library_videos') \
        .select('id, youtube_video_id, transcript_text') \
        .eq('classification_status', 'pending') \
        .not_.is_('transcript_text', 'null') \
        .limit(50) \
        .execute()

    for video in result.data:
        try:
            tags = classify_video(
                video['youtube_video_id'],
                video['transcript_text']
            )

            supabase.table('library_videos').update({
                'suggested_title': tags.get('suggested_title'),
                'suggested_description': tags.get('suggested_description'),
                'language': tags.get('language'),
                'exam': tags.get('exam'),
                'category': tags.get('category'),
                'subcategories': tags.get('subcategories', []),
                'topics': tags.get('topics', []),
                'difficulty': tags.get('difficulty'),
                'key_concepts': tags.get('key_concepts', []),
                'is_practical_demo': tags.get('is_practical_demo', False),
                'ai_confidence': tags.get('confidence', 0),
                'classification_status': 'classified'
            }).eq('id', video['id']).execute()

            print(f"✅ Classified: {video['youtube_video_id']}")

        except Exception as e:
            supabase.table('library_videos').update({
                'classification_status': 'error',
                'classification_error': str(e)
            }).eq('id', video['id']).execute()

            print(f"❌ Error: {video['youtube_video_id']} - {e}")


if __name__ == '__main__':
    process_all_videos()
```

### 4.4 Cost Estimate

| Item | Calculation | Cost |
|------|-------------|------|
| Claude Sonnet (input) | 1000 videos × ~3000 tokens avg | ~3M input tokens → ~$9 |
| Claude Sonnet (output) | 1000 videos × ~300 tokens avg | ~300K output tokens → ~$4.50 |
| YouTube Data API | Within free 10,000 units/day | $0 |
| youtube-transcript-api | Open source, no API key | $0 |
| **Total one-time cost** | | **~$13.50** |

---

## 5. Supabase Schema

```sql
-- ============================================================
-- VIDEO LIBRARY TABLES
-- ============================================================

-- Main video table
CREATE TABLE library_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- YouTube metadata (from API sync)
  youtube_video_id TEXT NOT NULL UNIQUE,
  youtube_channel_id TEXT,
  original_title TEXT,              -- Original YouTube title (may be empty/useless)
  original_description TEXT,
  youtube_thumbnail_url TEXT,       -- Default thumbnail
  youtube_thumbnail_hq_url TEXT,    -- High-quality thumbnail
  duration_seconds INTEGER,         -- ISO 8601 duration converted to seconds
  published_at TIMESTAMPTZ,         -- When uploaded to YouTube
  privacy_status TEXT DEFAULT 'unlisted',

  -- Transcript data
  transcript_text TEXT,             -- Full concatenated transcript
  transcript_language TEXT,         -- 'ta', 'en', or detected language
  transcript_is_generated BOOLEAN DEFAULT true,
  transcript_segments JSONB,        -- [{text, start, duration}] for seek support
  transcript_status TEXT DEFAULT 'pending'
    CHECK (transcript_status IN ('pending', 'fetched', 'unavailable', 'error')),

  -- AI Classification (auto-generated, reviewed by admin)
  suggested_title TEXT,             -- AI-suggested title
  suggested_description TEXT,       -- AI-suggested description
  language TEXT CHECK (language IN ('ta', 'en', 'ta_en')),
  exam TEXT CHECK (exam IN ('nata', 'jee_barch', 'both', 'general')),
  category TEXT,                    -- Primary category
  subcategories TEXT[] DEFAULT '{}', -- Array of subcategory codes
  topics TEXT[] DEFAULT '{}',       -- Free-form topic tags
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'mixed')),
  key_concepts TEXT[] DEFAULT '{}',
  is_practical_demo BOOLEAN DEFAULT false,
  ai_confidence NUMERIC(3,2),       -- 0.00 to 1.00
  classification_status TEXT DEFAULT 'pending'
    CHECK (classification_status IN ('pending', 'classified', 'error', 'skipped')),
  classification_error TEXT,

  -- Admin review (human verification of AI tags)
  approved_title TEXT,              -- Final title after admin review
  approved_description TEXT,
  review_status TEXT DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_reclass')),
  reviewed_by UUID REFERENCES user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,                 -- Any notes from reviewer
  is_published BOOLEAN DEFAULT false, -- Visible to students only when true

  -- Engagement tracking
  view_count INTEGER DEFAULT 0,
  total_watch_seconds BIGINT DEFAULT 0,
  bookmark_count INTEGER DEFAULT 0,

  -- Timestamps
  synced_at TIMESTAMPTZ DEFAULT now(),  -- When pulled from YouTube
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_library_videos_category ON library_videos(category);
CREATE INDEX idx_library_videos_exam ON library_videos(exam);
CREATE INDEX idx_library_videos_language ON library_videos(language);
CREATE INDEX idx_library_videos_difficulty ON library_videos(difficulty);
CREATE INDEX idx_library_videos_review_status ON library_videos(review_status);
CREATE INDEX idx_library_videos_is_published ON library_videos(is_published);
CREATE INDEX idx_library_videos_published_at ON library_videos(published_at);
CREATE INDEX idx_library_videos_subcategories ON library_videos USING GIN(subcategories);
CREATE INDEX idx_library_videos_topics ON library_videos USING GIN(topics);
CREATE INDEX idx_library_videos_youtube_id ON library_videos(youtube_video_id);

-- Full-text search on titles and topics
CREATE INDEX idx_library_videos_search ON library_videos
  USING GIN(to_tsvector('english',
    COALESCE(approved_title, suggested_title, '') || ' ' ||
    COALESCE(approved_description, suggested_description, '') || ' ' ||
    array_to_string(topics, ' ')
  ));


-- Collections (curated playlists by teachers)
CREATE TABLE library_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  created_by UUID REFERENCES user_profiles(id),
  classroom_id UUID REFERENCES classrooms(id),  -- Optional: scope to classroom
  exam TEXT CHECK (exam IN ('nata', 'jee_barch', 'both', 'general')),
  is_published BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Collection items (videos in a collection)
CREATE TABLE library_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES library_collections(id) ON DELETE CASCADE,
  video_id UUID REFERENCES library_videos(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  notes TEXT,                       -- Teacher's note for this video in context
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collection_id, video_id)
);

CREATE INDEX idx_collection_items_collection ON library_collection_items(collection_id);


-- Student bookmarks
CREATE TABLE library_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  video_id UUID REFERENCES library_videos(id) ON DELETE CASCADE,
  timestamp_seconds INTEGER,        -- Bookmark at specific point in video
  note TEXT,                        -- Student's personal note
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, video_id, timestamp_seconds)
);

CREATE INDEX idx_bookmarks_student ON library_bookmarks(student_id);


-- Watch history (for "continue watching" and recommendations)
CREATE TABLE library_watch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  video_id UUID REFERENCES library_videos(id) ON DELETE CASCADE,
  last_position_seconds INTEGER DEFAULT 0,  -- Resume point
  total_watched_seconds INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,          -- Watched > 90%
  watch_count INTEGER DEFAULT 1,
  first_watched_at TIMESTAMPTZ DEFAULT now(),
  last_watched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, video_id)
);

CREATE INDEX idx_watch_history_student ON library_watch_history(student_id);
CREATE INDEX idx_watch_history_last_watched ON library_watch_history(last_watched_at);


-- Sync log (track YouTube sync runs)
CREATE TABLE library_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_videos_found INTEGER,
  new_videos_added INTEGER,
  transcripts_fetched INTEGER,
  transcripts_failed INTEGER,
  classifications_run INTEGER,
  classifications_failed INTEGER,
  status TEXT DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  error_log JSONB DEFAULT '[]',
  run_by UUID REFERENCES user_profiles(id)
);
```

### 5.1 Row Level Security (RLS)

```sql
-- Students: can only see published videos
ALTER TABLE library_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students see published videos"
  ON library_videos FOR SELECT
  USING (
    is_published = true
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('teacher', 'admin')
    )
  );

-- Teachers/admins: full read access, admins can update
CREATE POLICY "Admins can update videos"
  ON library_videos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('teacher', 'admin')
    )
  );

-- Watch history: students see only their own
ALTER TABLE library_watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students own watch history"
  ON library_watch_history FOR ALL
  USING (student_id = auth.uid());

-- Bookmarks: students see only their own
ALTER TABLE library_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students own bookmarks"
  ON library_bookmarks FOR ALL
  USING (student_id = auth.uid());

-- Collections: published visible to all, draft to teachers/admins
ALTER TABLE library_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published collections for all"
  ON library_collections FOR SELECT
  USING (
    is_published = true
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role IN ('teacher', 'admin')
    )
  );
```

---

## 6. Student-Facing UI

### 6.1 Library Home Screen

```
┌─────────────────────────────────────────────────────────┐
│  📚 Class Library                          🔍 Search    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Continue Watching]                                    │
│  ┌──────┐ ┌──────┐ ┌──────┐                            │
│  │ thumb│ │ thumb│ │ thumb│  ← horizontal scroll        │
│  │ ▶ 23m│ │ ▶ 45m│ │ ▶ 12m│                            │
│  │ title│ │ title│ │ title│                            │
│  └──────┘ └──────┘ └──────┘                            │
│                                                         │
│  [Filter: Category ▼] [Exam ▼] [Language ▼] [Level ▼]  │
│                                                         │
│  ── Drawing ─────────────────────────────── See All →   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │ thumb│ │ thumb│ │ thumb│ │ thumb│                   │
│  │ 1:23 │ │ 0:45 │ │ 2:01 │ │ 1:15 │                   │
│  │ title│ │ title│ │ title│ │ title│                   │
│  │ NATA │ │ Both │ │ NATA │ │ JEE  │                   │
│  └──────┘ └──────┘ └──────┘ └──────┘                   │
│                                                         │
│  ── Aptitude ────────────────────────────── See All →   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  │
│  │      │ │      │ │      │ │      │                   │
│  └──────┘ └──────┘ └──────┘ └──────┘                   │
│                                                         │
│  ── Mathematics ─────────────────────────── See All →   │
│  ...                                                    │
│                                                         │
│  ── Collections ─────────────────────────── See All →   │
│  ┌─────────────┐ ┌─────────────┐                       │
│  │ "NATA 2025  │ │ "Perspective│                       │
│  │  Crash      │ │  Drawing    │                       │
│  │  Course"    │ │  Masterclass│                       │
│  │  12 videos  │ │  8 videos   │                       │
│  └─────────────┘ └─────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

### 6.2 Video Player Screen

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Library                                      │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                 │    │
│  │            YouTube Embedded Player              │    │
│  │            (iframe, unlisted video)             │    │
│  │                                                 │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Perspective Drawing — One Point Perspective Basics      │
│  NATA · Drawing · Beginner · Tamil                      │
│  Recorded: 15 Mar 2022 · 1h 23m · 47 views             │
│                                                         │
│  [🔖 Bookmark] [📋 Add to Collection]                   │
│                                                         │
│  AI-generated description:                              │
│  This class covers the fundamentals of one-point        │
│  perspective drawing, including vanishing point          │
│  placement, depth estimation, and common exercises...   │
│                                                         │
│  Topics: perspective, vanishing point, depth,           │
│          architectural sketching                         │
│                                                         │
│  ── Related Videos ──────────────────────────────────   │
│  ┌──────┐ ┌──────┐ ┌──────┐                            │
│  │      │ │      │ │      │                            │
│  └──────┘ └──────┘ └──────┘                            │
└─────────────────────────────────────────────────────────┘
```

### 6.3 Filter / Browse Screen

```
┌─────────────────────────────────────────────────────────┐
│  Drawing Classes                            🔍 Filter   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Subcategory:                                           │
│  [All] [Sketching] [Perspective] [2D Comp] [3D Comp]   │
│  [Imagination] [Poster] [Color] [Shading] [Human Fig]  │
│                                                         │
│  Exam: [All] [NATA] [JEE] [Both]                       │
│  Language: [All] [Tamil] [English] [Bilingual]          │
│  Level: [All] [Beginner] [Intermediate] [Advanced]      │
│                                                         │
│  ── 156 videos ── Sort: [Newest ▼]                      │
│                                                         │
│  ┌──────┐ Perspective Drawing — Two Point               │
│  │ thumb│ NATA · Intermediate · Tamil · 1h 12m          │
│  │ ▶    │ Covers two-point perspective with building... │
│  └──────┘ 15 Mar 2022 · 23 views                        │
│                                                         │
│  ┌──────┐ Freehand Sketching — Trees and Foliage        │
│  │ thumb│ Both · Beginner · Tamil · 45m                 │
│  │ ▶    │ Practice session on sketching natural...      │
│  └──────┘ 10 Feb 2022 · 18 views                        │
│                                                         │
│  ┌──────┐ ...                                           │
│  │      │                                               │
│  └──────┘                                               │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Admin Review UI

### 7.1 Review Queue

The admin/teacher reviews AI-classified videos before they become visible to students.

```
┌─────────────────────────────────────────────────────────┐
│  Video Library Admin                                    │
├─────────────────────────────────────────────────────────┤
│  Sync Status: Last run 2 hours ago · 1,024 videos      │
│  [🔄 Run Sync Now]                                      │
│                                                         │
│  ── Review Queue (847 pending) ─────────────────────    │
│                                                         │
│  Filter: [All] [High Confidence] [Low Confidence]       │
│          [No Transcript] [Errors]                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ 📹 VIDEO: dQw4w9WgXcQ                           │    │
│  │ Original title: "2022-03-15 class recording"     │    │
│  │ Duration: 1h 23m · Uploaded: 15 Mar 2022         │    │
│  │ Transcript: ✅ Tamil (auto-generated)             │    │
│  │ AI Confidence: 0.87                               │    │
│  │                                                   │    │
│  │ Suggested Title: [Perspective Drawing — One      ]│    │
│  │                   [Point Basics               ✏️ ]│    │
│  │ Category:    [Drawing          ▼]                 │    │
│  │ Subcategory: [perspective_drawing ▼]              │    │
│  │ Exam:        [NATA ▼]                             │    │
│  │ Language:    [Tamil ▼]                            │    │
│  │ Difficulty:  [Beginner ▼]                         │    │
│  │ Topics:      [perspective] [vanishing point] [+]  │    │
│  │                                                   │    │
│  │ [✅ Approve] [✏️ Edit & Approve] [⏭️ Skip] [🗑️]  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ── Stats ──                                            │
│  Approved: 153 · Pending: 847 · Errors: 24             │
│  Avg review time: ~30 sec/video                         │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Bulk Actions

For high-confidence classifications (> 0.85), allow bulk approve:

- Select all high-confidence videos in a category
- Quick scan of titles and tags
- "Approve All Selected" button
- This can handle 50-100 videos in minutes

### 7.3 Collection Builder

Teachers can create curated collections (like playlists):

- "NATA 2026 Crash Course" — hand-pick 20 essential videos in order
- "Perspective Drawing Complete Guide" — all perspective videos, ordered beginner → advanced
- "Doubt Clearing Sessions" — all Q&A / doubt clearing recordings
- Collections can be assigned to specific classrooms

---

## 8. YouTube Embed Strategy

### 8.1 Embedding Unlisted Videos

Unlisted YouTube videos can be embedded using the standard iframe player as long as you have the video ID. No additional authentication is needed.

```jsx
// React component for video player
import { useEffect, useRef } from 'react';

function VideoPlayer({ videoId, startAt = 0, onProgress }) {
  const playerRef = useRef(null);

  useEffect(() => {
    // Load YouTube IFrame API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      playerRef.current = new window.YT.Player('yt-player', {
        videoId,
        playerVars: {
          start: startAt,
          rel: 0,              // Don't show related videos
          modestbranding: 1,    // Minimal YouTube branding
          playsinline: 1,       // Inline play on mobile
        },
        events: {
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              // Track watch progress every 10 seconds
              const interval = setInterval(() => {
                const currentTime = playerRef.current.getCurrentTime();
                onProgress?.(currentTime);
              }, 10000);
            }
          }
        }
      });
    };
  }, [videoId]);

  return <div id="yt-player" />;
}
```

### 8.2 Content Protection

Since videos are unlisted, they can only be accessed by someone who has the video ID. Nexus controls access:

- Video IDs are stored in Supabase, protected by RLS
- Only authenticated Nexus users can see the library
- YouTube embed URLs are generated server-side
- No video IDs are exposed in public HTML/SEO
- If a student shares a direct YouTube link, the video is still unlisted (low risk)

For stronger protection in future: consider moving to YouTube API with signed URLs, or migrating critical content to a paid platform like Bunny Stream.

---

## 9. Incremental Sync

After the initial bulk sync, run periodic syncs to catch new uploads:

```javascript
// Supabase Edge Function: sync-youtube-library
// Runs daily via cron or manually triggered

async function incrementalSync() {
  // Get the most recent video's published date
  const { data: latest } = await supabase
    .from('library_videos')
    .select('published_at')
    .order('published_at', { ascending: false })
    .limit(1)
    .single();

  // Fetch only videos published after that date
  const newVideos = await fetchYouTubeVideos({
    publishedAfter: latest.published_at
  });

  for (const video of newVideos) {
    // Insert new video
    await supabase.from('library_videos').upsert({
      youtube_video_id: video.id,
      original_title: video.snippet.title,
      // ... metadata
    });

    // Fetch transcript
    const transcript = await fetchTranscript(video.id);
    if (transcript.status === 'success') {
      await supabase.from('library_videos').update({
        transcript_text: transcript.full_text,
        transcript_status: 'fetched'
      }).eq('youtube_video_id', video.id);
    }

    // Auto-classify
    const tags = await classifyVideo(video.id, transcript.full_text);
    await supabase.from('library_videos').update({
      ...tags,
      classification_status: 'classified'
    }).eq('youtube_video_id', video.id);
  }
}
```

---

## 10. Integration with Other Nexus Modules

| Module | Integration |
|--------|------------|
| **Course Planner** | Link specific library videos to syllabus topics. "Week 3: Perspective Drawing" → auto-suggest relevant library videos |
| **Checklist** | Mark "watched recommended video" as a checklist item |
| **Learning Path** | Recommend videos based on student's weak areas |
| **Question Bank** | Link solution videos from the library to specific questions |
| **Attendance** | Students who missed a live class → suggest the matching recorded class from library |
| **Revit Classroom** | Self-paced Revit learning uses library videos as the primary content |

---

## 11. Phased Rollout

### Phase 1: Foundation (Week 1-2)

- [ ] Set up YouTube Data API OAuth credentials
- [ ] Write bulk sync script (fetch all unlisted video metadata)
- [ ] Create Supabase tables (run SQL from Section 5)
- [ ] Run initial sync — populate `library_videos` with metadata
- [ ] Write transcript extraction script using `youtube-transcript-api`
- [ ] Run transcript extraction for all videos
- [ ] Log stats: how many have transcripts, languages detected

### Phase 2: Classification (Week 2-3)

- [ ] Finalize taxonomy (review category/subcategory list with Hari)
- [ ] Write Claude batch classification script
- [ ] Run classification on all videos with transcripts
- [ ] Review confidence distribution — how many > 0.85? > 0.5? < 0.3?
- [ ] Build admin review queue UI in Nexus
- [ ] Begin admin review (target: 50 videos/day)

### Phase 3: Student UI (Week 3-4)

- [ ] Build Library home screen (category rows, continue watching)
- [ ] Build filter/browse screen
- [ ] Build video player screen with YouTube embed
- [ ] Implement watch history tracking
- [ ] Implement bookmarks
- [ ] Implement search (full-text on titles + topics)

### Phase 4: Curation & Polish (Week 4-5)

- [ ] Build collection builder for teachers
- [ ] Create initial curated collections
- [ ] Add "Related Videos" suggestions (same category + subcategory)
- [ ] Set up incremental sync (daily cron)
- [ ] Connect to Course Planner module (link videos to syllabus)
- [ ] Mobile optimization pass

---

## 12. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Video hosting | YouTube (keep existing) | Zero cost, adaptive streaming, already uploaded |
| Transcript source | `youtube-transcript-api` (Python) | Free, no API quota, works for unlisted, supports Tamil |
| Classification | Claude Sonnet via API | Best accuracy for bilingual Tamil/English, ~$13.50 total |
| Review approach | AI classify + human review queue | ~30 sec/video vs ~5 min watching each video |
| Embed method | YouTube IFrame API | Full playback control, progress tracking, no additional cost |
| Search | Supabase full-text search (tsvector) | Already in stack, sufficient for 1000 videos |
| Content protection | RLS + unlisted videos | Good enough for now; upgrade path to signed URLs later |

---

## 13. Files for Claude Code

This spec is self-contained. To implement in Claude Code:

1. Copy this file to the Nexus project root
2. Run the SQL in Section 5 against Supabase
3. Implement the sync scripts (Section 3 + 4) as standalone Python scripts in a `/scripts/video-library/` directory
4. Build the UI components (Section 6 + 7) as Next.js pages under `/app/library/`
5. Follow the phased rollout checklist in Section 11

### Required Environment Variables

```env
# YouTube API
YOUTUBE_API_KEY=<from Google Cloud Console>
YOUTUBE_OAUTH_CLIENT_ID=<for accessing own channel>
YOUTUBE_OAUTH_CLIENT_SECRET=<for accessing own channel>

# Anthropic (for classification)
ANTHROPIC_API_KEY=<for Claude API batch classification>

# Supabase (already configured in Nexus)
NEXT_PUBLIC_SUPABASE_URL=<existing>
SUPABASE_SERVICE_ROLE_KEY=<for sync scripts>
```

### Python Dependencies (for sync scripts)

```
google-api-python-client
google-auth-oauthlib
youtube-transcript-api
anthropic
supabase
```

---

*This module transforms 10 years of recorded classes from dead storage into a searchable, categorized, AI-tagged learning library — at a total classification cost of ~$13.50.*
