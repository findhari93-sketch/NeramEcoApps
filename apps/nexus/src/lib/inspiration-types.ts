/**
 * Labels for the drawing type tree (nexus_qb_tags under "drawing"), so chips on
 * a deep-linked page render before any facet counts arrive. Facets from the
 * server carry the registry label and win when present.
 */
export const INSPIRATION_TYPE_LABELS: Record<string, string> = {
  '2d_composition': '2D Composition',
  '3d_composition': '3D Composition',
  kit_sculpture: 'Kit Sculpture',
  memory_drawing: 'Memory Drawing',
  building_exterior: 'Building Exterior',
  colour_composition: 'Colour Composition',
  free_form_sculpture: 'Free-form Sculpture',
  given_kit_assembly: 'Given Kit Assembly',
  interior_view: 'Interior View',
  logo_design: 'Logo Design',
  pattern_motif: 'Pattern and Motif',
  perspective_drawing: 'Perspective Drawing',
  portrait_figure: 'Portrait and Figure',
  poster_design: 'Poster Design',
  product_object: 'Product and Object',
  shape_composition: 'Shape Composition',
  still_life: 'Still Life',
  street_view: 'Street View',
  typography_composition: 'Typography Composition',
};

/** The four top-level families. A leaf type is the more specific, better title. */
export const INSPIRATION_FAMILIES = new Set(['2d_composition', '3d_composition', 'kit_sculpture', 'memory_drawing']);

export const EXAM_LABELS: Record<string, string> = { NATA: 'NATA', JEE_PAPER_2: 'JEE Paper 2' };

export const BY_LABELS: Record<string, string> = {
  reference: 'Reference',
  current: 'Current students',
  alumni: 'Alumni',
};

export function typeLabel(slug: string): string {
  return INSPIRATION_TYPE_LABELS[slug] ?? slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
