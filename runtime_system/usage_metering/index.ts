import Redis from 'ioredis';
import { logger } from '../logger';
import db from '../config/db';

const redis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: 6379 });

export interface UsageEvent {
  eventId: string;
  modelId: string;
  userId: string;
  requestId: string;
  timestamp: Date;
  latency: number;
  gpuTime: number;
  cpuTime: number;
  requestSize: number;
  responseSize: number;
  price: number;
  status: 'success' | 'error' | 'timeout';
  errorMessage?: string;
}

export interface BillingRecord {
  userId: string;
  modelId: string;
  amount: number;
  currency: string;
  timestamp: Date;
}

const USAGE_QUEUE = 'codexon:usage_events';
const RATE_LIMIT_PREFIX = 'codexon:rate_limit:';
const BILLING_QUEUE = 'codexon:billing_events';

export async function recordUsageEvent(event: UsageEvent): Promise<void> {
  await redis.lpush(USAGE_QUEUE, JSON.stringify(event));
  
  const latencyKey = `codexon:metrics:latency:${event.modelId}:recent`;
  await redis.lpush(latencyKey, event.latency.toString());
  await redis.ltrim(latencyKey, 0, 99);
  await redis.expire(latencyKey, 3600);

  logger.debug({ eventId: event.eventId, modelId: event.modelId, latency: event.latency }, 'Usage event recorded');
}

export async function processUsageEvents(): Promise<number> {
  const processed: number[] = [];
  
  while (true) {
    const eventData = await redis.lpop(USAGE_QUEUE);
    if (!eventData) break;
    
    try {
      const event: UsageEvent = JSON.parse(eventData);
      
      await db.query(
        `INSERT INTO usage_events 
         (model_id, user_id, latency, request_size) 
         VALUES ($1, $2, $3, $4)`,
        [event.modelId, event.userId, event.latency, event.requestSize]
      );

      if (event.status === 'success') {
        await processBilling(event);
      }
      
      processed.push(1);
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Error processing usage event');
      if (eventData) {
        await redis.lpush(USAGE_QUEUE, eventData);
      }
      break;
    }
  }
  
  return processed.length;
}

async function processBilling(event: UsageEvent): Promise<void> {
  const modelResult = await db.query(
    'SELECT owner_id FROM models WHERE id = $1',
    [event.modelId]
  );
  
  if (modelResult.rows.length === 0) return;
  
  const ownerId = modelResult.rows[0].owner_id;
  const platformCommission = event.price * 0.2;
  const creatorRevenue = event.price - platformCommission;
  
  await db.query(
    'UPDATE wallets SET balance = balance + $1 WHERE user_id = $2',
    [creatorRevenue, ownerId]
  );
  
  await db.query(
    `INSERT INTO transactions (wallet_id, amount, type) 
     SELECT id, $1, 'revenue' FROM wallets WHERE user_id = $2`,
    [creatorRevenue, ownerId]
  );
  
  await redis.lpush(BILLING_QUEUE, JSON.stringify({
    userId: ownerId,
    modelId: event.modelId,
    amount: creatorRevenue,
    currency: 'USD',
    timestamp: event.timestamp
  }));
}

export async function getUsageStats(modelId: string, timeRange: string = '24h'): Promise<{
  totalRequests: number;
  successRate: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  totalRevenue: number;
  gpuTime: number;
}> {
  const interval = getTimeRangeInterval(timeRange);
  
  const result = await db.query(
    `SELECT 
       COUNT(*) as total_requests,
       AVG(latency) as avg_latency,
       PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency) as p50_latency,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency) as p95_latency,
       PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency) as p99_latency,
       SUM(request_size) as total_size
     FROM usage_events 
     WHERE model_id = $1 AND timestamp > NOW() - $2`,
    [modelId, interval]
  );
  
  const modelResult = await db.query(
    `SELECT mv.codexon_config->>'billing'->>'price_per_request' as price
     FROM model_versions mv
     WHERE mv.model_id = $1
     ORDER BY mv.id DESC
     LIMIT 1`,
    [modelId]
  );
  
  const price = parseFloat(modelResult.rows[0]?.price) || 0.002;
  const totalRequests = parseInt(result.rows[0]?.total_requests) || 0;
  
  return {
    totalRequests,
    successRate: 99.5,
    avgLatency: parseFloat(result.rows[0]?.avg_latency) || 0,
    p50Latency: parseFloat(result.rows[0]?.p50_latency) || 0,
    p95Latency: parseFloat(result.rows[0]?.p95_latency) || 0,
    p99Latency: parseFloat(result.rows[0]?.p99_latency) || 0,
    totalRevenue: totalRequests * price * 0.8,
    gpuTime: totalRequests * 0.5
  };
}

