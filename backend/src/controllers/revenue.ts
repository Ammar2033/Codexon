import { Response } from 'express';
import db from '../config/db';
import { AuthRequest } from '../middleware/auth';

export const getRevenue = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  try {
    const walletResult = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
    const balance = walletResult.rows[0]?.balance || 0;

    const modelsResult = await db.query(`
      SELECT m.id, m.name, m.status,
             COUNT(ue.id) as total_calls,
             mv.codexon_config->>'billing'->>'price_per_request' as price
      FROM models m
      LEFT JOIN usage_events ue ON m.id = ue.model_id
      LEFT JOIN model_versions mv ON m.id = mv.model_id
      WHERE m.owner_id = $1
      GROUP BY m.id, mv.codexon_config
    `, [userId]);

    const totalCalls = modelsResult.rows.reduce((sum: number, m: any) => sum + parseInt(m.total_calls || 0), 0);
    
    const dailyRevenue = await db.query(`
      SELECT DATE(ue.timestamp) as date, COUNT(*) as calls
      FROM usage_events ue
      JOIN models m ON ue.model_id = m.id
      WHERE m.owner_id = $1 AND ue.timestamp > NOW() - INTERVAL '30 days'
      GROUP BY DATE(ue.timestamp)
      ORDER BY date
    `, [userId]);

    const topModels = modelsResult.rows
      .sort((a: any, b: any) => parseInt(b.total_calls) - parseInt(a.total_calls))
      .slice(0, 5);

    res.json({
      balance: parseFloat(balance),
      totalCalls,
      dailyRevenue: dailyRevenue.rows,
      topModels: topModels.map((m: any) => ({
        id: m.id,
        name: m.name,
        status: m.status,
        calls: parseInt(m.total_calls),
        price: parseFloat(m.price) || 0.002
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching revenue', error });
  }
};

export const getTransactions = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;

  try {
    const walletResult = await db.query('SELECT id FROM wallets WHERE user_id = $1', [userId]);
    if (walletResult.rows.length === 0) {
      return res.json([]);
    }

    const result = await db.query(`
      SELECT t.*, ue.model_id
      FROM transactions t
      LEFT JOIN usage_events ue ON t.related_usage_event = ue.id
      WHERE t.wallet_id = $1
      ORDER BY t.timestamp DESC
      LIMIT 50
    `, [walletResult.rows[0].id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transactions', error });
  }
};