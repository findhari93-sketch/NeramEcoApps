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
  // Booking for the visitor (2026-10-20). Each one only PREPARES: it checks the
  // values and puts a filled-in card under the answer. Nothing is booked or
  // cancelled until the visitor taps Confirm on that card.
  {
    name: 'prepare_demo_booking',
    description:
      'Prepare a free demo class booking (or a new time for the demo they already have) and show it on a card the visitor confirms with one tap. Call it once you know the day and time; include the student name and exam year when known. Never book a second demo: if they have one, the result says so.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Day from DEMO SLOTS NOW as YYYY-MM-DD, or "today" / "tomorrow". Leave out for "any time".' },
        window: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening', 'anytime'],
          description: 'Time of day, or "anytime" when they have no preference.',
        },
        student_name: { type: 'string', description: 'Name of the student attending (a parent may book for their child).' },
        exam_year: { type: 'number', description: 'Year the student will write NATA or JEE B.Arch, e.g. 2027.' },
        parent_joining: { type: 'boolean', description: 'True if a parent will join the demo.' },
      },
    },
  },
  {
    name: 'prepare_demo_cancel',
    description:
      'Prepare cancelling the visitor\'s demo class: shows a card where they tap "Yes, cancel". Only when they clearly ask to cancel.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why they are cancelling, in their words, if they said.' },
      },
    },
  },
  {
    name: 'prepare_callback',
    description:
      'Prepare a callback from our counsellor on a card the visitor confirms. The card collects their number, never ask for it in the chat.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '"today", "tomorrow" or YYYY-MM-DD, within the next few days.' },
        slot: { type: 'string', enum: ['morning', 'afternoon', 'evening'], description: 'Time of day for the call.' },
        topic: { type: 'string', description: 'What they want to talk about, in a few words.' },
      },
    },
  },
  // The application form, filled in by talking (2026-10-20). The one tool that
  // writes: it saves answers to the student's own DRAFT application (the same
  // draft /apply reopens). Submitting is always the student's tap on the card.
  {
    name: 'save_application_details',
    description:
      'Save the student\'s answers to their application form (a private draft, never submitted by this). Call it every time they answer one or more questions; the result says what was saved and what is still needed. Pass only what they told you.',
    parameters: {
      type: 'object',
      properties: {
        student_name: { type: 'string', description: 'Student\'s full name as on school records.' },
        father_name: { type: 'string', description: 'Father\'s name.' },
        date_of_birth: { type: 'string', description: 'YYYY-MM-DD.' },
        gender: { type: 'string', enum: ['male', 'female', 'other'] },
        currently_in: {
          type: 'string',
          enum: ['class_8', 'class_9', 'class_10', 'class_11', 'class_12', '12th_completed', 'diploma', 'college', 'working'],
          description: 'What the student is doing now.',
        },
        school_name: { type: 'string', description: 'School name (school students).' },
        board: {
          type: 'string',
          enum: ['cbse', 'icse', 'state_tn', 'matriculation', 'state_ka', 'state_ap', 'state_ke', 'ib', 'igcse', 'nios', 'other'],
          description: 'School board (school students).',
        },
        college_name: { type: 'string', description: 'College or polytechnic name (diploma or college students).' },
        department: { type: 'string', description: 'Department or branch (diploma or college students).' },
        year_of_study: { type: 'number', description: 'Year of study, 1 to 5 (college students).' },
        twelfth_year: { type: 'number', description: 'Year they finished Class 12 (college students, working).' },
        completed_grade: { type: 'string', enum: ['10th', '12th'], description: 'Diploma students: joined after 10th or 12th.' },
        exam_year: { type: 'number', description: 'Year they will write NATA or JEE B.Arch, e.g. 2027.' },
        course: { type: 'string', enum: ['nata', 'jee_paper2', 'both', 'not_sure'] },
        programme: { type: 'string', enum: ['crash', '1-year', '2-year'], description: 'Which Neram programme (see the fees).' },
        pincode: { type: 'string', description: '6-digit Indian PIN code of where they live.' },
      },
    },
  },
  {
    name: 'prepare_application_submit',
    description:
      'When save_application_details says nothing is still needed: show the application summary card, where the student ticks the terms and taps Submit.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'prepare_centre_visit',
    description:
      'Prepare a visit to one of our classroom centres on a card the visitor confirms (they type their contact details on the card).',
    parameters: {
      type: 'object',
      properties: {
        centre: { type: 'string', description: 'Centre name or area, e.g. "Tambaram" or "Coimbatore".' },
        date: { type: 'string', description: '"tomorrow" or YYYY-MM-DD, from tomorrow up to 30 days ahead.' },
        time: { type: 'string', description: '"morning", "afternoon", or a slot the result listed.' },
        purpose: { type: 'string', description: 'What they want from the visit, in a few words.' },
      },
    },
  },
  {
    name: 'prepare_college_enquiry',
    description:
      'Prepare an admission enquiry to an architecture college, sent with the visitor\'s consent from a card. Resolve the college slug first (search_colleges or the page they are on).',
    parameters: {
      type: 'object',
      properties: {
        college_slug: { type: 'string', description: 'The college slug.' },
        message: { type: 'string', description: 'Their question to the college, if they gave one.' },
      },
      required: ['college_slug'],
    },
  },
  {
    name: 'prepare_message',
    description:
      'Prepare a written message to the Neram team (a question that needs a person, a complaint, a request). Our team replies by email. For "call me", use prepare_callback instead.',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'A short subject.' },
        message: { type: 'string', description: 'The message, in their words (at least a sentence).' },
      },
      required: ['message'],
    },
  },
  {
    name: 'get_my_status',
    description:
      'The signed-in visitor\'s own demo class, callback request and application status. Use when they ask "what did I book", "is my demo confirmed" or "what is my application status".',
    parameters: { type: 'object', properties: {} },
  },
] as const;
