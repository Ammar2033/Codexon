import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import db from '../config/db';
import { AuthRequest } from '../middleware/auth';

export const createApiKey = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  try {
    const key = uuidv4().replace(/-/g, '');
    const keyHash = await bcrypt.hash(key, 10);

    const result = await db.query(
      'INSERT INTO api_keys (user_id, key_hash) VALUES ($1, $2) RETURNING id',
      [userId, keyHash]
    );

    res.status(201).json({
      id: result.rows[0].id,
      key: key,
      message: 'API key created. Store it securely - it will not be shown again.'
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating API key', error });
  }
};

export const getApiKeys = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  try {
    const result = await db.query(
      'SELECT id, created_at FROM api_keys WHERE user_id = $1',
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching API keys', error });
  }
};

export const deleteApiKey = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const result = await db.query(
      'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'API key not found' });
    }

    res.json({ message: 'API key deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting API key', error });
  }
};