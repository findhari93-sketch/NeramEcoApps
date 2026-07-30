/**
 * Which image stands for a class, and which copy of it to load.
 *
 * A finished class can carry several images (nexus_class_images). One of them is
 * the cover: the picture shown in front of the class everywhere it is listed, so
 * a week of history can be scanned by eye. The teacher picks it by starring an
 * image, which writes nexus_scheduled_classes.cover_image_id.
 *
 * Nothing forces a teacher to star anything, so an unstarred class still needs a
 * cover. The rule is "the starred one, else the first one", which means the
 * ordering here has to agree EXACTLY with the order the wrap-up editor lists
 * them in (see listImages in api/timetable/[classId]/images/route.ts). If the two
 * disagree, the timetable shows a different picture from the first thumb in the
 * editor and the star looks broken.
 */

/**
 * The gallery embed for any select on nexus_scheduled_classes.
 *
 * The constraint name is NOT optional decoration. There are two foreign keys
 * between these tables now: nexus_class_images.scheduled_class_id points at the
 * class (one-to-many, what we want here) and nexus_scheduled_classes.cover_image_id
 * points back at one image (many-to-one). Without the name, PostgREST cannot tell
 * which to follow and fails the WHOLE query with PGRST201, which would blank the
 * timetable rather than just drop the pictures.
 *
 * One constant so all four call sites cannot drift apart. Never add .order() to
 * an embed: that needs the alias in the param and a mistake 400s the query too.
 * sortClassImages does the ordering.
 */
export const CLASS_IMAGES_EMBED =
  'class_images:nexus_class_images!nexus_class_images_scheduled_class_id_fkey(id, url, thumb_url, caption, sort_order, created_at)';

export interface ClassImageRef {
  id: string;
  url: string;
  /** Small copy for tiles. Null on rows uploaded before thumbnails existed. */
  thumb_url?: string | null;
  caption?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
}

/**
 * sort_order, then created_at, then id.
 *
 * The created_at tiebreak is load bearing, not decoration: sort_order defaults
 * to 0 in the schema, so every row not written by the upload path (a Teams-chat
 * import, a hand-inserted row) lands at 0 and would otherwise order by whatever
 * PostgREST felt like returning.
 */
export function sortClassImages<T extends ClassImageRef>(images: T[]): T[] {
  return [...images].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;

    const createdDiff = (a.created_at || '').localeCompare(b.created_at || '');
    if (createdDiff !== 0) return createdDiff;

    return a.id.localeCompare(b.id);
  });
}

/**
 * The class cover: the starred image, else the first, else nothing.
 *
 * A starred id that is not in the array means the teacher deleted that image.
 * The database clears the pointer itself (ON DELETE SET NULL), but a payload
 * fetched before the delete can still carry the stale id, so fall back rather
 * than render an empty tile.
 */
export function resolveClassCover<T extends ClassImageRef>(
  images: T[] | null | undefined,
  coverImageId?: string | null,
): T | null {
  if (!images || images.length === 0) return null;

  if (coverImageId) {
    const starred = images.find((img) => img.id === coverImageId);
    if (starred) return starred;
  }

  return sortClassImages(images)[0];
}

/**
 * What a tile should load. The small copy when one exists, the original
 * otherwise.
 *
 * The full-size url is always what the lightbox shows, so a teacher's detail is
 * never lost, only the 48px tile settles for less.
 */
export function coverThumbSrc(img: ClassImageRef): string {
  return img.thumb_url || img.url;
}
