export const dynamic = 'force-dynamic';

import { getDailyCallVolume } from '@/lib/db';

function fmtDay(day: string) {
  return new Date(day + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

export default async function StatsPage() {
  const rows = await getDailyCallVolume(30);
  const totalTranscripts = rows.reduce((s, r) => s + r.transcripts, 0);

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#ffffff' }}>Daily Import Log</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Last 30 days · {totalTranscripts} transcripts imported
        </p>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
        {rows.length === 0 ? (
          <div className="bg-white p-6 text-sm" style={{ color: 'var(--text-3)' }}>
            No calls imported in the last 30 days.
          </div>
        ) : (
          <table className="w-full text-sm bg-white">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-5 py-3 font-semibold text-xs" style={{ color: 'var(--text-3)' }}>Date</th>
                <th className="text-right px-5 py-3 font-semibold text-xs" style={{ color: 'var(--text-3)' }}>Transcripts</th>
                <th className="text-right px-5 py-3 font-semibold text-xs" style={{ color: 'var(--text-3)' }}>Deals</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.day}
                  style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : undefined }}
                >
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-1)' }}>
                    {fmtDay(row.day)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums" style={{ color: 'var(--text-1)' }}>
                    {row.transcripts}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums" style={{ color: 'var(--text-2)' }}>
                    {row.deals}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
