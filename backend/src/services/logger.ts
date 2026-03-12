import pino from 'pino';
import path from 'path';

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
    level: (label) => {
      return { level: label.toUpperCase() };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'codexon-api',
    version: '1.0.0'
  }
});

export function createChildLogger(service: string, extraFields?: object) {
  return logger.child({ service, ...extraFields });
}

export const metrics = {
  inferenceRequests: 0,
  inferenceErrors: 0,
  activeContainers: 0,
  totalRevenue: 0,
  
  recordRequest() {
    this.inferenceRequests++;
  },
  
  recordError() {
    this.inferenceErrors++;
  },
  
  setActiveContainers(count: number) {
    this.activeContainers = count;
  },
  
  addRevenue(amount: number) {
    this.totalRevenue += amount;
  },
  
  getMetrics() {
    return {
      inferenceRequests: this.inferenceRequests,
      inferenceErrors: this.inferenceErrors,
      errorRate: this.inferenceRequests > 0 ? this.inferenceErrors / this.inferenceRequests : 0,
      activeContainers: this.activeContainers,
      totalRevenue: this.totalRevenue
    };
  }
};

export function formatLogMetadata(req: any, extra?: object) {
  return {
    requestId: req.headers['x-request-id'] || req.headers['x-correlation-id'] || generateRequestId(),
    path: req.path,
    method: req.method,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
    ...extra
  };
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}