import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { SCORE_LOCK_THRESHOLD } from '../../constants';

export default function ScoreTrendChart({ iterations }) {
  if (!iterations?.length) return <p className="text-gray-500 font-mono text-sm">No evaluated iterations yet</p>;

  const data = iterations
    .filter(i => i.evaluation)
    .map(i => ({
      name: `#${i.iteration_number}`,
      identity: i.evaluation.scores.identity.total,
      location: i.evaluation.scores.location.total,
      motion: i.evaluation.scores.motion.total,
      total: i.evaluation.scores.grand_total
    }));

  if (!data.length) return <p className="text-gray-500 font-mono text-sm">No evaluations to chart</p>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="name" stroke="#666" fontSize={12} fontFamily="monospace" />
        <YAxis stroke="#666" fontSize={12} fontFamily="monospace" domain={[0, 75]} />
        <Tooltip
          contentStyle={{ backgroundColor: '#262626', border: '1px solid #444', fontFamily: 'monospace', fontSize: 12 }}
          labelStyle={{ color: '#999' }}
        />
        <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 12 }} />
        <ReferenceLine y={SCORE_LOCK_THRESHOLD} stroke="#22c55e" strokeDasharray="5 5" label={{ value: 'Lock', fill: '#22c55e', fontSize: 10 }} />
        <Line type="monotone" dataKey="total" stroke="#d97706" strokeWidth={2} name="Total" dot={{ r: 4 }} />
        <Line type="monotone" dataKey="identity" stroke="#3b82f6" strokeWidth={1} name="Identity" />
        <Line type="monotone" dataKey="location" stroke="#8b5cf6" strokeWidth={1} name="Location" />
        <Line type="monotone" dataKey="motion" stroke="#ec4899" strokeWidth={1} name="Motion" />
      </LineChart>
    </ResponsiveContainer>
  );
}
