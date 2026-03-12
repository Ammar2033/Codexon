'use client';
import Link from 'next/link';
import { Model } from '@/lib/api';

interface ModelCardProps {
  model: Model;
  isOwner?: boolean;
  price?: number;
  showActions?: boolean;
}

export function ModelCard({ model, isOwner = false, price, showActions = true }: ModelCardProps) {
  const statusColors = {
    draft: 'bg-gray-100 text-gray-800',
    deployed: 'bg-blue-100 text-blue-800',
    published: 'bg-green-100 text-green-800',
    archived: 'bg-red-100 text-red-800',
  };

  return (
    <div className="border rounded-lg hover:shadow-lg transition-shadow p-5 bg-white">
      <div className="flex justify-between items-start mb-3">
        <Link href={`/models/${model.id}`} className="flex-1">
          <h3 className="text-lg font-semibold hover:text-blue-600">{model.name}</h3>
        </Link>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[model.status] || 'bg-gray-100'}`}>
          {model.status}
        </span>
      </div>

      <p className="text-gray-600 text-sm mb-4 line-clamp-2">
        {model.description || 'No description provided'}
      </p>

      <div className="flex justify-between items-center text-sm">
        <span className="text-green-600 font-medium">
          ${(price || model.price || 0.002).toFixed(3)}/req
        </span>
        
        {showActions && (
          <div className="flex gap-2">
            <Link
              href={`/models/${model.id}`}
              className="text-blue-600 hover:underline text-sm"
            >
              {isOwner ? 'Manage' : 'Use'}
            </Link>
          </div>
        )}
      </div>

      {isOwner && showActions && model.status !== 'draft' && (
        <div className="mt-3 pt-3 border-t flex gap-3 text-sm">
          <Link href={`/models/${model.id}/analytics`} className="text-gray-600 hover:text-gray-900">
            Analytics
          </Link>
          <Link href={`/models/${model.id}/logs`} className="text-gray-600 hover:text-gray-900">
            Logs
          </Link>
          <Link href={`/models/${model.id}/versions`} className="text-gray-600 hover:text-gray-900">
            Versions
          </Link>
        </div>
      )}
    </div>
  );
}

interface ModelCardSkeletonProps {
  count?: number;
}

export function ModelCardSkeleton({ count = 3 }: ModelCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border rounded-lg p-5 animate-pulse">
          <div className="flex justify-between items-start mb-3">
            <div className="h-6 bg-gray-200 rounded w-1/2"></div>
            <div className="h-5 bg-gray-200 rounded w-16"></div>
          </div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="flex justify-between items-center mt-4">
            <div className="h-4 bg-gray-200 rounded w-20"></div>
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </div>
        </div>
      ))}
    </>
  );
}
