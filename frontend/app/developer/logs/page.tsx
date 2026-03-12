'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, User, Model } from '@/lib/api';
import { LogTable, LogEntry, LogDetailModal } from '@/components/LogTable';

export default function LogsViewer() {
  const params = useParams();
  const modelId = params.id as string | undefined;
  const [user, setUser] = useState<User | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>(modelId || 'all');
  const [dateRange, setDateRange] = useState<7 | 30 | 90>(7);
  const router = useRouter();

  useEffect(() => {
    api.getMe()
      .then(data => {
        setUser(data.user);
        return api.getMyModels();
      })
      .then(modelData => {
        setModels(modelData);
        if (!modelData.length) {
          // Load mock data for demo
          setLogs(getMockLogs());
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (modelId && models.length > 0) {
      setSelectedModel(modelId);
    }
  }, [modelId, models]);

  useEffect(() => {
    if (selectedModel !== 'all' && user?.is_creator) {
      loadLogs();
    }
  }, [selectedModel, dateRange, user]);

  const loadLogs = async () => {
    try {
      const logsData = selectedModel === 'all' 
        ? await api.getUserUsageLogs(200)
        : await api.getUsageLogs(selectedModel, 200);
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load logs:', err);
      setLogs(getMockLogs());
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading logs...</p>
        </div>
      </div>
    );
  }

  const filteredLogs = logs.filter(log => {
    if (selectedModel !== 'all' && log.model_id !== selectedModel) return false;
    return true;
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Request Logs</h1>
          <p className="text-gray-500 mt-1">View and search through your API request history</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadLogs}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="all">All Models</option>
              {models.map(model => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">Time Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(Number(e.target.value) as 7 | 30 | 90)}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold">{filteredLogs.length}</div>
          <div className="text-sm text-gray-500">Total Requests</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-green-600">
            {filteredLogs.filter(l => !l.error).length}
          </div>
          <div className="text-sm text-gray-500">Successful</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-red-600">
            {filteredLogs.filter(l => l.error || (l.status_code && l.status_code >= 400)).length}
          </div>
          <div className="text-sm text-gray-500">Errors</div>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-blue-600">
            {filteredLogs.length > 0 
              ? Math.round(filteredLogs.reduce((sum, l) => sum + (l.latency || 0), 0) / filteredLogs.length)
              : 0}ms
          </div>
          <div className="text-sm text-gray-500">Avg Latency</div>
        </div>
      </div>

      {/* Logs Table */}
      <LogTable
        logs={filteredLogs}
        showModel={selectedModel === 'all'}
        showUser={false}
        onRowClick={setSelectedLog}
      />

      {/* Detail Modal */}
      <LogDetailModal
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}

function getMockLogs(): LogEntry[] {
  const logs: LogEntry[] = [];
  const models = ['model-123', 'model-456', 'model-789'];
  const statuses = [200, 200, 200, 200, 201, 400, 500];
  
  for (let i = 0; i < 50; i++) {
    const timestamp = new Date();
    timestamp.setHours(timestamp.getHours() - Math.floor(Math.random() * 24 * 7));
    
    const hasError = Math.random() < 0.1;
    const status = hasError ? 500 : statuses[Math.floor(Math.random() * statuses.length)];
    
    logs.push({
      id: i,
      timestamp: timestamp.toISOString(),
      model_id: models[Math.floor(Math.random() * models.length)],
      user_id: Math.floor(Math.random() * 100) + 1,
      latency: Math.floor(Math.random() * 2000) + 50,
      status_code: status,
      error: hasError ? 'Request timeout after 30s' : undefined,
      trace_id: `trace_${Math.random().toString(36).substring(7)}`,
      request_size: Math.floor(Math.random() * 10000) + 100,
    });
  }
  
  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
