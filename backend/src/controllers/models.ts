import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import db from '../config/db';
import { AuthRequest } from '../middleware/auth';
import { logger, metrics } from '../services/logger';
import { buildAndStartContainer, stopContainer, removeContainer, restartContainer, getContainerStatus, getContainerLogs } from '../services/docker';
import { validateModelPackage, parseAndValidateManifest, validateAppPy, validateRequirementsTxt, CodexonManifest } from '../services/validator';
import { addInferenceJob, getQueueStats, getJobHistory } from '../services/queue';

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '../../../storage');
const MODEL_RUNTIME_PORT_BASE = 9000;

export const uploadModel = async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const userId = req.user?.id;
  const tempPath = req.file.path;
  const modelId = uuidv4();
  const version = '1.0';
  const uploadDir = path.join(STORAGE_PATH, 'models', modelId, version);

  try {
    fs.mkdirSync(uploadDir, { recursive: true });

    logger.info({ modelId, userId }, 'Extracting model package');
    const zip = new AdmZip(tempPath);
    zip.extractAllTo(uploadDir, true);

    logger.info({ modelId }, 'Validating model package');
    const packageValidation = validateModelPackage(uploadDir);
    if (!packageValidation.valid) {
      fs.rmSync(path.join(STORAGE_PATH, 'models', modelId), { recursive: true, force: true });
      fs.unlinkSync(tempPath);
      return res.status(400).json({ 
        message: 'Invalid model package', 
        errors: packageValidation.errors 
      });
    }

    const warnings = packageValidation.warnings;

    const manifestPath = path.join(uploadDir, 'aimodel.codexon');
    const { config: codexonConfig, error: manifestError } = parseAndValidateManifest(manifestPath);
    
    if (manifestError || !codexonConfig) {
      fs.rmSync(path.join(STORAGE_PATH, 'models', modelId), { recursive: true, force: true });
      fs.unlinkSync(tempPath);
      return res.status(400).json({ 
        message: 'Invalid .codexon manifest', 
        error: manifestError 
      });
    }

    const appValidation = validateAppPy(path.join(uploadDir, 'app.py'));
    warnings.push(...appValidation.warnings);

    const reqValidation = validateRequirementsTxt(path.join(uploadDir, 'requirements.txt'));
    warnings.push(...reqValidation.warnings);

    await db.query('BEGIN');

    const modelResult = await db.query(
      'INSERT INTO models (id, owner_id, name, description, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [modelId, userId, codexonConfig.model.name, codexonConfig.model.description, 'draft']
    );

    const versionResult = await db.query(
      'INSERT INTO model_versions (model_id, version, storage_path, codexon_config, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [modelId, version, uploadDir, codexonConfig, 'draft']
    );

    await db.query('COMMIT');

    fs.unlinkSync(tempPath);

    logger.info({ modelId, name: codexonConfig.model.name }, 'Model uploaded successfully');

    res.status(201).json({
      message: 'Model uploaded successfully',
      model: modelResult.rows[0],
      version: versionResult.rows[0],
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (error) {
    await db.query('ROLLBACK');
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(path.join(STORAGE_PATH, 'models', modelId), { recursive: true, force: true });
    }
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    logger.error({ modelId, error: (error as Error).message }, 'Error uploading model');
    res.status(500).json({ message: 'Error uploading model', error: (error as Error).message });
  }
};

export const getMyModels = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  try {
    const result = await db.query(`
      SELECT m.*, mv.codexon_config->>'billing'->>'price_per_request' as price,
             mv.codexon_config->>'runtime'->>'framework' as framework
      FROM models m 
      LEFT JOIN LATERAL (
        SELECT mv.codexon_config 
        FROM model_versions mv 
        WHERE mv.model_id = m.id 
        ORDER BY mv.id DESC 
        LIMIT 1
      ) mv ON true
      WHERE m.owner_id = $1
      ORDER BY m.created_at DESC
    `, [userId]);

    const models = result.rows.map(m => ({
      ...m,
      price: parseFloat(m.price) || 0.002,
      framework: m.framework || 'onnx'
    }));

    res.json(models);
  } catch (error) {
    logger.error({ userId, error: (error as Error).message }, 'Error fetching models');
    res.status(500).json({ message: 'Error fetching models', error: (error as Error).message });
  }
};

