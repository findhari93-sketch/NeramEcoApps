/**
 * Search copy for every public tool page: title, description, the direct
 * answer at the top of the page, how it works, FAQ and what signing in adds.
 *
 * Server-safe (no icons, no 'use client'), so pages, sitemaps and llms.txt can
 * all read it. The tool UI catalog stays in navigation-data.tsx; a unit test
 * keeps ids and paths in step.
 *
 * Writing rules: no em dashes or double hyphens; every claim must match what
 * the tool actually computes; years come from nataCycleYear(), never typed.
 */
import { nataCycleYear } from './cycle';
import type { ToolId } from './tool-ids';

export interface ToolFaq {
  q: string;
  a: string;
}

export interface ToolStep {
  title: string;
  text: string;
}

/** Kinds of place page a tool has (see lib/seo/tool-geo-*.ts). */
export type ToolGeoKind = 'state' | 'city' | 'system';

export interface ToolSeo {
  id: ToolId;
  path: string;
  /** Short name used in breadcrumbs, related links and llms.txt. */
  name: string;
  track: 'nata' | 'counseling';
  h1: string;
  /** Full <title>, 60 characters or fewer. */
  title: string;
  /** Meta description, 155 characters or fewer. */
  description: string;
  /** One or two sentences that answer the search on their own. */
  answer: string;
  steps: ToolStep[];
  faqs: ToolFaq[];
  /** What the free demo does and what signing in adds (gate card + guide). */
  free: string[];
  gated: string[];
  /** Where the numbers come from, shown under the answer. */
  source: string;
  related: ToolId[];
  keywords: string[];
  geo?: ToolGeoKind[];
}

