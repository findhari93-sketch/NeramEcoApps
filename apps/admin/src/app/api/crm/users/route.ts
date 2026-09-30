export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  listUserJourneys,
  getCurrentBatch,
  getPeopleBreakdown,
  getSupabaseAdminClient,
  examYearForBatchCode,
} from '@neram/database';
import { seasonBounds } from '@/lib/people-summary';
import type {
  UserJourneyListOptions,
  PipelineStage,
  LifecycleStatus,
  CandidateSegment,
  LifecycleStage,
  EngagementState,
} from '@neram/database';

const LIFECYCLE_STAGES = ['prospect', 'lead', 'applicant', 'enrolled', 'active_student', 'paused', 'alumni', 'archived'];
const ENGAGEMENT_STATES = ['new', 'engaged', 'low', 'inactive', 'dormant'];
const IDENTITIES = ['firebase', 'microsoft', 'all'];
const ACTIVITY = ['recent', 'quiet', 'gone'];
const OUTCOMES = ['dead_lead', 'irrelevant'];

/** Only known values reach the query; anything else is ignored. */
function oneOf<T extends string>(value: string | null, allowed: string[]): T | undefined {
  return value && allowed.includes(value) ? (value as T) : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Lifecycle focus: default the list to active users only; an explicit
    // lifecycle_status (active|archived) or a candidate segment overrides.
    const lifecycleStatus = (searchParams.get('lifecycle_status') as LifecycleStatus) || undefined;
    const candidateSegment = (searchParams.get('candidate') as CandidateSegment) || undefined;
    // Candidate segments and explicit archived view should still include
    // archived rows when asked; otherwise default to active-only.
    const includeArchived =
      lifecycleStatus === 'archived' || searchParams.get('include_archived') === 'true';

    // Batch (exam-year cohort) filter. Accept ?batch= (new) with ?academic_year=
    // as an alias; supports the 'current' | 'none' | 'all' sentinels. Resolve the
    // registry current so 'current' means the admin-set batch (OR untagged users).
    const batchParam = searchParams.get('batch') || searchParams.get('academic_year') || undefined;
    const season = searchParams.get('season');
    let currentBatchCode: string | undefined;
    if (batchParam === 'current' || season || searchParams.get('summary')) {
      try {
        currentBatchCode = (await getCurrentBatch()).code;
      } catch {
        /* fall back to the helper inside listUserJourneys */
      }
    }
    const currentExamYear =
      examYearForBatchCode(currentBatchCode) ??
      // The batch registry is empty: a season starts on 1 July.
      new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0);
    const outcome = oneOf<'dead_lead' | 'irrelevant'>(searchParams.get('outcome'), OUTCOMES);

    const options: UserJourneyListOptions = {
      search: searchParams.get('search') || undefined,
      pipelineStage: (searchParams.get('pipeline_stage') as PipelineStage) || undefined,
      status: searchParams.get('status') as any || undefined,
      userType: searchParams.get('user_type') as any || undefined,
      applicationStatus: searchParams.get('application_status') as any || undefined,
      interestCourse: searchParams.get('interest_course') as any || undefined,
      hasDemoRegistration: searchParams.has('has_demo')
        ? searchParams.get('has_demo') === 'true'
        : undefined,
      isDeadLead: outcome === 'dead_lead' || searchParams.get('is_dead_lead') === 'true' || undefined,
      isIrrelevant: outcome === 'irrelevant' || searchParams.get('is_irrelevant') === 'true' || undefined,
      lifecycleStatus,
      excludeArchived: includeArchived ? false : undefined,
      // ?season= replaces the batch filter on the People page.
      academicYear: season ? undefined : batchParam,
      ...seasonBounds(season, currentExamYear),
      currentBatchCode,
      candidateSegment,
      dateFrom: searchParams.get('date_from') || undefined,
      dateTo: searchParams.get('date_to') || undefined,
      // Lifecycle dimensions (user_lifecycle_view). ?identity=microsoft lists the
      // Microsoft-only students the Firebase-only CRM view never showed.
      lifecycleStage: oneOf<LifecycleStage>(searchParams.get('lifecycle_stage'), LIFECYCLE_STAGES),
      engagement: oneOf<EngagementState>(searchParams.get('engagement'), ENGAGEMENT_STATES),
      activityGroup: oneOf<'recent' | 'quiet' | 'gone'>(searchParams.get('activity'), ACTIVITY),
      identity: oneOf<'firebase' | 'microsoft' | 'all'>(searchParams.get('identity'), IDENTITIES),
      limit: parseInt(searchParams.get('limit') || '25', 10),
      offset: parseInt(searchParams.get('offset') || '0', 10),
      orderBy: searchParams.get('order_by') || 'created_at',
      orderDirection: (searchParams.get('order_dir') as 'asc' | 'desc') || 'desc',
    };

    // ?summary=1 (the People page) adds exact grouped counts from one grouped
    // query, so no number stops at PostgREST's 1,000-row limit; ?summary=only
    // returns just the counts. Season, search, stage and activity are left out
    // on purpose: the page cross-filters the breakdown itself, so the cards
    // are the filters.
    const summary = searchParams.get('summary');
    const wantsSummary = summary === '1' || summary === 'only';
    const headCount = (query: any): Promise<number> =>
      query.then(({ count, error }: { count: number | null; error: unknown }) => {
        if (error) throw error;
        return count || 0;
      });
    // lifecycle_suggestions is not in the generated types yet.
    const admin: any = wantsSummary ? getSupabaseAdminClient() : null;

    const [usersResult, breakdown, allAccounts, archiveSuggestions] = await Promise.all([
      summary === 'only' ? Promise.resolve({ users: [], total: 0 }) : listUserJourneys(options),
      wantsSummary
        ? getPeopleBreakdown({ identity: options.identity || 'firebase', contactedStatus: outcome || null })
        : Promise.resolve(undefined),
      admin ? headCount(admin.from('users').select('id', { count: 'exact', head: true })) : Promise.resolve(undefined),
      admin
        ? headCount(
            admin
              .from('lifecycle_suggestions')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'open')
              .eq('kind', 'archive_lead')
          )
        : Promise.resolve(undefined),
    ]);

    return NextResponse.json({
      users: usersResult.users,
      total: usersResult.total,
      page: Math.floor((options.offset || 0) / (options.limit || 25)),
      limit: options.limit,
      ...(wantsSummary ? { breakdown, allAccounts, archiveSuggestions, currentExamYear } : {}),
    });
  } catch (error: any) {
    console.error('CRM users list error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch users' },
      { status: 500 }
    );
  }
}