export const getModelDetails = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const modelResult = await db.query('SELECT * FROM models WHERE id = $1', [id]);
    if (modelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Model not found' });
    }

    const versionsResult = await db.query(
      'SELECT * FROM model_versions WHERE model_id = $1 ORDER BY id DESC',
      [id]
    );

    const config = versionsResult.rows[0]?.codexon_config;
    const price = config?.billing?.price_per_request || 0.002;
    const endpoint = config?.api?.endpoint || '/predict';

    const containerInfo = await getContainerStatus(id);

    res.json({
      model: modelResult.rows[0],
      versions: versionsResult.rows,
      config,
      price,
      endpoint,
      container: containerInfo ? {
        status: containerInfo.status,
        port: containerInfo.port,
        containerId: containerInfo.containerId
      } : null
    });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error fetching model details');
    res.status(500).json({ message: 'Error fetching model details', error: (error as Error).message });
  }
};

export const getMarketplaceModels = async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT m.*, u.email as owner_email, 
             mv.codexon_config->>'billing'->>'price_per_request' as price,
             mv.codexon_config->>'api'->>'endpoint' as endpoint,
             mv.codexon_config->>'model'->>'description' as description
      FROM models m
      JOIN users u ON m.owner_id = u.id
      JOIN LATERAL (
        SELECT mv.codexon_config 
        FROM model_versions mv 
        WHERE mv.model_id = m.id 
        ORDER BY mv.id DESC 
        LIMIT 1
      ) mv ON true
      WHERE m.status = 'published'
      ORDER BY m.created_at DESC
    `);
    
    res.json(result.rows.map(m => ({
      ...m,
      price: parseFloat(m.price) || 0.002
    })));
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Error fetching marketplace models');
    res.status(500).json({ message: 'Error fetching marketplace models', error: (error as Error).message });
  }
};

export const deployModel = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const modelResult = await db.query(
      'SELECT * FROM models WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    
    if (modelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Model not found or you are not the owner' });
    }

    const versionResult = await db.query(
      'SELECT * FROM model_versions WHERE model_id = $1 ORDER BY id DESC LIMIT 1',
      [id]
    );

    const config = versionResult.rows[0].codexon_config as CodexonManifest;
    const storagePath = versionResult.rows[0].storage_path;

    const existingContainer = await getContainerStatus(id);
    if (existingContainer && existingContainer.status === 'running') {
      return res.status(400).json({ 
        message: 'Model is already deployed',
        container: existingContainer
      });
    }

    logger.info({ modelId: id }, 'Building and starting container');
    
    const containerInfo = await buildAndStartContainer({
      modelId: id,
      modelVersion: versionResult.rows[0].version,
      storagePath,
      codexonConfig: config,
      port: MODEL_RUNTIME_PORT_BASE + Math.floor(Math.random() * 1000)
    });

    await db.query(
      'UPDATE models SET status = $1 WHERE id = $2',
      ['deployed', id]
    );
    
    await db.query(
      'UPDATE model_versions SET status = $1 WHERE model_id = $2',
      ['deployed', id]
    );

    metrics.setActiveContainers((await getQueueStats()).active);

    logger.info({ modelId: id, containerId: containerInfo.containerId }, 'Model deployed successfully');

    res.json({ 
      message: 'Model deployed successfully',
      container: {
        id: containerInfo.containerId,
        port: containerInfo.port,
        status: containerInfo.status,
        endpoint: `http://localhost:${containerInfo.port}/predict`
      }
    });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error deploying model');
    res.status(500).json({ message: 'Error deploying model', error: (error as Error).message });
  }
};

export const publishModel = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const modelResult = await db.query(
      'SELECT * FROM models WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    
    if (modelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Model not found or you are not the owner' });
    }

    const containerInfo = await getContainerStatus(id);
    if (!containerInfo || containerInfo.status !== 'running') {
      return res.status(400).json({ message: 'Model must be deployed and running before publishing' });
    }

    await db.query(
      'UPDATE models SET status = $1 WHERE id = $2',
      ['published', id]
    );
    
    await db.query(
      'UPDATE model_versions SET status = $1 WHERE model_id = $2',
      ['published', id]
    );

    logger.info({ modelId: id }, 'Model published successfully');

    res.json({ message: 'Model published successfully' });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error publishing model');
    res.status(500).json({ message: 'Error publishing model', error: (error as Error).message });
  }
};

