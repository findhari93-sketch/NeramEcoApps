import { describe, it, expect } from 'vitest';
import { classifyCoordinateGeometry, conicFromEquationShape } from './qb-subtopic-rules';

/**
 * Every string below is a verbatim question from the production bank
 * (nexus_qb_questions, is_active + status='active'), so this suite doubles as a
 * regression record of the 20 conic_sections questions the reclassification run
 * has to split.
 */

const add = (t: string) => classifyCoordinateGeometry(t).add.sort();

describe('classifyCoordinateGeometry: named conics', () => {
  it('tags a parabola by name', () => {
    expect(
      add('An equilateral triangle is inscribed in the parabola $y^2 = 8x$ with one of its vertices at the vertex of the parabola. Then the length of its side is'),
    ).toEqual(['parabola']);
  });

  it('tags a hyperbola by name', () => {
    expect(
      add('If PQ is a double ordinate of the hyperbola $\\frac{x^2}{a^2} - \\frac{y^2}{b^2} = 1$, such that OPQ is an equilateral triangle, O being the centre of the hyperbola, then the eccentricity e of the hyperbola is'),
    ).toEqual(['hyperbola']);
  });

  it('tags an ellipse by name', () => {
    expect(
      add('In an ellipse, the distance between its directrices is four times the distance between its foci. If $(-2, 0)$ is one of its vertices, then the equation of the ellipse is'),
    ).toEqual(['ellipse']);
  });

  it('tags both conics when a question compares them', () => {
    expect(
      add('If the foci of the ellipse $\\frac{x^2}{16} + \\frac{y^2}{b^2} = 1$ and the hyperbola $\\frac{x^2}{144} - \\frac{y^2}{81} = \\frac{1}{25}$ coincide, then $b^2$ equals:'),
    ).toEqual(['ellipse', 'hyperbola']);
  });

  it('always drops conic_sections once a specific conic is identified', () => {
    const r = classifyCoordinateGeometry('The acute angle between the tangents drawn from the point $(1, 4)$ to the parabola $y^2 = 4x$ is:');
    expect(r.add).toContain('parabola');
    expect(r.remove).toEqual(['conic_sections']);
  });
});

describe('classifyCoordinateGeometry: equation shape, where no conic is named', () => {
  it('reads a hyperbola out of x^2 - 2y^2 = 18 and does not call x^2 + y^2 = 9 an ellipse', () => {
    // Real question. The second equation is a CIRCLE (equal coefficients);
    // a naive "plus means ellipse" rule mislabels this one.
    expect(add('A common tangent to $x^2 - 2y^2 = 18$ and $x^2 + y^2 = 9$ is:')).toEqual(['hyperbola']);
  });

  it('reads an ellipse out of 9x^2 + 4y^2 - 36 = 0 rather than trusting "latus rectum"', () => {
    // "latus rectum" is shared across all three conics, so it must not be a
    // signal on its own. Only the unequal coefficients identify this ellipse.
    expect(add('The latus rectum of the conic section $9x^2 + 4y^2 - 36 = 0$ is:')).toEqual(['ellipse']);
  });

  it('does not treat a plain circle equation as an ellipse', () => {
    expect(add('If a chord of a circle $x^2 + y^2 = 4$ with one extremity at $(1, \\sqrt{3})$ subtends a right angle at the centre of this circle, then the coordinates of the other extremity are')).toEqual([]);
  });

  it('does not treat a general circle equation as a conic', () => {
    expect(add('The circle $x^2 + y^2 - 6x - 10y + p = 0$ does not touch or intersect the axes and the point $(1, 4)$ lies inside the circle for all p in the interval')).toEqual([]);
  });
});

describe('conicFromEquationShape', () => {
  it('identifies the standard forms', () => {
    expect(conicFromEquationShape('$x^2 - y^2 = 4$')).toContain('hyperbola');
    expect(conicFromEquationShape('$4x^2 + y^2 = 16$')).toContain('ellipse');
    expect(conicFromEquationShape('$y^2 = 16x$')).toContain('parabola');
    expect(conicFromEquationShape('$x^2 = 4py$')).toContain('parabola');
  });

  it('does not call a circle an ellipse', () => {
    expect(conicFromEquationShape('$x^2 + y^2 = 7$')).toEqual([]);
  });

  it('does not call an equation with both squares a parabola', () => {
    expect(conicFromEquationShape('$x^2 + y^2 = 7$')).not.toContain('parabola');
  });
});

