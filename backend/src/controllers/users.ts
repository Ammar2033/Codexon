import { Response } from 'express';
import db from '../config/db';
import { AuthRequest } from '../middleware/auth';

export const becomeCreator = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  try {
    await db.query('UPDATE users SET is_creator = TRUE WHERE id = $1', [userId]);
    res.json({ message: 'User is now a creator' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user status', error });
  }
};
