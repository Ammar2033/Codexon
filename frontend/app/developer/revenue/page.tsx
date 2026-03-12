'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function RevenuePage() {
  const [data, setData] = useState<{
    balance: number;
    totalCalls: number;
    dailyRevenue: { date: string; calls: number }[];
    topModels: { id: string; name: string; calls: number; price: number }[];
  } | null>(null);

  useEffect(() => {
    api.getRevenue().then(setData).catch(console.error);
  }, []);

  if (!data) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Revenue Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-green-50 p-6 rounded-lg border border-green-200">
          <div className="text-3xl font-bold">${data.balance.toFixed(2)}</div>
          <div className="text-gray-600">Current Balance</div>
        </div>
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <div className="text-3xl font-bold">{data.totalCalls}</div>
          <div className="text-gray-600">Total API Calls</div>
        </div>
        <div className="bg-purple-50 p-6 rounded-lg border border-purple-200">
          <div className="text-3xl font-bold">80%</div>
          <div className="text-gray-600">Revenue Share</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Top Models</h2>
          <div className="space-y-3">
            {data.topModels.map(model => (
              <div key={model.id} className="flex justify-between items-center">
                <span>{model.name}</span>
                <span className="text-gray-600">{model.calls} calls</span>
              </div>
            ))}
            {data.topModels.length === 0 && <p className="text-gray-500">No data yet</p>}
          </div>
        </div>

        <div className="border p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Daily Activity (Last 30 days)</h2>
          <div className="space-y-2">
            {data.dailyRevenue.slice(0, 10).map(day => (
              <div key={day.date} className="flex justify-between items-center">
                <span className="text-sm">{new Date(day.date).toLocaleDateString()}</span>
                <span className="text-gray-600">{day.calls} calls</span>
              </div>
            ))}
            {data.dailyRevenue.length === 0 && <p className="text-gray-500">No activity yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
}