describe('classifyCoordinateGeometry: locus', () => {
  it('tags locus AND parabola on the multi-label case', () => {
    expect(add('The locus of the mid points of the chords of the parabola $x^2 = 4py$ having slope $m$ is a:')).toEqual([
      'locus',
      'parabola',
    ]);
  });

  it('tags locus on a straight-lines question', () => {
    expect(
      add('If a variable line, passing through the point of intersection of the lines $x + 2y - 1 = 0$ and $2x - y - 1 = 0$, meets the coordinate axes in A and B, then the locus of the mid-point of AB is'),
    ).toEqual(['locus']);
  });
});

describe('classifyCoordinateGeometry: areas of triangles', () => {
  it('tags a triangle area formed by lines', () => {
    expect(
      add('If $m_1$ and $m_2$ are the roots of the equation $x^2 + (\\sqrt{3} + 2)x + \\sqrt{3} - 1 = 0$, then the area of the triangle formed by the lines $y = m_1 x$, $y = -m_2 x$ and $y = 1$ is:'),
    ).toEqual(['areas_of_triangles']);
  });

  it('tags "the area of this triangle" phrasing with explicit coordinates', () => {
    expect(
      add('Two vertices of a triangle are $(1, 1)$ and $(3, 4)$, and the third vertex lies on the line $y = x + 1$. If the area of this triangle is 1, then the third vertex is'),
    ).toEqual(['areas_of_triangles']);
  });

  it('does NOT tag a complex-number triangle-area question', () => {
    // Real question, categorised complex_numbers. It says "vertices" and "area
    // of a triangle" but is not coordinate geometry.
    expect(add('Area of a triangle with vertices $z$, $iz$, $z + iz$, where $z$ is any complex number, is:')).toEqual([]);
  });

  it('does NOT tag a trigonometric triangle-area identity', () => {
    expect(add('If $\\Delta$ stands for the area of the triangle ABC, then $b^2 \\sin 2C + c^2 \\sin 2B$ is equal to')).toEqual([]);
  });

  it('does NOT fire on "area enclosed by the parabola"', () => {
    // The single most likely over-match: "area" plus a conic, but no triangle.
    expect(add('The area enclosed by the parabola $y = 3(1 - x^2)$ and the x-axis is')).toEqual(['parabola']);
  });

  it('does NOT fire on a circle question that mentions area and lines', () => {
    expect(
      add('If a circle of area $16\\pi$ has two of its diameters along the lines $2x - 3y + 5 = 0$ and $x + 3y - 11 = 0$, then the equation of the circle is'),
    ).toEqual([]);
  });
});

describe('classifyCoordinateGeometry: leaves unrelated questions alone', () => {
  it.each([
    'If the point $(2, k)$ lies outside the circles $x^2 + y^2 = 13$ and $x^2 + y^2 + x - 2y - 14 = 0$, then',
    'The maximum possible number of points of intersection of 8 straight lines and 4 circles is',
    'Statement 1: The line $2x + y + 6 = 0$ is perpendicular to the line $x - 2y + 5 = 0$ and the second line passes through $(1, 3)$.',
    'The y-axis and the lines $(a^5 - 2a^3)x + (a+2)y + 3a = 0$ and $(a^5 - 3a^2)x + 4y + a - 2 = 0$ are concurrent for',
  ])('proposes nothing for: %s', (text) => {
    const r = classifyCoordinateGeometry(text);
    expect(r.add).toEqual([]);
    expect(r.remove).toEqual([]);
  });

  it('handles empty and null input', () => {
    expect(classifyCoordinateGeometry('')).toEqual({ add: [], remove: [], hits: [] });
    expect(classifyCoordinateGeometry(null)).toEqual({ add: [], remove: [], hits: [] });
    expect(classifyCoordinateGeometry(undefined)).toEqual({ add: [], remove: [], hits: [] });
  });
});

