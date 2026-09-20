import type { InspirationCuration, InspirationRow, InspirationSourceKind } from '@neram/database/queries/nexus';
import { examYearOf } from '@/lib/student-stage';
import { formatInspirationCredit } from '@/lib/inspiration-credit';
import { HIDDEN_REASON_LABEL, hiddenReason } from '@/lib/inspiration-rules';
import { INSPIRATION_FAMILIES, typeLabel } from '@/lib/inspiration-types';

/** Teacher-only fields. presentRow adds this block for staff and never for students. */
export interface InspirationCardStaff {
  submissionId: string | null;
  curation: InspirationCuration;
  visible: boolean;
  hiddenReason: string | null;
  titleOverride: string | null;
  authorId: string | null;
}

/** The one shape every Inspiration screen renders. */
export interface InspirationCard {
  id: string;
  kind: InspirationSourceKind;
  imageUrl: string;
  thumbnailUrl: string | null;
  aspect: number | null;
  title: string;
  alt: string;
  brief: string | null;
  credit: string;
  /**
   * The one thing worth saying on top of the image. 'featured' outranks
   * 'alumni' because a teacher chose it and the credit line underneath already
   * says Alumni, so nothing is lost by giving the slot to the rarer fact.
   */
  badge: 'reference' | 'featured' | 'alumni' | null;
  typeSlugs: string[];
  tagLabels: string[];
  examTypes: string[];
  years: number[];
  featured: boolean;
  saved: boolean;
  saveCount: number;
  createdAt: string;
  staff?: InspirationCardStaff;
}

export function displayTitle(row: Pick<InspirationRow, 'title_override' | 'type_slugs' | 'category'>): string {
  const override = row.title_override?.trim();
  if (override) return override;
  const slugs = row.type_slugs ?? [];
  const leaf = slugs.find((s) => !INSPIRATION_FAMILIES.has(s));
  if (leaf) return typeLabel(leaf);
  const family = slugs.find((s) => INSPIRATION_FAMILIES.has(s)) ?? row.category;
  return family ? typeLabel(family) : 'Drawing';
}

export function presentRow(row: InspirationRow, opts: { staff: boolean }): InspirationCard {
  const title = displayTitle(row);
  const isOriginal = row.source_kind === 'submission_original';
  const badge: InspirationCard['badge'] = !isOriginal
    ? 'reference'
    : row.is_featured
      ? 'featured'
      : row.author_is_alumni
        ? 'alumni'
        : null;

  const card: InspirationCard = {
    id: row.id,
    kind: row.source_kind,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    aspect: row.image_aspect == null ? null : Number(row.image_aspect),
    title,
    alt: `${isOriginal ? 'Student drawing' : 'Reference drawing'}: ${title}`,
    brief: row.brief,
    credit: formatInspirationCredit({
      kind: row.source_kind,
      firstName: row.author_first_name,
      lastName: row.author_last_name,
      fullName: row.author_name,
      isAlumni: row.author_is_alumni,
      examYear: examYearOf(row.author_academic_year),
      optedOut: row.author_opted_out,
    }),
    badge,
    typeSlugs: row.type_slugs ?? [],
    tagLabels: row.tag_labels ?? [],
    examTypes: row.exam_types ?? [],
    years: (row.paper_years ?? []).map(Number),
    featured: row.is_featured,
    saved: row.is_saved,
    saveCount: Number(row.save_count ?? 0),
    createdAt: row.source_created_at,
  };

  if (opts.staff) {
    const reason = hiddenReason({
      kind: row.source_kind,
      curation: row.curation,
      visible: row.is_visible,
      scorePct: row.score_pct,
      authorOptedOut: row.author_opted_out,
    });
    card.staff = {
      submissionId: row.source_submission_id,
      curation: row.curation,
      visible: row.is_visible,
      hiddenReason: reason ? HIDDEN_REASON_LABEL[reason] : null,
      titleOverride: row.title_override,
      authorId: row.author_id,
    };
  }
  return card;
}
