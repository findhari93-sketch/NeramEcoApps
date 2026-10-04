import { registerTools } from '@/lib/assistant/registry';
import { examCountdown } from './exam-countdown';
import { getInspirations } from './get-inspirations';
import { myAssignments } from './my-assignments';
import { myAttendance } from './my-attendance';
import { myBrief } from './my-brief';
import { myCatchup } from './my-catchup';
import { myReviews } from './my-reviews';
import { mySchedule } from './my-schedule';
import { mySketchbook } from './my-sketchbook';
import { myTests } from './my-tests';
import { newStudentWelcome } from './new-student-welcome';

registerTools([myBrief, mySchedule, myAssignments, myCatchup, myAttendance, mySketchbook, examCountdown, myReviews, getInspirations, newStudentWelcome, myTests]);
