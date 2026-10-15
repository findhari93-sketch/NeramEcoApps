-- Where Aintra's visitors are.
--
-- chatbot_conversations stored no location, so the founder could not see which
-- states and cities the assistant reaches. The marketing chat routes now write
-- the visitor's place from Cloudflare's location headers (cf-ipcity, cf-region,
-- cf-ipcountry via @neram/database/signup-geo). Only the place is stored, never
-- the IP.
--
-- Older guest chats have no location and never will. Signed-in chatters are
-- backfilled from their application form (lead_profiles), tagged 'profile' so
-- the admin view can tell the two apart.

alter table public.chatbot_conversations
  add column if not exists geo_city text,
  add column if not exists geo_state text,
  add column if not exists geo_country text,
  add column if not exists geo_source text;

comment on column public.chatbot_conversations.geo_source is
  'cloudflare | vercel (request headers at chat time) | profile (backfilled from lead_profiles)';

create index if not exists idx_chatbot_conversations_created_geo
  on public.chatbot_conversations (created_at desc)
  include (session_id, geo_state, geo_city, geo_country);

-- Backfill: signed-in chatters whose application form names a state.
update public.chatbot_conversations c
set geo_state = lp.state,
    geo_city = lp.city,
    geo_country = lp.country,
    geo_source = 'profile'
from (
  select distinct on (user_id)
    user_id,
    nullif(initcap(lower(btrim(state))), '') as state,
    nullif(initcap(lower(btrim(city))), '') as city,
    nullif(upper(btrim(country)), '') as country
  from public.lead_profiles
  where user_id is not null
    and nullif(btrim(state), '') is not null
  order by user_id, updated_at desc nulls last
) lp
where c.user_id = lp.user_id
  and c.geo_state is null
  and c.geo_country is null;

-- ---------------------------------------------------------------------------
-- Summary for the admin Chat History "Locations" view.
--
-- Counts distinct sessions (one visitor = one session), not messages. A
-- session's place is its first located row in the range. A state with no
-- country (a profile row) is treated as India, which is where the application
-- form's state list comes from.
-- ---------------------------------------------------------------------------
create or replace function public.chatbot_geo_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_source text default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with rows_in_range as (
    select session_id, created_at, geo_city, geo_state, geo_country
    from chatbot_conversations
    where (p_from is null or created_at >= p_from)
      and (p_to is null or created_at < p_to)
      and (p_source is null or source = p_source)
  ),
  sessions as (
    select session_id, count(*) as messages
    from rows_in_range
    group by session_id
  ),
  placed as (
    select distinct on (session_id)
      session_id,
      nullif(btrim(geo_city), '') as city,
      nullif(btrim(geo_state), '') as state,
      coalesce(nullif(upper(btrim(geo_country)), ''),
               case when nullif(btrim(geo_state), '') is not null then 'IN' end) as country
    from rows_in_range
    where geo_state is not null or geo_country is not null or geo_city is not null
    order by session_id, created_at
  ),
  joined as (
    select s.session_id, s.messages, p.city, p.state, p.country
    from sessions s
    left join placed p using (session_id)
  )
  select jsonb_build_object(
    'total_sessions', (select count(*) from joined),
    'total_messages', (select coalesce(sum(messages), 0) from joined),
    'located_sessions', (select count(*) from joined where country is not null),
    'india_sessions', (select count(*) from joined where country = 'IN'),
    'abroad_sessions', (select count(*) from joined where country is not null and country <> 'IN'),
    'india_no_state_sessions', (select count(*) from joined where country = 'IN' and state is null),
    'by_state', coalesce((
      select jsonb_agg(jsonb_build_object('state', state, 'sessions', sessions, 'messages', messages)
                       order by sessions desc, state)
      from (
        select state, count(*) as sessions, sum(messages) as messages
        from joined
        where country = 'IN' and state is not null
        group by state
      ) t
    ), '[]'::jsonb),
    'by_city', coalesce((
      select jsonb_agg(jsonb_build_object('city', city, 'state', state, 'country', country, 'sessions', sessions)
                       order by sessions desc, city)
      from (
        select city, state, country, count(*) as sessions
        from joined
        where city is not null
        group by city, state, country
        order by count(*) desc, city
        limit 300
      ) t
    ), '[]'::jsonb),
    'by_country', coalesce((
      select jsonb_agg(jsonb_build_object('country', country, 'sessions', sessions) order by sessions desc)
      from (
        select country, count(*) as sessions
        from joined
        where country is not null
        group by country
      ) t
    ), '[]'::jsonb),
    'tracking_since', (
      select min(created_at) from chatbot_conversations
      where geo_source in ('cloudflare', 'vercel')
    )
  );
$$;

-- Grants: service_role only (the admin API calls it with the admin client).
revoke all on function public.chatbot_geo_summary(timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.chatbot_geo_summary(timestamptz, timestamptz, text) to service_role;
