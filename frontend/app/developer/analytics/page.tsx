'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, User } from '@/lib/api';
import { MetricCard, UsageChart, LatencyBar, QueueStatus, GPUStatus } from '@/components/Charts';

export default function AnalyticsDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(7);
  const router = useRouter();

  useEffect(() => {
    api.getMe()
      .then(data => {
        setUser(data.user);
        if (!data.user.is_creator) {
          router.push('/dashboard');
        }
      })
      .catch(() => router.push('/login'));
  }, [router]);

  useEffect(() => {
    if (user?.is_creator) {
      loadData();
    }
  }, [user, timeRange]);

  const loadData = async () => {
    try {
      const [metricsData, healthData] = await Promise.all([
        api.getMetrics(),
        api.getHealth()
      ]);
      setMetrics({ ...metricsData, health: healthData });
    } catch (err) {
      console.error('Failed to load metrics:', err);
      // Use mock data for demo
      setMetrics(getMockData());
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const queue = metrics?.queue || { waiting: 0, active: 0, completed: 0, failed: 0 };
  const gpu = metrics?.gpu || { totalNodes: 3, onlineNodes: 3, totalGpus: 12, availableGpus: 8 };
  const db = metrics?.database || { users: 150, models: 42, api_keys: 230, usage_events: 15420 };

  // Generate mock trend data
  const generateTrendData = (days: number) => {
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: Math.floor(Math.random() * 500) + 100,
      });
    }
    return data;
  };

  const generateRevenueData = (days: number) => {
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      data.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: Math.floor(Math.random() * 100) + 10,
      });
    }
    return data;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <div className="flex gap-2">
          {[7, 30, 90].map(days => (
            <button
              key={days}
              onClick={() => setTimeRange(days as 7 | 30 | 90)}
              className={`px-3 py-1 rounded text-sm ${
                timeRange === days ? 'bg-slate-900 text-white' : 'bg-gray-100'
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Total Requests"
          value={(metrics?.application?.inferenceRequests || 12453).toLocaleString()}
          subtitle="Last 30 days"
          trend="up"
          trendValue="12%"
          color="blue"
        />
        <MetricCard
          title="Active Models"
          value={metrics?.application?.activeContainers || 8}
          subtitle="Running containers"
          color="green"
        />
        <MetricCard
          title="Total Revenue"
          value={`$${(metrics?.application?.totalRevenue || 1247.83).toFixed(2)}`}
          subtitle="Last 30 days"
          trend="up"
          trendValue="8%"
          color="purple"
        />
        <MetricCard
          title="Error Rate"
          value={`${((metrics?.application?.errorRate || 0.02) * 100).toFixed(2)}%`}
          subtitle="Last 30 days"
          trend="down"
          trendValue="0.5%"
          color={metrics?.application?.errorRate > 0.05 ? 'red' : 'green'}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <UsageChart
          data={generateTrendData(timeRange)}
          title={`API Requests (${timeRange} days)`}
          valueLabel="Requests"
          color="blue"
        />
        <UsageChart
          data={generateRevenueData(timeRange)}
          title={`Revenue (${timeRange} days)`}
          valueLabel="Revenue ($)"
          color="green"
        />
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <QueueStatus
          waiting={queue.waiting}
          active={queue.active}
          completed={queue.completed}
          failed={queue.failed}
        />
        <GPUStatus
          totalNodes={gpu.totalNodes}
          onlineNodes={gpu.onlineNodes}
          totalGpus={gpu.totalGpus}
          availableGpus={gpu.availableGpus}
        />
        <div className="bg-white p-4 rounded-lg border">
          <h3 className="text-sm font-medium text-gray-600 mb-3">Latency (P50/P95/P99)</h3>
          <LatencyBar p50={45} p95={180} p99={450} />
        </div>
      </div>

      {/* Database Stats */}
      <div className="bg-white rounded-lg border p-4 mb-8">
        <h3 className="font-semibold mb-4">Database Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold text-blue-600">{db.users}</div>
            <div className="text-sm text-gray-500">Users</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold text-green-600">{db.models}</div>
            <div className="text-sm text-gray-500">Models</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold text-purple-600">{db.api_keys}</div>
            <div className="text-sm text-gray-500">API Keys</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded">
            <div className="text-2xl font-bold text-orange-600">{db.usage_events.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Usage Events</div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/developer" className="p-4 border rounded-lg hover:shadow-md transition">
          <h3 className="font-semibold mb-1">Manage Models</h3>
          <p className="text-sm text-gray-500">View and manage your deployed models</p>
        </Link>
        <Link href="/developer/revenue" className="p-4 border rounded-lg hover:shadow-md transition">
          <h3 className="font-semibold mb-1">Revenue</h3>
          <p className="text-sm text-gray-500">View earnings and transactions</p>
        </Link>
        <Link href="/monitoring" className="p-4 border rounded-lg hover:shadow-md transition">
          <h3 className="font-semibold mb-1">Monitoring</h3>
          <p className="text-sm text-gray-500">System health and metrics</p>
        </Link>
      </div>
    </div>
  );
}

function getMockData() {
  return {
    queue: { waiting: 5, active: 12, completed: 1240, failed: 3 },
    gpu: { totalNodes: 3, onlineNodes: 3, totalGpus: 12, availableGpus: 8 },
    application: {
      inferenceRequests: 12453,
      inferenceErrors: 234,
      errorRate: 0.0188,
      activeContainers: 8,
      totalRevenue: 1247.83
    },
    database: {
      users: 150,
      models: 42,
      api_keys: 230,
      usage_events: 15420
    }
  };
}