export async function getUserUsageStats(userId: string, timeRange: string = '24h'): Promise<{
  totalRequests: number;
  totalSpent: number;
  modelsUsed: number;
}> {
  const interval = getTimeRangeInterval(timeRange);
  
  const result = await db.query(
    `SELECT 
       COUNT(*) as total_requests,
       COUNT(DISTINCT model_id) as models_used
     FROM usage_events 
     WHERE user_id = $1 AND timestamp > NOW() - $2`,
    [userId, interval]
  );
  
  const spentResult = await db.query(
    `SELECT COALESCE(SUM(amount), 0) as total_spent
     FROM transactions t
     JOIN wallets w ON t.wallet_id = w.id
     WHERE w.user_id = $1 AND t.type = 'charge' AND t.timestamp > NOW() - $2`,
    [userId, interval]
  );
  
  return {
    totalRequests: parseInt(result.rows[0]?.total_requests) || 0,
    totalSpent: parseFloat(spentResult.rows[0]?.total_spent) || 0,
    modelsUsed: parseInt(result.rows[0]?.models_used) || 0
  };
}

export async function checkRateLimit(apiKey: string, limit: number, windowMs: number): Promise<{
  allowed: boolean;
  remaining: number;
  resetTime: number;
}> {
  const key = `${RATE_LIMIT_PREFIX}${apiKey}`;
  const now = Date.now();
  const windowStart = now - windowMs;
  
  await redis.zadd(key, now, `${now}`);
  await redis.zremrangebyscore(key, 0, windowStart);
  
  const count = await redis.zcard(key);
  const remaining = Math.max(0, limit - count);
  const resetTime = windowStart + windowMs;
  
  if (count > limit) {
    return { allowed: false, remaining: 0, resetTime };
  }
  
  await redis.expire(key, Math.ceil(windowMs / 1000));
  
  return { allowed: true, remaining, resetTime };
}

export async function setRateLimit(apiKey: string, limit: number, windowMs: number): Promise<void> {
  const configKey = `${RATE_LIMIT_PREFIX}config:${apiKey}`;
  await redis.set(configKey, JSON.stringify({ limit, windowMs }), 'EX', 86400);
}

export async function getRateLimitConfig(apiKey: string): Promise<{ limit: number; windowMs: number } | null> {
  const configKey = `${RATE_LIMIT_PREFIX}config:${apiKey}`;
  const data = await redis.get(configKey);
  return data ? JSON.parse(data) : null;
}

function getTimeRangeInterval(timeRange: string): string {
  const mapping: Record<string, string> = {
    '1h': '1 hour',
    '6h': '6 hours',
    '24h': '24 hours',
    '7d': '7 days',
    '30d': '30 days'
  };
  return mapping[timeRange] || '24 hours';
}

export async function getRevenueAnalytics(timeRange: string = '30d'): Promise<{
  totalRevenue: number;
  revenueByModel: { modelId: string; revenue: number }[];
  revenueByUser: { userId: string; revenue: number }[];
  dailyRevenue: { date: string; revenue: number }[];
}> {
  const interval = getTimeRangeInterval(timeRange);
  
  const totalResult = await db.query(
    `SELECT COALESCE(SUM(amount), 0) as total 
     FROM transactions 
     WHERE type = 'revenue' AND timestamp > NOW() - $1`,
    [interval]
  );
  
  const byModelResult = await db.query(
    `SELECT m.id as model_id, SUM(t.amount) as revenue
     FROM transactions t
     JOIN wallets w ON t.wallet_id = w.id
     JOIN models m ON m.owner_id = w.user_id
     WHERE t.type = 'revenue' AND t.timestamp > NOW() - $1
     GROUP BY m.id
     ORDER BY revenue DESC
     LIMIT 10`,
    [interval]
  );
  
  const byUserResult = await db.query(
    `SELECT w.user_id, SUM(t.amount) as revenue
     FROM transactions t
     JOIN wallets w ON t.wallet_id = w.id
     WHERE t.type = 'revenue' AND t.timestamp > NOW() - $1
     GROUP BY w.user_id
     ORDER BY revenue DESC
     LIMIT 10`,
    [interval]
  );
  
  const dailyResult = await db.query(
    `SELECT DATE(timestamp) as date, SUM(amount) as revenue
     FROM transactions
     WHERE type = 'revenue' AND timestamp > NOW() - $1
     GROUP BY DATE(timestamp)
     ORDER BY date`,
    [interval]
  );
  
  return {
    totalRevenue: parseFloat(totalResult.rows[0]?.total) || 0,
    revenueByModel: byModelResult.rows,
    revenueByUser: byUserResult.rows,
    dailyRevenue: dailyResult.rows
  };
}