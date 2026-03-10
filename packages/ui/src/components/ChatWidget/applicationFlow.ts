import type { ChatFlowConfig } from './types';

/**
 * Pre-scripted conversational flow for the Neram Classes application form.
 * Aligned with the Marketing app's 4-step form structure:
 *   Step 0: Personal Info + Location
 *   Step 1: Academic Details
 *   Step 2: Course Selection
 *   Step 3: Review & Submit (handled by form, not chat)
 */

/** Helper to read nested form data safely */
function getNestedValue(formData: Record<string, unknown>, section: string, field: string): unknown {
  const sectionData = formData[section] as Record<string, unknown> | undefined;
  return sectionData?.[field];
}

export const applicationFormFlow: ChatFlowConfig = {
  welcomeMessages: [
    "Hi there! I'm Nera, your application assistant.",
    "I'll help you apply to Neram Classes in just a few minutes.",
    "Let's start with your basic details. What's your first name?",
  ],

  steps: [
    // ========================================
    // STEP 0: Personal Info + Location
    // ========================================
    {
      id: 'firstName',
      fieldName: 'firstName',
      section: 'personal',
      botMessages: [],
      inputConfig: {
        type: 'text',
        placeholder: 'Enter your first name',
        validation: { required: true, minLength: 2 },
      },
      responses: {
        valid: (value) => `Nice to meet you, ${value}!`,
        invalid: 'Please enter your first name (at least 2 characters).',
      },
    },
    {
      id: 'fatherName',
      fieldName: 'fatherName',
      section: 'personal',
      botMessages: ["What's your father's name?"],
      inputConfig: {
        type: 'text',
        placeholder: "Enter your father's name",
        validation: { required: true, minLength: 2 },
      },
      responses: {
        valid: 'Got it!',
        invalid: "Please enter your father's name (at least 2 characters).",
      },
    },
    {
      id: 'email',
      fieldName: 'email',
      section: 'personal',
      botMessages: ["What's your email address? We'll send important updates here."],
      inputConfig: {
        type: 'email',
        placeholder: 'your.email@example.com',
        validation: {
          required: true,
          pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        },
      },
      responses: {
        valid: "Perfect! I'll send all updates to {{value}}.",
        invalid: 'Please enter a valid email address.',
      },
      skipCondition: (formData) => {
        const val = getNestedValue(formData, 'personal', 'email');
        return typeof val === 'string' && val.includes('@');
      },
    },
    {
      id: 'phone',
      fieldName: 'phone',
      section: 'personal',
      botMessages: ['Your mobile number? (10 digits starting with 6-9)'],
      inputConfig: {
        type: 'phone',
        placeholder: '9876543210',
        validation: {
          required: true,
          pattern: /^[6-9]\d{9}$/,
        },
      },
      responses: {
        valid: "Got it! You'll need to verify this number with OTP in the form.",
        invalid: 'Please enter a valid 10-digit mobile number starting with 6-9.',
      },
      skipCondition: (formData) => {
        const val = getNestedValue(formData, 'personal', 'phone');
        return typeof val === 'string' && /^[6-9]\d{9}$/.test(val);
      },
    },
    {
      id: 'dateOfBirth',
      fieldName: 'dateOfBirth',
      section: 'personal',
      botMessages: ['When were you born? (Select your date of birth)'],
      inputConfig: {
        type: 'date',
        placeholder: 'Select date',
        validation: { required: true },
      },
      responses: {
        valid: 'Thanks!',
        invalid: 'Please enter a valid date of birth.',
      },
    },
    {
      id: 'gender',
      fieldName: 'gender',
      section: 'personal',
      botMessages: ['What is your gender?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'other', label: 'Other' },
        ],
      },
      responses: {
        valid: 'Thanks!',
      },
    },
    {
      id: 'pincode',
      fieldName: 'pincode',
      section: 'location',
      botMessages: ["What's your pincode? We'll auto-fill your city and state."],
      inputConfig: {
        type: 'text',
        placeholder: 'Enter 6-digit pincode',
        validation: {
          required: true,
          pattern: /^\d{6}$/,
        },
      },
      responses: {
        valid: "Got your pincode! Your location details will be auto-filled in the form.",
        invalid: 'Please enter a valid 6-digit pincode.',
      },
    },

    // ========================================
    // STEP 1: Academic Details
    // ========================================
    {
      id: 'applicantCategory',
      fieldName: 'applicantCategory',
      section: 'academic',
      botMessages: [
        "Now let's talk about your academic background.",
        'Which category best describes you?',
      ],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'school_student', label: 'School Student' },
          { value: 'diploma_student', label: 'Diploma Student' },
          { value: 'college_student', label: 'College Student' },
          { value: 'working_professional', label: 'Working Professional' },
        ],
      },
      responses: {
        valid: (value) => {
          const labels: Record<string, string> = {
            school_student: 'school student',
            diploma_student: 'diploma student',
            college_student: 'college student',
            working_professional: 'working professional',
          };
          return `Great, you're a ${labels[value] || value}! Let me ask a few more questions.`;
        },
      },
    },

    // --- School Student sub-questions ---
    {
      id: 'school_current_class',
      fieldName: 'current_class',
      section: 'academic',
      subSection: 'schoolStudentData',
      botMessages: ['Which class are you currently in?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: '8', label: 'Class 8' },
          { value: '9', label: 'Class 9' },
          { value: '10', label: 'Class 10' },
          { value: '11', label: 'Class 11' },
          { value: '12', label: 'Class 12' },
        ],
      },
      responses: {
        valid: 'Noted!',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'school_student',
    },
    {
      id: 'school_name',
      fieldName: 'school_name',
      section: 'academic',
      subSection: 'schoolStudentData',
      botMessages: ["What's the name of your school?"],
      inputConfig: {
        type: 'text',
        placeholder: 'Enter your school name',
        validation: { required: true, minLength: 3 },
      },
      responses: {
        valid: 'Great!',
        invalid: 'Please enter your school name.',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'school_student',
    },
    {
      id: 'school_board',
      fieldName: 'board',
      section: 'academic',
      subSection: 'schoolStudentData',
      botMessages: ['Which board is your school affiliated with?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'cbse', label: 'CBSE' },
          { value: 'icse', label: 'ICSE' },
          { value: 'state_tn', label: 'TN State Board' },
          { value: 'state_other', label: 'Other State Board' },
          { value: 'ib', label: 'IB' },
          { value: 'other', label: 'Other' },
        ],
      },
      responses: {
        valid: 'Got it!',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'school_student',
    },

    // --- Diploma Student sub-questions ---
    {
      id: 'diploma_college_name',
      fieldName: 'college_name',
      section: 'academic',
      subSection: 'diplomaStudentData',
      botMessages: ["What's the name of your college?"],
      inputConfig: {
        type: 'text',
        placeholder: 'Enter your college name',
        validation: { required: true, minLength: 3 },
      },
      responses: {
        valid: 'Great!',
        invalid: 'Please enter your college name.',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'diploma_student',
    },
    {
      id: 'diploma_department',
      fieldName: 'department',
      section: 'academic',
      subSection: 'diplomaStudentData',
      botMessages: ['Which department are you in?'],
      inputConfig: {
        type: 'text',
        placeholder: 'e.g., Architecture, Civil Engineering',
        validation: { required: true, minLength: 2 },
      },
      responses: {
        valid: 'Noted!',
        invalid: 'Please enter your department.',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'diploma_student',
    },
    {
      id: 'diploma_completed_grade',
      fieldName: 'completed_grade',
      section: 'academic',
      subSection: 'diplomaStudentData',
      botMessages: ['Which grade did you complete before diploma?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: '10th', label: 'Completed 10th Standard' },
          { value: '12th', label: 'Completed 12th Standard' },
        ],
      },
      responses: {
        valid: 'Got it!',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'diploma_student',
    },

    // --- College Student sub-questions ---
    {
      id: 'college_name',
      fieldName: 'college_name',
      section: 'academic',
      subSection: 'collegeStudentData',
      botMessages: ["What's the name of your college?"],
      inputConfig: {
        type: 'text',
        placeholder: 'Enter your college name',
        validation: { required: true, minLength: 3 },
      },
      responses: {
        valid: 'Great!',
        invalid: 'Please enter your college name.',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'college_student',
    },
    {
      id: 'college_department',
      fieldName: 'department',
      section: 'academic',
      subSection: 'collegeStudentData',
      botMessages: ['Which department are you studying in?'],
      inputConfig: {
        type: 'text',
        placeholder: 'e.g., Architecture, Civil Engineering',
        validation: { required: true, minLength: 2 },
      },
      responses: {
        valid: 'Noted!',
        invalid: 'Please enter your department.',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'college_student',
    },
    {
      id: 'college_year_of_study',
      fieldName: 'year_of_study',
      section: 'academic',
      subSection: 'collegeStudentData',
      botMessages: ['Which year of study are you in?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: '1', label: '1st Year' },
          { value: '2', label: '2nd Year' },
          { value: '3', label: '3rd Year' },
          { value: '4', label: '4th Year' },
          { value: '5', label: '5th Year' },
        ],
      },
      responses: {
        valid: 'Got it!',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'college_student',
    },

    // --- Working Professional sub-questions ---
    {
      id: 'wp_twelfth_year',
      fieldName: 'twelfth_year',
      section: 'academic',
      subSection: 'workingProfessionalData',
      botMessages: ['In which year did you complete your 12th standard?'],
      inputConfig: {
        type: 'number',
        placeholder: 'e.g., 2020',
        validation: {
          required: true,
          min: 1990,
          max: new Date().getFullYear(),
        },
      },
      responses: {
        valid: 'Got it!',
        invalid: 'Please enter a valid year.',
      },
      skipCondition: (formData) =>
        getNestedValue(formData, 'academic', 'applicantCategory') !== 'working_professional',
    },

    // --- Common academic fields ---
    {
      id: 'casteCategory',
      fieldName: 'casteCategory',
      section: 'academic',
      botMessages: ['What is your caste category? (This helps with scholarship eligibility)'],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'general', label: 'General' },
          { value: 'obc', label: 'OBC' },
          { value: 'sc', label: 'SC' },
          { value: 'st', label: 'ST' },
          { value: 'ews', label: 'EWS' },
          { value: 'other', label: 'Other' },
        ],
      },
      responses: {
        valid: 'Noted!',
      },
    },
    {
      id: 'targetExamYear',
      fieldName: 'targetExamYear',
      section: 'academic',
      botMessages: ['Which exam year are you targeting?'],
      inputConfig: {
        type: 'select',
        options: (() => {
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth();
          const baseYear = month >= 8 ? year + 1 : year;
          const years = [];
          for (let i = 0; i < 4; i++) {
            const startYear = baseYear + i;
            const endYear = startYear + 1;
            const value = `${startYear}-${String(endYear).slice(2)}`;
            years.push({ value, label: value });
          }
          return years;
        })(),
      },
      responses: {
        valid: 'Perfect!',
      },
    },

    // ========================================
    // STEP 2: Course Selection
    // ========================================
    {
      id: 'interestCourse',
      fieldName: 'interestCourse',
      section: 'course',
      botMessages: ['Almost done! Which course are you interested in?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'nata', label: 'NATA Preparation' },
          { value: 'jee_paper2', label: 'JEE Paper 2 (B.Arch)' },
          { value: 'both', label: 'Both NATA & JEE' },
          { value: 'not_sure', label: "Not sure yet" },
        ],
      },
      responses: {
        valid: (value) => {
          const courseNames: Record<string, string> = {
            nata: 'NATA Preparation',
            jee_paper2: 'JEE Paper 2',
            both: 'NATA & JEE Combined',
            not_sure: "No worries, you can decide later",
          };
          return value === 'not_sure'
            ? "No worries! You can decide later. Our counselor will help you choose."
            : `Excellent choice! ${courseNames[value] || value} is one of our most popular courses.`;
        },
      },
    },
    {
      id: 'learningMode',
      fieldName: 'learningMode',
      section: 'course',
      botMessages: ['How would you prefer to learn?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'hybrid', label: 'Hybrid (Online + Offline Center)' },
          { value: 'online_only', label: 'Online Only' },
        ],
      },
      responses: {
        valid: (value) =>
          value === 'hybrid'
            ? "Great! You can select your preferred center in the form."
            : 'Online learning it is! You can attend all classes from home.',
      },
    },
  ],

  completionMessages: [
    "That's all the information I needed!",
    'Please review your details in the form and click "Review & Submit" when ready.',
    'Feel free to edit any field before submitting. Good luck with your application!',
  ],
};

export default applicationFormFlow;
