'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Model } from '@/lib/api';

export default function DeveloperPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMyModels()
      .then(setModels)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Developer Panel</h1>
        <Link href="/developer/deploy" className="bg-slate-900 text-white px-6 py-2 rounded">
          Deploy Model
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Link href="/developer" className="p-4 bg-slate-100 rounded-lg">
          <div className="text-2xl font-bold">{models.filter(m => m.status === 'draft').length}</div>
          <div className="text-gray-600">Drafts</div>
        </Link>
        <Link href="/developer" className="p-4 bg-blue-100 rounded-lg">
          <div className="text-2xl font-bold">{models.filter(m => m.status === 'deployed').length}</div>
          <div className="text-gray-600">Deployed</div>
        </Link>
        <Link href="/developer" className="p-4 bg-green-100 rounded-lg">
          <div className="text-2xl font-bold">{models.filter(m => m.status === 'published').length}</div>
          <div className="text-gray-600">Published</div>
        </Link>
        <Link href="/developer/revenue" className="p-4 bg-purple-100 rounded-lg">
          <div className="text-2xl font-bold">$</div>
          <div className="text-gray-600">Revenue</div>
        </Link>
      </div>

      <h2 className="text-xl font-semibold mb-4">My Models</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="space-y-4">
          {models.map(model => (
            <div key={model.id} className="border p-4 rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold">{model.name}</h3>
                  <p className="text-gray-600">{model.description}</p>
                </div>
                <span className={`px-3 py-1 rounded text-sm ${
                  model.status === 'published' ? 'bg-green-100 text-green-800' :
                  model.status === 'deployed' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {model.status}
                </span>
              </div>
              <div className="mt-4 space-x-2">
                {model.status === 'draft' && (
                  <button className="text-blue-600 hover:underline">Deploy</button>
                )}
                {model.status === 'deployed' && (
                  <button className="text-green-600 hover:underline">Publish</button>
                )}
                <Link href={`/models/${model.id}`} className="text-gray-600 hover:underline">View</Link>
              </div>
            </div>
          ))}
          {models.length === 0 && (
            <p className="text-gray-500">No models yet. <Link href="/developer/deploy" className="text-blue-600">Deploy your first model</Link></p>
          )}
        </div>
      )}
    </div>
  );
}