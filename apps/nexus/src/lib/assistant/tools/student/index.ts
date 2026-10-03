import { registerTools } from '@/lib/assistant/registry';
import { examCountdown } from './exam-countdown';
import { myAssignments } from './my-assignments';
import { myAttendance } from './my-attendance';
import { myBrief } from './my-brief';
import { myCatchup } from './my-catchup';
import { mySchedule } from './my-schedule';
import { mySketchbook } from './my-sketchbook';

registerTools([myBrief, mySchedule, myAssignments, myCatchup, myAttendance, mySketchbook, examCountdown]);
