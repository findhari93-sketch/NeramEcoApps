-- Admin aggregate RPCs (cost and performance plan, Phase 3).
--
-- Each function replaces a JS tally that read rows over PostgREST and summed them
-- in the route. Those tallies made many round trips (the financial dashboard ran
-- 16 sequential queries, the sidebar badges 13 count queries a minute per open
-- tab) and several were silently wrong past PostgREST's 1,000-row ceiling
-- (onboarding analytics read 1,150 sessions and 3,762 responses on production
-- through a single unpaged select).
--
-- Every function:
--   * is SECURITY INVOKER and callable only by service_role (the admin app's
--     server client). EXECUTE is revoked from public, anon and authenticated.
--   * pins search_path = public.
--   * compares enum columns as ::text, so a status value an enum does not carry
--     reads as "no match" instead of raising 22P02.
--
-- Time boundaries (IST month start, "today" for the monthly series, the 24-hour
-- chat window) are computed by the caller and passed in, so the date rules stay in
-- the tested TypeScript and the database session time zone never matters.

-- ---------------------------------------------------------------------------
-- 1. Sidebar badges + bell: one call instead of 13 count queries.
-- ---------------------------------------------------------------------------
create or replace function public.admin_badge_counts(
  p_chat_since timestamptz,
  p_follow_up_before timestamptz
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'leads', (
      select count(*) from lead_profiles
      where deleted_at is null
        and ((phone_verified is true and whatsapp_sent_at is null)
          or (status::text = 'submitted' and contacted_status is null))
    ),
    'students', (
      select count(*) from student_profiles
      where ms_teams_email is null or batch_id is null
    ),
    'demo_classes', (
      select count(*) from demo_class_registrations where status::text = 'pending'
    ),
    'support_tickets', (
      select count(*) from support_tickets where status::text in ('open', 'in_progress')
    ),
    'app_feedback', (
      select count(*) from app_feedback where status::text = 'new'
    ),
    'qa_moderation', (
      select count(*) from question_posts where status::text = 'pending'
    ),
    'payments', (
      select count(*) from payments
      where screenshot_url is not null and screenshot_verified = false
    ),
    'chat_history', (
      select count(*) from chatbot_conversations
      where created_at >= p_chat_since and admin_correction is null and thumbs_up is null
    ),
    'duplicates', (
      select count(*) from user_duplicate_candidates where status = 'open'
    ),
    'follow_ups', (
      select count(*) from crm_follow_ups where due_at < p_follow_up_before
    ),
    'lifecycle', (
      select count(*) from lifecycle_suggestions where status = 'open'
    ),
    'careers', (
      select count(*) from job_applications where status = 'new'
    ),
    'messages_unread', (
      select count(*) from contact_messages where status = 'unread'
    ),
    -- admin_notifications.is_read is one shared flag for all staff (mark-read
    -- writes read_by on the row itself), so the unread count is org-wide, which is
    -- what /api/notifications?isRead=false has always returned.
    'notifications_unread', (
      select count(*) from admin_notifications where is_read = false
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Admin home: the four dashboard numbers.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats(
  p_week_ago timestamptz,
  p_month_start timestamptz
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'active_students', (
      select count(distinct e.user_id)
      from nexus_enrollments e
      join nexus_classrooms c on c.id = e.classroom_id
      where e.role = 'student' and e.is_active = true and c.is_archived is not true
    ),
    'new_leads_7d', (
      select count(*) from users where user_type::text = 'lead' and created_at >= p_week_ago
    ),
    'applications_to_review', (
      select count(*) from lead_profiles
      where status::text in ('submitted', 'under_review', 'pending_verification')
        and deleted_at is null
    ),
    'collected_this_month', (
      select coalesce(sum(amount), 0) from payments
      where status::text = 'paid' and paid_at >= p_month_start
    ),
    'payments_pending', (
      select count(*) from payments where status::text = 'pending'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Students hub revenue overview: per academic-year fee rollup.
-- ---------------------------------------------------------------------------
create or replace function public.revenue_by_year(p_program text default 'architecture')
returns table (
  year text,
  student_count bigint,
  total_fee numeric,
  collected numeric,
  pending numeric,
  fully_paid_count bigint,
  partial_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    u.academic_year as year,
    count(*) as student_count,
    coalesce(sum(sp.total_fee), 0) as total_fee,
    coalesce(sum(sp.fee_paid), 0) as collected,
    coalesce(sum(sp.fee_due), 0) as pending,
    count(*) filter (where sp.payment_status::text = 'paid') as fully_paid_count,
    count(*) filter (where sp.payment_status::text = 'pending' and coalesce(sp.fee_paid, 0) > 0) as partial_count
  from student_profiles sp
  join users u on u.id = sp.user_id
  where u.user_type::text = 'student'
    and u.student_program = p_program
  group by u.academic_year;
$$;

-- ---------------------------------------------------------------------------
-- 4. Onboarding analytics: status counts + per-question answer distribution.
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_analytics(
  p_start timestamptz default null,
  p_end timestamptz default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with s as (
    select status::text as status
    from onboarding_sessions
    where (p_start is null or created_at >= p_start)
      and (p_end is null or created_at <= p_end)
  ),
  r as (
    select question_id, response
    from onboarding_responses
    where (p_start is null or responded_at >= p_start)
      and (p_end is null or responded_at <= p_end)
      and jsonb_typeof(response) = 'object'
  ),
  -- Same precedence as the old JS: 'value' first, then 'values', then 'scale'.
  answers as (
    select question_id, coalesce(response ->> 'value', 'null') as answer
    from r where response ? 'value'
    union all
    select r.question_id, coalesce(v.answer, 'null')
    from r
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(r.response -> 'values') = 'array' then r.response -> 'values' else '[]'::jsonb end
    ) as v(answer)
    where not (r.response ? 'value') and r.response ? 'values'
    union all
    select question_id, coalesce(response ->> 'scale', 'null')
    from r where not (response ? 'value') and not (response ? 'values') and response ? 'scale'
  ),
  per_answer as (
    select question_id, answer, count(*) as n from answers group by question_id, answer
  ),
  per_question as (
    select question_id::text as question_id, jsonb_object_agg(answer, n) as dist
    from per_answer group by question_id
  )
  select jsonb_build_object(
    'completed', (select count(*) from s where status = 'completed'),
    'skipped', (select count(*) from s where status = 'skipped'),
    'pending', (select count(*) from s where status = 'pending'),
    'in_progress', (select count(*) from s where status = 'in_progress'),
    'total', (select count(*) from s),
    'distribution', coalesce((select jsonb_object_agg(question_id, dist) from per_question), '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Financial dashboard: one call instead of 16 sequential queries.
--    Payments use created_at between start 00:00:00Z and end 23:59:59Z, exactly
--    as the route did. Any transaction type other than 'expense' is side income.
-- ---------------------------------------------------------------------------
create or replace function public.financial_dashboard_summary(
  p_start date,
  p_end date,
  p_prev_start date,
  p_prev_end date,
  p_months integer default 6,
  p_today date default current_date
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with cur as (
    select type, category, amount from financial_transactions
    where transaction_date between p_start and p_end
  ),
  prev as (
    select type, category, amount from financial_transactions
    where transaction_date between p_prev_start and p_prev_end
  ),
  months as (
    select (date_trunc('month', p_today) - make_interval(months => i))::date as m_start
    from generate_series(0, greatest(p_months, 1) - 1) as i
  ),
  monthly as (
    select
      m.m_start,
      (select coalesce(sum(t.amount) filter (where t.type = 'expense'), 0)
         from financial_transactions t
         where t.transaction_date between m.m_start and (m.m_start + interval '1 month' - interval '1 day')::date) as expenses,
      (select coalesce(sum(t.amount) filter (where t.type is distinct from 'expense'), 0)
         from financial_transactions t
         where t.transaction_date between m.m_start and (m.m_start + interval '1 month' - interval '1 day')::date) as side_income,
      (select coalesce(sum(p.amount), 0)
         from payments p
         where p.status::text = 'paid'
           and p.created_at >= (m.m_start::timestamp at time zone 'UTC')
           and p.created_at <= (((m.m_start + interval '1 month' - interval '1 day')::date + time '23:59:59') at time zone 'UTC')) as fee_income
    from months m
  ),
  top_assignment as (
    select t.assignment_id, sum(t.amount) as total
    from financial_transactions t
    where t.assignment_id is not null and t.transaction_date between p_start and p_end
    group by t.assignment_id
    having sum(t.amount) > 0
    order by sum(t.amount) desc, t.assignment_id
    limit 1
  )
  select jsonb_build_object(
    'student_fee_income', (
      select coalesce(sum(amount), 0) from payments
      where status::text = 'paid'
        and created_at >= (p_start::timestamp at time zone 'UTC')
        and created_at <= ((p_end + time '23:59:59') at time zone 'UTC')
    ),
    'side_income', (select coalesce(sum(amount), 0) from cur where type is distinct from 'expense'),
    'total_expenses', (select coalesce(sum(amount), 0) from cur where type = 'expense'),
    'highest_single_expense', (select greatest(coalesce(max(amount), 0), 0) from cur where type = 'expense'),
    'category_breakdown', coalesce((
      select jsonb_object_agg(category, total) from (
        select coalesce(category, 'null') as category, sum(amount) as total
        from cur where type = 'expense' group by 1
      ) c
    ), '{}'::jsonb),
    'prev_fee_income', (
      select coalesce(sum(amount), 0) from payments
      where status::text = 'paid'
        and created_at >= (p_prev_start::timestamp at time zone 'UTC')
        and created_at <= ((p_prev_end + time '23:59:59') at time zone 'UTC')
    ),
    'prev_side_income', (select coalesce(sum(amount), 0) from prev where type is distinct from 'expense'),
    'prev_expenses', (select coalesce(sum(amount), 0) from prev where type = 'expense'),
    'prev_category_breakdown', coalesce((
      select jsonb_object_agg(category, total) from (
        select coalesce(category, 'null') as category, sum(amount) as total
        from prev where type = 'expense' group by 1
      ) c
    ), '{}'::jsonb),
    'student_count', (select count(*) from student_profiles),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month_start', to_char(m_start, 'YYYY-MM-DD'),
        'fee_income', fee_income,
        'side_income', side_income,
        'expenses', expenses
      ) order by m_start)
      from monthly
    ), '[]'::jsonb),
    'top_assignment', (
      select jsonb_build_object('title', a.title, 'staff_name', a.staff_name, 'total', ta.total)
      from top_assignment ta
      join expense_assignments a on a.id = ta.assignment_id
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 6. CRM: lead accounts whose email belongs to a student account.
--    Replaces "load every student email, then .in() them all in the URL".
--    Case and surrounding spaces are ignored (the old exact match missed
--    Foo@gmail.com vs foo@gmail.com).
-- ---------------------------------------------------------------------------
create or replace function public.admin_lead_student_email_matches()
returns table (user_id uuid)
language sql
stable
set search_path = public
as $$
  select distinct l.id
  from users l
  join users s
    on lower(trim(s.email)) = lower(trim(l.email))
  where l.user_type::text = 'lead'
    and s.user_type::text = 'student'
    and l.email is not null
    and s.email is not null
    and trim(l.email) <> '';
$$;

-- ---------------------------------------------------------------------------
-- Grants: service_role only.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_badge_counts(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dashboard_stats(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.revenue_by_year(text) from public, anon, authenticated;
revoke all on function public.onboarding_analytics(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.financial_dashboard_summary(date, date, date, date, integer, date) from public, anon, authenticated;
revoke all on function public.admin_lead_student_email_matches() from public, anon, authenticated;

grant execute on function public.admin_badge_counts(timestamptz, timestamptz) to service_role;
grant execute on function public.dashboard_stats(timestamptz, timestamptz) to service_role;
grant execute on function public.revenue_by_year(text) to service_role;
grant execute on function public.onboarding_analytics(timestamptz, timestamptz) to service_role;
grant execute on function public.financial_dashboard_summary(date, date, date, date, integer, date) to service_role;
grant execute on function public.admin_lead_student_email_matches() to service_role;

notify pgrst, 'reload schema';
