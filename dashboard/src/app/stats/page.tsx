export const dynamic = 'force-dynamic';

import { getStats } from '@/lib/db';
import StatsCards from '@/components/StatsCards';
import { TrendingUp, Phone, Mail, BarChart2 } from 'lucide-react';
import { stageBadgeClass } from '@/lib/stages';

function activityIcon(type: string) {
  if (type === 'call')     return <Phone size={14} className="text-indigo-400" />;
  if (type === 'email')    return <Mail size={14} className="text-violet-400" />;
  return <BarChart2 size={14} className="text-[#F4956A]" />;
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default async function StatsPage() {
  const stats = await getStats();
  const maxCount = Math.max(...stats.deals_by_stage.map(s => s.count), 1);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>Statistics</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>Live view of your production database</p>
      </div>

      <StatsCards stats={stats} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stage breakdown */}
        <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#EEF0FF' }}>
              <TrendingUp size={14} style={{ color: 'var(--primary)' }} />
            </div>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Deals by Stage</h2>
          </div>
          {stats.deals_by_stage.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>No stage data yet.</p>
          ) : (
            <div className="space-y-3">
              {stats.deals_by_stage.map(({ stage, count }) => (
                <div key={stage} className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium w-44 truncate shrink-0 ${stageBadgeClass(stage)}`}>
                    {stage}
                  </span>
                  <div className="flex-1 rounded-full h-2" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.round((count / maxCount) * 100)}%`,
                        background: 'linear-gradient(90deg, var(--primary), #8B83F5)',
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold w-5 text-right" style={{ color: 'var(--text-1)' }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
          <h2 className="font-semibold text-sm mb-5" style={{ color: 'var(--text-1)' }}>Recent Activity</h2>
          {stats.recent_activity.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {stats.recent_activity.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: '#F0EFFF' }}>
                    {activityIcon(item.activity_type)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>
                      {item.deal_name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                      {item.account_name ?? item.stage ?? ''} · {fmtTime(item.activity_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
