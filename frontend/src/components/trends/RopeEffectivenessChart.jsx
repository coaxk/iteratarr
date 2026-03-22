import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { ROPES } from '../../constants';

// Build a lookup from rope id to label for display
const ROPE_LABELS = Object.fromEntries(ROPES.map(r => [r.id, r.label]));

function getBarColor(value) {
  if (value > 0) return '#22c55e';
  if (value < 0) return '#ef4444';
  return '#666666';
}

export default function RopeEffectivenessChart({ iterations }) {
  if (!iterations?.length) return <p className="text-gray-500 font-mono text-sm">No evaluated iterations yet</p>;

  // Build a map of iteration_number -> evaluation for quick lookup
  const evaluatedMap = {};
  for (const iter of iterations) {
    if (iter.evaluation) {
      evaluatedMap[iter.iteration_number] = iter;
    }
  }

  // For each evaluated iteration with a parent, compute the delta attributed to a rope
  const ropeDeltas = {};
  for (const iter of iterations) {
    if (!iter.evaluation?.attribution?.rope) continue;
    if (iter.iteration_number <= 1) continue;

    const parentNumber = iter.iteration_number - 1;
    const parent = evaluatedMap[parentNumber];
    if (!parent) continue;

    const rope = iter.evaluation.attribution.rope;
    const delta = iter.evaluation.scores.grand_total - parent.evaluation.scores.grand_total;

    if (!ropeDeltas[rope]) {
      ropeDeltas[rope] = { sum: 0, count: 0 };
    }
    ropeDeltas[rope].sum += delta;
    ropeDeltas[rope].count += 1;
  }

  if (Object.keys(ropeDeltas).length === 0) {
    return <p className="text-gray-500 font-mono text-sm">Not enough attributed iterations to chart rope effectiveness</p>;
  }

  // Build chart data sorted by average delta descending
  const data = Object.entries(ropeDeltas)
    .map(([ropeId, { sum, count }]) => ({
      ropeId,
      label: ROPE_LABELS[ropeId] || ropeId,
      displayLabel: `${ROPE_LABELS[ropeId] || ropeId} (${count}x)`,
      avg: parseFloat((sum / count).toFixed(2)),
      count
    }))
    .sort((a, b) => b.avg - a.avg);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-surface-raised border border-gray-600 rounded px-3 py-2 font-mono text-xs">
        <p className="text-gray-200 font-bold mb-1">{d.label}</p>
        <p className="text-gray-400">Used {d.count} time{d.count !== 1 ? 's' : ''}</p>
        <p style={{ color: getBarColor(d.avg) }}>
          Avg delta: {d.avg > 0 ? '+' : ''}{d.avg}
        </p>
      </div>
    );
  };

  // Calculate dynamic height based on number of ropes (min 200, 40px per bar)
  const chartHeight = Math.max(200, data.length * 50 + 40);

  return (
    <div>
      <h3 className="text-sm font-mono text-gray-400 mb-2">Rope Effectiveness (avg score delta)</h3>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 60, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
          <XAxis
            type="number"
            stroke="#666"
            fontSize={12}
            fontFamily="monospace"
            tickFormatter={(v) => (v > 0 ? `+${v}` : v)}
          />
          <YAxis
            type="category"
            dataKey="displayLabel"
            stroke="#666"
            fontSize={11}
            fontFamily="monospace"
            width={280}
            tick={{ fill: '#999' }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          <Bar dataKey="avg" radius={[0, 4, 4, 0]} maxBarSize={30}>
            {data.map((entry, index) => (
              <Cell key={index} fill={getBarColor(entry.avg)} />
            ))}
            <LabelList
              dataKey="avg"
              position="right"
              formatter={(v) => (v > 0 ? `+${v}` : v)}
              style={{ fill: '#ccc', fontSize: 11, fontFamily: 'monospace' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
