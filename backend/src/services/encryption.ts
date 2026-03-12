import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { logger } from '../logger';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

interface EncryptionConfig {
  key: Buffer;
}

let config: EncryptionConfig | null = null;

export function initializeEncryption(key: string): void {
  config = {
    key: crypto.scryptSync(key, 'codexon_salt', KEY_LENGTH)
  };
  logger.info('Encryption initialized');
}

function getKey(): Buffer {
  if (!config) {
    const defaultKey = process.env.ENCRYPTION_KEY || 'default_development_key_change_in_production';
    return crypto.scryptSync(defaultKey, 'codexon_salt', KEY_LENGTH);
  }
  return config.key;
}

export async function encryptFile(inputPath: string, outputPath: string): Promise<void> {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const input = createReadStream(inputPath);
  const output = createWriteStream(outputPath);

  output.write(iv);
  await pipeline(input, cipher, output);

  logger.info({ inputPath, outputPath }, 'File encrypted');
}

export async function decryptFile(inputPath: string, outputPath: string): Promise<void> {
  const key = getKey();
  
  const input = createReadStream(inputPath);
  const ivBuffer = Buffer.alloc(IV_LENGTH);
  
  await input.read(ivBuffer);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  const output = createWriteStream(outputPath);

  await pipeline(input, decipher, output);

  logger.info({ inputPath, outputPath }, 'File decrypted');
}

export async function encryptDirectory(sourceDir: string, destDir: string): Promise<void> {
  const files = getAllFiles(sourceDir);
  
  for (const file of files) {
    const relativePath = path.relative(sourceDir, file);
    const destPath = path.join(destDir, relativePath + '.enc');
    
    const destDirPath = path.dirname(destPath);
    if (!fs.existsSync(destDirPath)) {
      fs.mkdirSync(destDirPath, { recursive: true });
    }
    
    await encryptFile(file, destPath);
  }
  
  logger.info({ sourceDir, destDir, fileCount: files.length }, 'Directory encrypted');
}

export async function decryptDirectory(sourceDir: string, destDir: string): Promise<void> {
  const files = getAllFiles(sourceDir).filter(f => f.endsWith('.enc'));
  
  for (const file of files) {
    const relativePath = path.relative(sourceDir, file);
    const baseName = relativePath.replace('.enc', '');
    const destPath = path.join(destDir, baseName);
    
    const destDirPath = path.dirname(destPath);
    if (!fs.existsSync(destDirPath)) {
      fs.mkdirSync(destDirPath, { recursive: true });
    }
    
    await decryptFile(file, destPath);
  }
  
  logger.info({ sourceDir, destDir, fileCount: files.length }, 'Directory decrypted');
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) return files;
  
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  
  return files;
}

export async function encryptModelWeights(modelId: string, storagePath: string): Promise<string> {
  const modelDir = path.join(storagePath, 'model');
  const encryptedDir = path.join(storagePath, 'model_encrypted');
  const encryptedPath = path.join(encryptedDir, 'model.enc');
  
  if (!fs.existsSync(modelDir)) {
    throw new Error('Model directory not found');
  }
  
  if (!fs.existsSync(encryptedDir)) {
    fs.mkdirSync(encryptedDir, { recursive: true });
  }

  const onnxPath = path.join(modelDir, 'model.onnx');
  const ptPath = path.join(modelDir, 'model.pt');
  
  if (fs.existsSync(onnxPath)) {
    await encryptFile(onnxPath, encryptedPath);
    fs.unlinkSync(onnxPath);
  } else if (fs.existsSync(ptPath)) {
    await encryptFile(ptPath, encryptedPath);
    fs.unlinkSync(ptPath);
  } else {
    throw new Error('No model file found to encrypt');
  }
  
  return encryptedPath;
}

export async function decryptModelWeightsForContainer(modelId: string, storagePath: string): Promise<string> {
  const encryptedDir = path.join(storagePath, 'model_encrypted');
  const encryptedPath = path.join(encryptedDir, 'model.enc');
  const modelDir = path.join(storagePath, 'model');
  const decryptedPath = path.join(modelDir, fs.existsSync(path.join(storagePath, 'model.onnx')) ? 'model.onnx' : 'model.pt');
  
  if (!fs.existsSync(encryptedPath)) {
    return modelDir;
  }
  
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }
  
  await decryptFile(encryptedPath, decryptedPath);
  
  return modelDir;
}

export function hashModelFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function generateModelChecksum(modelDir: string): { [key: string]: string } {
  const checksums: { [key: string]: string } = {};
  const files = getAllFiles(modelDir);
  
  for (const file of files) {
    const relativePath = path.relative(modelDir, file);
    checksums[relativePath] = hashModelFile(file);
  }
  
  return checksums;
}

export function verifyModelIntegrity(modelDir: string, expectedChecksums: { [key: string]: string }): boolean {
  const actualChecksums = generateModelChecksum(modelDir);
  
  for (const [file, expectedHash] of Object.entries(expectedChecksums)) {
    if (actualChecksums[file] !== expectedHash) {
      return false;
    }
  }
  
  return true;
}