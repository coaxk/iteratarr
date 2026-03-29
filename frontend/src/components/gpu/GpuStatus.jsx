import { useState } from 'react';
import { useGpuStatus, useGpuHistory } from '../../hooks/useQueries';
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

function RenderControls({ gpuUtil }) {
  const [acting, setActing] = useState(null);
  // Only show when GPU is actively rendering (>50% utilization)
  if (gpuUtil < 50) return null;

  const handleAction = async (action, apiCall) => {
    setActing(action);
    try {
      await apiCall();
      setTimeout(() => setActing(null), 2000);
    } catch {
      setActing(null);
    }
  };

  return (
    <div className="flex gap-1">
      <button
        onClick={() => handleAction('pause', api.pauseRender)}
        disabled={acting}
        className="flex-1 px-1.5 py-1 text-[10px] font-mono rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors"
        title="Pause current Wan2GP render"
      >
        {acting === 'pause' ? 'Paused' : '⏸ Pause'}
      </button>
      <button
        onClick={() => handleAction('resume', api.resumeRender)}
        disabled={acting}
        className="flex-1 px-1.5 py-1 text-[10px] font-mono rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
        title="Resume paused render"
      >
        {acting === 'resume' ? 'Resumed' : '▶ Resume'}
      </button>
      <button
        onClick={() => {
          if (window.confirm('Abort the current render? This cannot be undone.')) {
            handleAction('abort', api.abortRender);
          }
        }}
        disabled={acting}
        className="flex-1 px-1.5 py-1 text-[10px] font-mono rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
        title="Abort current render"
      >
        {acting === 'abort' ? 'Aborted' : '⏹ Abort'}
      </button>
    </div>
  );
}

function ReleaseVramButton() {
  const [releasing, setReleasing] = useState(false);
  const [result, setResult] = useState(null);

  const handleRelease = async () => {
    setReleasing(true);
    setResult(null);
    try {
      await api.releaseVram();
      setResult('released');
      setTimeout(() => setResult(null), 5000);
    } catch (err) {
      setResult(err.message);
      setTimeout(() => setResult(null), 5000);
    } finally {
      setReleasing(false);
    }
  };

  return (
    <div className="pt-1">
      <button
        onClick={handleRelease}
        disabled={releasing}
        className={`w-full px-2 py-1.5 text-xs font-mono font-bold rounded transition-colors ${
          result === 'released'
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : releasing
              ? 'bg-surface-overlay text-gray-500 cursor-wait'
              : 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
        }`}
      >
        {releasing ? 'Releasing...' : result === 'released' ? 'VRAM Released' : result ? result : 'Release VRAM'}
      </button>
    </div>
  );
}

export default function GpuStatus() {
  const { data: status } = useGpuStatus();
  const { data: history } = useGpuHistory();
  const [expanded, setExpanded] = useState(false);
  // No manual polling — TanStack Query handles it at 10s interval

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

  const sparkData = (history || []).map(h => h.gpuUtil);

  return (
    <div className="px-3 py-2 border-t border-gray-700 space-y-1.5">
      {/* Header — clickable to expand/collapse */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs font-mono text-gray-400 hover:text-gray-300 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
          <span className="truncate" title={status.name}>{status.name}</span>
        </div>
        <span className={`text-sm transition-transform duration-200 ${expanded ? 'rotate-180' : ''} ${expanded ? 'text-gray-500' : 'text-accent group-hover:text-accent animate-pulse'}`}>
          ▲
        </span>
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

      {/* Render controls — show when GPU is active */}
      <div className="pl-4">
        <RenderControls gpuUtil={status.utilization.gpu} />
      </div>

      {/* Release VRAM — always visible */}
      <div className="pl-4">
        <ReleaseVramButton />
      </div>
    </div>
  );
}
