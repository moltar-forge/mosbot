import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function formatBucket(bucket, groupBy) {
  const date = new Date(bucket);
  if (groupBy === 'day') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
  });
}

function formatCost(value) {
  if (value === 0) return '$0';
  if (value < 0.001) return `$${value.toFixed(6)}`;
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(4)}`;
}

function formatTokens(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function CustomTooltip({ active, payload, label, groupBy }) {
  if (!active || !payload || payload.length === 0) return null;

  const d = payload[0]?.payload || {};
  return (
    <div className="bg-dark-800 border border-dark-600 rounded-lg p-3 shadow-lg text-sm">
      <p className="text-dark-300 font-medium mb-2">{formatBucket(label, groupBy)}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-dark-400">Cost</span>
          <span className="text-primary-400 font-semibold">{formatCost(d.costUsd || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-dark-400">Input tokens</span>
          <span className="text-dark-200">{formatTokens(d.tokensInput || 0)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-dark-400">Output tokens</span>
          <span className="text-dark-200">{formatTokens(d.tokensOutput || 0)}</span>
        </div>
      </div>
    </div>
  );
}

export default function CostChart({ data = [], groupBy = 'hour' }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-dark-500 text-sm">
        No usage data for this period
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    bucketLabel: formatBucket(d.bucket, groupBy),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(v) => formatBucket(v, groupBy)}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatCost}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip groupBy={groupBy} />} />
        <Area
          type="monotone"
          dataKey="costUsd"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#costGradient)"
          dot={false}
          activeDot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
