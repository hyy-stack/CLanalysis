'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useRef } from 'react';
import type { FilterOptions } from '@/lib/types';

interface Props {
  filters: FilterOptions;
}

export default function DealFilters({ filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const datalistId = 'deal-name-list';
  const dealInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const commitDealName = (value: string) => {
    // Only navigate if value is empty (clear) or matches an existing deal name
    update('dealName', value);
  };

  const hasFilters =
    searchParams.get('stage') ||
    searchParams.get('team') ||
    searchParams.get('person') ||
    searchParams.get('email') ||
    searchParams.get('dealName');

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {/* Deal name autocomplete */}
      <div className="relative">
        <input
          ref={dealInputRef}
          type="text"
          list={datalistId}
          placeholder="Deal name…"
          defaultValue={searchParams.get('dealName') ?? ''}
          onKeyDown={e => {
            if (e.key === 'Enter') commitDealName((e.target as HTMLInputElement).value);
          }}
          onChange={e => {
            const val = e.target.value;
            // Auto-navigate when the value exactly matches a deal name
            if (filters.dealNames.includes(val) || val === '') {
              commitDealName(val);
            }
          }}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 w-52"
        />
        <datalist id={datalistId}>
          {filters.dealNames.map(n => <option key={n} value={n} />)}
        </datalist>
      </div>

      <select
        value={searchParams.get('stage') ?? ''}
        onChange={e => update('stage', e.target.value)}
        className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="">All Stages</option>
        {filters.stages.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <select
        value={searchParams.get('team') ?? ''}
        onChange={e => update('team', e.target.value)}
        className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="">All Teams</option>
        {filters.teams.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <select
        value={searchParams.get('person') ?? ''}
        onChange={e => update('person', e.target.value)}
        className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
      >
        <option value="">All Reps</option>
        {filters.owners.map(o => (
          <option key={o.email || o.name} value={o.email || o.name}>
            {o.name || o.email}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Contact email…"
        defaultValue={searchParams.get('email') ?? ''}
        onBlur={e => update('email', e.target.value)}
        onKeyDown={e => e.key === 'Enter' && update('email', (e.target as HTMLInputElement).value)}
        className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500 w-44"
      />

      {hasFilters && (
        <button
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            ['stage', 'team', 'person', 'email', 'dealName'].forEach(k => params.delete(k));
            params.set('page', '1');
            if (dealInputRef.current) dealInputRef.current.value = '';
            router.push(`${pathname}?${params.toString()}`);
          }}
          className="text-sm text-gray-500 hover:text-gray-800 underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
