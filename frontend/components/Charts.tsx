'use client';
import { useState } from 'react';

interface UsageChartProps {
  data: { date: string; value: number }[];
  title: string;
  valueLabel?: string;
  color?: string;
}

export function UsageChart({ data, title, valueLabel = 'Requests', color = 'blue' }: UsageChartProps) {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };

  return (
    <div className="bg-white p-4 rounded-lg border">
      <h3 className="text-sm font-medium text-gray-600 mb-4">{title}</h3>
      <div className="flex items-end gap-1 h-32">
        {data.map((item, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div
              className={`w-full ${colorClasses[color]} rounded-t transition-all hover:opacity-80`}
              style={{ height: `${(item.value / maxValue) * 100}%`, minHeight: item.value > 0 ? '4px' : '0' }}
              title={`${item.date}: ${item.value} ${valueLabel}`}
            ></div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}

export function MetricCard({ title, value, subtitle, trend, trendValue, color = 'blue' }: MetricCardProps) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    orange: 'bg-orange-50 border-orange-200',
    red: 'bg-red-50 border-red-200',
  };

  const textClasses: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→',
  };

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${textClasses[color]}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {trend && trendValue && (
        <p className={`text-xs mt-2 ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'}`}>
          {trendIcons[trend]} {trendValue}
        </p>
      )}
    </div>
  );
}

interface LatencyBarProps {
  p50: number;
  p95: number;
  p99: number;
}

export function LatencyBar({ p50, p95, p99 }: LatencyBarProps) {
  const max = Math.max(p99, 1);
  
  return (
    <div className="bg-white p-4 rounded-lg border">
      <h3 className="text-sm font-medium text-gray-600 mb-3">Latency Distribution</h3>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>P50</span>
            <span>{p50}ms</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${(p50 / max) * 100}%` }}></div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>P95</span>
            <span>{p95}ms</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${(p95 / max) * 100}%` }}></div>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>P99</span>
            <span>{p99}ms</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full" style={{ width: `${(p99 / max) * 100}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface QueueStatusProps {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export function QueueStatus({ waiting, active, completed, failed }: QueueStatusProps) {
  const total = waiting + active + completed + failed;
  
  return (
    <div className="bg-white p-4 rounded-lg border">
      <h3 className="text-sm font-medium text-gray-600 mb-3">Queue Status</h3>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="p-2 bg-yellow-50 rounded">
          <div className="text-lg font-bold text-yellow-600">{waiting}</div>
          <div className="text-xs text-gray-500">Waiting</div>
        </div>
        <div className="p-2 bg-blue-50 rounded">
          <div className="text-lg font-bold text-blue-600">{active}</div>
          <div className="text-xs text-gray-500">Active</div>
        </div>
        <div className="p-2 bg-green-50 rounded">
          <div className="text-lg font-bold text-green-600">{completed}</div>
          <div className="text-xs text-gray-500">Completed</div>
        </div>
        <div className="p-2 bg-red-50 rounded">
          <div className="text-lg font-bold text-red-600">{failed}</div>
          <div className="text-xs text-gray-500">Failed</div>
        </div>
      </div>
    </div>
  );
}

interface GPUStatusProps {
  totalNodes: number;
  onlineNodes: number;
  totalGpus: number;
  availableGpus: number;
}

export function GPUStatus({ totalNodes, onlineNodes, totalGpus, availableGpus }: GPUStatusProps) {
  const usedGpus = totalGpus - availableGpus;
  const usagePercent = totalGpus > 0 ? (usedGpus / totalGpus) * 100 : 0;
  
  return (
    <div className="bg-white p-4 rounded-lg border">
      <h3 className="text-sm font-medium text-gray-600 mb-3">GPU Cluster</h3>
      <div className="flex justify-between items-center mb-3">
        <span className="text-2xl font-bold">{availableGpus} / {totalGpus}</span>
        <span className="text-sm text-gray-500">available</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div 
          className={`h-full rounded-full transition-all ${usagePercent > 80 ? 'bg-red-500' : usagePercent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${usagePercent}%` }}
        ></div>
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{onlineNodes}/{totalNodes} nodes online</span>
        <span>{Math.round(usagePercent)}% used</span>
      </div>
    </div>
  );
}
