'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, User } from '@/lib/api';

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api.getMe()
      .then(data => setUser(data.user))
      .catch(() => {
        router.push('/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleBecomeCreator = async () => {
    try {
      await api.becomeCreator();
      setUser({ ...user!, is_creator: true });
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    router.push('/login');
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <button onClick={handleLogout} className="text-red-600">Logout</button>
      </div>

      <div className="bg-gray-100 p-6 rounded-lg mb-6">
        <p className="text-lg">Logged in as: <strong>{user?.email}</strong></p>
        <p className="text-lg">Account type: <strong>{user?.is_creator ? 'Creator' : 'User'}</strong></p>
      </div>

      {!user?.is_creator && (
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h2 className="text-xl font-semibold mb-2">Become a Creator</h2>
          <p className="text-gray-600 mb-4">
            Upgrade your account to upload, deploy, and monetize AI models.
          </p>
          <button
            onClick={handleBecomeCreator}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Become a Creator
          </button>
        </div>
      )}

      {user?.is_creator && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <a href="/developer" className="p-6 border rounded-lg hover:shadow-lg transition">
            <h2 className="text-xl font-semibold">Developer Panel</h2>
            <p className="text-gray-600">Manage your models, deployments, and revenue</p>
          </a>
          <a href="/developer/deploy" className="p-6 border rounded-lg hover:shadow-lg transition">
            <h2 className="text-xl font-semibold">Deploy New Model</h2>
            <p className="text-gray-600">Upload and deploy a new AI model</p>
          </a>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Quick Links</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <a href="/dashboard/usage" className="p-4 border rounded-lg hover:shadow-md transition">
            <h3 className="font-semibold mb-1">View Usage</h3>
            <p className="text-sm text-gray-500">See your API request history</p>
          </a>
          <a href="/models" className="p-4 border rounded-lg hover:shadow-md transition">
            <h3 className="font-semibold mb-1">Browse Models</h3>
            <p className="text-sm text-gray-500">Discover AI models</p>
          </a>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">API Keys</h2>
        <ApiKeysList />
      </div>
    </div>
  );
}

function ApiKeysList() {
  const [keys, setKeys] = useState<{ id: number; created_at: string }[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);

  useEffect(() => {
    api.getApiKeys().then(setKeys).catch(console.error);
  }, []);

  const handleCreate = async () => {
    try {
      const result = await api.createApiKey();
      setNewKey(result.key);
      setKeys([...keys, { id: result.id, created_at: new Date().toISOString() }]);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteApiKey(id);
      setKeys(keys.filter(k => k.id !== id));
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      {newKey && (
        <div className="bg-green-100 p-4 rounded mb-4">
          <p className="font-medium">Your new API key:</p>
          <code className="bg-white p-2 block mt-2 font-mono">{newKey}</code>
          <p className="text-sm text-gray-600 mt-2">Save this now - it won't be shown again!</p>
        </div>
      )}
      <button onClick={handleCreate} className="bg-slate-900 text-white px-4 py-2 rounded mb-4">
        Create New API Key
      </button>
      <div className="space-y-2">
        {keys.map(key => (
          <div key={key.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
            <span>Key #{key.id} - Created {new Date(key.created_at).toLocaleDateString()}</span>
            <button onClick={() => handleDelete(key.id)} className="text-red-600">Delete</button>
          </div>
        ))}
        {keys.length === 0 && <p className="text-gray-500">No API keys yet</p>}
      </div>
    </div>
  );
}