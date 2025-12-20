import type { ChatFlowConfig } from './types';

/**
 * Pre-scripted conversational flow for the Neram Classes application form
 */
export const applicationFormFlow: ChatFlowConfig = {
  welcomeMessages: [
    "Hi there! I'm Nera, your application assistant. 👋",
    "I'll help you apply to Neram Classes in just a few minutes.",
    "Let's start with your basic details. What's your full name?",
  ],

  steps: [
    // Step 1: Basic Details
    {
      id: 'fullName',
      fieldName: 'fullName',
      botMessages: [],
      inputConfig: {
        type: 'text',
        placeholder: 'Enter your full name',
        validation: { required: true, minLength: 2 },
      },
      responses: {
        valid: (value) => `Nice to meet you, ${value}! 😊`,
        invalid: 'Please enter your full name (at least 2 characters).',
      },
    },
    {
      id: 'email',
      fieldName: 'email',
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
    },
    {
      id: 'phone',
      fieldName: 'phone',
      botMessages: ['And your mobile number? (10 digits)'],
      inputConfig: {
        type: 'phone',
        placeholder: '9876543210',
        validation: {
          required: true,
          pattern: /^[6-9]\d{9}$/,
        },
      },
      responses: {
        valid: 'Got it! We may call you for important updates.',
        invalid: 'Please enter a valid 10-digit mobile number starting with 6-9.',
      },
    },
    {
      id: 'gender',
      fieldName: 'gender',
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

    // Step 2: Education
    {
      id: 'schoolName',
      fieldName: 'schoolName',
      botMessages: ["Now let's talk about your education.", 'Which school are you currently studying in?'],
      inputConfig: {
        type: 'text',
        placeholder: 'Enter your school name',
        validation: { required: true, minLength: 3 },
      },
      responses: {
        valid: 'Great school choice!',
        invalid: 'Please enter your school name.',
      },
    },
    {
      id: 'board',
      fieldName: 'board',
      botMessages: ['Which board is your school affiliated with?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'cbse', label: 'CBSE' },
          { value: 'icse', label: 'ICSE' },
          { value: 'state', label: 'State Board' },
          { value: 'ib', label: 'IB' },
          { value: 'other', label: 'Other' },
        ],
      },
      responses: {
        valid: 'Got it!',
      },
    },
    {
      id: 'currentClass',
      fieldName: 'currentClass',
      botMessages: ['Which class are you currently in?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: '10th', label: '10th Standard' },
          { value: '11th', label: '11th Standard' },
          { value: '12th', label: '12th Standard' },
          { value: 'passed', label: 'Already Passed 12th' },
        ],
      },
      responses: {
        valid: 'Perfect!',
      },
    },
    {
      id: 'courseInterest',
      fieldName: 'courseInterest',
      botMessages: ['Which course are you interested in?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'nata', label: 'NATA Preparation' },
          { value: 'jee_paper2', label: 'JEE Paper 2 (B.Arch)' },
          { value: 'both', label: 'Both NATA & JEE' },
        ],
      },
      responses: {
        valid: (value) => {
          const courseNames: Record<string, string> = {
            nata: 'NATA Preparation',
            jee_paper2: 'JEE Paper 2',
            both: 'NATA & JEE Combined',
          };
          return `Excellent choice! ${courseNames[value] || value} is one of our most popular courses. 🎯`;
        },
      },
    },
    {
      id: 'batchPreference',
      fieldName: 'batchPreference',
      botMessages: ['When would you prefer to attend classes?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'morning', label: 'Morning (6 AM - 9 AM)' },
          { value: 'afternoon', label: 'Afternoon (2 PM - 5 PM)' },
          { value: 'evening', label: 'Evening (5 PM - 8 PM)' },
          { value: 'weekend', label: 'Weekends Only' },
        ],
      },
      responses: {
        valid: 'Noted your preference!',
      },
    },

    // Step 3: Source
    {
      id: 'sourceCategory',
      fieldName: 'sourceCategory',
      botMessages: ['Almost done! How did you hear about Neram Classes?'],
      inputConfig: {
        type: 'select',
        options: [
          { value: 'youtube', label: 'YouTube' },
          { value: 'instagram', label: 'Instagram' },
          { value: 'facebook', label: 'Facebook' },
          { value: 'google_search', label: 'Google Search' },
          { value: 'friend_referral', label: 'Friend/Family' },
          { value: 'school_visit', label: 'School Visit' },
          { value: 'other', label: 'Other' },
        ],
      },
      responses: {
        valid: 'Thanks for sharing!',
      },
    },
  ],

  completionMessages: [
    "That's all the information I needed! ✅",
    'Please review your details in the form and click "Preview & Submit" when ready.',
    'Feel free to edit any field before submitting. Good luck with your application! 🍀',
  ],
};

export default applicationFormFlow;
