export const ASSISTANT_FLAG = 'student.assistant-chat';
/** nexus_settings key: a JSON array of users.id. Empty or missing means everyone with the flag on. */
export const PILOT_KEY = 'assistant_pilot_user_ids';
/** Student features the assistant opens doors to; with one off, its tools, flows and chips go too (Ruling 25). */
export const SKETCHBOOK_FLAG = 'student.sketchbook';
export const ATTENDANCE_FLAG = 'student.attendance';

/** M2: the tests page, the question bank (exam tools) and the inspiration gallery. */
export const TESTS_FLAG = 'student.tests';
export const QUESTION_BANK_FLAG = 'student.question-bank';
export const INSPIRATION_FLAG = 'student.inspiration';

/** The AI Tutor (lib/assistant/tutor). Needs ASSISTANT_FLAG and QUESTION_BANK_FLAG on too. */
export const TUTOR_FLAG = 'student.ai-tutor';
