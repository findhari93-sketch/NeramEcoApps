/**
 * The student question list's filters, in its shareable URL.
 *
 * Moved out of the page so the round trip can be tested: a Next.js page file
 * may only export what the framework expects.
 *
 * PURE: no React.
 */

import type { QBDifficulty, QBFilterState, QBQuestionFormat } from '@neram/database';

export function serializeQBFilters(filters: QBFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.categories?.length) params.set('cat', filters.categories.join(','));
  if (filters.difficulty?.length) params.set('diff', filters.difficulty.join(','));
  if (filters.question_format?.length) params.set('fmt', filters.question_format.join(','));
  if (filters.attempt_status && filters.attempt_status !== 'all') params.set('status', filters.attempt_status);
  if (filters.search_text) params.set('q', filters.search_text);
  if (filters.topic_ids?.length) params.set('topics', filters.topic_ids.join(','));
  // The one solution filter a student has; the teacher queues never reach a student link.
  if (filters.solution_filter === 'has_video') params.set('video', '1');
  return params;
}

export function deserializeQBFilters(params: URLSearchParams): QBFilterState {
  const filters: QBFilterState = {};
  const cat = params.get('cat');
  if (cat) filters.categories = cat.split(',');
  const diff = params.get('diff');
  if (diff) filters.difficulty = diff.split(',') as QBDifficulty[];
  const fmt = params.get('fmt');
  if (fmt) filters.question_format = fmt.split(',') as QBQuestionFormat[];
  const status = params.get('status');
  if (status) filters.attempt_status = status as QBFilterState['attempt_status'];
  const q = params.get('q');
  if (q) filters.search_text = q;
  const topics = params.get('topics');
  if (topics) filters.topic_ids = topics.split(',');
  if (params.get('video') === '1') filters.solution_filter = 'has_video';
  return filters;
}
