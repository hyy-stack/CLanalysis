'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import type { DealQueryFilters } from '@/lib/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  filters: DealQueryFilters;
  totalTranscripts: number;
  dealCount: number;
  suggestedQuestions?: string[];
  contextLabel?: string;
}

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    if (!line.trim()) return <br key={i} />;
    if (line.startsWith('## '))
      return <p key={i} className="font-semibold mt-2" style={{ color: 'var(--text-1)' }}>{line.slice(3)}</p>;
    if (line.startsWith('# '))
      return <p key={i} className="font-bold mt-3" style={{ color: 'var(--text-1)' }}>{line.slice(2)}</p>;
    if (line.startsWith('- ') || line.startsWith('• '))
      return <li key={i} className="ml-4 list-disc" style={{ color: 'var(--text-2)' }}>{line.slice(2)}</li>;
    if (line.match(/^\*\*(.+?)\*\*/)) {
      const parts = line.split(/\*\*(.+?)\*\*/);
      return (
        <p key={i} style={{ color: 'var(--text-2)' }}>
          {parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: 'var(--text-1)' }}>{p}</strong> : p)}
        </p>
      );
    }
    return <p key={i} style={{ color: 'var(--text-2)' }}>{line}</p>;
  });
}

const DEFAULT_SUGGESTED = [
  'What are the most common objections across these deals?',
  'Which deals look at risk and why?',
  'Summarize the key themes from the most recent calls.',
  'Who are the main customer stakeholders involved?',
];

const MANAGER_SUGGESTED = [
  'Which rep has the most pipeline risk right now?',
  'What objections are coming up most across the team?',
  'Which deals are furthest along and what are the next steps?',
  'Where does the team need coaching based on recent calls?',
];

/** Claude logo mark */
function ClaudeLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" fill="url(#claude-grad)" />
      <path d="M8.5 15.5L12 8l3.5 7.5M9.5 13h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="claude-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6B63D5" />
          <stop offset="1" stopColor="#C084FC" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function ChatPanel({
  filters,
  totalTranscripts,
  dealCount,
  suggestedQuestions,
  contextLabel,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLTextAreaElement>(null);
  const bottomInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setMessages([]); }, [
    filters.owner, filters.owners?.join(','), filters.stage,
    filters.dealName, filters.from, filters.to,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const suggested = suggestedQuestions ?? (filters.owners ? MANAGER_SUGGESTED : DEFAULT_SUGGESTED);
  const label = contextLabel
    ?? `${dealCount} deal${dealCount !== 1 ? 's' : ''} · ${totalTranscripts} transcript${totalTranscripts !== 1 ? 's' : ''}`;

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters, messages: newMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Chat failed');
      const suffix = data.mode === 'map-reduce'
        ? `\n\n_Analyzed ${data.totalTranscripts} transcripts across ${data.batchCount} batches._`
        : '';
      setMessages(prev => [...prev, { role: 'assistant', content: data.content + suffix }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${e instanceof Error ? e.message : 'Something went wrong'}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const isEmpty = messages.length === 0;

  return (
    <div
      className="flex flex-col rounded-2xl bg-white overflow-hidden"
      style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)', minHeight: 440 }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <ClaudeLogo size={28} />
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Ask Claude</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{label}</p>
        </div>
      </div>

      {/* ── Empty state: inline input + suggestions ──────────────────────── */}
      {isEmpty && (
        <div className="flex-1 p-5 space-y-5">
          {/* Inline input (shown when no conversation yet) */}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inlineInputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about these transcripts… (Enter to send)"
              rows={3}
              className="flex-1 text-sm rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#6B63D5]"
              style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="p-3 rounded-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed self-end"
              style={{ background: 'linear-gradient(135deg, var(--primary), #8B83F5)' }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>

          {/* Suggested questions */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Suggested questions
            </p>
            {suggested.map(q => (
              <button
                key={q}
                onClick={() => send(q)}
                className="block w-full text-left text-xs rounded-xl px-4 py-3 transition-all"
                style={{ background: '#F5F5FF', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--primary)';
                  (e.currentTarget as HTMLElement).style.background = '#EEEEFF';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-2)';
                  (e.currentTarget as HTMLElement).style.background = '#F5F5FF';
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Conversation messages ────────────────────────────────────────── */}
      {!isEmpty && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="shrink-0 mt-1">
                    <ClaudeLogo size={22} />
                  </div>
                )}
                <div
                  className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm"
                  style={msg.role === 'user'
                    ? { background: 'linear-gradient(135deg, var(--primary), #8B83F5)', color: 'white' }
                    : { background: '#F5F5FF', border: '1px solid var(--border)', color: 'var(--text-2)' }
                  }
                >
                  {msg.role === 'user'
                    ? <p>{msg.content}</p>
                    : <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
                  }
                </div>
                {msg.role === 'user' && (
                  <div className="shrink-0 w-7 h-7 rounded-xl flex items-center justify-center mt-1 text-xs font-bold text-white"
                    style={{ background: 'var(--accent)' }}>
                    U
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 items-center">
                <div className="shrink-0"><ClaudeLogo size={22} /></div>
                <div className="rounded-2xl px-3.5 py-2.5 text-xs flex items-center gap-2"
                  style={{ background: '#F5F5FF', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                  <Loader2 size={13} className="animate-spin" />
                  {totalTranscripts > 30
                    ? `Analyzing ${totalTranscripts} transcripts in batches…`
                    : 'Thinking…'}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Bottom input bar — only shown once conversation started */}
          <div className="p-3 flex gap-2 items-end" style={{ borderTop: '1px solid var(--border)' }}>
            <textarea
              ref={bottomInputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Continue the conversation… (Enter to send)"
              rows={2}
              className="flex-1 text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#6B63D5]"
              style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="p-2.5 rounded-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, var(--primary), #8B83F5)' }}
            >
              <Send size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
