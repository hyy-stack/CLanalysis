'use client';

import { useState } from 'react';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import type { Analysis } from '@/lib/types';

interface Props {
  analysis: Analysis;
}

function fmt(ts: string | null | undefined) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function renderText(text: string | null | undefined) {
  if (!text) return null;
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />;
    if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-gray-800 mt-4 mb-1 text-base">{line.slice(3)}</h3>;
    if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-gray-900 mt-4 mb-1 text-lg">{line.slice(2)}</h2>;
    if (line.startsWith('- ') || line.startsWith('• ')) return <li key={i} className="ml-4 text-gray-700">{line.slice(2)}</li>;
    if (line.match(/^\d+\. /)) return <li key={i} className="ml-4 list-decimal text-gray-700">{line.replace(/^\d+\. /, '')}</li>;
    return <p key={i} className="text-gray-700">{line}</p>;
  });
}

export default function AnalysisSummary({ analysis }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const slackUrl = analysis.slack_thread_ts && analysis.slack_channel
    ? `https://slack.com/archives/${analysis.slack_channel}/p${analysis.slack_thread_ts.replace('.', '')}`
    : null;

  const fullText = analysis.details?.fullText;
  const sections = analysis.details?.sections;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <span className="inline-block bg-teal-100 text-teal-800 text-xs font-medium px-2 py-0.5 rounded uppercase tracking-wide">
            {analysis.analysis_type.replace(/_/g, ' ')}
          </span>
          <span className="ml-3 text-xs text-gray-400">{fmt(analysis.created_at)}</span>
        </div>
        {slackUrl && (
          <a
            href={slackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800"
          >
            View in Slack <ExternalLink size={12} />
          </a>
        )}
      </div>

      {analysis.exec_summary && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Executive Summary</h3>
          <div className="prose prose-sm max-w-none space-y-1">
            {renderText(analysis.exec_summary)}
          </div>
        </div>
      )}

      {analysis.next_steps && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Next Steps</h3>
          <ul className="space-y-1">
            {renderText(analysis.next_steps)}
          </ul>
        </div>
      )}

      {(fullText || sections) && (
        <div>
          <button
            onClick={() => setDetailsOpen(v => !v)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
          >
            {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {detailsOpen ? 'Hide' : 'Show'} full analysis
          </button>
          {detailsOpen && (
            <div className="mt-3 border border-gray-200 rounded p-4 bg-gray-50 text-sm space-y-1 max-h-[500px] overflow-y-auto">
              {sections
                ? Object.entries(sections).map(([k, v]) => (
                    <div key={k} className="mb-3">
                      <h4 className="font-semibold text-gray-700 mb-1">{k}</h4>
                      {renderText(v)}
                    </div>
                  ))
                : renderText(fullText)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
