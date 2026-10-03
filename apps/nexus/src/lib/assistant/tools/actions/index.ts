import { registerTools } from '@/lib/assistant/registry';
import { addSketch } from './add-sketch';
import { declareAway } from './declare-away-window';
import { declineClass } from './decline-class';
import { setReminder } from './set-reminder';

registerTools([declineClass, declareAway, setReminder, addSketch] as never[]);
