function formatMessage(level: 'INFO' | 'WARN' | 'ERROR', message: string, details?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const detailSuffix = details ? ` ${JSON.stringify(details)}` : '';
  return `[${timestamp}] [${level}] ${message}${detailSuffix}`;
}

export const logger = {
  info(message: string, details?: Record<string, unknown>): void {
    console.log(formatMessage('INFO', message, details));
  },
  warn(message: string, details?: Record<string, unknown>): void {
    console.warn(formatMessage('WARN', message, details));
  },
  error(message: string, details?: Record<string, unknown>): void {
    console.error(formatMessage('ERROR', message, details));
  },
};