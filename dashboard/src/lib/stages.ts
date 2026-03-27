export const STAGE_ORDER = [
  'Discover',
  'Qualify',
  'Scope',
  'Technical & Business Validation',
  'Economic Buyer Go/No-Go',
  'Finalize',
  'Closed Won',
  'Closed Lost',
] as const;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NORMALIZED_ORDER = STAGE_ORDER.map(normalize);

/** Returns a numeric sort key for a stage string (0 = earliest, higher = later). Unknown → end. */
export function stageIndex(stage: string | null | undefined): number {
  if (!stage) return STAGE_ORDER.length;
  const n = normalize(stage);
  const i = NORMALIZED_ORDER.indexOf(n);
  return i === -1 ? STAGE_ORDER.length - 1 : i;
}

/** Returns the canonical stage label, or the original string if unrecognized. */
export function stageLabel(stage: string | null | undefined): string {
  if (!stage) return 'Unknown';
  const i = stageIndex(stage);
  return i < STAGE_ORDER.length ? STAGE_ORDER[i] : stage;
}

const STAGE_COLORS: Record<string, string> = {
  'Discover':                        'bg-violet-100 text-violet-700',
  'Qualify':                         'bg-indigo-100 text-indigo-700',
  'Scope':                           'bg-blue-100 text-blue-700',
  'Technical & Business Validation': 'bg-purple-100 text-purple-700',
  'Economic Buyer Go/No-Go':         'bg-amber-100 text-amber-700',
  'Finalize':                        'bg-orange-100 text-orange-700',
  'Closed Won':                      'bg-emerald-100 text-emerald-700',
  'Closed Lost':                     'bg-rose-100 text-rose-700',
};

export function stageBadgeClass(stage: string | null | undefined): string {
  const label = stageLabel(stage);
  return STAGE_COLORS[label] ?? 'bg-slate-100 text-slate-600';
}
