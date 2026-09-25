/** Response shapes of /api/question-bank/tag-coverage and /suggestions, as the screen reads them. */

export interface CoverageTopic {
  tag_id: string;
  slug: string;
  label: string;
  group_type: 'subject' | 'theme';
  tagged_count: number;
  suggestion_count: number;
  high_confidence_count?: number;
}

export interface CoverageSummary {
  total: number;
  tagged: number;
  untagged: number;
  topics: CoverageTopic[];
}

export interface SuggestedTagRef {
  tag_id: string;
  slug: string;
  label: string;
}

export interface SuggestionItem {
  id: string;
  question_text: string | null;
  options: unknown;
  correct_answer: string | null;
  exam_relevance: string | null;
  origin: string | null;
  matched_terms: string[];
  confidence: 'high' | 'low';
  also_suggested: SuggestedTagRef[];
  source_label: string;
  has_topic_tag?: boolean;
}

export interface SuggestionsResponse {
  data: {
    tag: { id: string; slug: string; label: string };
    total: number;
    high_confidence_total: number;
    items: SuggestionItem[];
  };
}
