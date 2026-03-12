'use client';
import { useState, useMemo } from 'react';

export interface LogEntry {
  id?: number;
  timestamp: string;
  model_id?: string;
  user_id?: number;
  latency?: number;
  request_size?: number;
  status_code?: number;
  error?: string;
  trace_id?: string;
  input?: any;
  output?: any;
}

interface LogTableProps {
  logs: LogEntry[];
  showModel?: boolean;
  showUser?: boolean;
  onRowClick?: (log: LogEntry) => void;
}

export function LogTable({ logs, showModel = true, showUser = false, onRowClick }: LogTableProps) {
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'error'>('all');
  const [sortBy, setSortBy] = useState<'timestamp' | 'latency'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const filteredLogs = useMemo(() => {
    return logs
      .filter(log => {
        if (statusFilter === 'error') return log.error || log.status_code && log.status_code >= 400;
        if (statusFilter === 'success') return !log.error && log.status_code && log.status_code < 400;
        return true;
      })
      .filter(log => {
        if (!filter) return true;
        const searchLower = filter.toLowerCase();
        return (
          log.trace_id?.toLowerCase().includes(searchLower) ||
          log.model_id?.toLowerCase().includes(searchLower) ||
          log.error?.toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortBy === 'timestamp') {
          comparison = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        } else if (sortBy === 'latency') {
          comparison = (a.latency || 0) - (b.latency || 0);
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }, [logs, filter, statusFilter, sortBy, sortOrder]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatLatency = (ms?: number) => {
    if (ms === undefined) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search by trace ID, model, or error..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="error">Errors</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border rounded-md text-sm"
          >
            <option value="timestamp">Sort by Time</option>
            <option value="latency">Sort by Latency</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border rounded-md text-sm hover:bg-gray-100"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              {showModel && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Model</th>}
              {showUser && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Latency</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trace ID</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No logs found
                </td>
              </tr>
            ) : (
              filteredLogs.map((log, i) => (
                <tr
                  key={i}
                  className={`hover:bg-gray-50 cursor-pointer ${log.error ? 'bg-red-50' : ''}`}
                  onClick={() => onRowClick?.(log)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {formatTime(log.timestamp)}
                  </td>
                  {showModel && (
                    <td className="px-4 py-3 font-mono text-xs">
                      {log.model_id || '-'}
                    </td>
                  )}
                  {showUser && (
                    <td className="px-4 py-3">
                      {log.user_id || '-'}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className={`font-mono ${(log.latency || 0) > 1000 ? 'text-red-600' : (log.latency || 0) > 500 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {formatLatency(log.latency)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.error ? (
                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                        Error
                      </span>
                    ) : log.status_code ? (
                      <span className={`px-2 py-1 rounded text-xs ${
                        log.status_code < 300 ? 'bg-green-100 text-green-800' :
                        log.status_code < 400 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {log.status_code}
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {log.trace_id ? (
                      <span className="truncate max-w-[150px] block">{log.trace_id}</span>
                    ) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-t bg-gray-50 text-sm text-gray-500">
        Showing {filteredLogs.length} of {logs.length} logs
      </div>
    </div>
  );
}

interface LogDetailModalProps {
  log: LogEntry | null;
  onClose: () => void;
}

export function LogDetailModal({ log, onClose }: LogDetailModalProps) {
  if (!log) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">Request Details</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Timestamp</h3>
            <p>{new Date(log.timestamp).toLocaleString()}</p>
          </div>
          
          {log.trace_id && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Trace ID</h3>
              <p className="font-mono text-sm bg-gray-100 p-2 rounded">{log.trace_id}</p>
            </div>
          )}
          
          {log.latency !== undefined && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Latency</h3>
              <p>{log.latency}ms</p>
            </div>
          )}
          
          {log.error && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Error</h3>
              <p className="text-red-600 bg-red-50 p-2 rounded">{log.error}</p>
            </div>
          )}
          
          {log.input && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Input</h3>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-40">
                {JSON.stringify(log.input, null, 2)}
              </pre>
            </div>
          )}
          
          {log.output && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-1">Output</h3>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-40">
                {JSON.stringify(log.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
