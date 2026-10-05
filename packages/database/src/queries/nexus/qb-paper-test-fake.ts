/**
 * Test helper, not shipped through the index: a tiny in-memory stand-in for
 * the Supabase query builder, enough of select/insert/update with
 * eq/is/in/order/maybeSingle for the question-bank paper modules.
 *
 * `rpc('nexus_qb_move_questions')` mirrors the Postgres function in
 * supabase/migrations/20261102090000_nexus_qb_move_questions.sql closely enough
 * for the TypeScript around it to be tested: rows, numbering and source rows.
 */

export type Row = Record<string, any>;

const sameKey = (s: Row, p: Row) =>
  s.exam_type === p.exam_type &&
  s.year === p.year &&
  (s.session ?? null) === (p.session ?? null) &&
  (s.shift ?? null) === (p.shift ?? null);

function moveQuestions(tables: Record<string, Row[]>, args: Row) {
  const papers = tables.nexus_qb_original_papers ?? [];
  const questions = tables.nexus_qb_questions ?? [];
  const sources = (tables.nexus_qb_question_sources ??= []);
  const src = papers.find((p) => p.id === args.p_source_paper_id);
  const tgt = papers.find((p) => p.id === args.p_target_paper_id);
  if (!src || !tgt) return { data: null, error: { code: 'P0002', message: 'Paper not found' } };

  const picked = questions
    .filter((q) => args.p_question_ids.includes(q.id))
    .sort((a, b) => (a.section_order ?? 99) - (b.section_order ?? 99) || (a.display_order ?? 1e9) - (b.display_order ?? 1e9));
  if (picked.length !== args.p_question_ids.length || picked.some((q) => q.original_paper_id !== src.id)) {
    return { data: null, error: { code: '22023', message: 'Some of these questions are not on this paper' } };
  }

  const taken = new Map<string, number[]>();
  for (const q of picked) {
    const section = args.p_section ?? q.section ?? '';
    const used = taken.get(section) ?? [];
    const onTarget = questions.filter((o) => o.original_paper_id === tgt.id && (o.section ?? '') === section);
    let n = q.display_order;
    if (n == null || used.includes(n) || onTarget.some((o) => o.display_order === n)) {
      n = Math.max(0, ...onTarget.map((o) => o.display_order ?? 0), ...used) + 1;
    }
    used.push(n);
    taken.set(section, used);

    q.original_paper_id = tgt.id;
    if (args.p_section) {
      q.section = args.p_section;
      q.section_order = args.p_section_order;
    }
    q.display_order = n;
    if (q.exam_relevance !== 'BOTH') q.exam_relevance = tgt.exam_type === 'NATA' ? 'NATA' : 'JEE';

    const already = sources.find((s) => s.question_id === q.id && sameKey(s, tgt));
    const old = sources.find((s) => s.question_id === q.id && sameKey(s, src));
    if (already) {
      if (old) sources.splice(sources.indexOf(old), 1);
      already.question_number = n;
    } else if (old) {
      Object.assign(old, { exam_type: tgt.exam_type, year: tgt.year, session: tgt.session, shift: tgt.shift, question_number: n });
    } else {
      sources.push({ question_id: q.id, exam_type: tgt.exam_type, year: tgt.year, session: tgt.session, shift: tgt.shift, question_number: n });
    }
  }
  return { data: picked.length, error: null };
}

export function fakeSupabase(tables: Record<string, Row[]>) {
  const rpcCalls: Array<{ fn: string; args: Row }> = [];

  function builder(table: string) {
    const rows = (tables[table] ??= []);
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: any = null;
    const filters: Array<(r: Row) => boolean> = [];
    let returning = false;

    const run = () => {
      if (op === 'insert') {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({
          id: r.id ?? `gen-${Math.random().toString(36).slice(2)}`,
          ...r,
        }));
        rows.push(...list);
        return { data: returning ? list : null, error: null };
      }
      const matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        matched.forEach((r) => Object.assign(r, payload));
        return { data: null, error: null };
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    };

    const api: any = {
      select() {
        if (op !== 'select') returning = true;
        return api;
      },
      insert(p: any) {
        op = 'insert';
        payload = p;
        return api;
      },
      update(p: any) {
        op = 'update';
        payload = p;
        return api;
      },
      eq(col: string, v: any) {
        filters.push((r) => r[col] === v);
        return api;
      },
      is(col: string, v: any) {
        filters.push((r) => (r[col] ?? null) === v);
        return api;
      },
      in(col: string, vs: any[]) {
        filters.push((r) => vs.includes(r[col]));
        return api;
      },
      order() {
        return api;
      },
      maybeSingle() {
        const res = run();
        const list = res.data as Row[];
        return Promise.resolve({ data: list[0] ?? null, error: null });
      },
      single() {
        const res = run();
        return Promise.resolve({ data: (res.data as Row[])[0], error: null });
      },
      then(resolve: any, reject: any) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    from: builder,
    rpc(fn: string, args: Row) {
      rpcCalls.push({ fn, args });
      if (fn === 'nexus_qb_move_questions') return Promise.resolve(moveQuestions(tables, args));
      if (fn === 'nexus_qb_change_paper_exam') {
        // The paper row only; the SQL itself is tested on staging.
        const paper = (tables.nexus_qb_original_papers || []).find((p) => p.id === args.p_paper_id);
        if (paper) {
          Object.assign(paper, { exam_type: args.p_exam_type, year: args.p_year, session: args.p_session, shift: args.p_shift });
        }
        return Promise.resolve({ data: { paper_id: args.p_paper_id, remapped: 0, left_behind: 0, left_paper_id: null }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `no fake for ${fn}` } });
    },
    rpcCalls,
  } as any;
}
