'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STAGE_ORDER, stageBadgeClass, stageLabel } from '@/lib/stages';
import type { DealQueryFilters, DealQueryRow } from '@/lib/types';
import ChatPanel from '@/components/ChatPanel';

interface Props {
  filters: DealQueryFilters;
}

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function QueryResults({ filters }: Props) {
  const [deals, setDeals] = useState<DealQueryRow[]>([]);
  const [totalTranscripts, setTotalTranscripts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.owner)    params.set('owner', filters.owner);
    if (filters.dealName) params.set('dealName', filters.dealName);
    if (filters.stage)    params.set('stage', filters.stage);
    if (filters.from)     params.set('from', filters.from);
    if (filters.to)       params.set('to', filters.to);

    fetch(`/api/deals/query?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setDeals(d.deals);
        setTotalTranscripts(d.total_transcripts);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [filters.owner, filters.dealName, filters.stage, filters.from, filters.to]);

  const stageBreakdown = (() => {
    const map = new Map<string, { deals: number; transcripts: number }>();
    for (const d of deals) {
      const s = stageLabel(d.stage);
      const cur = map.get(s) ?? { deals: 0, transcripts: 0 };
      map.set(s, { deals: cur.deals + 1, transcripts: cur.transcripts + d.transcript_count });
    }
    return STAGE_ORDER
      .map(s => ({ stage: s, ...(map.get(s) ?? { deals: 0, transcripts: 0 }) }))
      .filter(r => r.deals > 0);
  })();

  if (loading) return (
    <div className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>Loading results…</div>
  );
  if (error) return (
    <div className="py-12 text-center text-sm text-rose-500">{error}</div>
  );

  return (
    <div className="space-y-5">
      {/* Stage breakdown summary */}
      {deals.length > 0 && (
        <div className="bg-white rounded-2xl overflow-hidden"
          style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
          <div className="px-5 py-3.5 flex items-center justify-between"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Summary by Stage
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <span>
                <strong className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{deals.length}</strong>
                <span className="ml-1" style={{ color: 'var(--text-3)' }}>deals</span>
              </span>
              <span>
                <strong className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{totalTranscripts}</strong>
                <span className="ml-1" style={{ color: 'var(--text-3)' }}>transcripts</span>
              </span>
            </div>
          </div>
          <div className="px-5 py-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                  <th className="text-left font-semibold py-1.5 pr-8">Stage</th>
                  <th className="text-right font-semibold py-1.5 pr-8">Deals</th>
                  <th className="text-right font-semibold py-1.5 pr-6">Transcripts</th>
                  <th className="text-right font-semibold py-1.5">Avg / deal</th>
                </tr>
              </thead>
              <tbody>
                {stageBreakdown.map(row => (
                  <tr key={row.stage} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="py-2 pr-8">
                      <span className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-lg ${stageBadgeClass(row.stage)}`}>
                        {row.stage}
                      </span>
                    </td>
                    <td className="py-2 pr-8 text-right font-bold" style={{ color: 'var(--text-1)' }}>
                      {row.deals}
                    </td>
                    <td className="py-2 pr-6 text-right font-bold" style={{ color: 'var(--text-1)' }}>
                      {row.transcripts}
                    </td>
                    <td className="py-2 text-right text-xs" style={{ color: 'var(--text-3)' }}>
                      {(row.transcripts / row.deals).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {deals.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-sm"
          style={{ border: '1px solid var(--border)', color: 'var(--text-3)' }}>
          No transcripts match the selected filters.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Chat — full width on top */}
          <ChatPanel
            filters={filters}
            totalTranscripts={totalTranscripts}
            dealCount={deals.length}
          />

          {/* Deal list — below chat */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide px-1" style={{ color: 'var(--text-3)' }}>
              Deals
            </h3>
            <div className="bg-white rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
              {deals.map((deal, i) => (
                <div
                  key={deal.deal_id}
                  className="px-4 py-3"
                  style={i > 0 ? { borderTop: '1px solid var(--border)' } : {}}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/deals/${deal.deal_id}`}
                      className="font-semibold text-sm truncate transition-colors hover:underline"
                      style={{ color: 'var(--text-1)' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--primary)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'}
                    >
                      {deal.deal_name || '(unnamed)'}
                    </Link>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-lg shrink-0 whitespace-nowrap"
                      style={{ background: '#EEF0FF', color: 'var(--primary)' }}>
                      {deal.transcript_count} call{deal.transcript_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium ${stageBadgeClass(deal.stage)}`}>
                      {stageLabel(deal.stage)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>{fmt(deal.latest_timestamp)}</span>
                  </div>
                  {deal.exec_summary && (
                    <p className="mt-1.5 text-xs line-clamp-2" style={{ color: 'var(--text-3)' }}>
                      {deal.exec_summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
