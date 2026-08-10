/**
 * Environment-aware logging.
 *
 * Vercel bills one observability event per emitted log line, so an
 * unconditional console.log on a request path is a recurring charge, not a free
 * diagnostic. A single pretty-printed object (`JSON.stringify(x, null, 2)`) can
 * bill dozens of events for one request.
 *
 * The split:
 *   debug / info  development only, silenced in production
 *   warn / error  always emitted, in every environment
 *
 * Error reporting is never suppressed. If something is worth waking somebody up
 * for, it is worth the event.
 *
 * Prefer passing values as extra arguments over interpolating them into the
 * message, and never pass a pretty-printed blob: `log.debug('payload', obj)`
 * stays one line, `JSON.stringify(obj, null, 2)` becomes one line per field.
 */

const isProduction = process.env.NODE_ENV === 'production';

export interface Logger {
  /** Verbose tracing. Development only. */
  debug: (...args: unknown[]) => void;
  /** Routine progress and success messages. Development only. */
  info: (...args: unknown[]) => void;
  /** Recoverable problems. Always emitted. */
  warn: (...args: unknown[]) => void;
  /** Failures. Always emitted. */
  error: (...args: unknown[]) => void;
}

export const log: Logger = {
  debug: (...args) => {
    if (!isProduction) console.debug(...args);
  },
  info: (...args) => {
    if (!isProduction) console.info(...args);
  },
  warn: (...args) => {
    console.warn(...args);
  },
  error: (...args) => {
    console.error(...args);
  },
};

/**
 * A logger that prefixes every line with a fixed tag, e.g.
 * `createLogger('[Application API]')`.
 */
export function createLogger(prefix: string): Logger {
  return {
    debug: (...args) => log.debug(prefix, ...args),
    info: (...args) => log.info(prefix, ...args),
    warn: (...args) => log.warn(prefix, ...args),
    error: (...args) => log.error(prefix, ...args),
  };
}
