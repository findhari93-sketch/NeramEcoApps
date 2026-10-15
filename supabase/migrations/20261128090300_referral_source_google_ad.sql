-- Ads ROI: a separate "Google ad" answer to "How did you find Neram Classes?",
-- so a sponsored result can be told from free search. Plain "Google Search"
-- answers are about 55 to 60% every month, ads or not, so they cannot be
-- credited to ads. Existing answers are untouched. Safe to run twice.
update onboarding_questions q
set options = (
  select jsonb_agg(s.elem order by s.ord)
  from (
    select t.elem, t.ord::numeric as ord
    from jsonb_array_elements(q.options) with ordinality as t(elem, ord)
    union all
    select '{"value":"google_ad","label":"Google ad (Sponsored result)","label_ta":"கூகுள் விளம்பரம்","icon":"search"}'::jsonb,
           coalesce((select g.ord + 0.5 from jsonb_array_elements(q.options) with ordinality as g(elem, ord) where g.elem->>'value' = 'google'), 1000)
  ) s
)
where q.question_key = 'referral_source'
  and not q.options @> '[{"value":"google_ad"}]'::jsonb;
