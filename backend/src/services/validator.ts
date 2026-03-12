import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { logger } from './logger';

export const CodexonManifestSchema = z.object({
  model: z.object({
    name: z.string().min(1).max(255),
    version: z.string().regex(/^\d+\.\d+(\.\d+)?$/),
    description: z.string().max(1000).optional()
  }),
  runtime: z.object({
    framework: z.enum(['onnx', 'pytorch', 'tensorflow', 'custom']),
    python: z.string().regex(/^\d+\.\d+$/)
  }),
  resources: z.object({
    cpu: z.number().int().min(1).max(64),
    memory: z.string().regex(/^\d+[gm]?$/i),
    gpu: z.number().int().min(0).max(8).default(0)
  }),
  api: z.object({
    endpoint: z.string().startsWith('/')
  }),
  billing: z.object({
    price_per_request: z.number().positive().max(10)
  })
});

export type CodexonManifest = z.infer<typeof CodexonManifestSchema>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const REQUIRED_FILES = ['app.py', 'aimodel.codexon', 'requirements.txt'];
const OPTIONAL_FILES = ['test.py'];
const MODEL_FILES = ['model.onnx', 'model.pt'];

export function validateModelPackage(unzippedPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.info({ path: unzippedPath }, 'Validating model package');

  for (const file of REQUIRED_FILES) {
    const filePath = path.join(unzippedPath, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`Required file missing: ${file}`);
    }
  }

  const modelDir = path.join(unzippedPath, 'model');
  if (fs.existsSync(modelDir)) {
    const hasModelFile = MODEL_FILES.some(f => fs.existsSync(path.join(modelDir, f)));
    if (!hasModelFile) {
      errors.push('Model folder exists but no model.onnx or model.pt found');
    }
  } else {
    warnings.push('No model/ folder found - running in mock mode');
  }

  const testFile = path.join(unzippedPath, 'test.py');
  if (fs.existsSync(testFile)) {
    warnings.push('test.py found - can be executed for model testing');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function parseAndValidateManifest(manifestPath: string): { config: CodexonManifest | null; error: string | null } {
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const rawConfig = JSON.parse(content);
    
    const result = CodexonManifestSchema.safeParse(rawConfig);
    
    if (!result.success) {
      const errorMessages = result.error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      );
      return { config: null, error: errorMessages.join('; ') };
    }

    return { config: result.data, error: null };
  } catch (error) {
    return { config: null, error: (error as Error).message };
  }
}

export function validateAppPy(appPyPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const content = fs.readFileSync(appPyPath, 'utf-8');
    
    if (!content.includes('FastAPI') && !content.includes('uvicorn')) {
      warnings.push('app.py does not seem to use FastAPI');
    }

    if (!content.includes('/predict') && !content.includes('post')) {
      warnings.push('app.py does not define a /predict endpoint');
    }

    const importMatch = content.match(/^import\s+(\w+)/gm);
    const requiredImports = ['fastapi', 'pydantic'];
    const missingImports = requiredImports.filter(req => 
      !importMatch?.some(imp => imp.includes(req))
    );
    
    if (missingImports.length > 0) {
      warnings.push(`Missing recommended imports: ${missingImports.join(', ')}`);
    }
  } catch (error) {
    errors.push(`Failed to read app.py: ${(error as Error).message}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateRequirementsTxt(requirementsPath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const content = fs.readFileSync(requirementsPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    
    if (lines.length === 0) {
      warnings.push('requirements.txt is empty');
    }

    for (const line of lines) {
      if (!line.match(/^[\w-]+([<>=!~]+[\d.]+)?$/)) {
        warnings.push(`Potentially invalid requirement: ${line}`);
      }
    }
  } catch (error) {
    errors.push(`Failed to read requirements.txt: ${(error as Error).message}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}