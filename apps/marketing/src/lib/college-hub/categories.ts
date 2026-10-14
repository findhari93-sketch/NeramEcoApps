/**
 * Category pages of the college hub (canvas: Desktop · Category page): the
 * "Also browse" chips shared by every category, minus the page itself.
 */
export const CATEGORY_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'COA approved', href: '/colleges/accreditation/coa-approved' },
  { label: 'Government colleges', href: '/colleges/type/government' },
  { label: 'NIRF Architecture', href: '/colleges/rankings/nirf' },
  { label: 'Fee under ₹3L', href: '/colleges/fees/below-3-lakhs' },
  { label: 'TNEA counselling', href: '/colleges/tnea' },
  { label: 'JoSAA counselling', href: '/colleges/josaa' },
  { label: 'Private colleges', href: '/colleges/type/private' },
  { label: 'NAAC A+ and above', href: '/colleges/accreditation/naac-a-plus' },
];

/** Up to `max` related categories, never the current page; `first` links lead. */
export function relatedCategories(currentHref: string, first: Array<{ label: string; href: string }> = [], max = 5) {
  const seen = new Set<string>([currentHref]);
  const out: Array<{ label: string; href: string }> = [];
  for (const l of [...first, ...CATEGORY_LINKS]) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    out.push(l);
    if (out.length >= max) break;
  }
  return out;
}

/** Where "Change" in the locked category box goes: the category lists on /colleges. */
export const CATEGORY_INDEX_HREF = '/colleges#explore';
