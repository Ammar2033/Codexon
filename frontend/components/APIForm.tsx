'use client';
import { useState, useRef, useEffect } from 'react';

interface InferenceFormProps {
  modelId: string;
  endpoint?: string;
  price?: number;
  onSubmit: (input: object) => Promise<any>;
  onInferenceComplete?: (result: any, latency: number) => void;
}

export function InferenceForm({ modelId, endpoint = '/predict', price, onSubmit, onInferenceComplete }: InferenceFormProps) {
  const [input, setInput] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [useBatch, setUseBatch] = useState(false);
  const [batchInputs, setBatchInputs] = useState('[\n  {},\n  {}\n]');

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setLatency(null);

    const startTime = Date.now();

    try {
      let parsedInput;
      if (useBatch) {
        parsedInput = JSON.parse(batchInputs);
      } else {
        parsedInput = JSON.parse(input);
      }

      const response = await onSubmit(parsedInput);
      
      const elapsed = Date.now() - startTime;
      setLatency(elapsed);
      setResult(response);
      onInferenceComplete?.(response, elapsed);
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const isValidJson = (str: string) => {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  };

  const inputValid = !useBatch ? isValidJson(input) : isValidJson(batchInputs);

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">API Request</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setUseBatch(false)}
            className={`px-3 py-1 text-sm rounded ${!useBatch ? 'bg-slate-900 text-white' : 'bg-gray-100'}`}
          >
            Single
          </button>
          <button
            onClick={() => setUseBatch(true)}
            className={`px-3 py-1 text-sm rounded ${useBatch ? 'bg-slate-900 text-white' : 'bg-gray-100'}`}
          >
            Batch
          </button>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {useBatch ? 'Inputs (JSON Array)' : 'Input (JSON)'}
        </label>
        <textarea
          value={useBatch ? batchInputs : input}
          onChange={(e) => useBatch ? setBatchInputs(e.target.value) : setInput(e.target.value)}
          className={`w-full p-3 border rounded-md font-mono text-sm ${
            inputValid ? '' : 'border-red-500'
          }`}
          rows={useBatch ? 6 : 4}
          placeholder={useBatch ? '[\n  {"data": [1,2,3]},\n  {"data": [4,5,6]}\n]' : '{"data": [1, 2, 3]}'}
        />
        {!inputValid && (
          <p className="text-red-500 text-sm mt-1">Invalid JSON</p>
        )}
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-500">
          {price && <span>Estimated cost: ${(price * (useBatch ? 2 : 1)).toFixed(4)}</span>}
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading || !inputValid}
          className="bg-slate-900 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-slate-800"
        >
          {loading ? 'Processing...' : useBatch ? 'Run Batch' : 'Run Inference'}
        </button>
      </div>

      {latency !== null && (
        <div className="mb-4 p-2 bg-blue-50 rounded text-sm">
          Latency: <span className="font-mono">{latency}ms</span>
          {price && <span className="ml-4">Cost: ${price.toFixed(4)}</span>}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Response</label>
          <pre className="bg-gray-900 text-gray-100 p-3 rounded-md text-sm overflow-auto max-h-60">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

interface StreamingViewerProps {
  modelId: string;
  className?: string;
}

export function StreamingViewer({ modelId, className }: StreamingViewerProps) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setLoading(true);
    setError(null);
    setMessages([]);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const eventSource = new EventSource(`${apiUrl}/streaming/${modelId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setLoading(false);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages(prev => [...prev, data]);
        
        if (data.type === 'done') {
          eventSource.close();
          setConnected(false);
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = (err) => {
      setError('Connection failed');
      setConnected(false);
      setLoading(false);
      eventSource.close();
    };
  };

  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnected(false);
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className={`bg-white rounded-lg border ${className || ''}`}>
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="font-semibold">Streaming Output</h3>
        <div className="flex gap-2">
          {!connected ? (
            <button
              onClick={connect}
              disabled={loading}
              className="bg-green-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            >
              {loading ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="bg-red-600 text-white px-3 py-1 rounded text-sm"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div className="p-4 min-h-[200px] max-h-[400px] overflow-auto bg-gray-900">
        {messages.length === 0 && !connected && !error && (
          <p className="text-gray-500 text-center">Click "Connect" to start streaming</p>
        )}
        
        {error && (
          <p className="text-red-500">{error}</p>
        )}

        {messages.map((msg, i) => (
          <div key={i} className="mb-2">
            {msg.type === 'connected' && (
              <span className="text-green-500">● Connected</span>
            )}
            {msg.type === 'token' && (
              <span className="text-white">{msg.content}</span>
            )}
            {msg.type === 'done' && (
              <span className="text-blue-500">● Stream complete ({msg.total} tokens)</span>
            )}
            {msg.type === 'error' && (
              <span className="text-red-500">Error: {msg.message}</span>
            )}
          </div>
        ))}
        
        {connected && messages.length > 0 && messages[messages.length - 1].type !== 'done' && (
          <span className="text-gray-500 animate-pulse">▊</span>
        )}
      </div>

      <div className="p-3 border-t bg-gray-50 text-sm">
        Status: {connected ? (
          <span className="text-green-600">● Connected</span>
        ) : (
          <span className="text-gray-500">Disconnected</span>
        )}
        {messages.length > 0 && (
          <span className="ml-4">{messages.filter(m => m.type === 'token').length} tokens received</span>
        )}
      </div>
    </div>
  );
}
