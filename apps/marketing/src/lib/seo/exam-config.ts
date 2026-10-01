/**
 * The exams that have location pages, and everything that differs between them:
 * URLs, the national target page, and which colleges count as local facts.
 * AAT and PGETA have no location pages (their candidate pools are too small for
 * per-city pages to be anything but doorways); they appear as blocks on state pages.
 */

export type ExamKey = 'nata' | 'jee-paper-2';

export interface CollegeExamFields {
  accepted_exams: string[] | null;
  counseling_systems: string[] | null;
}

export interface ExamConfig {
  key: ExamKey;
  /** Short name used in headings, e.g. "NATA". */
  name: string;
  /** Name used once in an intro sentence. */
  longName: string;
  /** The one national page that owns "{exam} coaching" searches. */
  nationalPath: string;
  /** All-India list of states and cities. */
  directoryPath: string;
  cityPath: (citySlug: string) => string;
  statePath: (stateSlug: string) => string;
  /** Whether a college admits through this exam. */
  collegeAccepts: (c: CollegeExamFields) => boolean;
  /** NATA test cities are a local fact only for NATA pages. */
  usesNataTestCities: boolean;
}

const has = (list: string[] | null | undefined, values: string[]) =>
  (list ?? []).some((v) => values.includes(v));

export const NATA_CITY_PREFIX = 'nata-coaching-centers-in-';
export const JEE_CITY_PREFIX = 'jee-paper-2-coaching-in-';

export const EXAMS: Record<ExamKey, ExamConfig> = {
  nata: {
    key: 'nata',
    name: 'NATA',
    longName: 'NATA (National Aptitude Test in Architecture)',
    nationalPath: '/nata-online-coaching',
    directoryPath: '/coaching/nata-coaching',
    cityPath: (slug) => `/coaching/nata-coaching/${NATA_CITY_PREFIX}${slug}`,
    statePath: (state) => `/coaching/nata-coaching-in-${state}`,
    // Almost every B.Arch seat outside the IITs/NITs admits on NATA; colleges
    // with no exam data are listed rather than hidden.
    collegeAccepts: (c) => !c.accepted_exams?.length || has(c.accepted_exams, ['NATA', 'TANATA', 'KEAM', 'KCET', 'TNEA', 'MHT-CET', 'GUJCET']),
    usesNataTestCities: true,
  },
  'jee-paper-2': {
    key: 'jee-paper-2',
    name: 'JEE Paper 2',
    longName: 'JEE Main Paper 2 (B.Arch)',
    nationalPath: '/jee-paper-2-preparation',
    directoryPath: '/coaching/nata-coaching',
    cityPath: (slug) => `/coaching/jee-paper-2-coaching/${JEE_CITY_PREFIX}${slug}`,
    statePath: (state) => `/coaching/jee-paper-2-coaching-in-${state}`,
    collegeAccepts: (c) =>
      has(c.accepted_exams, ['JEE_PAPER_2', 'JEE Main Paper 2', 'JEE Main']) || has(c.counseling_systems, ['JoSAA']),
    usesNataTestCities: false,
  },
};

/** Colleges that take AAT (IIT B.Arch) students. */
export const acceptsAat = (c: CollegeExamFields) => has(c.accepted_exams, ['AAT', 'JEE Advanced']);
