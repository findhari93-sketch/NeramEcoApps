/** Import this, not registry.ts, wherever the full tool list is needed at runtime. */
import '@/lib/assistant/tools/student';
import '@/lib/assistant/tools/actions';
export * from './registry';
