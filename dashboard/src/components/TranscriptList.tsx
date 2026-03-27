'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink, Phone, Users } from 'lucide-react';
import AnalysisSummary from '@/components/AnalysisSummary';
import { stageBadgeClass, stageLabel } from '@/lib/stages';
import type { TranscriptRow, Analysis } from '@/lib/types';

interface Props {
  dealName: string;
}

function fmt(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtDuration(secs: number | null) {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  return `${m}m`;
}

function rowToAnalysis(row: TranscriptRow): Analysis | null {
  if (!row.analysis_id) return null;
  return {
    id: row.analysis_id,
    deal_id: row.deal_id,
    analysis_type: row.analysis_type ?? '',
    exec_summary: row.exec_summary,
    next_steps: row.next_steps,
    details: row.details,
    structured_data: null,
    slack_thread_ts: row.slack_thread_ts,
    slack_channel: row.slack_channel,
    created_at: row.analysis_at ?? '',
  };
}

export default function TranscriptList({ dealName }: Props) {
  const [transcripts, setTranscripts] = useState<TranscriptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    setExpandedId(null);
    fetch(`/api/deals/transcripts?dealName=${encodeURIComponent(dealName)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setTranscripts(d.transcripts);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [dealName]);

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Loading transcripts…</p>;
  if (error) return <p className="text-sm text-red-500 py-8 text-center">{error}</p>;
  if (transcripts.length === 0) return <p className="text-sm text-gray-400 py-8 text-center">No call transcripts found for "{dealName}".</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} — sorted by stage then most recent first</p>

      <div className="rounded border border-gray-200 shadow-sm overflow-hidden">
        {transcripts.map((row, i) => {
          const isExpanded = expandedId === row.id;
          const analysis = rowToAnalysis(row);
          const participants = Array.isArray(row.participants) ? row.participants : [];
          const dur = fmtDuration(row.duration);

          return (
            <div key={row.id} className={i > 0 ? 'border-t border-gray-100' : ''}>
              {/* Row */}
              <div
                className="flex items-start gap-4 px-4 py-3 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : row.id)}
              >
                <div className="mt-0.5 shrink-0">
                  <Phone size={14} className="text-blue-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate text-sm">
                      {row.title || 'Call'}
                    </span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${stageBadgeClass(row.stage)}`}>
                      {stageLabel(row.stage)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                    <span>{fmt(row.timestamp)}</span>
                    {dur && <span>{dur}</span>}
                    {participants.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={11} />
                        {participants.map(p => p.name).filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/deals/${row.deal_id}`}
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-teal-600 hover:text-teal-800 flex items-center gap-0.5"
                  >
                    Deal <ExternalLink size={11} />
                  </Link>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
              </div>

              {/* Expanded: AI summary */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                  {analysis ? (
                    <AnalysisSummary analysis={analysis} />
                  ) : (
                    <div className="text-sm text-gray-400 py-2">
                      No AI analysis for this deal yet.{' '}
                      <Link href={`/deals/${row.deal_id}`} className="text-teal-600 hover:underline">
                        Open deal to run analysis →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
