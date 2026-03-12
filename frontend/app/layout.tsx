import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Codexon - AI Model Marketplace',
  description: 'Build, deploy, and monetize AI models',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="bg-slate-900 text-white p-4">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <a href="/" className="text-2xl font-bold">Codexon</a>
            <div className="space-x-4">
              <a href="/models" className="hover:text-slate-300">Marketplace</a>
              <a href="/developer" className="hover:text-slate-300">Developer</a>
              <a href="/dashboard" className="hover:text-slate-300">Dashboard</a>
              <a href="/monitoring" className="hover:text-slate-300">Monitoring</a>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto p-4">{children}</main>
      </body>
    </html>
  );
}