function build(y: number): Record<ToolId, ToolSeo> {
  return {
    'nata-cutoff-calculator': {
      id: 'nata-cutoff-calculator',
      path: '/tools/nata/cutoff-calculator',
      name: 'NATA Cutoff Calculator',
      track: 'nata',
      h1: `NATA Cutoff Calculator ${y}`,
      title: `NATA Cutoff Calculator ${y}: Your Score out of 400`,
      description: `Free NATA cutoff calculator. Turn your 12th marks and NATA score into the B.Arch cutoff out of 400 used in counselling, with the 45% eligibility check.`,
      answer: `Your B.Arch cutoff is your 12th board marks scaled to 200 plus your best valid NATA score out of 200, a total out of 400. You also need at least 45% in 12th to be eligible for B.Arch.`,
      steps: [
        { title: 'Enter your 12th marks', text: 'Pick your board and type the marks you scored out of the maximum. The calculator scales them to 200.' },
        { title: 'Add your NATA score', text: 'Enter Part A and Part B, or your total out of 200. With more than one attempt, the best valid score counts.' },
        { title: 'Read your cutoff', text: 'Board out of 200 plus NATA out of 200 gives your cutoff out of 400, the number counselling ranks you on.' },
      ],
      faqs: [
        { q: 'How is the NATA cutoff out of 400 calculated?', a: 'Your 12th marks are converted to a score out of 200 (marks scored divided by maximum marks, times 200). Your best valid NATA score out of 200 is added to it. For example, 450 out of 500 in CBSE is 180, and a NATA score of 120 gives a cutoff of 300 out of 400.' },
        { q: 'What is the minimum 12th percentage for B.Arch?', a: 'The Council of Architecture asks for at least 45% aggregate in 12th with Physics and Mathematics (or a 10+3 diploma with Mathematics). Some state counselling rules ask for 50% for some categories, so check your state as well.' },
        { q: 'Which NATA score counts if I write more than one attempt?', a: 'The best valid score counts. Taking an attempt in the new NATA year can cancel last year\'s score, and the full calculator applies those rules for you.' },
        { q: 'Is a cutoff of 300 out of 400 good?', a: 'It depends on the state, the college and your category. Use the college predictor to compare your cutoff with last year\'s closing marks at each college.' },
      ],
      free: ['Your cutoff out of 400 from board marks and one NATA score', 'The 45% B.Arch eligibility check'],
      gated: ['Best of several attempts and last year\'s score', 'Part A and Part B breakdown', 'Your saved results across devices', 'Colleges that match your cutoff'],
      source: 'Formula used by state B.Arch counselling such as TNEA; eligibility rule from the Council of Architecture.',
      related: ['counseling-college-predictor', 'nata-eligibility-checker', 'counseling-rank-predictor'],
      keywords: ['nata cutoff calculator', 'nata score calculator', 'b.arch cutoff out of 400', 'nata cutoff marks', 'board marks conversion nata'],
    },

    'nata-exam-centers': {
      id: 'nata-exam-centers',
      path: '/tools/nata/exam-centers',
      name: 'NATA Exam Centres',
      track: 'nata',
      h1: `NATA Exam Centres ${y}: Find the Nearest Test City`,
      title: `NATA Exam Centres ${y}: Nearest Test City Finder`,
      description: `Find the NATA test cities nearest to you, state by state, with distance in km and the likely venues. Free NATA exam centre finder by Neram Classes.`,
      answer: `NATA is a computer-based test held in test cities across India and a few abroad. Pick your state or city below to see the nearest test cities and how far they are.`,
      steps: [
        { title: 'Choose your state', text: 'Every test city in that state is listed with its likely venues.' },
        { title: 'Pick your city', text: 'See the three nearest test cities and the distance from your city in km.' },
        { title: 'Plan your trip', text: 'Use the cost calculator to add up the fee, travel and stay for the city you choose.' },
      ],
      faqs: [
        { q: 'Can I choose my NATA exam centre?', a: 'You choose test cities in order of preference in the NATA application. The exact venue is printed on your admit card.' },
        { q: 'Are the venues on this page confirmed?', a: 'Test cities come from the NATA brochure. Venue names are our best estimate from past years and are marked as probable until admit cards are out.' },
        { q: 'Which test city should I pick?', a: 'Usually the nearest one you can reach the evening before. Distances here are straight-line km, so check the road or train time too.' },
        { q: 'Is NATA held outside India?', a: 'Yes, NATA has had test cities in the Gulf. The fee for a centre outside India is higher.' },
      ],
      free: ['Test cities in any state', 'The three nearest test cities to a city, with km'],
      gated: ['Nearest centres from your exact location', 'Venue details and alternates', 'Directions and a saved preference'],
      source: 'Test cities from the NATA brochure; distances are straight-line km. Place data: GeoNames (CC BY 4.0).',
      related: ['nata-cost-calculator', 'nata-exam-planner', 'nata-cutoff-calculator'],
      keywords: ['nata exam centre', 'nata test city', 'nata exam centre near me', 'nata centre list'],
      geo: ['state', 'city'],
    },

    'nata-eligibility-checker': {
      id: 'nata-eligibility-checker',
      path: '/tools/nata/eligibility-checker',
      name: 'NATA Eligibility Checker',
      track: 'nata',
      h1: `NATA and B.Arch Eligibility Checker ${y}`,
      title: `NATA Eligibility Checker ${y}: Can You Apply for B.Arch?`,
      description: `Check in seconds if your 12th or diploma subjects and marks meet the NATA and B.Arch rules: Physics, Mathematics and 45% aggregate.`,
      answer: `For B.Arch you need 12th with Physics and Mathematics plus one more listed subject and at least 45% aggregate, or a 10+3 diploma with Mathematics and 45%. You can write NATA while still in 12th.`,
      steps: [
        { title: 'Tell us your qualification', text: '12th appearing or passed, or a 10+3 diploma.' },
        { title: 'Tick your subjects', text: 'Physics, Mathematics and your other subjects.' },
        { title: 'See the rule by rule result', text: 'Each condition shows met or not met, with the reason.' },
      ],
      faqs: [
        { q: 'Can I write NATA without Maths?', a: 'You can sit NATA, but B.Arch admission needs Mathematics in 12th (or in your diploma), so without it you cannot join B.Arch.' },
        { q: 'Is biology accepted as the third subject?', a: 'Yes. Along with Physics and Mathematics, the third subject can be Chemistry, Biology, a technical vocational subject, Computer Science, IT, Informatics Practices, Engineering Graphics or Business Studies.' },
        { q: 'Can 12th appearing students write NATA?', a: 'Yes. You can write NATA while in 12th; the 45% rule applies when you join B.Arch.' },
        { q: 'Can diploma holders join B.Arch?', a: 'Yes, a 10+3 diploma with Mathematics and at least 45% aggregate meets the rule.' },
      ],
      free: ['Eligible or not for NATA and B.Arch, with the reason'],
      gated: ['Your state counselling rule (45% or 50%)', 'A saved eligibility report', 'Document checklist for counselling'],
      source: 'Council of Architecture B.Arch admission rules.',
      related: ['nata-cutoff-calculator', 'nata-exam-planner', 'counseling-coa-checker'],
      keywords: ['nata eligibility', 'b.arch eligibility', 'nata eligibility criteria', 'can i write nata without maths'],
    },

    'nata-cost-calculator': {
      id: 'nata-cost-calculator',
      path: '/tools/nata/cost-calculator',
      name: 'NATA Cost Calculator',
      track: 'nata',
      h1: 'NATA Exam Cost Calculator: Fees, Travel and Stay',
      title: 'NATA Cost Calculator: Exam Fee, Travel and Stay',
      description: 'Add up the NATA application fee for your category and attempts, plus travel and stay for your test city. Free NATA cost calculator.',
      answer: 'The NATA 2026 fee was Rs 1,750 per attempt for General and OBC (NCL), Rs 1,250 for SC, ST, EWS and PwD, Rs 1,000 for transgender candidates and Rs 15,000 for a centre outside India. Travel and stay depend on how far your test city is.',
      steps: [
        { title: 'Pick your category', text: 'The fee per attempt depends on it.' },
        { title: 'Choose attempts and your state', text: 'We find the nearest test cities and their distance.' },
        { title: 'See the total', text: 'Fees plus travel and stay, so you can plan before you apply.' },
      ],
      faqs: [
        { q: 'What is the NATA application fee?', a: 'For NATA 2026 it was Rs 1,750 per attempt (General, OBC NCL), Rs 1,250 (SC, ST, EWS, PwD), Rs 1,000 (transgender) and Rs 15,000 for centres outside India. Check the new brochure when it is released.' },
        { q: 'Is the fee per attempt?', a: 'Yes, you pay for each attempt you register for.' },
        { q: 'How much should I budget for travel?', a: 'If your nearest test city is in your own city, very little. If it is a few hundred km away, plan for a return ticket and one night\'s stay.' },
      ],
      free: ['Fee for your category', 'Nearest test cities for your state with km'],
      gated: ['Full travel, stay and materials plan', 'Several attempts and saved budget'],
      source: 'Fees from the NATA 2026 brochure. Distances are straight-line km.',
      related: ['nata-exam-centers', 'nata-exam-planner', 'nata-eligibility-checker'],
      keywords: ['nata fee', 'nata application fee', 'nata exam cost', 'nata fees for sc st'],
      geo: ['state'],
    },

    'nata-image-crop': {
      id: 'nata-image-crop',
      path: '/tools/nata/image-crop',
      name: 'NATA Photo and Signature Resizer',
      track: 'nata',
      h1: 'NATA Photo and Signature Resizer',
      title: 'NATA Photo and Signature Resizer: Exact Size and KB',
      description: 'Crop and resize your photo (3.5 x 4.5 cm, 4 to 100 KB) and signature (3.5 x 1.5 cm, 1 to 30 KB) for the NATA form. Free, nothing is uploaded.',
      answer: 'The NATA form takes a photo in 3.5 x 4.5 cm (7:9) between 4 and 100 KB and a signature in 3.5 x 1.5 cm (7:3) between 1 and 30 KB, as JPG. This tool crops and compresses both in your browser.',
      steps: [
        { title: 'Choose photo or signature', text: 'The crop box locks to the right shape.' },
        { title: 'Drag and zoom', text: 'Fit your face or signature in the frame.' },
        { title: 'Check the size', text: 'The tool shows the KB and warns if it is outside the limit.' },
      ],
      faqs: [
        { q: 'What size photo does NATA accept?', a: 'A recent passport-size photo, 3.5 x 4.5 cm, as JPG between 4 KB and 100 KB, on a light background with your face covering most of the frame.' },
        { q: 'What size signature does NATA accept?', a: '3.5 x 1.5 cm, as JPG between 1 KB and 30 KB, signed in black or dark blue ink on white paper.' },
        { q: 'Is my photo uploaded anywhere?', a: 'No. Cropping and compressing happen in your browser.' },
      ],
      free: ['Crop and preview your photo and signature'],
      gated: ['Download the final JPG at the right size'],
      source: 'Photo and signature specifications from the NATA application instructions.',
      related: ['nata-eligibility-checker', 'nata-exam-planner', 'nata-cost-calculator'],
      keywords: ['nata photo size', 'nata signature size', 'nata photo resize', 'nata image crop'],
    },

    'nata-exam-planner': {
      id: 'nata-exam-planner',
      path: '/tools/nata/exam-planner',
      name: 'NATA Exam Planner',
      track: 'nata',
      h1: `NATA Exam Planner ${y}: Sessions and Key Dates`,
      title: `NATA Exam Planner ${y}: Pick Sessions, Track Dates`,
      description: 'See every NATA session and key date in one place, pick the attempts that suit you and keep your plan. Free NATA exam planner.',
      answer: `In 2026, NATA Phase 1 ran every Friday afternoon and every Saturday (morning and afternoon) from 4 April to 13 June, and Phase 2 on 7 and 8 August. The NATA ${y} dates come with the new brochure; this planner shows the sessions so you can choose your attempts.`,
      steps: [
        { title: 'Browse the sessions', text: 'Every session by month, with the phase it belongs to.' },
        { title: 'Pick your attempts', text: 'Choose the dates that leave time to prepare.' },
        { title: 'Keep the plan', text: 'Sign in to save it and get reminders.' },
      ],
      faqs: [
        { q: 'How many times can I write NATA?', a: 'NATA allows more than one attempt in a year, and the best valid score counts. The exact limit is set in each year\'s brochure.' },
        { q: `When are the NATA ${y} dates announced?`, a: 'The Council of Architecture releases the brochure with session dates early in the year. This planner is updated when it is out.' },
      ],
      free: ['Browse the session calendar'],
      gated: ['Save your plan', 'Reminders before each date'],
      source: 'Session dates from the NATA brochure.',
      related: ['nata-exam-centers', 'nata-cost-calculator', 'nata-cutoff-calculator'],
      keywords: ['nata exam dates', 'nata schedule', 'nata sessions', 'nata planner'],
    },

    'nata-question-bank': {
      id: 'nata-question-bank',
      path: '/tools/nata/question-bank',
      name: 'NATA Question Bank',
      track: 'nata',
      h1: 'NATA Question Bank: Real Questions with Answers',
      title: 'NATA Question Bank: Previous Questions and Answers',
      description: 'Practise NATA questions remembered and shared by students, sorted by topic and year, with answers and discussion. Free NATA question bank.',
      answer: 'This question bank collects NATA questions shared by students after their exam, sorted by topic and year, with answers and discussion from the community.',
      steps: [
        { title: 'Browse by topic or year', text: 'Maths, general aptitude, drawing and more.' },
        { title: 'Try a question', text: 'Then compare with the answer and discussion.' },
        { title: 'Share yours', text: 'Add questions you remember to unlock more.' },
      ],
      faqs: [
        { q: 'Are these official NATA papers?', a: 'No. NATA does not publish papers; these are questions students remember and share after the exam.' },
        { q: 'Is the question bank free?', a: 'Yes. Sign in free to open every question; contributing questions unlocks the rest of the community content.' },
      ],
      free: ['Topics and sample questions'],
      gated: ['Every question with answers', 'Discussion and contributing'],
      source: 'Questions shared by students on aiArchitek.',
      related: ['nata-exam-planner', 'nata-cutoff-calculator', 'nata-eligibility-checker'],
      keywords: ['nata question bank', 'nata previous year questions', 'nata questions with answers'],
    },

    'counseling-college-predictor': {
      id: 'counseling-college-predictor',
      path: '/tools/counseling/college-predictor',
      name: 'B.Arch College Predictor',
      track: 'counseling',
      h1: `B.Arch College Predictor ${y}`,
      title: `B.Arch College Predictor ${y}: Colleges for Your Score`,
      description: 'Enter your cutoff or rank and see the B.Arch colleges you can get, based on last year\'s closing marks in TNEA, KEAM and other state counselling.',
      answer: 'The college predictor compares your cutoff or rank with last year\'s closing marks and ranks at each college in your state counselling, and lists the colleges you have a realistic chance at.',
      steps: [
        { title: 'Pick your counselling', text: 'TNEA, KEAM and the other state counselling with published data.' },
        { title: 'Enter your cutoff or rank', text: 'Out of 400 for most state counselling.' },
        { title: 'See your colleges', text: 'Colleges whose last closing mark is at or below yours come first.' },
      ],
      faqs: [
        { q: 'How accurate is the college predictor?', a: 'It uses real closing marks and ranks from past allotment lists. Cutoffs move every year with seats and applicants, so treat the result as a shortlist, not a guarantee.' },
        { q: 'Which counselling does it cover?', a: 'State B.Arch counselling with published allotment data, such as TNEA in Tamil Nadu and KEAM in Kerala. For NITs and SPAs use the JoSAA predictor.' },
        { q: 'Does my category change the result?', a: 'Yes. Reserved categories often have lower closing marks. Sign in to filter by your category.' },
      ],
      free: ['The top 3 colleges for your score in one counselling'],
      gated: ['Every matching college', 'Your category and round', 'Seat-aware chances and rank mode', 'Saved shortlist'],
      source: 'Closing marks and ranks from official counselling allotment lists.',
      related: ['nata-cutoff-calculator', 'counseling-rank-predictor', 'counseling-coa-checker'],
      keywords: ['b.arch college predictor', 'nata college predictor', 'tnea b.arch college predictor', 'architecture college predictor'],
      geo: ['state', 'city'],
    },

    'counseling-josaa-predictor': {
      id: 'counseling-josaa-predictor',
      path: '/tools/counseling/josaa-predictor',
      name: 'JoSAA B.Arch Predictor',
      track: 'counseling',
      h1: `JoSAA B.Arch College Predictor ${y}`,
      title: `JoSAA B.Arch Predictor ${y}: NIT and SPA Chances`,
      description: 'Enter your JEE Main Paper 2 (B.Arch) rank and see the NITs, SPAs and other JoSAA institutes you can get, from real JoSAA closing ranks.',
      answer: 'JoSAA allots B.Arch seats at NITs, SPAs and other government-funded institutes using JEE Main Paper 2 ranks. This predictor checks your rank against past JoSAA closing ranks for each institute.',
      steps: [
        { title: 'Enter your rank', text: 'Your JEE Main Paper 2 (B.Arch) rank.' },
        { title: 'Add category and home state', text: 'Home state quota changes the closing rank at NITs.' },
        { title: 'See your institutes', text: 'Institutes whose closing rank was at or above yours.' },
      ],
      faqs: [
        { q: 'Does JoSAA use NATA scores?', a: 'No. JoSAA uses JEE Main Paper 2 (B.Arch) ranks. NATA is used by state and private college counselling.' },
        { q: 'Can I get an IIT for B.Arch through this?', a: 'IIT B.Arch seats need JEE Advanced and the Architecture Aptitude Test (AAT), so they are not predicted from a Paper 2 rank.' },
        { q: 'What is home state quota?', a: 'At NITs, half the seats are for students from the NIT\'s own state, which often have a different closing rank.' },
      ],
      free: ['The top 3 institutes for your rank (open category)'],
      gated: ['Your category, quota and gender', 'Every round and year', 'The full list'],
      source: 'Opening and closing ranks published by JoSAA.',
      related: ['counseling-college-predictor', 'counseling-coa-checker', 'counseling-insights'],
      keywords: ['josaa b.arch predictor', 'jee paper 2 college predictor', 'nit b.arch closing rank', 'spa closing rank'],
    },

    'counseling-rank-predictor': {
      id: 'counseling-rank-predictor',
      path: '/tools/counseling/rank-predictor',
      name: 'B.Arch Counselling Rank Predictor',
      track: 'counseling',
      h1: `B.Arch Counselling Rank Predictor ${y}`,
      title: `B.Arch Rank Predictor ${y}: Your Counselling Rank`,
      description: 'Estimate your state B.Arch counselling rank from your cutoff, using past rank lists from TNEA, KEAM and others. Free rank predictor.',
      answer: 'Your counselling rank depends on how many students scored above you. This predictor places your cutoff in last year\'s rank list for your counselling and gives you the likely rank range.',
      steps: [
        { title: 'Pick your counselling', text: 'Only counselling with published rank lists.' },
        { title: 'Enter your cutoff', text: 'The same score counselling ranks you on.' },
        { title: 'See your rank range', text: 'Where that score fell in past rank lists.' },
      ],
      faqs: [
        { q: 'Why is it a range and not one rank?', a: 'The number of applicants and scores change each year, so the same score lands a little higher or lower.' },
        { q: 'Which counselling has rank data?', a: 'Counselling bodies that publish rank lists, such as TNEA. Others are added as their lists are published.' },
      ],
      free: ['A rank range for your score'],
      gated: ['A closer rank estimate', 'Category rank', 'Year by year trend'],
      source: 'Official counselling rank lists.',
      related: ['counseling-college-predictor', 'nata-cutoff-calculator', 'counseling-insights'],
      keywords: ['b.arch rank predictor', 'tnea b.arch rank predictor', 'nata rank predictor'],
      geo: ['system'],
    },

    'counseling-insights': {
      id: 'counseling-insights',
      path: '/tools/counseling/insights',
      name: 'B.Arch Counselling Insights',
      track: 'counseling',
      h1: 'B.Arch Counselling Insights: Seats, Applicants and Cutoffs',
      title: 'B.Arch Counselling Insights: Who Got Seats, Where',
      description: 'How many applied, how many got B.Arch seats and which colleges filled first, from official allotment lists for TNEA, KEAM and more.',
      answer: 'Counselling insights shows how many students applied, how many were allotted a B.Arch seat and which colleges filled first, year by year, from official allotment lists.',
      steps: [
        { title: 'Pick a counselling and year', text: 'Only counselling with published lists.' },
        { title: 'Read the summary', text: 'Applicants, seats allotted and the closing marks.' },
        { title: 'Spot the trend', text: 'Which colleges fill first and how cutoffs moved.' },
      ],
      faqs: [
        { q: 'Where does this data come from?', a: 'From allotment and rank lists published by the counselling bodies. We show totals and per-college figures only, never individual students.' },
      ],
      free: ['Headline numbers for one counselling'],
      gated: ['Round by round detail', 'Per-college and per-category views'],
      source: 'Official counselling allotment lists.',
      related: ['counseling-college-predictor', 'counseling-rank-predictor', 'counseling-josaa-predictor'],
      keywords: ['b.arch counselling statistics', 'tnea b.arch allotment', 'b.arch seats filled'],
      geo: ['system'],
    },

    'counseling-coa-checker': {
      id: 'counseling-coa-checker',
      path: '/tools/counseling/coa-checker',
      name: 'COA Approved College Checker',
      track: 'counseling',
      h1: 'COA Approved Architecture College Checker',
      title: 'COA Approved Colleges: Check Any B.Arch College',
      description: 'Check if a B.Arch college is approved by the Council of Architecture, with intake and approval status. Search by name, state or city. Free.',
      answer: 'Every B.Arch college in India must be approved by the Council of Architecture (COA), or the degree does not lead to registration as an architect. Search any college here to see its approval status and intake.',
      steps: [
        { title: 'Search a college', text: 'By name, or browse a state or city.' },
        { title: 'Check the status', text: 'Approved, with the sanctioned intake.' },
        { title: 'Decide safely', text: 'Avoid colleges that are not on the list.' },
      ],
      faqs: [
        { q: 'Why does COA approval matter?', a: 'Only a B.Arch from a COA approved college lets you register as an architect under the Architects Act, 1972.' },
        { q: 'What does intake mean?', a: 'The number of B.Arch seats COA has approved for the college each year.' },
      ],
      free: ['Search with the first 5 results', 'College counts by state'],
      gated: ['The full list with filters', 'Approval year and details', 'Saved colleges'],
      source: 'Council of Architecture list of approved institutions.',
      related: ['counseling-college-predictor', 'counseling-josaa-predictor', 'nata-eligibility-checker'],
      keywords: ['coa approved colleges', 'coa approved architecture colleges', 'is college coa approved'],
      geo: ['state', 'city'],
    },
  };
}

let cache: { year: number; tools: Record<ToolId, ToolSeo> } | null = null;

export function getToolSeoMap(now: Date = new Date()): Record<ToolId, ToolSeo> {
  const year = nataCycleYear(now);
  if (!cache || cache.year !== year) cache = { year, tools: build(year) };
  return cache.tools;
}

export function getToolSeo(id: ToolId, now?: Date): ToolSeo {
  return getToolSeoMap(now)[id];
}

export function allToolSeo(now?: Date): ToolSeo[] {
  return Object.values(getToolSeoMap(now));
}
