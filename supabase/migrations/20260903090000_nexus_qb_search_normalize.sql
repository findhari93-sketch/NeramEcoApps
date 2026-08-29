-- ============================================================
-- Question Bank search: math aware text normalizer
-- ============================================================
-- Students cannot type LaTeX. The bank stores it: "$y^2=2x$", "$A^2$",
-- "$\frac{5\sqrt3}{2}$". A student looking for that question types "y2",
-- "y squared", "A2" or "root". None of those appear anywhere in the stored
-- text, so substring search can never find them.
--
-- This normalizer flattens LaTeX into every surface form a student might
-- actually type, so one indexed document satisfies all of them:
--
--   y^2   ->  y 2 | y2 | y squared | y square | y power 2
--   A^2   ->  a 2 | a2 | a squared | a square | a power 2
--   x_1   ->  x 1 | x1
--   \sqrt ->  sqrt | root | square root
--   \int  ->  integral | integration
--
-- It is deliberately SEPARATE from nexus_qb_normalize rather than a
-- replacement. That function backs the question_text_norm generated column
-- used by the dedupe probe (nexus_qb_find_similar) and by library_search;
-- changing its output would silently move both of their similarity scores.
--
-- IMMUTABLE + PARALLEL SAFE so it can be used in index expressions.

CREATE OR REPLACE FUNCTION nexus_qb_search_normalize(t text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $fn$
DECLARE
  v text := lower(coalesce(t, ''));
BEGIN
  IF v = '' THEN
    RETURN '';
  END IF;

  -- HTML first: some imported questions carry <p>/<sub>/<em> wrappers.
  v := regexp_replace(v, '<[^>]*>', ' ', 'g');

  -- Control characters from the CSV importer's unescaped backslashes
  -- (\f became a formfeed, \t a tab). 91 rows carry these today.
  v := regexp_replace(v, '[\r\n\t\f\v]+', ' ', 'g');

  -- Repair the same import bug in text form so search still works on the
  -- damaged rows even before the data fix migration runs: "rac{" is a
  -- \frac whose backslash-f was eaten.
  v := regexp_replace(v, '(^|[^f])rac\{', '\1 frac {', 'g');

  -- ---- 1. Drop LaTeX control words that are pure layout noise ----------
  -- MUST run before the punctuation strip below. Otherwise every \text{...}
  -- in the bank contributes a literal token "text", and searching "text"
  -- matches half the corpus. Longest alternatives first so \textbf is not
  -- consumed as \text + "bf".
  -- (?![a-z]) not \y: in POSIX ARE underscore is a WORD character, so \y
  -- would fail to match in "\int_0^1" and leave the command unexpanded.
  v := regexp_replace(v,
    '\\(displaystyle|textbf|textit|mathrm|mathbf|mathbb|operatorname|begin|end|array|qquad|quad|limits|nonumber|label|left|right|text)(?![a-z])',
    ' ', 'g');

  -- ---- 2. Commands that expand to several words a student might use ----
  v := regexp_replace(v, '\\sqrt(?![a-z])',           ' sqrt root square root ',     'g');
  v := regexp_replace(v, '\\frac(?![a-z])',           ' frac fraction over ',        'g');
  v := regexp_replace(v, '\\infty(?![a-z])',          ' infinity infinite ',         'g');
  v := regexp_replace(v, '\\int(?![a-z])',            ' integral integration ',      'g');
  v := regexp_replace(v, '\\(geq|ge)(?![a-z])',       ' greater than or equal ',     'g');
  v := regexp_replace(v, '\\(leq|le)(?![a-z])',       ' less than or equal ',        'g');
  v := regexp_replace(v, '\\(neq|ne)(?![a-z])',       ' not equal ',                 'g');
  v := regexp_replace(v, '\\approx(?![a-z])',         ' approximately ',             'g');
  v := regexp_replace(v, '\\(times|cdot)(?![a-z])',   ' times multiply product ',    'g');
  v := regexp_replace(v, '\\div(?![a-z])',            ' divide division ',           'g');
  v := regexp_replace(v, '\\pm(?![a-z])',             ' plus minus ',                'g');
  v := regexp_replace(v, '\\perp(?![a-z])',           ' perpendicular ',             'g');
  v := regexp_replace(v, '\\parallel(?![a-z])',       ' parallel ',                  'g');
  v := regexp_replace(v, '\\cup(?![a-z])',            ' union ',                     'g');
  v := regexp_replace(v, '\\cap(?![a-z])',            ' intersection ',              'g');
  v := regexp_replace(v, '\\angle(?![a-z])',          ' angle ',                     'g');
  v := regexp_replace(v, '\\(vec|overrightarrow)(?![a-z])', ' vector ',              'g');
  v := regexp_replace(v, '\\(overline|bar)(?![a-z])', ' bar conjugate ',             'g');

  -- ---- 3. Commands whose own name is the searchable word ---------------
  v := regexp_replace(v,
    '\\(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|sigma|omega|phi|psi|chi|rho|tau|nu|xi|mu|pi'
    || '|sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|arcsin|arccos|arctan'
    || '|log|ln|exp|lim|sum|prod|min|max|det|dim|deg|gcd|arg|matrix)(?![a-z])',
    ' \1 ', 'g');

  -- ---- 4. Powers -------------------------------------------------------
  -- 2 and 3 get their spoken names ("squared"/"cubed") before the generic
  -- rule. Each pattern keeps TWO capture groups on purpose: the glued form
  -- is written as \1\2, and with only one group \2 would expand to the
  -- empty string, silently producing "y" where "y2" was intended.
  v := regexp_replace(v, '([a-z0-9])\^\{?(2)\}?', ' \1 \2 \1\2 \1 squared \1 square \1 power \2 ', 'g');
  v := regexp_replace(v, '([a-z0-9])\^\{?(3)\}?', ' \1 \2 \1\2 \1 cubed \1 cube \1 power \2 ',     'g');
  v := regexp_replace(v, '([a-z0-9])\^\{?(-?[0-9]+)\}?', ' \1 \2 \1\2 \1 power \2 ',               'g');

  -- ---- 5. Subscripts ---------------------------------------------------
  v := regexp_replace(v, '([a-z0-9])_\{?([0-9]+)\}?', ' \1 \2 \1\2 ', 'g');

  -- ---- 6. Everything else becomes a separator --------------------------
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');

  RETURN btrim(v);
END;
$fn$;

COMMENT ON FUNCTION nexus_qb_search_normalize(text) IS
  'Flattens LaTeX/HTML question text into every spoken and glued surface form a student might type (y^2 -> y2, y squared, y square). Backs the QB search vectors. Distinct from nexus_qb_normalize, which the dedupe probe depends on.';


-- ------------------------------------------------------------
-- Option text extractor
-- ------------------------------------------------------------
-- options is jsonb: [{ id, text, text_hi, image_url, nta_id }, ...].
-- 3,930 of 4,129 questions have options and none of that text is searchable
-- today. IMMUTABLE so it can sit inside the search document.

CREATE OR REPLACE FUNCTION nexus_qb_options_text(p_options jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT coalesce(
    string_agg(concat_ws(' ', o->>'text', o->>'text_hi', o->>'nta_id'), ' '),
    ''
  )
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_options) = 'array' THEN p_options ELSE '[]'::jsonb END
  ) AS o
$fn$;

COMMENT ON FUNCTION nexus_qb_options_text(jsonb) IS
  'Flattens the options jsonb array into one searchable string (text + Hindi text + NTA id).';
