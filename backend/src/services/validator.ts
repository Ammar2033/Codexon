import { z } from 'zod';

export const InferenceInputSchema = z.object({
  input: z.any().optional().default({}),
}).strict();

export const BatchInputSchema = z.object({
  inputs: z.array(z.record(z.any())).min(1).max(100),
}).strict();

export const ModelDeploySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  framework: z.enum(['pytorch', 'tensorflow', 'onnx', 'jax']).default('pytorch'),
  gpuRequired: z.boolean().default(false),
  gpuMemory: z.number().int().min(1).max(64).default(8),
  cpuCores: z.number().int().min(1).max(64).default(2),
  memoryMb: z.number().int().min(512).max(128000).default(4096),
  pricePerRequest: z.number().min(0).default(0.002),
}).strict();

export const ModelPublishSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional(),
}).strict();

export const VersionCreateSchema = z.object({
  version: z.string().min(1).max(50),
  notes: z.string().max(1000).optional(),
}).strict();

export const ApiKeyCreateSchema = z.object({
  name: z.string().max(100).optional(),
}).strict();

export const UserRegistrationSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  is_creator: z.boolean().optional().default(false),
}).strict();

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
}).strict();

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function validateInferenceInput(data: unknown): ValidationResult<z.infer<typeof InferenceInputSchema>> {
  try {
    const result = InferenceInputSchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: 'Invalid input' };
  }
}

export function validateBatchInput(data: unknown): ValidationResult<z.infer<typeof BatchInputSchema>> {
  try {
    const result = BatchInputSchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: 'Invalid input' };
  }
}

export function validateModelDeploy(data: unknown): ValidationResult<z.infer<typeof ModelDeploySchema>> {
  try {
    const result = ModelDeploySchema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: 'Invalid input' };
  }
}

export function validateModelId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 100;
}
