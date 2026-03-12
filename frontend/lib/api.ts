const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface User {
  id: number;
  email: string;
  is_creator: boolean;
}

export interface Model {
  id: string;
  owner_id: number;
  name: string;
  description: string;
  status: 'draft' | 'deployed' | 'published';
  price?: number;
}

export interface ApiKey {
  id: number;
  created_at: string;
}

export interface ContainerInfo {
  status: 'running' | 'stopped' | 'error';
  port: number;
  containerId: string;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}

export interface Metrics {
  inferenceRequests: number;
  inferenceErrors: number;
  errorRate: number;
  activeContainers: number;
  totalRevenue: number;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      (headers as any)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message);
    }

    return response.json();
  }

  async register(email: string, password: string) {
    const data = await this.request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.clearToken();
  }

  async getMe() {
    return this.request<{ user: User }>('/auth/me');
  }

  async becomeCreator() {
    return this.request<{ message: string }>('/users/become-creator', {
      method: 'POST',
    });
  }

  async getMarketplaceModels() {
    return this.request<Model[]>('/models/marketplace');
  }

  async getMyModels() {
    return this.request<Model[]>('/models/my');
  }

  async getModelDetails(id: string) {
    return this.request<{
      model: Model;
      price: number;
      endpoint: string;
      container: ContainerInfo | null;
      config: any;
    }>(`/models/${id}`);
  }

  async uploadModel(file: File, onProgress?: (progress: number) => void) {
    const formData = new FormData();
    formData.append('model', file);
    
    const token = this.getToken();
    const response = await fetch(`${API_URL}/models/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Upload failed');
    }
    return response.json();
  }

  async deployModel(id: string) {
    return this.request<{ 
      message: string;
      container: ContainerInfo;
    }>(`/models/${id}/deploy`, {
      method: 'POST',
    });
  }

  async stopModel(id: string) {
    return this.request<{ message: string }>(`/models/${id}/stop`, {
      method: 'POST',
    });
  }

  async restartModel(id: string) {
    return this.request<{ message: string }>(`/models/${id}/restart`, {
      method: 'POST',
    });
  }

  async deleteModel(id: string) {
    return this.request<{ message: string }>(`/models/${id}`, {
      method: 'DELETE',
    });
  }

  async publishModel(id: string) {
    return this.request<{ message: string }>(`/models/${id}/publish`, {
      method: 'POST',
    });
  }

  async testModel(id: string, input: object) {
    return this.request<{
      testType: string;
      logs: string;
      result?: any;
      error?: string;
      passed: boolean;
    }>(`/models/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }

  async runInference(id: string, input: object, apiKey: string) {
    return this.request<{
      message: string;
      jobId: string;
      status: string;
      price: number;
    }>(`/models/${id}/inference`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(input),
    });
  }

  async getInferenceStatus(id: string, jobId: string) {
    return this.request<{
      jobId: string;
      status: string;
      progress: any;
      result?: any;
      failed?: string;
    }>(`/models/${id}/inference/${jobId}`);
  }

  async getModelLogs(id: string, tail: number = 100) {
    return this.request<{ logs: string }>(`/models/${id}/logs?tail=${tail}`);
  }

  async createApiKey() {
    return this.request<{ id: number; key: string }>('/api-keys/create', {
      method: 'POST',
    });
  }

  async getApiKeys() {
    return this.request<ApiKey[]>('/api-keys');
  }

  async deleteApiKey(id: number) {
    return this.request<{ message: string }>(`/api-keys/${id}`, {
      method: 'DELETE',
    });
  }

  async getRevenue() {
    return this.request<{
      balance: number;
      totalCalls: number;
      dailyRevenue: { date: string; calls: number }[];
      topModels: { id: string; name: string; calls: number; price: number }[];
    }>('/revenue');
  }

  async getModelUsage(id: string) {
    return this.request<{
      daily: { date: string; requests: number; avg_latency: number }[];
      total: { requests: number; avgLatency: number; totalSize: number; estimatedRevenue: number; pricePerRequest: number };
      queue: QueueStats;
    }>(`/models/${id}/usage`);
  }

  async getQueueStats() {
    return this.request<{ queue: QueueStats; metrics: Metrics }>('/models/queue/stats');
  }

  async getMetrics() {
    return this.request<any>('/metrics/json');
  }

  async getHealth() {
    return this.request<{
      status: string;
      timestamp: string;
      traceId: string;
      queue: QueueStats;
      containers: { running: number };
      gpu: { totalNodes: number; onlineNodes: number; totalGpus: number; availableGpus: number };
    }>('/health');
  }

  async getTrace(traceId: string) {
    return this.request<{ traceId: string; spans: any[] }>(`/trace/${traceId}`);
  }

  async getQueueStatsForModel(modelId: string) {
    return this.request<{
      modelId: string;
      queue: QueueStats;
      containers: { containerId: string; status: string; currentLoad: number; requestCount: number }[];
    }>(`/queue/${modelId}/stats`);
  }

  async runBatchInference(modelId: string, inputs: object[]) {
    return this.request<{
      batchId: string;
      traceId: string;
      status: string;
      jobId: string;
      inputCount: number;
    }>(`/batch/${modelId}`, {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    });
  }

  async getModelVersions(modelId: string) {
    return this.request<any[]>(`/models/${modelId}/versions`);
  }

  async createModelVersion(modelId: string, version: string) {
    return this.request<any>(`/models/${modelId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    });
  }

  async setActiveVersion(modelId: string, versionId: string) {
    return this.request<any>(`/models/${modelId}/versions/${versionId}/activate`, {
      method: 'POST',
    });
  }

  async getUsageLogs(modelId: string, limit: number = 100) {
    return this.request<any[]>(`/models/${modelId}/usage-logs?limit=${limit}`);
  }

  async getUserUsageLogs(limit: number = 100) {
    return this.request<any[]>(`/users/usage-logs?limit=${limit}`);
  }

  async getAllModels() {
    return this.request<Model[]>('/models');
  }

  async searchModels(query: string) {
    return this.request<Model[]>(`/models/search?q=${encodeURIComponent(query)}`);
  }

  async getModelUsageAnalytics(modelId: string, days: number = 30) {
    return this.request<{
      daily: { date: string; requests: number; avg_latency: number; errors: number }[];
      hourly: { hour: number; requests: number }[];
      total: { requests: number; avgLatency: number; errors: number; revenue: number };
      byUser: { user_id: number; requests: number }[];
    }>(`/models/${modelId}/analytics?days=${days}`);
  }

  async getCreatorAnalytics() {
    return this.request<{
      totalRevenue: number;
      totalRequests: number;
      totalModels: number;
      activeModels: number;
      dailyRevenue: { date: string; revenue: number }[];
      dailyRequests: { date: string; requests: number }[];
      topModels: { id: string; name: string; revenue: number; requests: number }[];
    }>('/developer/analytics');
  }
}

export const api = new ApiClient();