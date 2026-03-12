'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Model } from '@/lib/api';

export default function Marketplace() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMarketplaceModels()
      .then(setModels)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Model Marketplace</h1>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {models.map(model => (
            <Link key={model.id} href={`/models/${model.id}`} className="border p-6 rounded-lg hover:shadow-lg transition">
              <h3 className="text-xl font-semibold mb-2">{model.name}</h3>
              <p className="text-gray-600 mb-4">{model.description}</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">{model.status}</span>
                <span className="text-green-600 font-medium">${(model.price || 0.002).toFixed(3)}/req</span>
              </div>
            </Link>
          ))}
          {models.length === 0 && (
            <p className="text-gray-500 col-span-3">No models available yet.</p>
          )}
        </div>
      )}
    </div>
  );
}