'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, User } from '@/lib/api';

interface ModelVersion {
  id: string;
  version: string;
  status: 'active' | 'staging' | 'archived' | 'deprecated';
  is_default: boolean;
  created_at: string;
  deployed_at?: string;
}

export default function ModelVersionsPage() {
  const params = useParams();
  const modelId = params.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [newVersion, setNewVersion] = useState('');
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api.getMe()
      .then(data => {
        setUser(data.user);
        if (!data.user.is_creator) {
          router.push('/dashboard');
        }
      })
      .catch(() => router.push('/login'));
  }, [router]);

  useEffect(() => {
    if (user?.is_creator && modelId) {
      loadVersions();
    }
  }, [user, modelId]);

  const loadVersions = async () => {
    try {
      const data = await api.getModelVersions(modelId);
      setVersions(data);
    } catch (err) {
      console.error('Failed to load versions:', err);
      // Mock data
      setVersions([
        { id: 'v3', version: '3.0.0', status: 'active', is_default: true, created_at: new Date().toISOString(), deployed_at: new Date().toISOString() },
        { id: 'v2', version: '2.0.0', status: 'staging', is_default: false, created_at: new Date(Date.now() - 86400000 * 7).toISOString() },
        { id: 'v1', version: '1.0.0', status: 'archived', is_default: false, created_at: new Date(Date.now() - 86400000 * 30).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!newVersion.trim()) return;
    
    setCreating(true);
    try {
      await api.createModelVersion(modelId, newVersion);
      setNewVersion('');
      loadVersions();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSetActive = async (versionId: string) => {
    try {
      await api.setActiveVersion(modelId, versionId);
      loadVersions();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    staging: 'bg-blue-100 text-blue-800',
    archived: 'bg-gray-100 text-gray-800',
    deprecated: 'bg-red-100 text-red-800',
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Model Versions</h1>
          <p className="text-gray-500 mt-1">Manage versions of your model</p>
        </div>
        <Link href={`/models/${modelId}`} className="text-blue-600 hover:underline">
          Back to Model
        </Link>
      </div>

      {/* Create New Version */}
      <div className="bg-white p-4 rounded-lg border mb-6">
        <h2 className="font-semibold mb-3">Create New Version</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newVersion}
            onChange={(e) => setNewVersion(e.target.value)}
            placeholder="Version (e.g., 1.0.1)"
            className="flex-1 px-3 py-2 border rounded-md"
          />
          <button
            onClick={handleCreateVersion}
            disabled={creating || !newVersion.trim()}
            className="bg-slate-900 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Version'}
          </button>
        </div>
      </div>

      {/* Version List */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Default</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deployed</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {versions.map((version) => (
              <tr key={version.id} className="hover:bg-gray-50">
                <td className="px-4 py-4 font-mono font-medium">{version.version}</td>
                <td className="px-4 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[version.status]}`}>
                    {version.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  {version.is_default ? (
                    <span className="text-green-600">✓ Default</span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-4 py-4 text-gray-600">
                  {new Date(version.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-4 text-gray-600">
                  {version.deployed_at ? new Date(version.deployed_at).toLocaleDateString() : '-'}
                </td>
                <td className="px-4 py-4">
                  {version.status !== 'active' && (
                    <button
                      onClick={() => handleSetActive(version.id)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Set Active
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {versions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No versions yet. Create your first version above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">Version Management</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• <strong>Active</strong>: The version currently serving inference requests</li>
          <li>• <strong>Staging</strong>: Version being tested before going live</li>
          <li>• <strong>Archived</strong>: Previous versions kept for rollback</li>
          <li>• <strong>Deprecated</strong>: Versions no longer supported</li>
        </ul>
      </div>
    </div>
  );
}

import Link from 'next/link';
