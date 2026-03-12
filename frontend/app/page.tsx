import Link from 'next/link';

export default function Home() {
  return (
    <div className="text-center py-20">
      <h1 className="text-5xl font-bold mb-6">Welcome to Codexon</h1>
      <p className="text-xl text-gray-600 mb-8">
        Build, deploy, and monetize AI models
      </p>
      <div className="space-x-4">
        <Link
          href="/register"
          className="bg-slate-900 text-white px-6 py-3 rounded-lg hover:bg-slate-800"
        >
          Get Started
        </Link>
        <Link
          href="/models"
          className="border border-slate-900 text-slate-900 px-6 py-3 rounded-lg hover:bg-slate-100"
        >
          Browse Models
        </Link>
      </div>
      <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="p-6 border rounded-lg">
          <h3 className="text-xl font-semibold mb-2">Upload Models</h3>
          <p className="text-gray-600">Upload your trained models as ZIP packages with .codexon manifest</p>
        </div>
        <div className="p-6 border rounded-lg">
          <h3 className="text-xl font-semibold mb-2">Deploy & Test</h3>
          <p className="text-gray-600">Deploy models as API endpoints and test before publishing</p>
        </div>
        <div className="p-6 border rounded-lg">
          <h3 className="text-xl font-semibold mb-2">Earn Revenue</h3>
          <p className="text-gray-600">Set pricing per request and earn 80% of the revenue</p>
        </div>
      </div>
    </div>
  );
}