export const testModel = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { input } = req.body;
  const userId = req.user?.id;

  try {
    const modelResult = await db.query(
      'SELECT * FROM models WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    
    if (modelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Model not found or you are not the owner' });
    }

    const versionResult = await db.query(
      'SELECT storage_path FROM model_versions WHERE model_id = $1',
      [id]
    );
    
    const storagePath = versionResult.rows[0].storage_path;
    const testPyPath = path.join(storagePath, 'test.py');
    const appPyPath = path.join(storagePath, 'app.py');

    const logs: string[] = [];

    if (fs.existsSync(testPyPath)) {
      logger.info({ modelId: id }, 'Running test.py');
      
      return new Promise<void>((resolve) => {
        const proc = spawn('python', [testPyPath], {
          cwd: storagePath,
          env: { ...process.env, PYTHONPATH: storagePath }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        proc.on('close', (code) => {
          logs.push(`test.py exited with code ${code}`);
          if (stdout) logs.push(`STDOUT:\n${stdout}`);
          if (stderr) logs.push(`STDERR:\n${stderr}`);

          res.json({
            testType: 'test.py',
            exitCode: code,
            logs: logs.join('\n'),
            passed: code === 0
          });
          resolve();
        });

        proc.on('error', (error) => {
          logs.push(`Error running test.py: ${error.message}`);
          res.json({
            testType: 'test.py',
            error: error.message,
            logs: logs.join('\n'),
            passed: false
          });
          resolve();
        });
      });
    }

    if (fs.existsSync(appPyPath)) {
      logger.info({ modelId: id }, 'Testing model via API');
      
      const containerInfo = await getContainerStatus(id);
      if (!containerInfo || containerInfo.status !== 'running') {
        return res.status(400).json({ message: 'Model must be deployed to test via API' });
      }

      try {
        const axios = require('axios');
        const baseUrl = process.env.MODEL_RUNTIME_BASE_URL || 'http://localhost';
        const response = await axios.post(
          `${baseUrl}:${containerInfo.port}/predict`,
          { input: input || { test: true } },
          { timeout: 30000 }
        );

        logs.push(`API test successful`);
        logs.push(`Response: ${JSON.stringify(response.data, null, 2)}`);

        res.json({
          testType: 'api',
          logs: logs.join('\n'),
          result: response.data,
          passed: true
        });
      } catch (error) {
        logs.push(`API test failed: ${(error as Error).message}`);
        res.json({
          testType: 'api',
          logs: logs.join('\n'),
          error: (error as Error).message,
          passed: false
        });
      }
    }

    res.status(400).json({ message: 'No test.py or app.py found' });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error testing model');
    res.status(500).json({ message: 'Error testing model', error: (error as Error).message });
  }
};

export const runInference = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const body = req.body;
  const userId = req.user?.id;

  try {
    const modelResult = await db.query(
      'SELECT * FROM models WHERE id = $1',
      [id]
    );
    
    if (modelResult.rows.length === 0 || modelResult.rows[0].status !== 'published') {
      return res.status(404).json({ message: 'Model not found or not published' });
    }

    const versionResult = await db.query(
      'SELECT codexon_config FROM model_versions WHERE model_id = $1',
      [id]
    );
    
    const config = versionResult.rows[0].codexon_config as CodexonManifest;
    const price = parseFloat(config?.billing?.price_per_request) || 0.002;

    const job = await addInferenceJob({
      modelId: id,
      userId: userId!,
      input: body,
      apiKeyId: req.apiKeyId || 'unknown'
    });

    logger.info({ modelId: id, jobId: job.id }, 'Inference job queued');

    res.json({
      message: 'Inference request queued',
      jobId: job.id,
      status: 'processing',
      price
    });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error queuing inference');
    res.status(500).json({ message: 'Error processing inference request', error: (error as Error).message });
  }
};

export const getInferenceStatus = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { jobId } = req.query;

  try {
    const job = await import('bullmq').then(m => 
      m.Queue.prototype?.getJob?.call(null, jobId as string)
    );

    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress();

    res.json({
      jobId: job.id,
      status: state,
      progress,
      result: state === 'completed' ? job.returnvalue : undefined,
      failed: state === 'failed' ? job.failedReason : undefined
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Error getting inference status');
    res.status(500).json({ message: 'Error getting inference status', error: (error as Error).message });
  }
};

export const getModelUsage = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const modelResult = await db.query(
      'SELECT * FROM models WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    
    if (modelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Model not found or you are not the owner' });
    }

    const usageResult = await db.query(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as requests,
        AVG(latency)::integer as avg_latency,
        SUM(request_size) as total_size
      FROM usage_events 
      WHERE model_id = $1 
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
      LIMIT 30
    `, [id]);

    const totalResult = await db.query(`
      SELECT 
        COUNT(*) as total_requests,
        AVG(latency)::integer as avg_latency,
        SUM(request_size) as total_size
      FROM usage_events 
      WHERE model_id = $1
    `, [id]);

    const versionResult = await db.query(
      'SELECT codexon_config FROM model_versions WHERE model_id = $1',
      [id]
    );
    
    const price = parseFloat(versionResult.rows[0]?.codexon_config?.billing?.price_per_request) || 0.002;
    const totalRequests = parseInt(totalResult.rows[0]?.total_requests) || 0;
    const estimatedRevenue = totalRequests * price * 0.8;

    const queueStats = await getQueueStats();

    res.json({
      daily: usageResult.rows,
      total: {
        requests: totalRequests,
        avgLatency: parseInt(totalResult.rows[0]?.avg_latency) || 0,
        totalSize: parseInt(totalResult.rows[0]?.total_size) || 0,
        estimatedRevenue,
        pricePerRequest: price
      },
      queue: queueStats
    });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error fetching usage');
    res.status(500).json({ message: 'Error fetching usage', error: (error as Error).message });
  }
};

export const getModelLogs = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { tail } = req.query;
  const userId = req.user?.id;

  try {
    const modelResult = await db.query(
      'SELECT * FROM models WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    
    if (modelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Model not found or you are not the owner' });
    }

    const logs = await getContainerLogs(id, parseInt(tail as string) || 100);
    res.json({ logs });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error fetching logs');
    res.status(500).json({ message: 'Error fetching logs', error: (error as Error).message });
  }
};

export const stopModel = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const modelResult = await db.query(
      'SELECT * FROM models WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    
    if (modelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Model not found or you are not the owner' });
    }

    await stopContainer(id);
    
    await db.query(
      'UPDATE models SET status = $1 WHERE id = $2',
      ['deployed', id]
    );

    res.json({ message: 'Model stopped successfully' });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error stopping model');
    res.status(500).json({ message: 'Error stopping model', error: (error as Error).message });
  }
};

export const restartModel = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const modelResult = await db.query(
      'SELECT * FROM models WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    
    if (modelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Model not found or you are not the owner' });
    }

    await restartContainer(id);
    res.json({ message: 'Model restarted successfully' });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error restarting model');
    res.status(500).json({ message: 'Error restarting model', error: (error as Error).message });
  }
};

export const deleteModel = async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
    const modelResult = await db.query(
      'SELECT * FROM models WHERE id = $1 AND owner_id = $2',
      [id, userId]
    );
    
    if (modelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Model not found or you are not the owner' });
    }

    try {
      await removeContainer(id);
    } catch (e) {}

    await db.query('DELETE FROM model_versions WHERE model_id = $1', [id]);
    await db.query('DELETE FROM models WHERE id = $1', [id]);

    const storageDir = path.join(STORAGE_PATH, 'models', id);
    if (fs.existsSync(storageDir)) {
      fs.rmSync(storageDir, { recursive: true, force: true });
    }

    res.json({ message: 'Model deleted successfully' });
  } catch (error) {
    logger.error({ modelId: id, error: (error as Error).message }, 'Error deleting model');
    res.status(500).json({ message: 'Error deleting model', error: (error as Error).message });
  }
};

export const getQueueStatsEndpoint = async (req: Request, res: Response) => {
  try {
    const stats = await getQueueStats();
    const metricsData = metrics.getMetrics();
    res.json({ queue: stats, metrics: metricsData });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Error getting queue stats');
    res.status(500).json({ message: 'Error getting queue stats', error: (error as Error).message });
  }
};