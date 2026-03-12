'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api, Model } from '@/lib/api';
import { ModelCard, ModelCardSkeleton } from '@/components/ModelCard';

export default function MarketplacePage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'deployed'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'newest' | 'price'>('newest');

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const data = await api.getMarketplaceModels();
      setModels(data);
    } catch (err) {
      console.error('Failed to load models:', err);
      // Mock data for demo
      setModels([
        { id: '1', owner_id: 1, name: 'GPT-4 Style LLM', description: 'Large language model for text generation', status: 'published', price: 0.01 },
        { id: '2', owner_id: 2, name: 'Stable Diffusion XL', description: 'Image generation model', status: 'published', price: 0.005 },
        { id: '3', owner_id: 1, name: 'Whisper Large V3', description: 'Speech to text transcription', status: 'published', price: 0.003 },
        { id: '4', owner_id: 3, name: 'CodeGen Pro', description: 'Code generation model', status: 'published', price: 0.008 },
        { id: '5', owner_id: 2, name: 'Embedding Model', description: 'Text embeddings for semantic search', status: 'deployed', price: 0.001 },
        { id: '6', owner_id: 4, name: 'Object Detector', description: 'Real-time object detection', status: 'published', price: 0.002 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const filteredModels = useMemo(() => {
    return models
      .filter(model => {
        if (statusFilter !== 'all' && model.status !== statusFilter) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            model.name.toLowerCase().includes(query) ||
            model.description?.toLowerCase().includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'price') return (a.price || 0) - (b.price || 0);
        return 0; // newest - keep original order
      });
  }, [models, searchQuery, statusFilter, sortBy]);

  const stats = useMemo(() => ({
    total: models.length,
    published: models.filter(m => m.status === 'published').length,
    deployed: models.filter(m => m.status === 'deployed').length,
  }), [models]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Model Marketplace</h1>
        <p className="text-gray-500">Discover and use AI models from the community</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Models</div>
        </div>
        <div className="bg-white p-4 rounded-lg border text-center">
          <div className="text-2xl font-bold text-green-600">{stats.published}</div>
          <div className="text-sm text-gray-500">Published</div>
        </div>
        <div className="bg-white p-4 rounded-lg border text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.deployed}</div>
          <div className="text-sm text-gray-500">Deployed</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg border mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="deployed">Deployed</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="newest">Newest</option>
            <option value="name">Name A-Z</option>
            <option value="price">Price: Low to High</option>
          </select>
        </div>
      </div>

      {/* Model Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ModelCardSkeleton count={6} />
        </div>
      ) : filteredModels.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModels.map(model => (
            <ModelCard key={model.id} model={model} showActions={true} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg mb-4">No models found matching your criteria</p>
          <button
            onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
            className="text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* CTA */}
      {models.length > 0 && (
        <div className="mt-12 bg-slate-900 text-white rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">Have a model to share?</h2>
          <p className="text-gray-300 mb-4">Upload your AI model and start earning</p>
          <Link
            href="/developer/deploy"
            className="inline-block bg-white text-slate-900 px-6 py-2 rounded-lg font-medium hover:bg-gray-100"
          >
            Deploy Your Model
          </Link>
        </div>
      )}
    </div>
  );
}
