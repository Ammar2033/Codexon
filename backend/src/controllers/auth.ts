import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../config/db';
import { AuthRequest } from '../middleware/auth';

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const userCheck = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, is_creator',
      [email, passwordHash]
    );

    const user = result.rows[0];

    // Create wallet for the user
    await db.query('INSERT INTO wallets (user_id) VALUES ($1)', [user.id]);

    const token = jwt.sign(
      { id: user.id, email: user.email, is_creator: user.is_creator },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, is_creator: user.is_creator },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, email: user.email, is_creator: user.is_creator } });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;

    try {
      const result = await db.query('SELECT id, email, is_creator, created_at FROM users WHERE id = $1', [userId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json({ user: result.rows[0] });
    } catch (error) {
      res.status(500).json({ message: 'Error fetching user profile', error });
    }
};

export const logout = async (req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
};
