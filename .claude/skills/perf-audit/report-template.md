# Report template

Write the report to `docs/audits/perf/<app>/reports/YYYY-MM-DD.md`. If a report already exists for that date, add `-2`, `-3` and so on. The repo is public: a security-sensitive finding appears only as its id and a generic title, and its details go to private memory.

Two rules apply to every section below:
- A number that was not measured is written as "not measured". It is never estimated as if it were measured.
- Each section is filled for **this session's scope only**. "Not in scope this session" is a valid answer.

```markdown
# <App> performance audit, YYYY-MM-DD

## Scope and coverage
- Planned: N units (focus: ...). Audited: N. Skipped as fresh: N (listed below). Deferred: N.
- Re-audits: N stale:code (diff-focused), N stale:checks, N stale:ttl.
- Coverage after this session: fresh X of Y units; never audited Z.
- Evidence sources used: (for example: pg_stat_statements on prod, staging EXPLAIN, user HAR, next dev hard load)

## Performance audit report
1. Top problems (up to 10, worst first, each a finding id)
2. Root cause of <each production error the user reported> (for example React #418, #423)
3. Root cause of each failing or slow endpoint named by the user
4. Why refresh fixes it (or: does not apply)
5. Slowest APIs (endpoint, p50/p95 or "not measured", slow step)
6. Duplicate requests (endpoint | calls per screen | expected | cause)
7. Largest components and bundles
8. Database and query bottlenecks
9. Most expensive renders
10. Recommended fixes (finding id, fix, owner app)
11. Estimated impact of each fix
12. Risk of each change
13. Implementation order
14. Needs approval before doing (DB indexes, RLS, architecture, cross-app)
15. Fixed this session (finding id, commit or "uncommitted", test added)

## Findings
<one block per finding, the same fields as findings.jsonl>

### PERF-0001 [CRITICAL] <title>
- Units: page:..., shared:...
- Check: HYD-1 | Evidence type: measured / inferred
- Location: path/to/file.tsx:123
- Root cause:
- Evidence:
- User impact:
- Technical impact:
- Recommended fix:
- Risk:
- Expected improvement:
- Status: open / fixed (uncommitted) / verified

## Skipped (fresh: audited and unchanged)
- Counts by area. List individual units only when they were on the focus path (`status --json` gives `auditedAt` per unit).

## BEFORE / AFTER
| | BEFORE | AFTER |
|---|---|---|
| Page load | | |
| API calls per screen | | |
| Slow APIs | | |
| React errors | | |
| Hydration errors | | |
| Major UX problems / improvements | | |
```

Severity scale:
- **CRITICAL** covers failures, infinite loading, production errors, timeouts, broken navigation and hydration failure.
- **HIGH** covers issues that significantly slow page load, APIs, navigation, large tables or interaction.
- **MEDIUM** covers moderate performance problems, unnecessary requests and maintainability that affects reliability.
- **LOW** covers minor optimisations.
