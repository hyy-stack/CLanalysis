export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { getFilterOptions } from '@/lib/db';
import DealsFilterPanel from '@/components/DealsFilterPanel';

export default async function DealsPage() {
  const filterOptions = await getFilterOptions();

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: '#ffffff' }}>Anrok Deal Analyzer</h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Browse calls by owner, stage, or team — then ask Claude about the results.
        </p>
      </div>

      <Suspense>
        <DealsFilterPanel dealNames={filterOptions.dealNames} />
      </Suspense>
    </div>
  );
}
