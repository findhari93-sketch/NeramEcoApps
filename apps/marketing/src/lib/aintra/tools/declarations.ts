export const TOOL_DECLARATIONS = [
  {
    name: 'get_college',
    description:
      'Fetch full data for one architecture college by slug. Returns college info plus fees, cutoffs, placements, infrastructure, and faculty. Use this when the user asks about a specific college and you know its slug.',
    parameters: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Unique college slug from the /colleges/<state>/<slug> URL, e.g., "papni-architecture".',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'search_colleges',
    description:
      'Search architecture colleges with filters. Returns up to 20 matching college cards. Use when the user asks broadly (by city, state, fee range, exam, COA status, NAAC grade) or when you need to resolve a college name to a slug via the "q" free-text search.',
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Free-text name match, e.g., "sathyabama".' },
        state: { type: 'string', description: 'State slug, e.g., "tamil-nadu", "kerala", "karnataka".' },
        city: { type: 'string', description: 'City slug, e.g., "chennai", "bangalore".' },
        type: {
          type: 'string',
          enum: ['government', 'private', 'aided', 'deemed'],
          description: 'College type.',
        },
        counseling_system: {
          type: 'string',
          description: 'Counseling system code, e.g., "tnea", "keam", "kcet", "comedk", "josaa".',
        },
        coa_approved: { type: 'boolean', description: 'Filter to COA-approved colleges only.' },
        naac_grade: {
          type: 'string',
          description: 'NAAC grade filter, e.g., "A++", "A+", "A", "B++".',
        },
        accepted_exam: {
          type: 'string',
          description: 'Exam accepted, e.g., "nata", "jee_paper_2", "kcet".',
        },
        fee_max: {
          type: 'number',
          description: 'Maximum annual fee in INR, e.g., 200000 for "under 2 lakh".',
        },
        neram_tier: {
          type: 'string',
          enum: ['platinum', 'gold', 'silver', 'bronze'],
          description: 'Neram quality tier.',
        },
        sort_by: {
          type: 'string',
          enum: ['arch_index', 'nirf_rank', 'fee_low', 'fee_high', 'name', 'placement_high', 'naac_grade'],
          description: 'Sort order. Default arch_index (best first).',
        },
        limit: {
          type: 'number',
          description: 'Max results to return. Default 10, max 20.',
        },
      },
    },
  },
  {
    name: 'compare_colleges',
    description:
      'Compare 2 to 3 architecture colleges side-by-side by slug. Returns comparison-trimmed data for each.',
    parameters: {
      type: 'object',
      properties: {
        slugs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of 2 or 3 college slugs to compare.',
        },
      },
      required: ['slugs'],
    },
  },
] as const;
