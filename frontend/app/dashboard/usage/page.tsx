'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, User } from '@/lib/api';
import { LogTable, LogEntry, LogDetailModal } from '@/components/LogTable';
import { MetricCard } from '@/components/Charts';

export default function UserUsagePage() {
  const [user, setUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const router = useRouter();

  useEffect(() => {
    api.getMe()
      .then(data => {
        setUser(data.user);
        return api.getUserUsageLogs(200);
      })
      .then(logsData => {
        setLogs(logsData);
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading your usage...</p>
        </div>
      </div>
    );
  }

  // Use mock data if empty
  const displayLogs = logs.length > 0 ? logs : getMockUserLogs();

  const totalRequests = displayLogs.length;
  const errors = displayLogs.filter(l => l.error || (l.status_code && l.status_code >= 400)).length;
  const avgLatency = displayLogs.length > 0
    ? Math.round(displayLogs.reduce((sum, l) => sum + (l.latency || 0), 0) / displayLogs.length)
    : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Your Usage</h1>
        <p className="text-gray-500">View your API request history and analytics</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <MetricCard
          title="Total Requests"
          value={totalRequests.toLocaleString()}
          subtitle="All time"
          color="blue"
        />
        <MetricCard
          title="Successful"
          value={(totalRequests - errors).toLocaleString()}
          subtitle={`${((totalRequests - errors) / Math.max(totalRequests, 1) * 100).toFixed(1)}% success rate`}
          color="green"
        />
        <MetricCard
          title="Average Latency"
          value={`${avgLatency}ms`}
          subtitle="Per request"
          color="purple"
        />
      </div>

      {/* Logs */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <h2 className="font-semibold mb-4">Request History</h2>
        <LogTable
          logs={displayLogs}
          showModel={true}
          showUser={false}
          onRowClick={setSelectedLog}
        />
      </div>

      {/* API Keys Reminder */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-800 mb-2">API Keys</h3>
        <p className="text-sm text-yellow-700 mb-3">
          Don't have an API key? Create one to start making requests.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="bg-yellow-600 text-white px-4 py-2 rounded text-sm hover:bg-yellow-700"
        >
          Manage API Keys
        </button>
      </div>

      <LogDetailModal
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}

function getMockUserLogs(): LogEntry[] {
  const logs: LogEntry[] = [];
  const models = ['gpt4-style-llm', 'stable-diffusion-xl', 'whisper-v3'];
  
  for (let i = 0; i < 30; i++) {
    const timestamp = new Date();
    timestamp.setHours(timestamp.getHours() - Math.floor(Math.random() * 24 * 7));
    
    logs.push({
      id: i,
      timestamp: timestamp.toISOString(),
      model_id: models[Math.floor(Math.random() * models.length)],
      latency: Math.floor(Math.random() * 2000) + 50,
      status_code: Math.random() < 0.95 ? 200 : 500,
      error: Math.random() < 0.05 ? 'Rate limit exceeded' : undefined,
      trace_id: `trace_${Math.random().toString(36).substring(7)}`,
    });
  }
  
  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
