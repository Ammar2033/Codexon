'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function DeployModel() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const result = await api.uploadModel(file);
      alert('Model uploaded successfully!');
      router.push('/developer');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Deploy New Model</h1>

      <div className="max-w-2xl">
        <div className="bg-yellow-50 p-4 rounded-lg mb-6 border border-yellow-200">
          <h3 className="font-semibold mb-2">Model Package Requirements</h3>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            <li>ZIP file containing:</li>
            <li className="ml-4">model/ - folder with model.onnx or model.pt</li>
            <li className="ml-4">app.py - FastAPI inference server</li>
            <li className="ml-4">requirements.txt - Python dependencies</li>
            <li className="ml-4">aimodel.codexon - deployment manifest</li>
          </ul>
        </div>

        <div className="border-2 border-dashed p-8 rounded-lg text-center mb-6">
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="mb-4"
          />
          {file && <p className="text-sm">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
        </div>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="bg-slate-900 text-white px-6 py-2 rounded disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload Model'}
        </button>
      </div>
    </div>
  );
}