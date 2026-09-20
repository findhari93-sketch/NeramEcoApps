import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';
import { stripLineComments } from './allowlist-jsonc';

/**
 * A face drawn by StudentStageAvatar must know whose face it is.
 *
 * The component carries three marks: the student info ring, the stage glyph at
 * the top right, and the language mark at the bottom left. Every one of them
 * needs an identity: `userId` (which resolves through the stage-facts lookup),
 * or the explicit prop for that mark (`stage` for the ring, `language` for the
 * letter). Without one the component does not fail, warn, or render oddly. It
 * resolves the language to English so LanguageMark returns null, and it resolves
 * the stage to "Not set" so the ring goes grey and dotted, and it draws a
 * perfectly plausible face that is quietly missing a mark for every Tamil,
 * Hindi, Kannada and Malayalam student on the screen, inside a ring that reads
 * as no ring at all.
 *
 * That is exactly how it went wrong. Commit 137563ac removed `userId` from the
 * two attendance call sites because the prop did not exist on main yet and CI
 * failed a production deploy at type-check. Its message said to pass it again
 * once the language work landed. The language work landed two commits later and
 * nobody did, and nothing anywhere noticed for three commits: it is valid
 * TypeScript, it passes the avatar ESLint rules in .eslintrc.json (which ban a
 * plain UserAvatar, GraphAvatar or Avatar-with-a-src, and have nothing to say
 * about this), and the screen looks fine unless you happen to know which
 * students speak what.
 *
 * This is the sibling of student-name-face.test.ts next door, which guards the
 * case of a name with no face at all. Same shape, same allowlist format.
 *
 * It is a test and not an ESLint rule only because the allowlist needs its
 * reasons, and ESLint's schema rejects unknown keys in an overrides entry.
 */

const APP_ROOT = join(__dirname, '..', '..', '..');
const SRC = join(APP_ROOT, 'src');

/**
 * Teacher screens only, by path rather than by exception: StudentStageFactsProvider
 * is mounted in app/(teacher)/layout.tsx and nowhere else, so under (student) and
 * (parent) the lookup returns null by design and no mark could render anyway.
 * That is the privacy line, not an oversight.
 */
const SCAN_ROOTS = [join(SRC, 'app', '(teacher)'), join(SRC, 'components')];

const COMPONENT = 'StudentStageAvatar';

/** Either one answers "whose face is this". `language` wins when both are present. */
const IDENTIFYING_PROPS = ['userId', 'language'];

/**
 * What the RING needs. Same shape, different prop: `stage` and `dormant` became
 * optional when the avatar learned to read them from the lookup, which is what
 * made every ring in the staff app agree with every other. The cost of that is
 * a new silent failure: a call site with neither is valid TypeScript and draws
 * a grey dotted "Not set" ring on a student whose class is perfectly well known.
 */
const RING_PROPS = ['userId', 'stage'];

