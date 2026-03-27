import type { StatsResponse } from '@/lib/types';

interface Props {
  stats: StatsResponse;
}

const cards = (stats: StatsResponse) => {
  const pct = stats.total_deals > 0
    ? Math.round((stats.analyzed_deals / stats.total_deals) * 100)
    : 0;
  return [
    {
      label: 'Total Deals',
      value: stats.total_deals,
      sub: 'in database',
      gradient: 'from-[#6B63D5] to-[#8B83F5]',
      icon: '📁',
    },
    {
      label: 'Analyzed',
      value: stats.analyzed_deals,
      sub: 'with AI insights',
      gradient: 'from-[#5890D8] to-[#78AAEE]',
      icon: '🤖',
    },
    {
      label: 'Pending Analysis',
      value: stats.unanalyzed_deals,
      sub: 'awaiting review',
      gradient: 'from-[#F4956A] to-[#F8B48A]',
      icon: '⏳',
    },
    {
      label: 'Coverage',
      value: `${pct}%`,
      sub: 'deals analyzed',
      gradient: 'from-[#52C497] to-[#74D9B0]',
      icon: '✅',
    },
  ];
};

export default function StatsCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards(stats).map(card => (
        <div
          key={card.label}
          className={`bg-gradient-to-br ${card.gradient} rounded-2xl p-5 text-white`}
          style={{ boxShadow: '0 6px 24px rgba(61,55,120,0.18)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide opacity-80">{card.label}</p>
              <p className="mt-2 text-3xl font-bold">{card.value}</p>
              <p className="mt-0.5 text-xs opacity-70">{card.sub}</p>
            </div>
            <span className="text-2xl opacity-80">{card.icon}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
