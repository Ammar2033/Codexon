'use client';

import './globals.css';
import { Inter } from 'next/font/google';
import { UserProvider } from '@/components/UserContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@/components/UserContext';

const inter = Inter({ subsets: ['latin'] });

function Navbar() {
  const { user, loading, isCreator } = useUser();
  const pathname = usePathname();

  if (loading) {
    return (
      <nav className="bg-slate-900 text-white p-4">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse h-8 bg-slate-700 rounded w-32"></div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-2xl font-bold">Codexon</Link>
            <div className="hidden md:flex gap-6">
              <Link 
                href="/models" 
                className={`hover:text-slate-300 ${pathname.startsWith('/models') ? 'text-blue-400' : ''}`}
              >
                Marketplace
              </Link>
              {isCreator && (
                <>
                  <Link 
                    href="/developer" 
                    className={`hover:text-slate-300 ${pathname.startsWith('/developer') ? 'text-blue-400' : ''}`}
                  >
                    Developer
                  </Link>
                  <Link 
                    href="/developer/analytics" 
                    className={`hover:text-slate-300 ${pathname === '/developer/analytics' ? 'text-blue-400' : ''}`}
                  >
                    Analytics
                  </Link>
                  <Link 
                    href="/developer/logs" 
                    className={`hover:text-slate-300 ${pathname === '/developer/logs' ? 'text-blue-400' : ''}`}
                  >
                    Logs
                  </Link>
                </>
              )}
              <Link 
                href="/monitoring" 
                className={`hover:text-slate-300 ${pathname === '/monitoring' ? 'text-blue-400' : ''}`}
              >
                Monitoring
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link 
                  href="/dashboard" 
                  className="text-sm hover:text-slate-300"
                >
                  {user.email}
                  {isCreator && <span className="ml-2 px-2 py-0.5 bg-purple-600 text-xs rounded">Creator</span>}
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="hover:text-slate-300">Login</Link>
                <Link href="/register" className="bg-blue-600 px-4 py-2 rounded hover:bg-blue-700">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <UserProvider>
          <Navbar />
          <main className="max-w-6xl mx-auto px-4 py-6 min-h-screen bg-gray-50">
            {children}
          </main>
          <footer className="border-t bg-white py-6">
            <div className="max-w-6xl mx-auto px-4 text-center text-gray-500 text-sm">
              <p>Codexon AI Model Marketplace</p>
            </div>
          </footer>
        </UserProvider>
      </body>
    </html>
  );
}
