'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Phone, Mail, RefreshCw, ExternalLink } from 'lucide-react';
import AnalysisSummary from '@/components/AnalysisSummary';
import type { DealDetail } from '@/lib/types';
import { stageBadgeClass, stageLabel } from '@/lib/stages';

function stageBadge(stage: string | null) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${stageBadgeClass(stage)}`}>
      {stageLabel(stage)}
    </span>
  );
}

function fmt(ts: string | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtDuration(secs: number | null) {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  return `${m}m`;
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState('');

  useEffect(() => {
    fetch(`/api/deals/${id}`)
      .then(r => r.json())
      .then(d => { setDeal(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const runAnalysis = async () => {
    if (!deal) return;
    setAnalyzing(true);
    setAnalyzeMsg('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crmId: deal.crm_id, dealId: deal.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setAnalyzeMsg('Analysis triggered — results will appear in Slack shortly.');
      } else {
        setAnalyzeMsg(data.error ?? 'Analysis request failed.');
      }
    } catch {
      setAnalyzeMsg('Analysis request failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading deal...</div>;
  if (!deal) return <div className="p-8 text-sm text-red-500">Deal not found.</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/deals" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft size={14} /> All deals
      </Link>

      {/* Header */}
      <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{deal.name || '(unnamed)'}</h1>
            <p className="text-sm text-gray-500 mt-1">{deal.account_name ?? ''}</p>
          </div>
          {stageBadge(deal.stage)}
        </div>
        <div className="mt-4 flex flex-wrap gap-6 text-sm text-gray-600">
          {deal.owner_name && <span><span className="text-gray-400">Owner:</span> {deal.owner_name}</span>}
          {deal.owner_email && <span><span className="text-gray-400">Email:</span> {deal.owner_email}</span>}
          {deal.team && <span><span className="text-gray-400">Team:</span> {deal.team}</span>}
          {deal.arr != null && <span><span className="text-gray-400">ARR:</span> ${deal.arr.toLocaleString()}</span>}
          {deal.crm_id && <span><span className="text-gray-400">CRM ID:</span> {deal.crm_id}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Analysis — main content */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-gray-800">AI Analysis</h2>
              <button
                onClick={runAnalysis}
                disabled={analyzing}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border border-teal-600 text-teal-700 hover:bg-teal-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={13} className={analyzing ? 'animate-spin' : ''} />
                {analyzing ? 'Running...' : 'Re-analyze'}
              </button>
            </div>

            {analyzeMsg && (
              <p className="text-sm text-teal-700 bg-teal-50 rounded px-3 py-2 mb-4">{analyzeMsg}</p>
            )}

            {deal.latest_analysis ? (
              <AnalysisSummary analysis={deal.latest_analysis} />
            ) : (
              <div className="text-center py-10">
                <p className="text-gray-400 text-sm mb-4">No analysis yet for this deal.</p>
                <button
                  onClick={runAnalysis}
                  disabled={analyzing}
                  className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 disabled:opacity-50"
                >
                  {analyzing ? 'Running...' : 'Run Analysis'}
                </button>
              </div>
            )}
          </div>

          {/* Past analyses */}
          {deal.all_analyses.length > 1 && (
            <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-gray-800 mb-3 text-sm">Analysis History</h2>
              <ul className="space-y-2 text-sm">
                {deal.all_analyses.slice(1).map(a => (
                  <li key={a.id} className="flex items-center gap-3 text-gray-600">
                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">
                      {a.analysis_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-gray-400 text-xs">{fmt(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Sidebar — calls + emails */}
        <div className="space-y-4">
          {/* Calls */}
          <div className="bg-white rounded border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Phone size={14} className="text-blue-500" />
              <h3 className="text-sm font-semibold text-gray-700">Calls ({deal.interactions.filter(i => i.type === 'call').length})</h3>
            </div>
            {deal.interactions.filter(i => i.type === 'call').length === 0 ? (
              <p className="text-xs text-gray-400">No calls recorded.</p>
            ) : (
              <ul className="space-y-2">
                {deal.interactions.filter(i => i.type === 'call').map(c => (
                  <li key={c.id} className="text-xs text-gray-600 border-b border-gray-50 pb-2 last:border-0">
                    <p className="font-medium text-gray-800 truncate">{c.title || 'Call'}</p>
                    <p className="text-gray-400">{fmt(c.timestamp)} {fmtDuration(c.duration) && `· ${fmtDuration(c.duration)}`}</p>
                    {Array.isArray(c.participants) && c.participants.length > 0 && (
                      <p className="text-gray-400 truncate">{c.participants.map(p => p.name).join(', ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Emails */}
          <div className="bg-white rounded border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <Mail size={14} className="text-purple-500" />
              <h3 className="text-sm font-semibold text-gray-700">
                Emails ({deal.interactions.filter(i => i.type === 'email').length + deal.manual_emails.length})
              </h3>
            </div>
            {deal.interactions.filter(i => i.type === 'email').length + deal.manual_emails.length === 0 ? (
              <p className="text-xs text-gray-400">No emails recorded.</p>
            ) : (
              <ul className="space-y-2">
                {deal.manual_emails.map(e => (
                  <li key={e.id} className="text-xs text-gray-600 border-b border-gray-50 pb-2 last:border-0">
                    <p className="font-medium text-gray-800 truncate">{e.subject || '(no subject)'}</p>
                    <p className="text-gray-400">{fmt(e.timestamp)}</p>
                    {e.from_email && <p className="text-gray-400 truncate">From: {e.from_email}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Salesforce link */}
          {deal.crm_id && (
            <a
              href={`https://anrok.lightning.force.com/lightning/r/Opportunity/${deal.crm_id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800"
            >
              <ExternalLink size={12} /> View in Salesforce
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
