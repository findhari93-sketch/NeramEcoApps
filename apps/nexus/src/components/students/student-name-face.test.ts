import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import { stripLineComments } from './allowlist-jsonc';

/**
 * A student's name must never appear without their face.
 *
 * The ESLint rule in .eslintrc.json bans a plain UserAvatar, GraphAvatar or
 * Avatar-with-a-src, so no face can be drawn without its cohort ring. What it
 * structurally cannot see is a screen that draws NO FACE AT ALL: the test
 * results tab listed "Hari Heera, 1 attempt, 76%" as bare text, and survived
 * three manual sweeps and the lint rule precisely because there was no avatar
 * element there to restrict. This is the guard for that class.
 *
 * It cannot be an ESLint rule. esquery cannot look sideways from a name to ask
 * whether a StudentAvatar sits beside it, so a selector on the name alone would
 * fire on the twenty-five screens that are already correct and the allowlist
 * would become the drift. Checking at FILE level instead means a screen that
 * imports a face component passes automatically, and only a genuinely faceless
 * one fails.
 */

const APP_ROOT = join(__dirname, '..', '..', '..');
const SRC = join(APP_ROOT, 'src');

/**
 * Teacher screens only. The (student) and (parent) zones are out of scope by
 * path rather than by exception: no provider is mounted there, so a ring can
 * never render, and that is the privacy line rather than an oversight.
 */
const SCAN_ROOTS = [join(SRC, 'app', '(teacher)'), join(SRC, 'components')];

/** Any of these in a file means somebody thought about the face. */
const FACE_COMPONENTS = ['StudentAvatar', 'StudentIdentityLine', 'StudentStageAvatar'];

/**
 * A property chain that is unambiguously a student's name.
 *
 * The codebase already names the role in the path, so the segment before `.name`
 * is enough to tell a student from anyone else: cls.teacher.name, c.author.name,
 * comment.user.name and parentSession.parent.name are all rejected by these
 * three patterns without a single special case. Anchoring the suffix also
 * rejects student.user.name and student.currentBatch.name, which start at a
 * student and end somewhere else.
 *
 * SINGLE-LETTER ROOTS LIKE {s.name} ARE DELIBERATELY NOT MATCHED, and this is
 * not an oversight to fix. Adding them surfaces twenty more files, of which
 * roughly seventeen are classrooms, files, batches and templates rather than
 * people. Seventeen allowlist entries to catch three real ones would make the
 * allowlist itself the drift, which is the exact failure the sibling avatar
 * allowlist exists to prevent. Precision over recall: this test is a net for the
 * obvious case, not a proof of completeness.
 */
const STUDENT_NAME_CHAIN = [
  /(^|\.)student_name$/,
  /(^|\.)student\.name$/,
  /(^|\.)studentName$/,
];

interface Hit {
  file: string;
  line: number;
  chain: string;
}

function tsxFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFilesUnder(full));
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

function isJsxNode(node: ts.Node): boolean {
  return (
    ts.isJsxElement(node) || ts.isJsxFragment(node) || ts.isJsxSelfClosingElement(node)
  );
}

/** `sub.student?.name!` and `sub.student.name` are the same chain. */
function normalise(text: string): string {
  return text.replace(/\?\./g, '.').replace(/!/g, '').replace(/\s+/g, '');
}

function findStudentNamesInText(source: ts.SourceFile, file: string): Hit[] {
  const hits: Hit[] = [];

  /**
   * Walk one JSX expression looking for a name rendered AS TEXT, stopping at any
   * nested JSX. That cutoff is load-bearing twice over: it stops
   * {rows.map(r => <StudentAvatar name={r.student_name} />)} being read as text,
   * and it stops an outer .map() re-reporting every hit its children already
   * reported.
   */
  function inspect(node: ts.Node): void {
    if (isJsxNode(node)) return;

    if (ts.isPropertyAccessExpression(node)) {
      const chain = normalise(node.getText(source));
      if (STUDENT_NAME_CHAIN.some((re) => re.test(chain))) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        hits.push({ file, line: line + 1, chain });
        // Do not descend: `row.student.name` must not also report `row.student`.
        return;
      }
    }

    node.forEachChild(inspect);
  }

  function visit(node: ts.Node): void {
    // An attribute value's parent is a JsxAttribute, so name={r.student_name} is
    // excluded here by construction rather than by a rule that could rot.
    if (
      ts.isJsxExpression(node) &&
      node.parent &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      node.expression
    ) {
      inspect(node.expression);
    }
    node.forEachChild(visit);
  }

  visit(source);
  return hits;
}

