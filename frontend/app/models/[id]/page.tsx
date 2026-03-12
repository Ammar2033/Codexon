'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function ModelDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [model, setModel] = useState<any>(null);
  const [apiKey, setApiKey] = useState('');
  const [testInput, setTestInput] = useState('{}');
  const [testResult, setTestResult] = useState<any>(null);
  const [testLogs, setTestLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [logs, setLogs] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [jobId, setJobId] = useState('');
  const [jobStatus, setJobStatus] = useState<any>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (id) {
      api.getModelDetails(id as string)
        .then(setModel)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [id]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleDeploy = async () => {
    setActionLoading('deploying');
    try {
      await api.deployModel(id as string);
      alert('Model deployed!');
      router.refresh();
      const updated = await api.getModelDetails(id as string);
      setModel(updated);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleStop = async () => {
    setActionLoading('stopping');
    try {
      await api.stopModel(id as string);
      alert('Model stopped!');
      router.refresh();
      const updated = await api.getModelDetails(id as string);
      setModel(updated);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleRestart = async () => {
    setActionLoading('restarting');
    try {
      await api.restartModel(id as string);
      alert('Model restarted!');
      router.refresh();
      const updated = await api.getModelDetails(id as string);
      setModel(updated);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handlePublish = async () => {
    setActionLoading('publishing');
    try {
      await api.publishModel(id as string);
      alert('Model published!');
      router.refresh();
      const updated = await api.getModelDetails(id as string);
      setModel(updated);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this model?')) return;
    setActionLoading('deleting');
    try {
      await api.deleteModel(id as string);
      router.push('/developer');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleTest = async () => {
    try {
      const input = JSON.parse(testInput);
      const result = await api.testModel(id as string, input);
      setTestResult(result.result);
      setTestLogs(result.logs);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRunInference = async () => {
    try {
      const input = JSON.parse(testInput);
      const result = await api.runInference(id as string, input, apiKey);
      setJobId(result.jobId);
      
      pollRef.current = setInterval(async () => {
        const status = await api.getInferenceStatus(id as string, result.jobId);
        setJobStatus(status);
        if (status.status === 'completed' || status.status === 'failed') {
          clearInterval(pollRef.current!);
        }
      }, 2000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleViewLogs = async () => {
    try {
      const result = await api.getModelLogs(id as string, 200);
      setLogs(result.logs);
      setShowLogs(true);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const isOwner = typeof window !== 'undefined' && localStorage.getItem('token');

  if (loading) return <div className="p-8">Loading...</div>;
  if (!model) return <div className="p-8">Model not found</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{model.model.name}</h1>
          <p className="text-gray-600">{model.model.description}</p>
        </div>
        <button onClick={handleDelete} className="text-red-600 hover:underline">
          Delete Model
        </button>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <span className={`px-3 py-1 rounded ${
          model.model.status === 'published' ? 'bg-green-100 text-green-800' :
          model.model.status === 'deployed' ? 'bg-blue-100 text-blue-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {model.model.status}
        </span>
        <span className="text-lg font-medium">${model.price}/request</span>
        {model.container && (
          <span className={`px-3 py-1 rounded ${
            model.container.status === 'running' ? 'bg-green-100' : 'bg-red-100'
          }`}>
            Container: {model.container.status}
          </span>
        )}
      </div>

      {model.model.status === 'draft' && (
        <button 
          onClick={handleDeploy} 
          disabled={actionLoading === 'deploying'}
          className="bg-blue-600 text-white px-6 py-2 rounded mb-6 disabled:opacity-50"
        >
          {actionLoading === 'deploying' ? 'Deploying...' : 'Deploy Model'}
        </button>
      )}

      {model.model.status === 'deployed' && (
        <div className="flex gap-2 mb-6">
          <button 
            onClick={handlePublish} 
            disabled={actionLoading === 'publishing'}
            className="bg-green-600 text-white px-6 py-2 rounded disabled:opacity-50"
          >
            {actionLoading === 'publishing' ? 'Publishing...' : 'Publish to Marketplace'}
          </button>
          {model.container?.status === 'running' ? (
            <button 
              onClick={handleStop} 
              disabled={actionLoading === 'stopping'}
              className="bg-orange-600 text-white px-6 py-2 rounded disabled:opacity-50"
            >
              {actionLoading === 'stopping' ? 'Stopping...' : 'Stop'}
            </button>
          ) : (
            <button 
              onClick={handleRestart} 
              disabled={actionLoading === 'restarting'}
              className="bg-blue-600 text-white px-6 py-2 rounded disabled:opacity-50"
            >
              {actionLoading === 'restarting' ? 'Restarting...' : 'Start'}
            </button>
          )}
          <button 
            onClick={handleViewLogs}
            className="bg-gray-600 text-white px-6 py-2 rounded"
          >
            View Logs
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">API Documentation</h2>
          <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-sm">
            <p className="text-purple-400">POST</p>
            <p>https://api.codexon.ai/v1/models/{id}/inference</p>
            <p className="mt-4 text-gray-400">Headers:</p>
            <p>Authorization: Bearer YOUR_API_KEY</p>
            <p className="mt-4 text-gray-400">Body:</p>
            <p>{`{ "input": { "data": ... } }`}</p>
          </div>

          {model.config && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Model Configuration</h3>
              <div className="text-sm space-y-1">
                <p>Framework: {model.config.runtime?.framework}</p>
                <p>Python: {model.config.runtime?.python}</p>
                <p>CPU: {model.config.resources?.cpu}</p>
                <p>Memory: {model.config.resources?.memory}</p>
                <p>GPU: {model.config.resources?.gpu}</p>
                <p>Endpoint: {model.config.api?.endpoint}</p>
              </div>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Test Model</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Your API Key (for inference)</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="Enter your API key"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Input (JSON)</label>
              <textarea
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                className="w-full p-2 border rounded font-mono text-sm"
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleTest} className="bg-slate-900 text-white px-4 py-2 rounded">
                Test Model
              </button>
              <button 
                onClick={handleRunInference} 
                disabled={!apiKey}
                className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                Run Inference
              </button>
            </div>

            {jobStatus && (
              <div className="bg-blue-50 p-4 rounded border border-blue-200">
                <p className="font-medium">Job Status: {jobStatus.status}</p>
                {jobStatus.result && (
                  <pre className="mt-2 text-sm overflow-auto">{JSON.stringify(jobStatus.result, null, 2)}</pre>
                )}
                {jobStatus.failed && (
                  <p className="text-red-600 mt-2">{jobStatus.failed}</p>
                )}
              </div>
            )}

            {testLogs && (
              <div className="bg-gray-50 p-4 rounded border">
                <p className="font-medium mb-2">Test Logs:</p>
                <pre className="text-sm overflow-auto whitespace-pre-wrap">{testLogs}</pre>
              </div>
            )}

            {testResult && (
              <div className="bg-green-50 p-4 rounded border border-green-200">
                <p className="font-medium mb-2">Result:</p>
                <pre className="text-sm overflow-auto">{JSON.stringify(testResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {showLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Container Logs</h2>
              <button onClick={() => setShowLogs(false)} className="text-gray-500 hover:text-gray-700">
                Close
              </button>
            </div>
            <pre className="bg-slate-900 text-slate-100 p-4 rounded text-sm overflow-auto whitespace-pre-wrap">
              {logs || 'No logs available'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}