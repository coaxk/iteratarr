import { useState, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ZAxis } from 'recharts';
import { SCORE_LOCK_THRESHOLD } from '../../constants';

// Generation parameters available for X axis
const X_PARAMS = [
  { key: 'guidance_scale', label: 'CFG High Noise' },
  { key: 'guidance2_scale', label: 'CFG Low Noise' },
  { key: 'loras_multipliers', label: 'LoRA Multiplier (1st)' },
  { key: 'flow_shift', label: 'Flow Shift' },
  { key: 'NAG_scale', label: 'NAG Scale' },
  { key: 'num_inference_steps', label: 'Steps' },
  { key: 'video_length', label: 'Video Length' },
  { key: 'render_duration', label: 'Render Duration (s)' }
];

// Score categories available for Y axis
const Y_SCORES = [
  { key: 'grand_total', label: 'Grand Total' },
  { key: 'identity_total', label: 'Identity Total' },
  { key: 'location_total', label: 'Location Total' },
  { key: 'motion_total', label: 'Motion Total' }
];

/**
 * Extract the X value from an iteration's json_contents for the given parameter key.
 * For loras_multipliers, parses the first number before the semicolon.
 * Returns null if unavailable or unparseable.
 */
function extractXValue(jsonContents, paramKey, iteration) {
  // render_duration lives on the iteration record, not json_contents
  if (paramKey === 'render_duration') {
    const dur = iteration?.render_duration_seconds;
    return dur != null ? Math.round(dur) : null;
  }
  if (!jsonContents) return null;
  const raw = jsonContents[paramKey];
  if (raw == null) return null;

  if (paramKey === 'loras_multipliers') {
    // Format: "1.0;0.3 0.3;1.2" — take the first number before the semicolon
    const str = String(raw);
    const match = str.match(/^[\s]*([0-9]*\.?[0-9]+)/);
    if (!match) return null;
    const val = parseFloat(match[1]);
    return isNaN(val) ? null : val;
  }

  const val = parseFloat(raw);
  return isNaN(val) ? null : val;
}

/**
 * Extract the Y value (score) from an iteration's evaluation for the given score key.
 */
function extractYValue(evaluation, scoreKey) {
  if (!evaluation?.scores) return null;
  const scores = evaluation.scores;
  switch (scoreKey) {
    case 'grand_total': return scores.grand_total;
    case 'identity_total': return scores.identity?.total ?? null;
    case 'location_total': return scores.location?.total ?? null;
    case 'motion_total': return scores.motion?.total ?? null;
    default: return null;
  }
}

/**
 * Interpolate between two hex colours based on t (0-1).
 */
function lerpColor(hex1, hex2, t) {
  const parse = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

const CustomTooltip = ({ active, payload, xLabel, yLabel }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-surface-raised border border-gray-600 rounded px-3 py-2 font-mono text-xs">
      <p className="text-gray-200 font-bold mb-1">Iter #{d.iterNum}</p>
      <p className="text-gray-400">{xLabel}: {d.x}</p>
      <p className="text-amber-400">{yLabel}: {d.y}</p>
    </div>
  );
};

/**
 * Custom dot renderer that colours each point by iteration age.
 * Older iterations are lighter grey, newer ones are accent amber.
 */
function renderDot(props, minIter, maxIter) {
  const { cx, cy, payload } = props;
  const range = maxIter - minIter || 1;
  const t = (payload.iterNum - minIter) / range;
  const fill = lerpColor('#666666', '#d97706', t);
  return <circle key={payload.iterNum} cx={cx} cy={cy} r={5} fill={fill} stroke="#222" strokeWidth={1} />;
}

export default function ParameterScatterChart({ iterations }) {
  const [xParam, setXParam] = useState('guidance_scale');
  const [yScore, setYScore] = useState('grand_total');

  const { data, minIter, maxIter } = useMemo(() => {
    if (!iterations?.length) return { data: [], minIter: 0, maxIter: 0 };

    const points = [];
    for (const iter of iterations) {
      if (!iter.evaluation) continue;
      const x = extractXValue(iter.json_contents, xParam, iter);
      const y = extractYValue(iter.evaluation, yScore);
      if (x == null || y == null) continue;
      points.push({
        x,
        y,
        iterNum: iter.iteration_number
      });
    }

    const iterNums = points.map(p => p.iterNum);
    return {
      data: points,
      minIter: iterNums.length ? Math.min(...iterNums) : 0,
      maxIter: iterNums.length ? Math.max(...iterNums) : 0
    };
  }, [iterations, xParam, yScore]);

  const xLabel = X_PARAMS.find(p => p.key === xParam)?.label || xParam;
  const yLabel = Y_SCORES.find(s => s.key === yScore)?.label || yScore;

  return (
    <div>
      <h3 className="text-sm font-mono text-gray-400 mb-2">Parameter vs Score</h3>

      {/* Axis selectors */}
      <div className="flex gap-4 mb-3">
        <div>
          <label className="text-xs font-mono text-gray-500 block mb-1">X Axis (parameter)</label>
          <select
            value={xParam}
            onChange={(e) => setXParam(e.target.value)}
            className="bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200"
          >
            {X_PARAMS.map(p => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-mono text-gray-500 block mb-1">Y Axis (score)</label>
          <select
            value={yScore}
            onChange={(e) => setYScore(e.target.value)}
            className="bg-surface border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200"
          >
            {Y_SCORES.map(s => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {!data.length ? (
        <p className="text-gray-500 font-mono text-sm">
          No data points — iterations need evaluations and a value for {xLabel}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis
              dataKey="x"
              type="number"
              name={xLabel}
              stroke="#666"
              fontSize={12}
              fontFamily="monospace"
              label={{ value: xLabel, position: 'bottom', offset: 0, fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
            />
            <YAxis
              dataKey="y"
              type="number"
              name={yLabel}
              stroke="#666"
              fontSize={12}
              fontFamily="monospace"
              label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#666', fontSize: 11, fontFamily: 'monospace' }}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip content={<CustomTooltip xLabel={xLabel} yLabel={yLabel} />} cursor={{ strokeDasharray: '3 3', stroke: '#555' }} />
            {yScore === 'grand_total' && (
              <ReferenceLine
                y={SCORE_LOCK_THRESHOLD}
                stroke="#22c55e"
                strokeDasharray="5 5"
                label={{ value: 'Lock', fill: '#22c55e', fontSize: 10, fontFamily: 'monospace' }}
              />
            )}
            <Scatter
              data={data}
              shape={(props) => renderDot(props, minIter, maxIter)}
            />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {/* Legend for dot colour gradient */}
      {data.length > 0 && (
        <div className="flex items-center gap-2 mt-1 text-xs font-mono text-gray-500">
          <span>Older</span>
          <div className="h-2 w-24 rounded" style={{ background: 'linear-gradient(to right, #666666, #d97706)' }} />
          <span>Newer</span>
          <span className="ml-2 text-gray-600">({data.length} point{data.length !== 1 ? 's' : ''})</span>
        </div>
      )}
    </div>
  );
}
