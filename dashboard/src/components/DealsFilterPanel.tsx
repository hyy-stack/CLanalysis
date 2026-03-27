'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search, Users, User, ChevronRight, Loader2 } from 'lucide-react';
import { STAGE_ORDER, stageBadgeClass, stageLabel } from '@/lib/stages';
import { ROSTER, MANAGERS, getTeamMembers, roleBadge, roleBadgeClass } from '@/lib/roles';
import type { MemberStats } from '@/app/api/team-stats/route';
import ChatPanel from '@/components/ChatPanel';
import QueryResults from '@/components/QueryResults';

interface Props {
  dealNames: string[];
}

// ── Individual filter panel ───────────────────────────────────────────────────

function IndividualPanel({ dealNames: initialDealNames }: { dealNames: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [owner, setOwner]       = useState(searchParams.get('owner')    ?? '');
  const [dealName, setDealName] = useState(searchParams.get('dealName') ?? '');
  const [stage, setStage]       = useState(searchParams.get('stage')    ?? '');
  const [from, setFrom]         = useState(searchParams.get('from')     ?? '');
  const [to, setTo]             = useState(searchParams.get('to')       ?? '');

  const [dealNames, setDealNames] = useState<string[]>(initialDealNames);

  useEffect(() => {
    const params = new URLSearchParams();
    if (owner) params.set('owner', owner);
    if (stage) params.set('stage', stage);
    if (from)  params.set('from', from);
    if (to)    params.set('to', to);
    fetch(`/api/deals/names?${params}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.names)) setDealNames(d.names); })
      .catch(() => {});
  }, [owner, stage, from, to]);

  const handleGo = () => {
    const params = new URLSearchParams();
    if (owner)    params.set('owner', owner);
    if (dealName) params.set('dealName', dealName);
    if (stage)    params.set('stage', stage);
    if (from)     params.set('from', from);
    if (to)       params.set('to', to);
    params.set('q', '1');
    router.push(`/deals?${params.toString()}`);
  };

  const handleClear = () => {
    setOwner(''); setDealName(''); setStage(''); setFrom(''); setTo('');
    router.push('/deals');
  };

  const hasQuery = searchParams.get('q') === '1';

  return (
    <div className="space-y-4">
      {/* Row 1: dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Owner */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Owner
          </label>
          <select
            value={owner}
            onChange={e => setOwner(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent"
            style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
          >
            <option value="">All Owners</option>
            {ROSTER.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Deal Name */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Deal Name
          </label>
          <select
            value={dealName}
            onChange={e => setDealName(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent"
            style={{ border: '1px solid var(--border)', color: dealName ? 'var(--text-1)' : 'var(--text-3)' }}
          >
            <option value="">All Deals</option>
            {dealNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Stage */}
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Stage
          </label>
          <select
            value={stage}
            onChange={e => setStage(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent"
            style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
          >
            <option value="">All Stages</option>
            {STAGE_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Row 2: date range */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Date Range
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="flex-1 min-w-0 text-sm rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent"
              style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
            <span className="text-xs shrink-0" style={{ color: 'var(--text-3)' }}>to</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="flex-1 min-w-0 text-sm rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent"
              style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleGo}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-all shadow-sm"
          style={{ background: 'var(--primary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-dk)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
        >
          <Search size={14} />
          Search
        </button>
        {hasQuery && (
          <button
            onClick={handleClear}
            className="text-sm font-medium"
            style={{ color: 'var(--text-3)' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {hasQuery && (
        <QueryResults filters={{
          owner:    searchParams.get('owner')    || undefined,
          dealName: searchParams.get('dealName') || undefined,
          stage:    searchParams.get('stage')    || undefined,
          from:     searchParams.get('from')     || undefined,
          to:       searchParams.get('to')       || undefined,
        }} />
      )}
    </div>
  );
}

// ── Team view panel ───────────────────────────────────────────────────────────

function TeamPanel() {
  const router = useRouter();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [manager,    setManagerRaw] = useState(MANAGERS[0] ?? '');
  const [selectedOwners, setSelectedOwners] = useState<Set<string>>(new Set()); // empty = all
  const [stage,      setStage]      = useState('');
  const [dealName,   setDealName]   = useState('');
  const [from,       setFrom]       = useState('');
  const [to,         setTo]         = useState('');

  // ── Applied filters (what the chat and cards actually reflect) ────────────
  const [appliedOwners,  setAppliedOwners]  = useState<string[]>([]);
  const [appliedStage,   setAppliedStage]   = useState('');
  const [appliedDeal,    setAppliedDeal]    = useState('');
  const [appliedFrom,    setAppliedFrom]    = useState('');
  const [appliedTo,      setAppliedTo]      = useState('');

  // ── Derived team member list ──────────────────────────────────────────────
  const teamMembers = manager ? getTeamMembers(manager) : [];

  // When manager changes, reset owner selection
  const setManager = (m: string) => { setManagerRaw(m); setSelectedOwners(new Set()); };

  const toggleOwner = (name: string) => {
    setSelectedOwners(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  // ── Fetch state ───────────────────────────────────────────────────────────
  const [members, setMembers] = useState<MemberStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Build query string from current filters
  const buildQuery = (mgr: string, owners: Set<string>, stg: string, dn: string, f: string, t: string) => {
    const p = new URLSearchParams({ manager: mgr });
    if (owners.size > 0) p.set('owners', Array.from(owners).join(','));
    if (stg) p.set('stage', stg);
    if (dn)  p.set('dealName', dn);
    if (f)   p.set('from', f);
    if (t)   p.set('to', t);
    return p.toString();
  };

  const fetchStats = (mgr: string, owners: Set<string>, stg: string, dn: string, f: string, t: string) => {
    if (!mgr) return;
    setLoading(true);
    setError('');
    // Resolve effective owner list: if none selected, all team members
    const allTeam = getTeamMembers(mgr).map(m => m.name);
    const effectiveOwners = owners.size > 0 ? Array.from(owners) : allTeam;
    setAppliedOwners(effectiveOwners);
    setAppliedStage(stg);
    setAppliedDeal(dn);
    setAppliedFrom(f);
    setAppliedTo(t);
    fetch(`/api/team-stats?${buildQuery(mgr, owners, stg, dn, f, t)}`)
      .then(r => r.json())
      .then(d => { setMembers(d.members ?? []); setLoading(false); })
      .catch(() => { setError('Failed to load team stats'); setLoading(false); });
  };

  // Load on mount and whenever manager changes
  useEffect(() => { fetchStats(manager, selectedOwners, stage, dealName, from, to); }, [manager]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => fetchStats(manager, selectedOwners, stage, dealName, from, to);
  const handleClear = () => {
    setSelectedOwners(new Set());
    setStage(''); setDealName(''); setFrom(''); setTo('');
    fetchStats(manager, new Set(), '', '', '', '');
  };

  const hasFilters = selectedOwners.size > 0 || stage || dealName || from || to;

  // Drill into individual view (carry all filters across)
  const drillInto = (name: string) => {
    const p = new URLSearchParams({ owner: name, q: '1' });
    if (stage)    p.set('stage', stage);
    if (dealName) p.set('dealName', dealName);
    if (from)     p.set('from', from);
    if (to)       p.set('to', to);
    router.push(`/deals?${p.toString()}`);
  };

  const person = ROSTER.find(p => p.name === manager);

  return (
    <div className="space-y-5">
      {/* ── Row 1: Manager + Owner pills ─────────────────────────────────── */}
      <div className="space-y-4">
        {/* Manager selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
            Manager
          </label>
          <div className="flex items-center gap-3">
            <select
              value={manager}
              onChange={e => setManager(e.target.value)}
              className="text-sm rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent min-w-[220px]"
              style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
            >
              {MANAGERS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {person && (
              <span className={`text-xs font-medium px-2.5 py-1.5 rounded-full ${roleBadgeClass(person.role)}`}>
                {person.role}
              </span>
            )}
          </div>
        </div>

        {/* Individual owner toggles */}
        {teamMembers.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
              Team Members
            </label>
            <div className="flex flex-wrap gap-2">
              {teamMembers.map(m => {
                const active = selectedOwners.size === 0 || selectedOwners.has(m.name);
                return (
                  <button
                    key={m.name}
                    onClick={() => toggleOwner(m.name)}
                    className="text-xs px-3.5 py-1.5 rounded-full border font-medium transition-all"
                    style={
                      active
                        ? { background: 'var(--primary)', borderColor: 'var(--primary)', color: 'white' }
                        : { background: 'white', borderColor: 'var(--border)', color: 'var(--text-3)' }
                    }
                  >
                    {m.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Row 2: Stage / Deal / Date filters ───────────────────────────── */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="space-y-1">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            Stage
          </label>
          <select
            value={stage}
            onChange={e => setStage(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent"
            style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
          >
            <option value="">All Stages</option>
            {STAGE_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            Deal Name
          </label>
          <input
            type="text"
            placeholder="Search deal…"
            value={dealName}
            onChange={e => setDealName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleApply()}
            className="w-full text-sm rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent"
            style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
          />
        </div>

        <div className="space-y-1 lg:col-span-2">
          <label
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--text-3)' }}
          >
            Date Range
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="flex-1 text-sm rounded-xl px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent"
              style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
            <span className="text-xs shrink-0" style={{ color: 'var(--text-3)' }}>to</span>
            <input
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="flex-1 text-sm rounded-xl px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#6B63D5] focus:border-transparent"
              style={{ border: '1px solid var(--border)', color: 'var(--text-1)' }}
            />
          </div>
        </div>
      </div>

      {/* ── Apply / Clear ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleApply}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-all shadow-sm"
          style={{ background: 'var(--primary)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-dk)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
        >
          <Search size={14} />
          Apply
        </button>
        {hasFilters && (
          <button
            onClick={handleClear}
            className="text-sm font-medium"
            style={{ color: 'var(--text-3)' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Team grid ─────────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-2 text-sm py-4" style={{ color: 'var(--text-3)' }}>
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      )}
      {error && <p className="text-sm text-rose-500">{error}</p>}

      {!loading && members.length > 0 && (
        <>
          <div
            className="flex items-center gap-6 text-sm pb-1"
            style={{ color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}
          >
            <span className="font-medium" style={{ color: 'var(--text-1)' }}>
              {members.filter(m => m.transcript_count > 0).length} members with data
            </span>
            <span>{members.reduce((s, m) => s + m.deal_count, 0)} deals</span>
            <span>{members.reduce((s, m) => s + m.transcript_count, 0)} transcripts</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {members.map(m => (
              <MemberCard key={m.name} member={m} onDrillIn={() => drillInto(m.name)} />
            ))}
          </div>
        </>
      )}

      {!loading && members.length === 0 && !error && (
        <p className="text-sm py-4" style={{ color: 'var(--text-3)' }}>
          No transcript data found for the selected filters.
        </p>
      )}

      {/* ── Claude chat ───────────────────────────────────────────────────── */}
      {appliedOwners.length > 0 && (() => {
        const totalDeals       = members.reduce((s, m) => s + m.deal_count, 0);
        const totalTranscripts = members.reduce((s, m) => s + m.transcript_count, 0);
        if (totalTranscripts === 0) return null;
        const chatFilters = {
          owners:    appliedOwners,
          stage:     appliedStage   || undefined,
          dealName:  appliedDeal    || undefined,
          from:      appliedFrom    || undefined,
          to:        appliedTo      || undefined,
        };
        const contextLabel = `${appliedOwners.length} rep${appliedOwners.length !== 1 ? 's' : ''} · ${totalDeals} deals · ${totalTranscripts} transcripts`;
        return (
          <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <ChatPanel
              filters={chatFilters}
              totalTranscripts={totalTranscripts}
              dealCount={totalDeals}
              contextLabel={contextLabel}
            />
          </div>
        );
      })()}
    </div>
  );
}

function MemberCard({ member, onDrillIn }: { member: MemberStats; onDrillIn: () => void }) {
  const [hovered, setHovered] = useState(false);
  const person = ROSTER.find(p => p.name === member.name);
  const role = person?.role ?? '';

  // Top 3 stages by transcript count
  const topStages = [...member.by_stage]
    .sort((a, b) => b.transcripts - a.transcripts)
    .slice(0, 3);

  return (
    <button
      onClick={onDrillIn}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="text-left bg-white rounded-2xl p-4 transition-all group cursor-pointer"
      style={
        hovered
          ? { border: '1px solid var(--primary)', boxShadow: 'var(--shadow-card)' }
          : { border: '1px solid var(--border)' }
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-1)' }}>
            {member.name}
          </p>
          {role && (
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${roleBadgeClass(role)}`}>
              {roleBadge(role)}
            </span>
          )}
        </div>
        <ChevronRight
          size={14}
          className="shrink-0 mt-1 transition-colors"
          style={{ color: hovered ? 'var(--primary)' : 'var(--border)' }}
        />
      </div>

      <div className="mt-3 flex items-center gap-4">
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          <strong className="font-bold text-base" style={{ color: 'var(--text-1)' }}>
            {member.deal_count}
          </strong>{' '}
          deals
        </span>
        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
          <strong className="font-bold text-base" style={{ color: 'var(--text-1)' }}>
            {member.transcript_count}
          </strong>{' '}
          calls
        </span>
      </div>

      {topStages.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {topStages.map(s => (
            <div key={s.stage} className="flex items-center gap-2">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap ${stageBadgeClass(s.stage)}`}>
                {stageLabel(s.stage)}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                {s.deals}d · {s.transcripts}t
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function DealsFilterPanel({ dealNames }: Props) {
  const searchParams = useSearchParams();
  const initTab = searchParams.get('view') === 'team' ? 'team' : 'individual';
  const [tab, setTab] = useState<'individual' | 'team'>(initTab);

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{ border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}
    >
      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border)' }}>
        <TabButton active={tab === 'team'} onClick={() => setTab('team')} icon={<Users size={14} />}>
          Team View
        </TabButton>
        <TabButton active={tab === 'individual'} onClick={() => setTab('individual')} icon={<User size={14} />}>
          My Transcripts
        </TabButton>
      </div>

      <div className="p-5">
        {tab === 'individual' && <IndividualPanel dealNames={dealNames} />}
        {tab === 'team'       && <TeamPanel />}
      </div>
    </div>
  );
}

function TabButton({
  active, onClick, icon, children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="border-b-2 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors"
      style={
        active
          ? { borderBottomColor: 'var(--primary)', color: 'var(--primary)', background: '#F0EFFF' }
          : { borderBottomColor: 'transparent', color: 'var(--text-2)' }
      }
    >
      {icon}
      {children}
    </button>
  );
}
