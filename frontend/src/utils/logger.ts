const isDev = import.meta.env.DEV;

export const logger = {
  info: (...args: unknown[]): void => {
    if (isDev) console.info('[GitRSS]', ...args);
  },
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn('[GitRSS]', ...args);
  },
  error: (...args: unknown[]): void => {
    //always log no matter environment
    // errors should be visible in prodction too
    console.error('[GitRSS]', ...args);
  },
};
