'use client';

import { ContentDashboard } from '@/components/ContentDashboard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/engine">
              <Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Content Dashboard</h1>
              <p className="text-slate-500">Manage and edit your generated articles from one place.</p>
            </div>
          </div>
          <Link href="/detector">
            <Button variant="outline" className="font-semibold text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 shadow-sm rounded-xl py-2 px-4">
              Launch Weak Copy Detector
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-200">
            <ContentDashboard />
        </div>
      </div>
    </div>
  );
}

