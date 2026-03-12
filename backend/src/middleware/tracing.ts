import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

declare global {
  namespace Express {
    interface Request {
      traceId?: string;
      spanId?: string;
      parentSpanId?: string;
      startTime?: number;
    }
  }
}

const TRACE_ID_HEADER = 'x-trace-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';
const SPAN_ID_HEADER = 'x-span-id';

export function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId = req.headers[TRACE_ID_HEADER] as string || 
                   req.headers[CORRELATION_ID_HEADER] as string || 
                   uuidv4();
  
  const spanId = uuidv4().substring(0, 16);
  
  req.traceId = traceId;
  req.spanId = spanId;
  req.startTime = Date.now();
  
  res.setHeader(TRACE_ID_HEADER, traceId);
  res.setHeader(SPAN_ID_HEADER, spanId);
  
  const originalSend = res.send;
  res.send = function(body?: any): Response {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    
    logger.info({
      traceId,
      spanId,
      path: req.path,
      method: req.method,
      statusCode: res.statusCode,
      duration
    }, 'Request completed');
    
    return originalSend.call(this, body);
  };
  
  next();
}

export function createSpan(name: string, traceId?: string, parentSpanId?: string) {
  const spanId = uuidv4().substring(0, 16);
  
  return {
    name,
    traceId: traceId || uuidv4(),
    spanId,
    parentSpanId,
    startTime: Date.now(),
    
    end(success: boolean = true) {
      const duration = Date.now() - this.startTime;
      
      logger.info({
        traceId: this.traceId,
        spanId: this.spanId,
        parentSpanId: this.parentSpanId,
        spanName: this.name,
        duration,
        success
      }, `Span ${this.name} completed`);
      
      return duration;
    },
    
    setError(error: Error) {
      logger.error({
        traceId: this.traceId,
        spanId: this.spanId,
        spanName: this.name,
        error: error.message,
        stack: error.stack
      }, `Span ${this.name} error`);
    }
  };
}

export async function withTracing<T>(
  name: string,
  fn: (span: any) => Promise<T>,
  traceId?: string,
  parentSpanId?: string
): Promise<T> {
  const span = createSpan(name, traceId, parentSpanId);
  
  try {
    const result = await fn(span);
    span.end(true);
    return result;
  } catch (error) {
    span.setError(error as Error);
    span.end(false);
    throw error;
  }
}

export function extractTraceContext(req: Request): {
  traceId: string | undefined;
  spanId: string | undefined;
  parentSpanId: string | undefined;
} {
  return {
    traceId: req.headers[TRACE_ID_HEADER] as string || req.traceId,
    spanId: req.spanId,
    parentSpanId: req.headers[SPAN_ID_HEADER] as string
  };
}

export function injectTraceContext(obj: any, req?: Request): any {
  const traceId = req?.traceId || obj.traceId || uuidv4();
  const spanId = req?.spanId || uuidv4().substring(0, 16);
  
  return {
    ...obj,
    traceId,
    spanId,
    'x-trace-id': traceId,
    'x-span-id': spanId
  };
}
