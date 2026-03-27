'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CheckCircle, Circle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Deal } from '@/lib/types';
import { stageBadgeClass, stageLabel } from '@/lib/stages';

interface Props {
  deals: Deal[];
  total: number;
  page: number;
  pageSize: number;
}

function stageBadge(stage: string | null) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${stageBadgeClass(stage)}`}>
      {stageLabel(stage)}
    </span>
  );
}

function fmt(val: string | null | undefined) {
  if (!val) return '—';
  const d = new Date(val);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DealTable({ deals, total, page, pageSize }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);

  const goPage = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div>
      <div className="overflow-x-auto rounded border border-gray-200 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Deal Name', 'Company', 'Stage', 'Owner', 'Last Activity', 'Calls', 'Analyzed'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {deals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-400">No deals found.</td>
              </tr>
            )}
            {deals.map(deal => (
              <tr
                key={deal.id}
                onClick={() => router.push(`/deals/${deal.id}`)}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                  <Link href={`/deals/${deal.id}`} className="hover:text-teal-700" onClick={e => e.stopPropagation()}>
                    {deal.name || '(unnamed)'}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-[160px] truncate">{deal.account_name ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap">{stageBadge(deal.stage)}</td>
                <td className="px-4 py-3 text-gray-600 max-w-[140px] truncate">{deal.owner_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(deal.last_activity_at)}</td>
                <td className="px-4 py-3 text-gray-600 text-center">{deal.call_count ?? 0}</td>
                <td className="px-4 py-3 text-center">
                  {deal.has_analysis
                    ? <CheckCircle size={16} className="text-teal-600 mx-auto" />
                    : <Circle size={16} className="text-gray-300 mx-auto" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>{total} deals · page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
