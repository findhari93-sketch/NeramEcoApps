import { redirect } from 'next/navigation';

/**
 * The old paste-the-AI-reply wizard.
 *
 * It is now the Upload JSON branch of the one test wizard, which reaches the
 * same review step as AI generation, the question bank and a previous-year
 * paper. Keeping this as a redirect rather than deleting it outright because
 * teachers bookmarked it and Teams messages link to it; delete the stub a
 * release after this one ships.
 */
export default function ImportTestRedirect() {
  redirect('/teacher/tests/new?src=json');
}
