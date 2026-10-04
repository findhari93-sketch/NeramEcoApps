import { registerTools } from '@/lib/assistant/registry';
import { ncertStudyRefs } from './ncert-study-refs';
import { qbChapterWeightage } from './qb-chapter-weightage';
import { qbExplainAnswer } from './qb-explain-answer';
import { qbSearchQuestions } from './qb-search-questions';
import { whatToStudy } from './what-to-study';

registerTools([qbChapterWeightage, whatToStudy, qbSearchQuestions, qbExplainAnswer, ncertStudyRefs]);
