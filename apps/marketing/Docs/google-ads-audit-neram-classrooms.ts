/**
 * Google Ads Audit & Improvement Plan
 * Account: Neram Classrooms
 * Period: 21 March 2026 - 21 May 2026 (60 days)
 * Generated: 21 May 2026
 */

// ============================================================
// 1. ACCOUNT SNAPSHOT
// ============================================================

export const accountSnapshot = {
  period: { from: "2026-03-21", to: "2026-05-21", days: 60 },
  totals: {
    spend: 73926.59,         // INR
    clicks: 1802,
    impressions: 22600,
    ctr: 7.97,               // %
    avgCpc: 41.02,           // INR
    conversions: 114,
    convRate: 6.33,          // %
    cpa: 648.48              // Cost per conversion (INR)
  },
  alerts: [
    "Balance is running low - top up billing immediately",
    "Main campaign 'TN Local - NATA 2026' is Limited by bid strategy",
    "Recommendations panel has unresolved items (red indicator)"
  ]
};

// ============================================================
// 2. CAMPAIGNS
// ============================================================

export interface Campaign {
  name: string;
  budget: number;            // INR/day
  status: string;
  type: string;
  spend: number;
  conversions: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpa: number;
}

export const campaigns: Campaign[] = [
  {
    name: "TN Local - NATA 2026",
    budget: 3600,
    status: "Limited by bid strategy",
    type: "Search",
    spend: 71253.67,
    conversions: 111.5,
    impressions: 21559,
    clicks: 1725,
    ctr: 8.00,
    cpa: 639.05
  },
  {
    name: "Gulf_Micro_Test",
    budget: 300,
    status: "Eligible",
    type: "Search",
    spend: 2672.92,
    conversions: 2.5,
    impressions: 1041,
    clicks: 77,
    ctr: 7.40,
    cpa: 1069.17
  }
];

// ============================================================
// 3. KEYWORD PERFORMANCE
// ============================================================

export interface Keyword {
  keyword: string;
  matchType: string;
  status: string;
  maxCpc: number;
  clicks: number;
  impressions: number;
  ctr: number;
  avgCpc: number;
  cost: number;
  qualityScore: number;       // 1-10
  conversions: number;
  cpa: number;
  category: "winner" | "fix" | "pause" | "review";
}

export const keywords: Keyword[] = [
  // --- WINNERS (scale these) ---
  {
    keyword: '"nata entrance exam"',
    matchType: "Phrase",
    status: "Eligible (Limited) - Rarely shown (low QS)",
    maxCpc: 40,
    clicks: 271,
    impressions: 0,
    ctr: 0,
    avgCpc: 24.59,
    cost: 6663.72,
    qualityScore: 1,
    conversions: 43.33,
    cpa: 153.78,
    category: "winner"        // HIGHEST PRIORITY - 38% of conversions
  },
  {
    keyword: '"NATA mock Test"',
    matchType: "Phrase",
    status: "Eligible",
    maxCpc: 50,
    clicks: 187,
    impressions: 1728,
    ctr: 10.82,
    avgCpc: 48.66,
    cost: 9099.27,
    qualityScore: 5,
    conversions: 17,
    cpa: 535.25,
    category: "winner"
  },
  {
    keyword: '"nata self study material"',
    matchType: "Phrase",
    status: "Eligible",
    maxCpc: 40,
    clicks: 111,
    impressions: 0,
    ctr: 0,
    avgCpc: 24.21,
    cost: 2687.76,
    qualityScore: 5,
    conversions: 7,
    cpa: 383.97,
    category: "winner"
  },
  {
    keyword: '"NATA coaching class"',
    matchType: "Phrase",
    status: "Eligible",
    maxCpc: 40,
    clicks: 239,
    impressions: 2368,
    ctr: 10.09,
    avgCpc: 42.89,
    cost: 10249.69,
    qualityScore: 4,
    conversions: 11,
    cpa: 931.79,
    category: "winner"
  },
  {
    keyword: '"nata online coaching classes"',
    matchType: "Phrase",
    status: "Eligible",
    maxCpc: 40,
    clicks: 52,
    impressions: 0,
    ctr: 0,
    avgCpc: 54.84,
    cost: 2851.65,
    qualityScore: 7,
    conversions: 1.5,
    cpa: 1901.10,
    category: "winner"        // High QS but low traffic - boost bid
  },

  // --- KEYWORDS TO FIX OR PAUSE ---
  {
    keyword: '"NATA coaching in chennai"',
    matchType: "Phrase",
    status: "Eligible",
    maxCpc: 50,
    clicks: 100,
    impressions: 969,
    ctr: 10.32,
    avgCpc: 70.47,
    cost: 7046.95,
    qualityScore: 5,
    conversions: 0.5,
    cpa: 14093.90,            // 22x account average - landing page issue
    category: "fix"
  },
  {
    keyword: '"dq labs"',
    matchType: "Phrase",
    status: "Eligible (Limited) - low QS",
    maxCpc: 40,
    clicks: 63,
    impressions: 0,
    ctr: 0,
    avgCpc: 48.32,
    cost: 3044.49,
    qualityScore: 1,
    conversions: 0,
    cpa: 0,                   // Infinite - PAUSE
    category: "pause"         // Competitor brand, zero conversions
  },
  {
    keyword: '"i arch"',
    matchType: "Phrase",
    status: "Eligible (Limited) - low QS",
    maxCpc: 40,
    clicks: 60,
    impressions: 0,
    ctr: 0,
    avgCpc: 50.45,
    cost: 3027.04,
    qualityScore: 1,
    conversions: 0,
    cpa: 0,                   // Infinite - PAUSE
    category: "pause"
  },
  {
    keyword: '"i arch nata coaching centre"',
    matchType: "Phrase",
    status: "Eligible (Limited) - low QS",
    maxCpc: 40,
    clicks: 104,
    impressions: 0,
    ctr: 0,
    avgCpc: 27.66,
    cost: 2876.70,
    qualityScore: 2,
    conversions: 1.5,
    cpa: 1917.80,
    category: "review"
  },
  {
    keyword: '"NATA coaching in Madurai"',
    matchType: "Phrase",
    status: "Eligible",
    maxCpc: 40,
    clicks: 26,
    impressions: 0,
    ctr: 0,
    avgCpc: 75.21,
    cost: 1955.35,
    qualityScore: 5,
    conversions: 0,
    cpa: 0,
    category: "review"
  }
];

