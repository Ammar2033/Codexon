import db from '../config/db';
import { logger } from './logger';

export interface ModelVersion {
  id: string;
  modelId: string;
  version: string;
  storagePath: string;
  codexonConfig: any;
  status: 'active' | 'staging' | 'archived' | 'deprecated';
  isDefault: boolean;
  createdAt: Date;
  deployedAt?: Date;
}

export async function createModelVersion(
  modelId: string,
  version: string,
  storagePath: string,
  codexonConfig: any
): Promise<ModelVersion> {
  const existingVersions = await db.query(
    'SELECT COUNT(*) as count FROM model_versions WHERE model_id = $1',
    [modelId]
  );
  
  const isFirst = parseInt(existingVersions.rows[0].count) === 0;
  
  const result = await db.query(
    `INSERT INTO model_versions (model_id, version, storage_path, codexon_config, status, is_default) 
     VALUES ($1, $2, $3, $4, $5, $6) 
     RETURNING *`,
    [modelId, version, storagePath, codexonConfig, isFirst ? 'active' : 'staging', isFirst]
  );
  
  logger.info({ modelId, version }, 'Model version created');
  
  return result.rows[0];
}

export async function getModelVersions(modelId: string): Promise<ModelVersion[]> {
  const result = await db.query(
    `SELECT * FROM model_versions WHERE model_id = $1 ORDER BY created_at DESC`,
    [modelId]
  );
  
  return result.rows;
}

export async function getActiveVersion(modelId: string): Promise<ModelVersion | null> {
  const result = await db.query(
    `SELECT * FROM model_versions WHERE model_id = $1 AND status = 'active' LIMIT 1`,
    [modelId]
  );
  
  return result.rows[0] || null;
}

export async function setActiveVersion(modelId: string, versionId: string): Promise<void> {
  const versionCheck = await db.query(
    'SELECT * FROM model_versions WHERE id = $1 AND model_id = $2',
    [versionId, modelId]
  );
  
  if (versionCheck.rows.length === 0) {
    throw new Error('Version not found');
  }
  
  await db.query(
    `UPDATE model_versions SET status = 'archived' WHERE model_id = $1 AND status = 'active'`,
    [modelId]
  );
  
  await db.query(
    `UPDATE model_versions SET status = 'active', is_default = true, deployed_at = NOW() WHERE id = $1`,
    [versionId]
  );
  
  logger.info({ modelId, versionId }, 'Active version updated');
}

export async function deprecateVersion(modelId: string, versionId: string): Promise<void> {
  await db.query(
    `UPDATE model_versions SET status = 'deprecated' WHERE id = $1 AND model_id = $2`,
    [versionId, modelId]
  );
  
  logger.info({ modelId, versionId }, 'Version deprecated');
}

export async function archiveVersion(modelId: string, versionId: string): Promise<void> {
  await db.query(
    `UPDATE model_versions SET status = 'archived' WHERE id = $1 AND model_id = $2`,
    [versionId, modelId]
  );
  
  logger.info({ modelId, versionId }, 'Version archived');
}

export async function rollbackToVersion(modelId: string, versionId: string): Promise<void> {
  const versionCheck = await db.query(
    'SELECT * FROM model_versions WHERE id = $1 AND model_id = $2 AND status = \'archived\'',
    [versionId, modelId]
  );
  
  if (versionCheck.rows.length === 0) {
    throw new Error('Can only rollback to archived versions');
  }
  
  const currentActive = await db.query(
    'SELECT id FROM model_versions WHERE model_id = $1 AND status = \'active\'',
    [modelId]
  );
  
  if (currentActive.rows.length > 0) {
    await db.query(
      `UPDATE model_versions SET status = 'archived' WHERE id = $1`,
      [currentActive.rows[0].id]
    );
  }
  
  await db.query(
    `UPDATE model_versions SET status = 'active', is_default = true, deployed_at = NOW() WHERE id = $1`,
    [versionId]
  );
  
  logger.info({ modelId, versionId }, 'Rolled back to version');
}

export async function deleteVersion(modelId: string, versionId: string): Promise<void> {
  const versionCheck = await db.query(
    'SELECT * FROM model_versions WHERE id = $1 AND model_id = $2',
    [versionId, modelId]
  );
  
  if (versionCheck.rows.length === 0) {
    throw new Error('Version not found');
  }
  
  if (versionCheck.rows[0].status === 'active') {
    throw new Error('Cannot delete active version. Set another version as active first.');
  }
  
  await db.query(
    'DELETE FROM model_versions WHERE id = $1 AND model_id = $2',
    [versionId, modelId]
  );
  
  logger.info({ modelId, versionId }, 'Version deleted');
}

export async function getVersionStats(modelId: string): Promise<{
  totalVersions: number;
  active: number;
  staging: number;
  archived: number;
  deprecated: number;
}> {
  const result = await db.query(
    `SELECT 
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'active') as active,
       COUNT(*) FILTER (WHERE status = 'staging') as staging,
       COUNT(*) FILTER (WHERE status = 'archived') as archived,
       COUNT(*) FILTER (WHERE status = 'deprecated') as deprecated
     FROM model_versions WHERE model_id = $1`,
    [modelId]
  );
  
  const row = result.rows[0];
  return {
    totalVersions: parseInt(row.total),
    active: parseInt(row.active),
    staging: parseInt(row.staging),
    archived: parseInt(row.archived),
    deprecated: parseInt(row.deprecated)
  };
}