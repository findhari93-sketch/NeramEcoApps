import { redirect } from 'next/navigation';

/**
 * "Custom sets" was never its own object. It read the theme group of the tag
 * registry and rendered it as cards, so the same tags appeared on two pages
 * under two names and neither explained the other. Tags is the surviving
 * surface: it shows every group, carries the same counts, and now opens a tag
 * as a question list, which was the only thing this page could do that it
 * could not.
 *
 * Kept as a redirect rather than deleted because the hub linked here for
 * months and the URL is bookmarked.
 */
export default function CustomSetsRedirect() {
  redirect('/teacher/question-bank/tags');
}
