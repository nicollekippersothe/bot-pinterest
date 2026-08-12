import { config } from '../config/index.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[(config.logLevel as Level) in LEVELS ? (config.logLevel as Level) : 'info'];

function emit(level: Level, icon: string, message: string, extra: unknown[]): void {
  if (LEVELS[level] < threshold) return;
  const stamp = new Date().toISOString().slice(11, 19);
  const line = `${stamp} ${icon} ${message}`;
  if (level === 'error') console.error(line, ...extra);
  else if (level === 'warn') console.warn(line, ...extra);
  else console.log(line, ...extra);
}

export const logger = {
  debug: (message: string, ...extra: unknown[]) => emit('debug', '·', message, extra),
  info: (message: string, ...extra: unknown[]) => emit('info', 'ℹ', message, extra),
  success: (message: string, ...extra: unknown[]) => emit('info', '✔', message, extra),
  warn: (message: string, ...extra: unknown[]) => emit('warn', '⚠', message, extra),
  error: (message: string, ...extra: unknown[]) => emit('error', '✖', message, extra),
};
