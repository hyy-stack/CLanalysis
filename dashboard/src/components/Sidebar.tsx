'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, Upload, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';

const nav = [
  { href: '/deals',  label: 'Anrok Deal Analyzer', icon: Sparkles, highlight: true },
  { href: '/stats',  label: 'Statistics',           icon: BarChart2 },
  { href: '/import', label: 'Import',                icon: Upload },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Persist across page loads
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);
  const toggle = () => {
    setCollapsed(c => {
      localStorage.setItem('sidebar-collapsed', String(!c));
      return !c;
    });
  };

  return (
    <aside
      className="shrink-0 flex flex-col h-screen sticky top-0 transition-all duration-200"
      style={{
        width: collapsed ? 56 : 208,
        background: 'var(--sidebar)',
      }}
    >
      {/* Brand */}
      {!collapsed && (
        <div className="px-5 py-5 overflow-hidden" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase whitespace-nowrap"
            style={{ color: 'rgba(255,255,255,0.35)' }}>
            Anrok
          </p>
          <p className="text-sm font-semibold text-white mt-0.5 whitespace-nowrap">Deal Analyzer</p>
        </div>
      )}
      {collapsed && (
        <div className="flex items-center justify-center py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.12)' }}>
            <Sparkles size={14} className="text-white" />
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon, highlight }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className="flex items-center rounded-xl text-sm font-medium transition-all overflow-hidden"
              style={{
                gap: collapsed ? 0 : 10,
                padding: collapsed ? '10px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                ...(active
                  ? { background: 'rgba(255,255,255,0.15)', color: '#fff' }
                  : highlight
                    ? { color: 'rgba(255,255,255,0.95)' }
                    : { color: 'rgba(255,255,255,0.5)' }),
              }}
            >
              <Icon size={15} className="shrink-0" />
              {!collapsed && (
                <span className={`truncate ${highlight ? 'font-semibold text-white' : ''}`}>
                  {label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
        <button
          onClick={toggle}
          className="w-full flex items-center justify-center rounded-xl py-2 transition-all"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          {!collapsed && <span className="text-xs ml-2">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
