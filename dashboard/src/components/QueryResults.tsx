'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { STAGE_ORDER, stageBadgeClass, stageLabel } from '@/lib/stages';
import type { DealQueryFilters, DealQueryRow } from '@/lib/types';
import ChatPanel from '@/components/ChatPanel';

export interface TranscriptRow {
  id: string;
  external_id: string | null;
  title: string | null;
  timestamp: string;
  deal_id: string;
  deal_name: string;
  stage: string | null;
}

interface Props {
  filters: DealQueryFilters;
}

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Transcript list grouped by deal then stage ────────────────────────────────

export function TranscriptList({ transcripts, deals }: { transcripts: TranscriptRow[]; deals: DealQueryRow[] }) {
  if (transcripts.length === 0) return null;

  // Build deal → stage map for ordering (falls back to stage on the transcript itself)
  const dealStageMap = new Map(deals.map(d => [d.deal_id, d.stage]));

  // Group by deal_id
  const byDeal = new Map<string, TranscriptRow[]>();
  for (const t of transcripts) {
    if (!byDeal.has(t.deal_id)) byDeal.set(t.deal_id, []);
    byDeal.get(t.deal_id)!.push(t);
  }

  // Sort deals by stage order
  const stageIdx = (stage: string | null) => {
    const i = (STAGE_ORDER as readonly string[]).indexOf(stageLabel(stage));
    return i === -1 ? 999 : i;
  };

  const effectiveStage = (dealId: string, rows: TranscriptRow[]) =>
    dealStageMap.get(dealId) ?? rows[0]?.stage ?? null;

  const sortedDealIds = Array.from(byDeal.keys()).sort((a, b) => {
    return stageIdx(effectiveStage(a, byDeal.get(a)!)) - stageIdx(effectiveStage(b, byDeal.get(b)!));
  });

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide px-1" style={{ color: 'var(--text-3)' }}>
        Transcripts
      </h3>
      <div className="space-y-3">
        {sortedDealIds.map(dealId => {
          const rows = byDeal.get(dealId)!;
          const { deal_name, stage } = rows[0];
          return (
            <div key={dealId} className="bg-white rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
              {/* Deal header */}
              <div className="px-4 py-2.5 flex items-center gap-2.5"
                style={{ borderBottom: '1px solid var(--border)', background: '#FAFAFA' }}>
                <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                  {deal_name || '(unnamed)'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${stageBadgeClass(stage)}`}>
                  {stageLabel(stage)}
                </span>
                <span className="ml-auto text-xs" style={{ color: 'var(--text-3)' }}>
                  {rows.length} call{rows.length !== 1 ? 's' : ''}
                </span>
              </div>
              {/* Individual transcripts */}
              {rows.map((t, i) => (
                <div key={t.id} className="px-4 py-2.5 flex items-center gap-3"
                  style={i > 0 ? { borderTop: '1px solid var(--border)' } : {}}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>
                      {t.title || 'Untitled call'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                      {fmt(t.timestamp)}
                    </p>
                  </div>
                  {t.external_id && (
                    <a
                      href={`https://app.gong.io/call?id=${t.external_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-colors"
                      style={{ background: '#EEF0FF', color: 'var(--primary)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--primary)'; (e.currentTarget as HTMLElement).style.color = 'white'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#EEF0FF'; (e.currentTarget as HTMLElement).style.color = 'var(--primary)'; }}
                    >
                      <ExternalLink size={12} />
                      View in Gong
                    </a>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QueryResults({ filters }: Props) {
  const [deals, setDeals] = useState<DealQueryRow[]>([]);
  const [totalTranscripts, setTotalTranscripts] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([]);
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

    Promise.all([
      fetch(`/api/deals/query?${params}`).then(r => r.json()),
      fetch(`/api/deals/interactions?${params}`).then(r => r.json()),
    ])
      .then(([dealsData, txData]) => {
        if (dealsData.error) throw new Error(dealsData.error);
        setDeals(dealsData.deals);
        setTotalTranscripts(dealsData.total_transcripts);
        setTranscripts(txData.transcripts ?? []);
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
          <ChatPanel
            filters={filters}
            totalTranscripts={totalTranscripts}
            dealCount={deals.length}
          />
          <TranscriptList transcripts={transcripts} deals={deals} />
        </div>
      )}
    </div>
  );
}