function importsAFace(source: ts.SourceFile): boolean {
  let found = false;
  source.forEachChild((node) => {
    if (found || !ts.isImportDeclaration(node)) return;
    const spec = (node.moduleSpecifier as ts.StringLiteral).text;
    if (FACE_COMPONENTS.some((c) => spec.endsWith(`/${c}`) || spec === `./${c}`)) found = true;
  });
  return found;
}

function scan(): Hit[] {
  const offenders: Hit[] = [];

  for (const root of SCAN_ROOTS) {
    for (const file of tsxFilesUnder(root)) {
      const src = readFileSync(file, 'utf8');
      // Cheap reject before paying for a parse: most files never say "student".
      if (!src.includes('student') && !src.includes('Student')) continue;

      const source = ts.createSourceFile(
        file,
        src,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.TSX
      );

      const hits = findStudentNamesInText(source, relative(APP_ROOT, file).split(sep).join('/'));
      if (hits.length && !importsAFace(source)) offenders.push(...hits);
    }
  }

  return offenders;
}

function allowlist(): string[] {
  const raw = readFileSync(join(__dirname, 'faceless-name-allowlist.jsonc'), 'utf8');
  return (JSON.parse(stripLineComments(raw)).files || []) as string[];
}

describe('student names are never faceless', () => {
  it('every teacher screen that names a student also shows one', () => {
    const allowed = new Set(allowlist());
    const offenders = scan().filter((h) => !allowed.has(h.file));

    const report = offenders
      .map((h) => `    ${h.file}:${h.line}   renders {${h.chain}} as text`)
      .join('\n');

    expect(
      offenders,
      offenders.length
        ? `These screens name a student with no face beside them:\n\n${report}\n\n` +
            `  A name is something a teacher READS; a face wearing its cohort ring is\n` +
            `  something they SCAN. Put one in front of the name:\n\n` +
            `      <StudentAvatar userId={...} name={...} size={32} />\n\n` +
            `  The user id is all it needs. The photo, the name and the ring all come\n` +
            `  from /api/students/stage-facts, so no route has to change.\n` +
            `  Budget size + 8 px of width, because the ring is drawn outside the face.\n\n` +
            `  If this name genuinely must stay bare, add the path to\n` +
            `  faceless-name-allowlist.jsonc with the reason above it.`
        : ''
    ).toEqual([]);
  });

  it('the allowlist names only files that still exist', () => {
    // A dead exception does not fail lint and does not fail the build. It just
    // makes the list look considered while it is stale.
    const missing = allowlist().filter((f) => !existsSync(join(APP_ROOT, f)));
    expect(missing).toEqual([]);
  });

  it('the scan can actually see a faceless name', () => {
    // Without this, deleting the detection would turn the suite green and read
    // as "no screen is faceless" rather than "nothing was checked".
    const source = ts.createSourceFile(
      'sample.tsx',
      `export const R = ({ r }: any) => <Typography>{r.student_name || 'Unknown'}</Typography>;`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    expect(findStudentNamesInText(source, 'sample.tsx')).toHaveLength(1);
  });

  it('does not mistake a name passed as a prop for one rendered as text', () => {
    const source = ts.createSourceFile(
      'sample.tsx',
      `export const R = ({ r }: any) => <div>{rows.map((x: any) => <StudentAvatar name={x.student_name} />)}</div>;`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    expect(findStudentNamesInText(source, 'sample.tsx')).toEqual([]);
  });

  it('leaves a teacher, an author or a parent alone', () => {
    const source = ts.createSourceFile(
      'sample.tsx',
      `export const R = ({ c }: any) => <div>{c.teacher.name}{c.author.name}{c.parent.name}{c.student.user.name}</div>;`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    expect(findStudentNamesInText(source, 'sample.tsx')).toEqual([]);
  });
});
