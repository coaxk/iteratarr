import { useState, useEffect, useRef } from 'react';
import { api } from '../../api';

/**
 * GpuStatus — compact sidebar widget showing NVIDIA GPU stats.
 *
 * Displays: GPU name, VRAM bar, utilization %, temperature (color-coded),
 * power draw, mini sparkline of recent utilization, and running processes.
 *
 * Polls /api/gpu/status every 5s when mounted.
 */

/** Temperature color: green < 70, yellow < 85, red >= 85 */
function tempColor(temp) {
  if (temp >= 85) return 'text-red-400';
  if (temp >= 70) return 'text-yellow-400';
  return 'text-green-400';
}

function tempBgColor(temp) {
  if (temp >= 85) return 'bg-red-400';
  if (temp >= 70) return 'bg-yellow-400';
  return 'bg-green-400';
}

/** Mini sparkline rendered as CSS bars */
function Sparkline({ data, max = 100 }) {
  if (!data || data.length === 0) return null;
  // Show last 30 samples max for the compact view
  const samples = data.slice(-30);
  return (
    <div className="flex items-end gap-px h-6 w-full" title="GPU utilization (5min)">
      {samples.map((val, i) => {
        const pct = Math.min(100, Math.max(0, (val / max) * 100));
        const barColor = val >= 90 ? 'bg-red-400' : val >= 60 ? 'bg-amber-500' : 'bg-green-500';
        return (
          <div
            key={i}
            className={`flex-1 min-w-0 rounded-sm ${barColor}`}
            style={{ height: `${Math.max(2, pct)}%` }}
          />
        );
      })}
    </div>
  );
}

/** VRAM usage bar */
function VramBar({ used, total }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const barColor = pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs font-mono text-gray-500">
        <span>VRAM</span>
        <span>{Math.round(used)} / {Math.round(total)} MiB ({Math.round(pct)}%)</span>
      </div>
      <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function GpuStatus() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const pollRef = useRef(null);

  const fetchData = async () => {
    try {
      const [gpuStatus, gpuHistory] = await Promise.all([
        api.gpuStatus(),
        api.gpuHistory()
      ]);
      setStatus(gpuStatus);
      setHistory(gpuHistory);
    } catch {
      setStatus({ online: false, error: 'Connection failed' });
    }
  };

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Offline / error state
  if (!status || !status.online) {
    return (
      <div className="px-3 py-2 border-t border-gray-700">
        <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
          <span className="w-2 h-2 rounded-full bg-gray-600 flex-shrink-0" />
          <span>GPU: {status?.error || 'Offline'}</span>
        </div>
      </div>
    );
  }

  const sparkData = history.map(h => h.gpuUtil);

  return (
    <div className="px-3 py-2 border-t border-gray-700 space-y-1.5">
      {/* Header — clickable to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs font-mono text-gray-400 hover:text-gray-300 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <span className="truncate" title={status.name}>{status.name}</span>
        </div>
        <span className="text-gray-600">{expanded ? '\u25B4' : '\u25BE'}</span>
      </button>

      {/* Always visible: utilization + temp compact row */}
      <div className="flex items-center justify-between text-xs font-mono text-gray-500 pl-4">
        <span>GPU: <span className="text-gray-300">{status.utilization.gpu}%</span></span>
        <span className={tempColor(status.temperature)}>{status.temperature}\u00B0C</span>
        <span>{status.power.draw.toFixed(0)}W</span>
      </div>

      {/* VRAM bar — always visible */}
      <div className="pl-4">
        <VramBar used={status.memory.used} total={status.memory.total} />
      </div>

      {/* Expanded: sparkline + processes */}
      {expanded && (
        <div className="pl-4 space-y-2 pt-1">
          {/* Sparkline */}
          {sparkData.length > 0 && (
            <div>
              <div className="text-xs font-mono text-gray-600 mb-0.5">Utilization History</div>
              <Sparkline data={sparkData} />
            </div>
          )}

          {/* Running processes */}
          {status.processes && status.processes.length > 0 && (
            <div>
              <div className="text-xs font-mono text-gray-600 mb-0.5">GPU Processes</div>
              <div className="space-y-0.5">
                {status.processes.map((proc, i) => {
                  // Show just the executable name, not the full path
                  const exeName = proc.name.split(/[/\\]/).pop();
                  const shortName = exeName.length > 20 ? exeName.slice(0, 20) + '...' : exeName;
                  return (
                    <div key={i} className="flex justify-between text-xs font-mono text-gray-500">
                      <span className="truncate mr-2" title={proc.name}>{shortName}</span>
                      <span className="flex-shrink-0">{proc.memoryUsed} MiB</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {status.processes && status.processes.length === 0 && (
            <div className="text-xs font-mono text-gray-600 italic">No GPU processes</div>
          )}
        </div>
      )}
    </div>
  );
}
