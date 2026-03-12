import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import Redis from 'ioredis';
import db from '../config/db';
import { logger } from '../services/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    is_creator: boolean;
  };
  apiKeyId?: string;
  apiKeyUserId?: number;
}

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  lazy: true
});

const API_KEY_CACHE_TTL = 300;
const API_KEY_CACHE_PREFIX = 'codexon:apikey:';

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const requireCreator = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.is_creator) {
    return res.status(403).json({ message: 'Creator account required' });
  }
  next();
};

async function getApiKeyFromCache(apiKey: string): Promise<{ id: number; user_id: number } | null> {
  try {
    const cached = await redis.get(`${API_KEY_CACHE_PREFIX}${apiKey}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'Redis cache read failed, falling back to DB');
  }
  return null;
}

async function setApiKeyCache(apiKey: string, data: { id: number; user_id: number }): Promise<void> {
  try {
    await redis.setex(`${API_KEY_CACHE_PREFIX}${apiKey}`, API_KEY_CACHE_TTL, JSON.stringify(data));
  } catch (error) {
    logger.warn({ error: (error as Error).message }, 'Redis cache write failed');
  }
}

export const apiKeyAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({ message: 'API key required' });
  }

  try {
    let keyData = await getApiKeyFromCache(apiKey);

    if (!keyData) {
      const result = await db.query(
        'SELECT id, user_id, key_hash FROM api_keys WHERE key_hash = $1',
        [apiKey]
      );

      if (result.rows.length === 0) {
        const hashResult = await db.query('SELECT id, user_id, key_hash FROM api_keys');
        for (const row of hashResult.rows) {
          const isMatch = await bcrypt.compare(apiKey, row.key_hash);
          if (isMatch) {
            keyData = { id: row.id, user_id: row.user_id };
            await setApiKeyCache(apiKey, keyData);
            break;
          }
        }
      } else {
        const row = result.rows[0];
        keyData = { id: row.id, user_id: row.user_id };
        await setApiKeyCache(apiKey, keyData);
      }
    }

    if (!keyData) {
      return res.status(401).json({ message: 'Invalid API key' });
    }

    const userResult = await db.query(
      'SELECT id, email, is_creator FROM users WHERE id = $1',
      [keyData.user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ message: 'User not found for API key' });
    }

    const user = userResult.rows[0];
    req.user = {
      id: user.id.toString(),
      email: user.email,
      is_creator: user.is_creator
    };
    req.apiKeyId = keyData.id.toString();
    req.apiKeyUserId = keyData.user_id;

    await db.query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [keyData.id]
    );

    next();
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'API key authentication error');
    return res.status(500).json({ message: 'Authentication error' });
  }
};

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
    req.user = decoded;
  } catch (error) {
  }
  
  next();
};

export function getUserFromRequest(req: AuthRequest): { userId: number; email: string; isCreator: boolean } | null {
  if (req.apiKeyUserId) {
    return {
      userId: req.apiKeyUserId,
      email: req.user?.email || '',
      isCreator: req.user?.is_creator || false
    };
  }
  if (req.user?.id) {
    return {
      userId: parseInt(req.user.id),
      email: req.user.email,
      isCreator: req.user.is_creator
    };
  }
  return null;
}
