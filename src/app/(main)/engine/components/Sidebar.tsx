'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Compass,
  Wand2,
  ScanSearch,
  Sparkles,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';

interface SidebarProps {
  onShowDashboard: () => void;
}

// ─── Stable nav item component ─────────────────────────────────────────────
// Defined outside Sidebar so React never recreates the component type on re-renders,
// which previously caused icon flicker when pathname changed.
interface NavItemProps {
  href: string;
  Icon: LucideIcon;
  label: string;
  pathname: string;
  gradient: string;
}

function NavItem({ href, Icon, label, pathname, gradient }: NavItemProps) {
  const isActive = pathname === href || pathname.startsWith(href + '/');
  return (
    <Link href={href} className="block mb-1">
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
          isActive
            ? 'bg-[var(--color-indigo-50)] text-indigo-700 font-semibold shadow-sm border border-indigo-100'
            : 'text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50/40'
        }`}
      >
        <div className={`w-8 h-8 rounded-xl ${isActive ? gradient : 'bg-slate-100'} flex items-center justify-center shrink-0 transition-all shadow-sm`}>
          <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
        </div>
        <span className="text-sm">{label}</span>
      </div>
    </Link>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────────────────
export function Sidebar({ onShowDashboard }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  return (
    <>
      <aside
        className={`${
          isOpen ? 'w-72 border-r' : 'w-0 border-r-0'
        } bg-white/50 backdrop-blur-xl flex flex-col h-screen sticky top-0 shrink-0 z-40 transition-all duration-300 ease-in-out overflow-hidden shadow-xl shadow-slate-200/20`}
      >
        <div className="w-72 h-full flex flex-col relative">
          {/* Collapse button */}
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-6 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-900 transition-colors z-50"
            title="Close Sidebar"
          >
            <PanelLeftClose className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="p-8 pb-4 pr-12">
            <div className="flex items-center gap-3 text-indigo-600 font-black text-xl tracking-tight mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span>Assembly</span>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-[0.15em] leading-relaxed opacity-70">
              SEO Content Engine
            </p>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-4 py-8 space-y-6">
            <div className="space-y-1">
              <label className="px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 block opacity-50">
                Main Tools
              </label>
              <NavItem href="/planning" Icon={Compass}    label="Strategy & Planning" pathname={pathname} gradient="bg-gradient-to-br from-indigo-500 to-violet-600" />
              <NavItem href="/engine"   Icon={Wand2}      label="Blog Generator"      pathname={pathname} gradient="bg-gradient-to-br from-purple-500 to-indigo-600" />
              <NavItem href="/detector" Icon={ScanSearch} label="Copy Detector"       pathname={pathname} gradient="bg-gradient-to-br from-violet-500 to-purple-600" />
            </div>

            <div className="space-y-1">
              <label className="px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3 block opacity-50">
                Project Management
              </label>
              <button
                type="button"
                onClick={onShowDashboard}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50/40 transition-all text-left"
              >
                <LayoutDashboard className="w-4 h-4 shrink-0" />
                <span className="text-sm">My Contents</span>
              </button>
            </div>
          </nav>

          {/* Footer */}
          <div className="p-6 border-t bg-[var(--color-indigo-50)] space-y-3">
            {user && (
              <div className="flex items-center gap-3 px-1">
                {user.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-8 h-8 rounded-full shrink-0 ring-2 ring-indigo-100"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs flex items-center justify-center shrink-0">
                    {(user.displayName || user.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-700 truncate">
                    {user.displayName || 'Signed in'}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                </div>
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl shadow-slate-200">
              <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Status</div>
              <div className="text-xs font-medium flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Generation Ready
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Floating re-open button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed top-6 left-4 p-2 rounded-lg bg-white shadow-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors z-50 animate-in fade-in zoom-in duration-300"
          title="Open Sidebar"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}
    </>
  );
}
