import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '../config/db';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    is_creator: boolean;
  };
  apiKeyId?: string;
}

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

export const apiKeyAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({ message: 'API key required' });
  }

  try {
    const keys = await db.query('SELECT id, user_id, key_hash FROM api_keys');
    
    for (const row of keys.rows) {
      const isMatch = await bcrypt.compare(apiKey, row.key_hash);
      if (isMatch) {
        req.user = { id: row.user_id.toString(), email: '', is_creator: false };
        req.apiKeyId = row.id.toString();
        
        await db.query(
          'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
          [row.id]
        );
        
        return next();
      }
    }
    
    return res.status(401).json({ message: 'Invalid API key' });
  } catch (error) {
    return res.status(500).json({ message: 'Authentication error', error });
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