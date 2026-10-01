/**
 * Links from location pages to the matching free tool pages on
 * app.neramclasses.com. The app owns tool searches ("NATA exam centre near
 * Hosur"); these pages own coaching searches, so each links across instead of
 * repeating the other. Only link pages that always exist on the app:
 * exam-centre and cost pages exist for every state; college pages need at
 * least one college in the state.
 */
import { APP_URL } from './constants';

const base = `${APP_URL}/tools`;

export const appToolLinks = {
  examCentresCity: (stateSlug: string, citySlug: string) => `${base}/nata/exam-centers/${stateSlug}/${citySlug}`,
  examCentresState: (stateSlug: string) => `${base}/nata/exam-centers/${stateSlug}`,
  costState: (stateSlug: string) => `${base}/nata/cost-calculator/${stateSlug}`,
  predictorState: (stateSlug: string) => `${base}/counseling/college-predictor/${stateSlug}`,
  coaState: (stateSlug: string) => `${base}/counseling/coa-checker/${stateSlug}`,
  cutoffCalculator: () => `${base}/nata/cutoff-calculator`,
};

/** The "Free tools" links for a state, in the shape LinkGrid takes. */
export function stateToolLinks(stateSlug: string, stateName: string, hasColleges: boolean) {
  return [
    { label: `NATA exam centres in ${stateName}`, href: appToolLinks.examCentresState(stateSlug), hint: 'Free tool: nearest test city' },
    ...(hasColleges
      ? [
          { label: `B.Arch college predictor, ${stateName}`, href: appToolLinks.predictorState(stateSlug), hint: 'Free tool: colleges for your score' },
          { label: `COA approved colleges in ${stateName}`, href: appToolLinks.coaState(stateSlug), hint: 'Free tool: check approval' },
        ]
      : []),
    { label: 'NATA cutoff calculator', href: appToolLinks.cutoffCalculator(), hint: 'Free tool: your score out of 400' },
  ];
}