// ============================================================
// 4. SEARCH TERMS LEAKAGE
// ============================================================

export const searchTermsAnalysis = {
  knownTerms:  { clicks: 1100, spend: 42375.53, conv: 79.5, cpa: 533.03 },
  otherTerms:  { clicks: 701,  spend: 31502.53, conv: 34.5, cpa: 913.12 },
  insight: "Other (unmatched) search terms convert at 71% higher CPA - phrase match leaking"
};

// ============================================================
// 5. NEGATIVE KEYWORDS TO ADD
// ============================================================

export const negativeKeywords = {
  competitors: ["aptoinn", "dq labs", "i arch", "iarch", "silica", "mosaic", "brds", "momentum"],
  wrongIntent: ["jee", "paper 2", "iit jam", "jee paper 2 coaching", "jee paper 2"],
  outOfService: ["bangalore", "hyderabad", "delhi", "mumbai", "kerala"],
  freeSeekers: ["free", "pdf download", "syllabus pdf"]
};

// ============================================================
// 6. THE 7-STEP IMPROVEMENT PLAN
// ============================================================

export interface ActionItem {
  step: number;
  title: string;
  priority: "P0" | "P1" | "P2";
  when: string;
  tasks: string[];
  expectedImpact: string;
}

export const improvementPlan: ActionItem[] = [
  {
    step: 1,
    title: "Top up billing & fix account balance",
    priority: "P0",
    when: "Day 1",
    tasks: [
      "Resolve 'Balance is running low' alert in Billing section",
      "Verify auto-payment method is active"
    ],
    expectedImpact: "Prevents campaign pause"
  },
  {
    step: 2,
    title: "Add negative keyword list to both campaigns",
    priority: "P0",
    when: "Day 1",
    tasks: [
      "Create shared negative keyword list 'NATA_Master_Negatives'",
      "Add competitor brands, wrong intents, out-of-service cities",
      "Apply list to TN Local - NATA 2026 and Gulf_Micro_Test"
    ],
    expectedImpact: "Saves ~INR 8,000-10,000/month in wasted spend"
  },
  {
    step: 3,
    title: "Pause wasteful keywords",
    priority: "P0",
    when: "Day 1",
    tasks: [
      "Pause '\"dq labs\"' (INR 3,044 spent, 0 conv)",
      "Pause '\"i arch\"' (INR 3,027 spent, 0 conv)",
      "Pause '\"NATA coaching in chennai\"' OR rebuild landing page",
      "Pause '\"NATA coaching in Madurai\"' until LP ready"
    ],
    expectedImpact: "Frees ~INR 17,000 over 60 days for winning keywords"
  },
  {
    step: 4,
    title: "Rescue 'nata entrance exam' (Highest ROI Opportunity)",
    priority: "P1",
    when: "Week 1",
    tasks: [
      "Create dedicated ad group: 'NATA Entrance Exam'",
      "Build landing page /nata-entrance-exam-coaching/ with exact phrase in title, H1, first paragraph, CTA",
      "Write 3 RSAs with 15 headlines each, 'NATA Entrance Exam' in H1 and Path1",
      "Add sitelinks: Fees, Demo Class, Syllabus, Past Results",
      "Add callouts and structured snippets"
    ],
    expectedImpact: "Lift QS from 1/10 to 5-7/10; unlock 3-5x more impressions on best converter (currently 43 conv at INR 154 CPA)"
  },
  {
    step: 5,
    title: "Raise bids on top converting keywords by 25%",
    priority: "P1",
    when: "Week 1",
    tasks: [
      "'nata entrance exam': INR 40 -> INR 50",
      "'NATA mock Test': INR 50 -> INR 62",
      "'nata self study material': INR 40 -> INR 50",
      "'NATA coaching class': INR 40 -> INR 50"
    ],
    expectedImpact: "Resolve 'Limited by bid strategy' warning; capture more impression share"
  },
  {
    step: 6,
    title: "Expand ad copy with 3 RSAs per ad group",
    priority: "P1",
    when: "Week 1",
    tasks: [
      "Write 3 RSAs per ad group (currently <3)",
      "15 headlines covering: keyword variations, benefits, CTAs, social proof",
      "4 descriptions covering features, USP, urgency, CTA",
      "Pin Headline 1 to keyword theme, Description 1 to USP",
      "Add ad assets: callouts, sitelinks, structured snippets, images"
    ],
    expectedImpact: "+1-2 point Quality Score; +15-25% CTR"
  },
  {
    step: 7,
    title: "Switch to Maximize Conversions with Target CPA (experiment)",
    priority: "P2",
    when: "Week 2",
    tasks: [
      "Create campaign experiment with 50/50 traffic split",
      "Set Target CPA: INR 500-600",
      "Run for 14 days minimum before deciding",
      "Compare conversions, CPA, and conv. rate to control"
    ],
    expectedImpact: "20-30% lower CPA based on Google's recommendation engine"
  }
];

