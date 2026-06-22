// Plain data module (NO 'use client').
//
// This object is read by BOTH the Server Component (page.tsx, for
// generateStaticParams / generateMetadata) and the Client Component
// (CourseDetailContent.tsx). It MUST live in a non-client module: values
// exported from a 'use client' file become client-reference proxies when
// imported into a Server Component, so the server cannot read their contents.

export interface CourseCurriculumSection {
  title: string;
  topics: string[];
}

export interface CourseFacultyMember {
  name: string;
  subject: string;
  qualification: string;
}

export interface CourseBatchDetails {
  batchSize: string;
  timing: string;
  startDate: string;
  classType: string;
}

export interface Course {
  id: number;
  title: string;
  description: string;
  longDescription: string;
  duration: string;
  level: string;
  category: string;
  image: string;
  price: string;
  curriculum: CourseCurriculumSection[];
  features: string[];
  faculty: CourseFacultyMember[];
  batchDetails: CourseBatchDetails;
}

// Course data for architecture entrance and software training
export const coursesData: Record<string, Course> = {
  'architecture-entrance-year-long': {
    id: 1,
    title: 'Architecture Entrance - Year Long',
    description:
      'Comprehensive NATA & JEE Paper 2 preparation with IIT/NIT architect alumni faculty.',
    longDescription:
      'Our year-long Architecture Entrance course covers both NATA and JEE Paper 2 (B.Arch/B.Planning) as they share a common syllabus. With IIT/NIT architect alumni faculty, proven methodology, and personalized attention, we help you achieve top ranks in architecture entrance exams.',
    duration: '1 Year',
    level: 'All Levels',
    category: 'Architecture Entrance',
    image: '/images/courses/architecture-year-long.jpg',
    price: '30,000',
    curriculum: [
      {
        title: 'Drawing & Sketching',
        topics: [
          'Perspective Drawing',
          'Object Drawing',
          'Landscape Sketching',
          'Imagination & Memory Drawing',
          'Composition & Design',
        ],
      },
      {
        title: 'Mathematics',
        topics: [
          'Algebra & Trigonometry',
          'Coordinate Geometry',
          '3D Geometry',
          'Mensuration',
          'Statistics & Probability',
        ],
      },
      {
        title: 'General Aptitude',
        topics: [
          'Logical Reasoning',
          'Spatial Ability',
          'Visual Perception',
          'Architecture Awareness',
          'Design Thinking',
        ],
      },
    ],
    features: [
      'NATA + JEE Paper 2 Combined',
      'IIT/NIT Alumni Faculty',
      'Weekly Mock Tests',
      'Drawing Practice Sessions',
      'Previous Year Papers Analysis',
      'Personal Mentoring',
      'Online & Offline Options',
      'Mobile App Access',
    ],
    faculty: [
      {
        name: 'Ar. Ramesh Kumar',
        subject: 'Drawing & Design',
        qualification: 'B.Arch IIT Kharagpur, 20+ years experience',
      },
      {
        name: 'Ar. Anjali Menon',
        subject: 'Aptitude & Reasoning',
        qualification: 'B.Arch NIT Trichy, Architecture Entrance Expert',
      },
    ],
    batchDetails: {
      batchSize: '25 students',
      timing: 'Morning & Evening Batches',
      startDate: 'Rolling Admissions',
      classType: 'Offline & Online Options',
    },
  },
  'architecture-entrance-crash-course': {
    id: 2,
    title: 'Architecture Entrance - Crash Course',
    description:
      'Intensive NATA & JEE Paper 2 crash course for quick preparation and revision.',
    longDescription:
      'Our crash course is designed for students who need intensive, focused preparation for NATA and JEE Paper 2. Perfect for last-minute revision, daily practice, and exam strategy building with experienced architect faculty.',
    duration: '2-3 Months',
    level: 'All Levels',
    category: 'Architecture Entrance',
    image: '/images/courses/architecture-crash.svg',
    price: '15,000',
    curriculum: [
      {
        title: 'Drawing Intensive',
        topics: [
          'Quick Sketching Techniques',
          'Time Management in Drawing',
          'Common Mistakes to Avoid',
          'Practice with Previous Papers',
        ],
      },
      {
        title: 'Mathematics Revision',
        topics: [
          'Important Topics Focus',
          'Formula Sheets',
          'Problem Solving Shortcuts',
          'Practice Tests',
        ],
      },
      {
        title: 'Aptitude Crash',
        topics: [
          'Quick Reasoning Techniques',
          'Spatial Ability Tricks',
          'Architecture Awareness',
          'Last Minute Tips',
        ],
      },
    ],
    features: [
      'NATA + JEE Paper 2 Combined',
      'Daily Practice Sessions',
      'Mock Tests Every Week',
      'Exam Strategies',
      'Previous Year Analysis',
      'Doubt Clearing',
      'Study Material',
      'Flexible Timing',
    ],
    faculty: [
      {
        name: 'Ar. Vikram Singh',
        subject: 'Drawing & Design',
        qualification: 'M.Arch, 15+ years coaching experience',
      },
    ],
    batchDetails: {
      batchSize: '20 students',
      timing: 'Intensive Daily Classes',
      startDate: 'Before Each Exam Cycle',
      classType: 'Online & Offline',
    },
  },
  'revit-training': {
    id: 3,
    title: 'Revit Architecture Training',
    description:
      'Professional Autodesk Revit training for architects and designers.',
    longDescription:
      'Learn industry-standard BIM software Autodesk Revit from certified professionals. Our hands-on training covers architectural modeling, documentation, and rendering - essential skills for modern architecture practice.',
    duration: '3 Months',
    level: 'Beginner to Advanced',
    category: 'Software Training',
    image: '/images/courses/revit.svg',
    price: '25,000',
    curriculum: [
      {
        title: 'Revit Fundamentals',
        topics: [
          'Interface & Navigation',
          'Project Setup',
          'Basic Modeling Tools',
          'Views & Sheets',
        ],
      },
      {
        title: 'Architectural Modeling',
        topics: [
          'Walls, Doors, Windows',
          'Floors, Ceilings, Roofs',
          'Stairs & Railings',
          'Curtain Walls',
        ],
      },
      {
        title: 'Documentation & Visualization',
        topics: [
          'Annotations & Dimensions',
          'Schedules & Quantities',
          'Rendering & Walkthroughs',
          'Export & Collaboration',
        ],
      },
    ],
    features: [
      'Hands-on Projects',
      'Autodesk Certified',
      'Industry Projects',
      'Job Assistance',
      'Portfolio Building',
      'Small Batch Size',
      'Flexible Timing',
      'Certificate Provided',
    ],
    faculty: [
      {
        name: 'Ms. Priya Sharma',
        subject: 'Revit & BIM',
        qualification: 'Autodesk Certified Professional, 10+ years experience',
      },
    ],
    batchDetails: {
      batchSize: '15 students',
      timing: 'Weekday & Weekend Options',
      startDate: 'Every Month',
      classType: 'Online & Offline',
    },
  },
  'autocad-training': {
    id: 4,
    title: 'AutoCAD Training',
    description:
      '2D and 3D AutoCAD training for architecture and design professionals.',
    longDescription:
      'Master AutoCAD - the industry standard for 2D drafting and 3D modeling. Our comprehensive course covers everything from basics to advanced techniques used in architectural and interior design practice.',
    duration: '2 Months',
    level: 'Beginner',
    category: 'Software Training',
    image: '/images/courses/autocad.jpg',
    price: '15,000',
    curriculum: [
      {
        title: '2D Drafting',
        topics: [
          'Drawing Tools',
          'Modify Commands',
          'Layers & Properties',
          'Blocks & Attributes',
        ],
      },
      {
        title: '3D Modeling',
        topics: [
          '3D Basics',
          'Solid Modeling',
          'Surface Modeling',
          'Rendering',
        ],
      },
      {
        title: 'Documentation',
        topics: [
          'Layouts & Viewports',
          'Plotting & Publishing',
          'Standards & Templates',
          'Collaboration',
        ],
      },
    ],
    features: [
      '2D & 3D Coverage',
      'Industry Projects',
      'Certificate Provided',
      'Job Assistance',
      'Flexible Timing',
      'Small Batches',
      'Practice Files',
      'Lifetime Support',
    ],
    faculty: [
      {
        name: 'Mr. Arun Kumar',
        subject: 'AutoCAD',
        qualification: 'Autodesk Certified, Architecture Graduate',
      },
    ],
    batchDetails: {
      batchSize: '15 students',
      timing: 'Multiple Batches',
      startDate: 'Every Month',
      classType: 'Online & Offline',
    },
  },
  'sketchup-training': {
    id: 5,
    title: 'SketchUp Training',
    description:
      'Learn SketchUp for architectural visualization and 3D modeling.',
    longDescription:
      'SketchUp is perfect for quick 3D modeling and visualization. Learn to create stunning architectural models, walkthroughs, and presentations with our hands-on training program.',
    duration: '1 Month',
    level: 'Beginner',
    category: 'Software Training',
    image: '/images/courses/sketchup.jpg',
    price: '10,000',
    curriculum: [
      {
        title: 'SketchUp Basics',
        topics: [
          'Interface & Navigation',
          'Drawing Tools',
          'Push/Pull Modeling',
          'Components & Groups',
        ],
      },
      {
        title: 'Advanced Modeling',
        topics: [
          'Complex Shapes',
          'Plugins & Extensions',
          'Terrain & Landscape',
          'Interiors',
        ],
      },
      {
        title: 'Visualization',
        topics: [
          'Materials & Textures',
          'Rendering with V-Ray',
          'Walkthroughs',
          'Export Options',
        ],
      },
    ],
    features: [
      '3D Modeling',
      'Rendering Skills',
      'Plugin Training',
      'Portfolio Projects',
      'Certificate',
      'Flexible Timing',
      'Small Batches',
      'Practice Files',
    ],
    faculty: [
      {
        name: 'Mr. Karthik Rajan',
        subject: 'SketchUp & Visualization',
        qualification: 'Visualization Expert, 8+ years experience',
      },
    ],
    batchDetails: {
      batchSize: '15 students',
      timing: 'Weekday & Weekend',
      startDate: 'Every Month',
      classType: 'Online & Offline',
    },
  },
  'nata-self-learning-app': {
    id: 6,
    title: 'NATA Self-Learning App',
    description:
      'AI-powered NATA & JEE Paper 2 preparation app with personalized learning.',
    longDescription:
      'Our AI-powered mobile app provides personalized learning paths for NATA and JEE Paper 2 preparation. Practice anytime, anywhere with adaptive tests, video lessons, and progress tracking.',
    duration: 'Self-paced',
    level: 'All Levels',
    category: 'Digital Learning',
    image: '/images/courses/nata-app.jpg',
    price: '5,000',
    curriculum: [
      {
        title: 'Drawing Module',
        topics: [
          'Video Tutorials',
          'Practice Exercises',
          'AI Feedback',
          'Sample Solutions',
        ],
      },
      {
        title: 'Mathematics Module',
        topics: [
          'Topic-wise Learning',
          'Practice Problems',
          'Formula Reference',
          'Mock Tests',
        ],
      },
      {
        title: 'Aptitude Module',
        topics: [
          'Reasoning Practice',
          'Spatial Ability',
          'Architecture Awareness',
          'Timed Tests',
        ],
      },
    ],
    features: [
      'AI-Powered Learning',
      'Personalized Path',
      'Practice Tests',
      'Progress Tracking',
      'Mobile Access',
      'Offline Mode',
      'Video Lessons',
      '24/7 Available',
    ],
    faculty: [
      {
        name: 'Digital Learning Team',
        subject: 'All Subjects',
        qualification: 'Expert Content Creators & AI Engineers',
      },
    ],
    batchDetails: {
      batchSize: 'Unlimited',
      timing: 'Self-paced, 24/7',
      startDate: 'Instant Access',
      classType: 'Mobile App',
    },
  },
};
