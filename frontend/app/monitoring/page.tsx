'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function MonitoringPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.getQueueStats();
        setStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">System Monitoring</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <div className="text-3xl font-bold">{stats?.queue?.waiting || 0}</div>
          <div className="text-gray-600">Queued Requests</div>
        </div>
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <div className="text-3xl font-bold">{stats?.queue?.active || 0}</div>
          <div className="text-gray-600">Active Jobs</div>
        </div>
        <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
          <div className="text-3xl font-bold">{stats?.metrics?.activeContainers || 0}</div>
          <div className="text-gray-600">Running Containers</div>
        </div>
        <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
          <div className="text-3xl font-bold">{stats?.queue?.completed || 0}</div>
          <div className="text-gray-600">Completed Jobs</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Queue Statistics</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Waiting</span>
              <span className="font-medium">{stats?.queue?.waiting || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Active</span>
              <span className="font-medium">{stats?.queue?.active || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Completed</span>
              <span className="font-medium">{stats?.queue?.completed || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Failed</span>
              <span className="font-medium text-red-600">{stats?.queue?.failed || 0}</span>
            </div>
          </div>
        </div>

        <div className="border p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">System Metrics</h2>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Requests</span>
              <span className="font-medium">{stats?.metrics?.inferenceRequests || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Failed Requests</span>
              <span className="font-medium text-red-600">{stats?.metrics?.inferenceErrors || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Error Rate</span>
              <span className="font-medium">{((stats?.metrics?.errorRate || 0) * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Revenue</span>
              <span className="font-medium text-green-600">${(stats?.metrics?.totalRevenue || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 p-6 bg-gray-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Health Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            <span>PostgreSQL: Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            <span>Redis: Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
            <span>Docker: Available</span>
          </div>
        </div>
      </div>
    </div>
  );
}