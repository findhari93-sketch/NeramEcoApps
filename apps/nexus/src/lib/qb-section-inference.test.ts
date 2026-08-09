import { describe, it, expect } from 'vitest';
import { inferPaperSections, type QBSectionInferenceInput } from './qb-section-inference';

/**
 * The paper this was written against: JEE Paper 2 (B.Arch) 2006, 92 questions,
 * laid out as maths Q1-40, aptitude Q41-90, drawing Q91-92.
 *
 * The old question-number rule was hardcoded to the 2019 layout and called
 * Q26-40 aptitude and Q76-90 drawing, which a teacher then had to correct one
 * dropdown at a time. The excerpts below are the real first ~170 characters of
 * each question, so this is a regression test against the actual paper rather
 * than against text chosen to make the classifier look good.
 */
const PAPER_2006: Array<[number, string, string]> = [
  [1, 'MCQ', 'If the centroid of the triangle with vertices $(3c + 2, 2, 0)$, $(2c, -1, -1)$ and $(c + 2, 3c + 1, c + 3)$ coincides with the centre of the sphere $x^2 + y^2 + z^2 + 5ax$'],
  [2, 'MCQ', 'A particle has two velocities $\\vec{v}_1$ and $\\vec{v}_2$. Its resultant velocity is equal to $\\vec{v}_1$ in magnitude.'],
  [3, 'MCQ', 'The domain of the function $f(x) = \\sqrt{2x - 3} + \\sin x + \\sqrt{x - 1}$ is'],
  [4, 'MCQ', 'The mean deviation of an ungrouped data is 10. If each observation is increased by 4%, the revised mean deviation is'],
  [5, 'MCQ', 'If A and B are square matrices of the same order, then which of the following is always true?'],
  [6, 'MCQ', 'The slope of the normal to the curve $y = x^3 - 4x^2$ at $(2, -1)$ is'],
  [7, 'MCQ', 'The line $x \\sin \\alpha - y \\cos \\alpha = a$ touches the circle $x^2 + y^2 = a^2$. Then'],
  [8, 'MCQ', "If f is a continuously differentiable function then $\\int_0^{1.5} [x^2] f'(x) \\, dx$ is"],
  [9, 'MCQ', 'If a circle of area $16\\pi$ has two of its diameters along the lines $2x - 3y + 5 = 0$ and $x + 3y - 11 = 0$, then the equation of the circle is'],
  [10, 'MCQ', 'The system of equations $x + y + z = 0$, $ax + by + z = 0$, $bx + y + z = 0$ has a non-trivial solution, when'],
  [11, 'MCQ', 'The number of solutions of the equation $\\tan x + \\sec x = 2 \\cos x$ lying in the interval $[0, 2\\pi]$ is'],
  [12, 'MCQ', 'For the curve $x = t^2 - 1$, $y = t^2 - t$, the tangent line is perpendicular to the x-axis when'],
  [13, 'MCQ', 'For $\\theta \\neq 0$, if $\\cos\\theta + \\sec\\theta = 2$, then $\\cos^n\\theta + \\sec^n\\theta$ equals'],
  [14, 'MCQ', 'The greatest resultant and the smallest resultant that two given forces can have are of magnitude R and S respectively.'],
  [15, 'MCQ', "Two events A and B are such that $P(B) = 0.55$ and $P(AB') = 0.15$. The probability of the occurrence of at least one event is"],
  [16, 'MCQ', 'Let $\\vec{a} = \\hat{i} - 2\\hat{j} + 3\\hat{k}$ and $\\vec{b} = \\hat{i} + 11\\hat{j} + 7\\hat{k}$ be given vectors.'],
  [17, 'MCQ', 'A function $f(x)$ is defined as $f(x) = \\begin{cases} x \\cdot g(x), & x \\neq 0 \\\\ 0, & x = 0 \\end{cases}$ where $\\lim_{x \\to 0} g(x) = 5$.'],
  [18, 'MCQ', 'Two friends A and B start walking from the same point O. A heads straight towards north. But B first walks 4 km towards north-east, then heads towards 30° west of north.'],
  [19, 'MCQ', 'If $x = a\\cos^3 t$, $y = a\\sin^3 t$, then $\\left(\\frac{d^2 y}{dx^2}\\right)_{t = \\frac{\\pi}{3}}$ is'],
  [20, 'MCQ', '$\\int_{-4}^{-5} e^{(x+5)^2} dx + 3\\int_{1/3}^{2/3} e^{9\\left(x - \\frac{2}{3}\\right)^2} dx$ is'],
  [21, 'MCQ', 'An equilateral triangle is inscribed in the parabola $y^2 = 8x$ with one of its vertices at the vertex of the parabola. Then the length of its side is'],
  [22, 'MCQ', 'A particular solution of the initial value differential equation $\\log\\left(\\frac{dy}{dx}\\right) = 3x + 4y$, $y(0) = 0$ is'],
  [23, 'MCQ', 'A plane passes through a fixed point $(p, q, r)$. The locus of the foot of the perpendicular to the plane from the origin is'],
  [24, 'MCQ', 'The area enclosed by the parabola $y = 3(1 - x^2)$ and the x-axis is'],
  [25, 'MCQ', 'If the roots of the quadratic equation $x^2 + 2px + q = 0$ are $\\tan 30°$ and $\\tan 15°$, respectively, then q is'],
  [26, 'MCQ', 'If $|z| = 3$, then the point representing the complex number $-3 + 3z$ lies on a circle'],
  [27, 'MCQ', 'If the first three terms of a sequence $\\frac{1}{16}$, $a$, $b$, $\\frac{1}{6}$ are in G.P. and the last three are in H.P.'],
  [28, 'MCQ', 'If the quadratic equations $ax^2 + cx - b = 0$ and $ax^2 - 2bx + \\frac{c}{2} = 0$ have a common root, then the value of $a - 4b + 2c$ is'],
  [29, 'MCQ', '$\\frac{5 + i\\sin\\theta}{5 - 3i\\sin\\theta}$ is a real number when'],
  [30, 'MCQ', 'The pair of straight lines joining the origin to the point of intersection of the straight lines $y = 2x + c$ and the curve $x^2 + y^2 = 7$ are at right angles if'],
  [31, 'MCQ', 'The circle passing through the distinct points $(1, t)$, $(t, 1)$ and $(t, t)$ for all values of $t$ passes through the point'],
  [32, 'MCQ', 'Let $\\vec{u}$, $\\vec{v}$ and $\\vec{w}$ be vectors such that $\\vec{u} + \\vec{v} + \\vec{w} = \\vec{0}$.'],
  [33, 'MCQ', 'The line $y = x + 1$ divides the area between the curves $y = \\cos x$, $[-\\pi/2, \\pi/2]$ and the x-axis into two regions which are in the ratio'],
  [34, 'MCQ', 'If PQ is a double ordinate of the hyperbola $\\frac{x^2}{a^2} - \\frac{y^2}{b^2} = 1$, such that OPQ is an equilateral triangle'],
  [35, 'MCQ', 'A set B contains 2007 elements. Let C be the set consisting of subsets of B which contain atmost 1003 elements. The number of elements of C is'],
  [36, 'MCQ', 'If $\\sin(xy) + \\cos(xy) = 1$ and $\\tan(xy) \\neq 1$, then $\\frac{dy}{dx}$ is equal to'],
  [37, 'MCQ', 'If $a$, $x$, $b$ are in H.P. and $a$, $y$, $z$, $b$ are in G.P., then the value of $\\frac{yz}{x(y^3 + z^3)}$ is'],
  [38, 'MCQ', 'If $(1 + x)(1 + x + x^2)(1 + x + x^2 + x^3) + \\ldots = a_0 + a_1 x + a_2 x^2 + \\ldots + a_m x^m$, then the value of $a_1$ is'],
  [39, 'MCQ', "If $f(x) = 4^{\\sin x}$ satisfies the Rolle's theorem on $[0, \\pi]$, then the value of $c \\in (0, \\pi)$ for which $f'(c) = 0$ is"],
  [40, 'MCQ', 'If in the expansion of $\\left(x^3 - \\frac{1}{x^2}\\right)^n$, the sum of coefficients of $x^5$ and $x^{10}$ is 0, then the coefficient of the third term is'],
  [41, 'MCQ', 'Which one of the answer figures shows the correct view of the 3-D problem figure, after it is opened up? (3D solid with T-shaped cross section)'],
  [42, 'MCQ', 'Which one of the answer figures shows the correct view of the 3-D problem figure, after it is opened up? (3D solid with cross-shaped cross section)'],
  [43, 'MCQ', 'Which one of the answer figures shows the correct view of the 3-D problem figure, after it is opened up? (3D solid with bottle/hexagonal shape)'],
  [44, 'MCQ', 'Squares were drawn on one side of the entire sheet of paper. The paper was then folded as shown in the figure. How many total number of squares are there on the flat surface'],
  [45, 'MCQ', 'Which one of the answer figures is the correct mirror image of the given problem figure? (Grid pattern with diagonal lines)'],
  [46, 'MCQ', 'Which one of the answer figures is the correct mirror image of the given problem figure? (Arrow/triangle shape)'],
  [47, 'MCQ', 'Some geometrical figures are given in the problem figure. After assembling them, which figure will be formed, from amongst the answer figures?'],
  [48, 'MCQ', 'One of the following answer figures is NOT hidden in the problem figure, in the same size and direction. Select that one as the correct answer.'],
  [49, 'MCQ', 'How many total number of triangles are there in the problem figure given below? (Rectangle with diagonals and horizontal line)'],
  [50, 'MCQ', 'How many total number of triangles are there in the problem figure given below? (Triangle subdivided by internal lines)'],
  [51, 'MCQ', 'Which one of the answer figures will complete the sequence of the three problem figures?'],
  [52, 'MCQ', 'Which one of the answer figures will complete the sequence of the three problem figures? (Square with X pattern rotating)'],
  [53, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct front view, from amongst the answer figures, looking in the direction of arrow. (Question 53)'],
  [54, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct front view, from amongst the answer figures, looking in the direction of arrow. (Question 54)'],
  [55, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct front view, from amongst the answer figures, looking in the direction of arrow. (Question 55)'],
  [56, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct front view, from amongst the answer figures, looking in the direction of arrow. (Question 56)'],
  [57, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct front view, from amongst the answer figures, looking in the direction of arrow. (Question 57)'],
  [58, 'MCQ', 'Find out the total number of surfaces of the object given below in the problem figure. (Question 58)'],
  [59, 'MCQ', 'Find out the total number of surfaces of the object given below in the problem figure. (Question 59)'],
  [60, 'MCQ', 'Find out the total number of surfaces of the object given below in the problem figure. (Question 60)'],
  [61, 'MCQ', 'Find out the total number of surfaces of the object given below in the problem figure. (Question 61)'],
  [62, 'MCQ', 'Identify the correct 3-D figure from the answer figures, which has the elevation as given in the problem figure on the left. (Question 62)'],
  [63, 'MCQ', 'Identify the correct 3-D figure from the answer figures, which has the elevation as given in the problem figure on the left. (Question 63)'],
  [64, 'MCQ', 'Find the odd figure out.'],
  [65, 'MCQ', 'Problem figure shows top view of an object. Identify the correct elevation, from amongst the answer figures.'],
  [66, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct top view from amongst the answer figures. (Question 66)'],
  [67, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct top view from amongst the answer figures. (Question 67)'],
  [68, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct top view from amongst the answer figures. (Question 68)'],
  [69, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct top view from amongst the answer figures. (Question 69)'],
  [70, 'MCQ', '3-D problem figure shows the view of an object. Identify the correct top view from amongst the answer figures. (Question 70)'],
  [71, 'MCQ', 'Which of the following does NOT possess a smooth texture?'],
  [72, 'MCQ', 'Which one of the following is a complementary colour scheme?'],
  [73, 'MCQ', 'HUDCO is an organisation for'],
  [74, 'MCQ', 'Which of these is NOT a residential building?'],
  [75, 'MCQ', 'The Parliament House, New Delhi is designed by'],
  [76, 'MCQ', 'Arc de Triomphe is a famous monument found in the city of'],
  [77, 'MCQ', 'Which of the following colours does NOT occur in a rainbow?'],
  [78, 'MCQ', 'The stair handrail should be'],
  [79, 'MCQ', 'Maximum insulation is offered by'],
  [80, 'MCQ', 'Gold colour matches with'],
  [81, 'MCQ', 'On the top of Rashtrapati Bhawan, New Delhi, one will find a'],
  [82, 'MCQ', 'Eiffel Tower is built in'],
  [83, 'MCQ', 'Which learned text did ancient Indian architects use for their profession?'],
  [84, 'MCQ', 'Statue of Liberty is situated at'],
  [85, 'MCQ', 'Madhya Pradesh Vidhan Sabha is designed by'],
  [86, 'MCQ', 'Which of the following city has canals as transportation channels?'],
  [87, 'MCQ', 'Which secondary colour will you get when red and yellow colours are mixed together?'],
  [88, 'MCQ', 'The marble used for the construction of Taj Mahal is'],
  [89, 'MCQ', 'A red rose viewed through a green coloured glass, will appear'],
  [90, 'MCQ', 'Plaster of Paris is used for'],
  [91, 'DRAWING_PROMPT', 'Drawing question 1 (not included in this PDF booklet — Drawing Sheet is separate). Part III consists of 2 questions carrying 70 marks total.'],
  [92, 'DRAWING_PROMPT', 'Drawing question 2 (not included in this PDF booklet — Drawing Sheet is separate). Part III consists of 2 questions carrying 70 marks total.'],
];

function toInput(rows: Array<[number, string, string]>): QBSectionInferenceInput[] {
  return rows.map(([n, format, text]) => ({
    id: `q${n}`,
    question_number: n,
    question_format: format as QBSectionInferenceInput['question_format'],
    question_text: text,
  }));
}

function sectionOf(results: ReturnType<typeof inferPaperSections>, n: number) {
  return results.find((r) => r.id === `q${n}`)?.section ?? null;
}

describe('inferPaperSections', () => {
  it('splits the real 2006 B.Arch paper at Q40/Q41, not at the hardcoded 2019 boundaries', () => {
    const results = inferPaperSections(toInput(PAPER_2006));

    for (let n = 1; n <= 40; n++) {
      expect(sectionOf(results, n), `Q${n} should be maths`).toBe('math_mcq');
    }
    for (let n = 41; n <= 90; n++) {
      expect(sectionOf(results, n), `Q${n} should be aptitude`).toBe('aptitude');
    }
    expect(sectionOf(results, 91)).toBe('drawing');
    expect(sectionOf(results, 92)).toBe('drawing');
  });

  it('never puts a four-option MCQ in drawing (the bug that mislabelled Q80-Q90)', () => {
    const results = inferPaperSections(toInput(PAPER_2006));
    const mcqNumbers = PAPER_2006.filter(([, f]) => f === 'MCQ').map(([n]) => n);
    for (const n of mcqNumbers) {
      expect(sectionOf(results, n), `Q${n} is an MCQ`).not.toBe('drawing');
      expect(sectionOf(results, n), `Q${n} is an MCQ`).not.toBe('math_numerical');
    }
  });

  it('lets format beat position: a drawing prompt in the middle is still drawing', () => {
    const rows = toInput(PAPER_2006);
    rows[10] = { ...rows[10], question_format: 'DRAWING_PROMPT' };
    const results = inferPaperSections(rows);
    expect(sectionOf(results, 11)).toBe('drawing');
    // and it does not drag the maths/aptitude boundary with it
    expect(sectionOf(results, 40)).toBe('math_mcq');
    expect(sectionOf(results, 41)).toBe('aptitude');
  });

  it('sends NUMERICAL questions to the numerical section wherever they sit', () => {
    const rows = toInput(PAPER_2006);
    rows[20] = { ...rows[20], question_format: 'NUMERICAL' };
    const results = inferPaperSections(rows);
    expect(sectionOf(results, 21)).toBe('math_numerical');
  });

  it('leaves everything unsectioned rather than guessing when the text says nothing', () => {
    const blank = Array.from({ length: 30 }, (_, i) => ({
      id: `q${i + 1}`,
      question_number: i + 1,
      question_format: 'MCQ' as const,
      question_text: 'Which of the following is correct?',
    }));
    const results = inferPaperSections(blank);
    expect(results.every((r) => r.section === null)).toBe(true);
  });

  it('reads option text too, so a bare stem still classifies', () => {
    const rows: QBSectionInferenceInput[] = [
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `m${i}`,
        question_number: i + 1,
        question_format: 'MCQ' as const,
        question_text: 'Evaluate the following.',
        options: [{ text: 'The integral diverges' }, { text: 'The derivative is zero' }],
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `a${i}`,
        question_number: i + 7,
        question_format: 'MCQ' as const,
        question_text: 'Choose one.',
        options: [{ text: 'Red colour' }, { text: 'A brick building' }],
      })),
    ];
    const results = inferPaperSections(rows);
    expect(results.slice(0, 6).every((r) => r.section === 'math_mcq')).toBe(true);
    expect(results.slice(6).every((r) => r.section === 'aptitude')).toBe(true);
  });
});