// ============================================================
// 7. EXPECTED IMPACT (next 60 days if plan executed)
// ============================================================

export const expectedImpact = {
  conversions:   { current: 114,     target: "160-180",  change: "+40 to +58%" },
  cpa:           { current: 648,     target: "450-500",  change: "-23 to -31%" },
  ctr:           { current: 7.97,    target: "9-10%",    change: "+13 to +25%" },
  avgQs:         { current: 3,       target: "5-6",      change: "+67 to +100%" },
  wastedSpend:   { current: 17000,   target: "<3000",    change: "-82%" }
};

// ============================================================
// 8. PENDING ITEMS - NEED USER ACCESS
// ============================================================

export const pendingTasks = {
  googleAnalytics: {
    url: "https://analytics.google.com",
    purpose: "Compare Paid vs Organic traffic, conversion paths, landing page engagement, bounce rates",
    keyReports: [
      "Acquisition > Traffic acquisition (by Source/Medium)",
      "Engagement > Landing page report",
      "Conversions by channel for last 60 days vs prior 60 days"
    ]
  },
  searchConsole: {
    url: "https://search.google.com/search-console",
    purpose: "Diagnose why 'NATA Online Coaching' isn't ranking on Page 1",
    checksToRun: [
      "Performance report - filter query: 'NATA Online Coaching' - check avg position, impressions, CTR",
      "Pages report - is there a dedicated URL ranking for this query?",
      "Coverage report - any indexing issues?",
      "Core Web Vitals & Mobile usability",
      "External links - backlink profile strength"
    ],
    hypothesesToVerify: [
      "Dedicated URL /nata-online-coaching/ exists?",
      "1000+ words of unique content with exact phrase in title/H1/first para?",
      "Backlink count vs competitors (IArch, Mosaic, Silica)?",
      "Page indexed and free of technical issues?"
    ]
  }
};

// ============================================================
// 9. WEEKLY TRACKING CHECKLIST
// ============================================================

export const weeklyTracking = {
  monday:    "Review search-terms report -> add new negatives",
  wednesday: "Check QS changes on key keywords; review ad asset performance",
  friday:    "Pull conversion + CPA report; adjust bids +/- 10-15% on outliers",
  monthly:   "Refresh RSA headlines; A/B test landing-page hero section; review competitor ads via Auction Insights"
};

// ============================================================
// 10. SEO STRATEGY FOR 'NATA Online Coaching'
// ============================================================

export const seoStrategy = {
  targetKeyword: "NATA Online Coaching",
  currentStatus: "Not ranking on Google Page 1",
  recommendedActions: [
    "Create/optimize dedicated landing page at /nata-online-coaching/",
    "Title tag: 'NATA Online Coaching | Live Classes by Top Faculty | Neram Classrooms'",
    "H1: 'NATA Online Coaching - Live Interactive Classes from Anywhere in India'",
    "Content: 1500+ words covering: course details, faculty, batches, fees, demo, testimonials, FAQs",
    "Schema markup: Course schema, LocalBusiness, FAQ, AggregateRating",
    "Internal linking from blog posts and city pages",
    "Build backlinks: education directories, guest posts on architecture blogs, YouTube embeds",
    "Publish weekly blog content around NATA preparation (mock tests, syllabus changes, drawing tips)",
    "Add student success stories with rich snippets",
    "Optimize for Core Web Vitals (LCP < 2.5s, CLS < 0.1)"
  ]
};
