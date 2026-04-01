export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listUserJourneys, getLeadPipelineStageCounts } from '@neram/database';
import type { UserJourneyListOptions, PipelineStage } from '@neram/database';

const EXCLUDED_STAGES: PipelineStage[] = ['enrolled', 'payment_complete'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const options: UserJourneyListOptions = {
      search: searchParams.get('search') || undefined,
      pipelineStage: (searchParams.get('pipeline_stage') as PipelineStage) || undefined,
      excludeStages: EXCLUDED_STAGES,
      status: searchParams.get('status') as any || undefined,
      userType: searchParams.get('user_type') as any || undefined,
      applicationStatus: searchParams.get('application_status') as any || undefined,
      interestCourse: searchParams.get('interest_course') as any || undefined,
      hasDemoRegistration: searchParams.has('has_demo')
        ? searchParams.get('has_demo') === 'true'
        : undefined,
      isDeadLead: searchParams.get('is_dead_lead') === 'true' || undefined,
      isIrrelevant: searchParams.get('is_irrelevant') === 'true' || undefined,
      dateFrom: searchParams.get('date_from') || undefined,
      dateTo: searchParams.get('date_to') || undefined,
      limit: parseInt(searchParams.get('limit') || '25', 10),
      offset: parseInt(searchParams.get('offset') || '0', 10),
      orderBy: searchParams.get('order_by') || 'created_at',
      orderDirection: (searchParams.get('order_dir') as 'asc' | 'desc') || 'desc',
    };

    const [usersResult, pipelineCounts] = await Promise.all([
      listUserJourneys(options),
      getLeadPipelineStageCounts(EXCLUDED_STAGES),
    ]);

    return NextResponse.json({
      users: usersResult.users,
      total: usersResult.total,
      page: Math.floor((options.offset || 0) / (options.limit || 25)),
      limit: options.limit,
      pipelineCounts,
    });
  } catch (error: any) {
    console.error('CRM leads list error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch leads' },
      { status: 500 }
    );
  }
}