describe('coverage against the live conic_sections set', () => {
  // All 20 active `conic_sections` questions in production, verbatim.
  const LIVE_CONICS: [string, string[]][] = [
    ['A common tangent to $x^2 - 2y^2 = 18$ and $x^2 + y^2 = 9$ is:', ['hyperbola']],
    ['An equilateral triangle is inscribed in the parabola $y^2 = 8x$ with one of its vertices at the vertex of the parabola. Then the length of its side is', ['parabola']],
    ['If PQ is a double ordinate of the hyperbola $\\frac{x^2}{a^2} - \\frac{y^2}{b^2} = 1$, such that OPQ is an equilateral triangle, O being the centre of the hyperbola, then the eccentricity e of the hyperbola is', ['hyperbola']],
    ['If the foci of the ellipse $\\frac{x^2}{16} + \\frac{y^2}{b^2} = 1$ and the hyperbola $\\frac{x^2}{144} - \\frac{y^2}{81} = \\frac{1}{25}$ coincide, then $b^2$ equals:', ['ellipse', 'hyperbola']],
    ['If the line $4\\sqrt{17} x - 3y = 48$ is a tangent to the hyperbola $16x^2 - 9y^2 = 144$ at the point $(x_0, y_0)$ on the hyperbola, then $x_0^2 + y_0^2 =$', ['hyperbola']],
    ['If the tangent and the normal to the hyperbola $x^2 - y^2 = 4$ at a point cut off intercepts $a_1$ and $a_2$ respectively on the x-axis', ['hyperbola']],
    ['In an ellipse, the distance between its directrices is four times the distance between its foci. If $(-2, 0)$ is one of its vertices, then the equation of the ellipse is', ['ellipse']],
    ['Let $P$ and $Q$ be the points of intersection of the line $y + x = 1$ and the parabola $y^2 = 4x$.', ['parabola']],
    ['Let $y^2 = 16x$ be a given parabola and L be an extremity of its latus rectum in the first quadrant.', ['parabola']],
    ['Let A be the area of square circumscribed by the ellipse $4x^2 + y^2 = 16$. Then $A =$', ['ellipse']],
    ['Let P be a point in the first quadrant lying on the ellipse $9x^2+16y^2=144$, such that the tangent at P to the ellipse is inclined at an angle $135°$', ['ellipse']],
    ['Statement 1: Point of intersection of the tangents drawn to the parabola $x^2 = 4y$ at $(4, 4)$ and $(-4, 4)$ lies on the y-axis.', ['parabola']],
    ['Statement-1: The point $\\left(\\frac{1}{4}, \\frac{1}{2}\\right)$ on the parabola $y^2 = x$ is closest to the line $y = x + 1$.', ['parabola']],
    ['The acute angle between the tangents drawn from the point $(1, 4)$ to the parabola $y^2 = 4x$ is:', ['parabola']],
    ['The area enclosed by the parabola $y = 3(1 - x^2)$ and the x-axis is', ['parabola']],
    ['The directrix of a parabola is $x + y = 2$ and the focus is $(\\sqrt{2} + 1, \\sqrt{2} + 1)$.', ['parabola']],
    ['The latus rectum of the conic section $9x^2 + 4y^2 - 36 = 0$ is:', ['ellipse']],
    ['The locus of the mid points of the chords of the parabola $x^2 = 4py$ having slope $m$ is a:', ['locus', 'parabola']],
    ['The maximum value of $|x + y|$, where $(x, y)$ lies on the ellipse $4x^2 + y^2 = 4$ is', ['ellipse']],
    ['The tangent to ellipse $3x^2 + 16y^2 = 12$, at the point $\\left(1, \\frac{3}{4}\\right)$, intersects the curve $y^2 + x = 0$ at:', ['ellipse']],
  ];

  it.each(LIVE_CONICS)('classifies %#', (text, expected) => {
    expect(add(text)).toEqual([...expected].sort());
  });

  it('resolves every live conic question, leaving nothing for the AI pass', () => {
    const unresolved = LIVE_CONICS.filter(([text]) => classifyCoordinateGeometry(text).remove.length === 0);
    expect(unresolved).toEqual([]);
  });
});
