import {
  admissionLabel,
  cutoffLabel,
  feeLabel,
  hasCutoff,
  packageLabel,
  seatsLabel,
} from '@/lib/college-hub/format';
import type { ListingCollege } from '@/lib/college-hub/listing-filter';

export interface CardStat {
  key: string;
  label: string;
  value: string;
  /** True when the value explains a gap ("Not published") rather than a number. */
  muted?: boolean;
}

const MISSING = new Set(['Not published', 'Via JoSAA', 'JEE only', 'Check with college']);

/**
 * The stat row of a directory card. Fee and seats always show (with a reason
 * when missing); the cutoff slot falls back to how admission happens; the
 * package shows only when known, so sparse colleges never show a row of blanks.
 */
export function cardStats(c: ListingCollege, length: 'full' | 'short' = 'full'): CardStat[] {
  const out: CardStat[] = [];
  const fee = feeLabel(c, length);
  out.push({ key: 'fee', label: 'Annual fee', value: fee, muted: MISSING.has(fee) });
  const seats = seatsLabel(c);
  out.push({ key: 'seats', label: 'Seats', value: seats, muted: MISSING.has(seats) });
  if (hasCutoff(c)) {
    const year = c.cutoff_year?.match(/\d{4}/)?.[0];
    out.push({ key: 'cutoff', label: year ? `Cutoff ${year}` : 'Cutoff', value: cutoffLabel({ ...c, cutoff_year: null }, 'full') ?? '' });
  } else {
    const via = admissionLabel(c);
    out.push({ key: 'admission', label: 'Admission via', value: via, muted: MISSING.has(via) });
  }
  const pkg = packageLabel(c);
  if (pkg) out.push({ key: 'package', label: 'Avg package', value: pkg });
  return out;
}

/** Paid listing tiers are labelled "Featured · paid listing". */
export function isPaidListing(c: Pick<ListingCollege, 'neram_tier'>): boolean {
  return c.neram_tier === 'silver' || c.neram_tier === 'gold' || c.neram_tier === 'platinum';
}
