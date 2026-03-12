import pino from 'pino';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: logLevel,
  transport: isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  },
  formatters: {
    level: (label) => ({ level: label.toUpperCase() })
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'codexon-runtime',
    version: '1.0.0'
  }
});

export function createChildLogger(service: string) {
  return logger.child({ service });
}