interface Hit {
  file: string;
  line: number;
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

function carriesOneOf(
  attributes: ts.JsxAttributes,
  source: ts.SourceFile,
  wanted: string[]
): boolean {
  for (const prop of attributes.properties) {
    // {...props} could carry anything, and a guard that cannot see inside must
    // not guess. Assuming the worst here would mean an allowlist entry for a
    // call site that is very likely correct, and the allowlist becoming the
    // drift is the failure this whole shape of test exists to avoid.
    if (ts.isJsxSpreadAttribute(prop)) return true;
    if (ts.isJsxAttribute(prop) && wanted.includes(prop.name.getText(source))) {
      return true;
    }
  }
  return false;
}

function findFacelessAvatars(source: ts.SourceFile, file: string, wanted: string[]): Hit[] {
  const hits: Hit[] = [];

  function visit(node: ts.Node): void {
    const opening = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxOpeningElement(node)
        ? node
        : null;

    if (opening && opening.tagName.getText(source) === COMPONENT) {
      if (!carriesOneOf(opening.attributes, source, wanted)) {
        const { line } = source.getLineAndCharacterOfPosition(opening.getStart(source));
        hits.push({ file, line: line + 1 });
      }
    }

    node.forEachChild(visit);
  }

  visit(source);
  return hits;
}

function scan(wanted: string[] = IDENTIFYING_PROPS): Hit[] {
  const offenders: Hit[] = [];

  for (const root of SCAN_ROOTS) {
    for (const file of tsxFilesUnder(root)) {
      const src = readFileSync(file, 'utf8');
      // Cheap reject before paying for a parse.
      if (!src.includes(COMPONENT)) continue;

      const source = ts.createSourceFile(
        file,
        src,
        ts.ScriptTarget.Latest,
        /* setParentNodes */ true,
        ts.ScriptKind.TSX
      );

      offenders.push(
        ...findFacelessAvatars(source, relative(APP_ROOT, file).split(sep).join('/'), wanted)
      );
    }
  }

  return offenders;
}

function allowlist(): string[] {
  const raw = readFileSync(join(__dirname, 'stage-avatar-identity-allowlist.jsonc'), 'utf8');
  return (JSON.parse(stripLineComments(raw)).files || []) as string[];
}

describe('every StudentStageAvatar knows whose face it is', () => {
  it('passes userId or language at every call site', () => {
    const allowed = new Set(allowlist());
    const offenders = scan().filter((h) => !allowed.has(h.file));

    const report = offenders.map((h) => `    ${h.file}:${h.line}`).join('\n');

    expect(
      offenders,
      offenders.length
        ? `These faces are drawn without an identity:\n\n${report}\n\n` +
            `  The ring will render from \`stage\`, but the stage glyph and the\n` +
            `  language mark (த, ह, K, M) will not, and nothing will look broken:\n` +
            `  the language silently resolves to English and the mark draws nothing.\n\n` +
            `      <StudentStageAvatar userId={student.id} ... />\n\n` +
            `  The user id is all it needs. The language and the limited-English\n` +
            `  flag both come from /api/students/stage-facts, so no route has to\n` +
            `  change. Pass \`language\` instead only where the screen already has it.\n\n` +
            `  Also check the size: below 28px the component drops BOTH corner\n` +
            `  marks whatever you pass, so a dense table wants 30 or more.\n\n` +
            `  If this face genuinely must stay anonymous, add the path to\n` +
            `  stage-avatar-identity-allowlist.jsonc with the reason above it.`
        : ''
    ).toEqual([]);
  });

  it('passes userId or stage at every call site, so no ring is silently "Not set"', () => {
    const allowed = new Set(allowlist());
    const offenders = scan(RING_PROPS).filter((h) => !allowed.has(h.file));

    const report = offenders.map((h) => `    ${h.file}:${h.line}`).join('\n');

    expect(
      offenders,
      offenders.length
        ? `These faces draw a ring they cannot fill in:\n\n${report}\n\n` +
            `  With neither \`userId\` nor \`stage\` the info ring resolves to\n` +
            `  "Not set" and renders grey and dotted, which at 30px reads as no\n` +
            `  ring at all, on a student whose class the app already knows.\n\n` +
            `      <StudentStageAvatar userId={student.id} ... />\n\n` +
            `  Pass the user id and the ring, the glyph and the language mark all\n` +
            `  resolve themselves from /api/students/stage-facts. Pass \`stage\`\n` +
            `  instead only where the screen already carries it in its payload.`
        : ''
    ).toEqual([]);
  });

  it('the allowlist names only files that still exist', () => {
    // A dead exception does not fail lint and does not fail the build. It just
    // makes the list look considered while it is stale.
    const missing = allowlist().filter((f) => !existsSync(join(APP_ROOT, f)));
    expect(missing).toEqual([]);
  });

  it('the scan can actually see a faceless avatar', () => {
    // Without this, deleting the detection would turn the suite green and read
    // as "every call site is fine" rather than "nothing was checked".
    const source = ts.createSourceFile(
      'sample.tsx',
      `export const R = ({ s }: any) => <StudentStageAvatar stage={s.stage} name={s.name} size={32} />;`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    expect(findFacelessAvatars(source, 'sample.tsx', IDENTIFYING_PROPS)).toHaveLength(1);
  });

  it('accepts either userId or an explicit language', () => {
    const source = ts.createSourceFile(
      'sample.tsx',
      `export const R = ({ s }: any) => (<div>
         <StudentStageAvatar stage={s.stage} userId={s.id} />
         <StudentStageAvatar stage={s.stage} language={s.home_language} />
         <StudentStageAvatar stage={s.stage} {...rest} />
       </div>);`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    expect(findFacelessAvatars(source, 'sample.tsx', IDENTIFYING_PROPS)).toEqual([]);
  });

  it('is not fooled by a different component whose name ends the same way', () => {
    const source = ts.createSourceFile(
      'sample.tsx',
      `export const R = ({ s }: any) => <MyStudentStageAvatar stage={s.stage} />;`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
    expect(findFacelessAvatars(source, 'sample.tsx', IDENTIFYING_PROPS)).toEqual([]);
  });
});
