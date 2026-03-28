import { useState, useEffect } from 'react';
import ScoreGroup from './ScoreGroup';
import ScoreRing from './ScoreRing';
import AttributionPanel from './AttributionPanel';
import JsonViewer from './JsonViewer';
import ImportEvalModal from './ImportEvalModal';
import JsonDiffPanel from './JsonDiffPanel';
import SettingsPanel from './SettingsPanel';
import FrameStrip from './FrameStrip';
import VideoDiff from './VideoDiff';
import GeneratedModal from './GeneratedModal';
import TagInput from '../clips/TagInput';
import ForkModal from './ForkModal';
import { api } from '../../api';
import { IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS, SCORE_LOCK_THRESHOLD, GRAND_MAX, ROPE_CATEGORY_MAP, ROPES, MODEL_TYPES } from '../../constants';

const defaultScores = (fields) => Object.fromEntries(fields.map(f => [f.key, 3]));

// Use shared CopyButton, alias for backward compat with inline usage
import CopyButton from '../common/CopyButton';
const CopyBtn = ({ text }) => <CopyButton text={text} />;

export default function EvaluationPanel({ iteration, childIteration, parentIteration, ancestorChain = [], allIterations = [], onSaved, onNext, onLocked, onGoToIteration, onScoreChange, clipId, clip, onForked, isForkPoint = false }) {
  const [identity, setIdentity] = useState(defaultScores(IDENTITY_FIELDS));
  const [location, setLocation] = useState(defaultScores(LOCATION_FIELDS));
  const [motion, setMotion] = useState(defaultScores(MOTION_FIELDS));
  const [attribution, setAttribution] = useState({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [generatedPath, setGeneratedPath] = useState(null);
  const [outputJson, setOutputJson] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [showGenerated, setShowGenerated] = useState(false);
  const [renderPath, setRenderPath] = useState(null);
  const [generatedIterNum, setGeneratedIterNum] = useState(null);
  const [generatedChild, setGeneratedChild] = useState(null);
  const [aiScores, setAiScores] = useState(null); // Tenzing/Claude's original scores before human adjustment
  const [scoringSource, setScoringSource] = useState('manual');
  const [currentVideoPath, setCurrentVideoPath] = useState(null);
  const [previousVideoPath, setPreviousVideoPath] = useState(null);
  const [comparisonVideoPath, setComparisonVideoPath] = useState(null);
  const [comparisonIter, setComparisonIter] = useState(null);
  const [lockCharacterUpdates, setLockCharacterUpdates] = useState(null);
  const [showFork, setShowFork] = useState(false);
  const [localTags, setLocalTags] = useState(iteration.tags || []);
  const [renderSubmitted, setRenderSubmitted] = useState(false);
  const [autoScoring, setAutoScoring] = useState(false);
  const [renderStatus, setRenderStatus] = useState(null); // null | 'rendering' | 'complete' | 'failed'
  const [queueAdded, setQueueAdded] = useState(false);

  const isEvaluated = !!iteration.evaluation;
  const hasChild = !!childIteration;
  const isReadOnly = isEvaluated && hasChild;

  useEffect(() => {
    if (iteration.evaluation) {
      const ev = iteration.evaluation;
      if (ev.scores?.identity) setIdentity(ev.scores.identity);
      if (ev.scores?.location) setLocation(ev.scores.location);
      if (ev.scores?.motion) setMotion(ev.scores.motion);
      setAttribution(ev.attribution || {});
      setNotes(ev.qualitative_notes || '');
      setAiScores(ev.ai_scores || null);
      setScoringSource(ev.scoring_source || 'manual');
    } else {
      setIdentity(defaultScores(IDENTITY_FIELDS));
      setLocation(defaultScores(LOCATION_FIELDS));
      setMotion(defaultScores(MOTION_FIELDS));
      setAttribution({});
      setNotes('');
      setAiScores(null);
      setScoringSource('manual');
    }
    if (childIteration) {
      setOutputJson(childIteration.json_contents);
      setGeneratedPath(childIteration.json_path || childIteration.json_filename);
    } else {
      setOutputJson(null);
      setGeneratedPath(null);
    }
    setLocalTags(iteration.tags || []);
    setRenderSubmitted(false);
    setQueueAdded(false);
    // Try to derive video paths from iteration data (render_path stored on iteration)
    setCurrentVideoPath(iteration.render_path || null);
    setPreviousVideoPath(parentIteration?.render_path || null);
    setComparisonVideoPath(null);
    setComparisonIter(null);

    // Check if this iteration is already in the queue
    if (iteration.status === 'pending') {
      api.getIterationQueueStatus(iteration.id).then(qs => {
        if (qs.in_queue) setQueueAdded(qs.status); // 'queued' | 'rendering' | 'complete' | 'failed'
      }).catch(() => {});
    }

    // If iteration is 'pending' but has a render_path, check if video already exists
    // This catches renders done outside the bridge (directly in Wan2GP)
    if (iteration.status === 'pending' && iteration.render_path) {
      fetch(`/api/video?path=${encodeURIComponent(iteration.render_path)}`, { method: 'HEAD' })
        .then(res => {
          if (res.ok) {
            setRenderStatus('complete');
            // Update iteration status in the database silently — don't trigger refetch
            // to avoid race conditions with FrameStrip loading
            api.updateIteration(iteration.id, { status: 'rendered' }).catch(() => {});
          } else {
            setRenderStatus(null);
          }
        })
        .catch(() => setRenderStatus(null));
    } else {
      setRenderStatus(null);
    }
  }, [iteration.id]);

  const grandTotal =
    IDENTITY_FIELDS.reduce((s, f) => s + (identity[f.key] || 1), 0) +
    LOCATION_FIELDS.reduce((s, f) => s + (location[f.key] || 1), 0) +
    MOTION_FIELDS.reduce((s, f) => s + (motion[f.key] || 1), 0);

  const canLock = grandTotal >= SCORE_LOCK_THRESHOLD;

  // Push live score up to parent for the persistent score ring
  useEffect(() => {
    onScoreChange?.(grandTotal);
  }, [grandTotal]);

  // Build history scores for ghost markers from ancestor chain
  const buildHistory = (group) => ancestorChain
    .filter(a => a.evaluation?.scores?.[group])
    .map(a => ({ iterNum: a.iteration_number, scores: a.evaluation.scores[group] }));
  const identityHistory = buildHistory('identity');
  const locationHistory = buildHistory('location');
  const motionHistory = buildHistory('motion');

  // Combined Save & Generate action
  const handleSaveAndGenerate = async () => {
    setSaving(true);
    try {
      await api.evaluate(iteration.id, {
        scores: { identity, location, motion },
        ai_scores: aiScores,
        attribution,
        qualitative_notes: notes,
        scoring_source: scoringSource
      });
      const next = await api.generateNext(iteration.id);
      setGeneratedPath(next.json_path || next.json_filename);
      setRenderPath(next.render_path || null);
      setOutputJson(next.json_contents);
      setGeneratedIterNum(next.iteration_number);
      setGeneratedChild(next);
      setShowGenerated(true);
      onSaved?.();
    } catch (err) {
      alert(`Save & Generate failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleImport = (imported) => {
    // Store AI's original scores for delta tracking
    setAiScores({
      identity: { ...imported.scores.identity },
      location: { ...imported.scores.location },
      motion: { ...imported.scores.motion }
    });
    // Pre-fill sliders with imported scores
    setIdentity(prev => ({ ...prev, ...imported.scores.identity }));
    setLocation(prev => ({ ...prev, ...imported.scores.location }));
    setMotion(prev => ({ ...prev, ...imported.scores.motion }));
    // Pre-fill attribution and notes
    if (imported.attribution) setAttribution(imported.attribution);
    if (imported.qualitative_notes) setNotes(imported.qualitative_notes);
    setScoringSource(imported.scoring_source || 'ai_assisted');
    setShowImport(false);
    setShowImportConfirm(true);
    setTimeout(() => setShowImportConfirm(false), 8000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.evaluate(iteration.id, {
        scores: { identity, location, motion },
        ai_scores: aiScores,
        attribution,
        qualitative_notes: notes,
        scoring_source: scoringSource
      });
      onSaved?.();
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    setSaving(true);
    try {
      const next = await api.generateNext(iteration.id);
      setGeneratedPath(next.json_path || next.json_filename);
      setRenderPath(next.render_path || null);
      setOutputJson(next.json_contents);
      setGeneratedIterNum(next.iteration_number);
      setGeneratedChild(next);
      setShowGenerated(true);
      onSaved?.();
    } catch (err) {
      alert(`Generate failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async () => {
    setSaving(true);
    try {
      const result = await api.lock(iteration.id);
      // Show character proven settings update notification
      if (result.updated_characters && result.updated_characters.length > 0) {
        setLockCharacterUpdates(result.updated_characters);
        setTimeout(() => setLockCharacterUpdates(null), 10000);
      }
      onLocked?.();
    } catch (err) {
      alert(`Lock failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Import modal */}
      {showImport && (
        <ImportEvalModal
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Generated iteration modal */}
      {showGenerated && generatedPath && (
        <GeneratedModal
          jsonPath={generatedPath}
          renderPath={renderPath}
          iterationNumber={generatedIterNum}
          clipName={`Iteration #${generatedIterNum}`}
          iterationId={generatedChild?.id || null}
          seed={iteration.seed_used || null}
          onClose={() => setShowGenerated(false)}
          onGoToIteration={generatedChild && onGoToIteration ? () => {
            setShowGenerated(false);
            onGoToIteration(generatedChild);
          } : null}
        />
      )}

      {/* Fork modal */}
      {showFork && clipId && (
        <ForkModal
          iteration={iteration}
          clipId={clipId}
          onForked={(result) => {
            setShowFork(false);
            onForked?.(result);
          }}
          onClose={() => setShowFork(false)}
        />
      )}

      {/* Read-only banner with navigation to next iteration */}
      {isReadOnly && (
        <div className="border border-gray-600 bg-surface-overlay rounded px-3 py-2 flex items-center justify-between">
          <p className="text-xs font-mono text-gray-400">
            Evaluated and locked — viewing read-only. Next iteration has been generated.
          </p>
          {childIteration && onGoToIteration && (
            <button
              onClick={() => onGoToIteration(childIteration)}
              className="shrink-0 px-3 py-1 bg-accent text-black text-xs font-mono font-bold rounded hover:bg-accent/90 transition-colors"
            >
              Go to #{childIteration.iteration_number} &rarr;
            </button>
          )}
        </div>
      )}

      {/* Character proven settings update banner — shows after lock */}
      {lockCharacterUpdates && lockCharacterUpdates.length > 0 && (
        <div className="border border-score-high/50 bg-score-high/10 rounded px-3 py-2">
          <p className="text-sm font-mono text-score-high font-bold">Character proven settings updated</p>
          {lockCharacterUpdates.map((ch, i) => (
            <p key={i} className="text-xs font-mono text-gray-400 mt-1">
              {ch.name} ({ch.trigger_word}) — proven settings updated with locked iteration values.
            </p>
          ))}
        </div>
      )}

      {/* Import confirmation banner — shows briefly after import */}
      {showImportConfirm && (
        <div className="border border-score-high/50 bg-score-high/10 rounded px-3 py-2">
          <p className="text-sm font-mono text-score-high font-bold">Evaluation imported successfully</p>
          <p className="text-xs font-mono text-gray-400 mt-1">
            Scores, attribution, and notes have been pre-filled. Review and adjust anything you disagree with before saving.
          </p>
        </div>
      )}

      {/* AI-assisted persistent banner */}
      {aiScores && !isReadOnly && !showImportConfirm && (
        <div className="border border-accent/30 bg-accent/5 rounded px-3 py-2">
          <p className="text-xs font-mono text-accent">
            AI-assisted scoring active — adjust any scores before saving. Your final scores are what gets recorded.
          </p>
        </div>
      )}

      {/* Header with iteration info + prev/next navigation */}
      <div>
        <div className="flex items-center gap-2">
          {(() => {
            const sorted = allIterations.sort((a, b) => a.iteration_number - b.iteration_number);
            const idx = sorted.findIndex(i => i.id === iteration.id);
            const prev = idx > 0 ? sorted[idx - 1] : null;
            const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
            return (
              <>
                <button
                  onClick={() => prev && onGoToIteration?.(prev)}
                  disabled={!prev}
                  className="text-gray-600 hover:text-accent disabled:text-gray-800 font-mono text-sm px-1"
                >
                  ←
                </button>
                <button
                  onClick={() => next && onGoToIteration?.(next)}
                  disabled={!next}
                  className="text-gray-600 hover:text-accent disabled:text-gray-800 font-mono text-sm px-1"
                >
                  →
                </button>
              </>
            );
          })()}
          <h3 className="text-sm font-mono text-gray-200">{iteration.json_filename}</h3>
          {isForkPoint && (
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded border" style={{ backgroundColor: 'rgba(168, 85, 247, 0.15)', borderColor: 'rgba(168, 85, 247, 0.4)', color: '#c4b5fd' }}>
              ⑂ Fork Point
            </span>
          )}
          {clipId && onForked && (
            <button
              onClick={() => setShowFork(true)}
              className="px-2 py-0.5 text-xs font-mono border border-gray-700 rounded text-gray-500 hover:text-accent hover:border-accent/30 transition-colors"
              title="Fork a new branch from this iteration's settings"
            >
              Fork
            </button>
          )}
          {scoringSource !== 'manual' && (
            <span className="px-1.5 py-0.5 text-xs font-mono bg-accent/10 text-accent rounded">
              {scoringSource === 'ai_assisted' ? 'AI-Assisted' : scoringSource}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 font-mono mt-1">
          Iteration {iteration.iteration_number} — Seed: {iteration.seed_used || 'none'}
          {iteration.model_type && iteration.model_type !== 'other' && (
            <span className="ml-2 px-1.5 py-0.5 text-xs font-mono bg-surface-overlay text-gray-400 rounded border border-gray-700">
              {MODEL_TYPES.find(m => m.id === iteration.model_type)?.label || iteration.model_type}
            </span>
          )}
        </p>
        {iteration.change_from_parent && (
          <p className="text-xs text-accent font-mono mt-1 break-words">Changed: {iteration.change_from_parent}</p>
        )}
        {/* Render / Queue status for pending iterations */}
        {iteration.status === 'pending' && iteration.json_path && (() => {
          // Queue states: null (not queued), 'queued', 'rendering', 'complete', 'failed'
          const queueState = queueAdded; // queueAdded now holds the queue status string or false

          if (renderStatus === 'complete' || queueState === 'complete') {
            return (
              <div className="mt-2 border border-green-500/30 bg-green-500/5 rounded px-3 py-2">
                <span className="text-xs font-mono text-green-400 font-bold">Render complete</span>
              </div>
            );
          }

          if (queueState === 'queued') {
            return (
              <div className="mt-2 border border-accent/30 bg-accent/5 rounded px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-accent font-bold">In queue — waiting to render</span>
                  <button
                    onClick={async () => {
                      try {
                        const qs = await api.getIterationQueueStatus(iteration.id);
                        if (qs.in_queue && qs.id) {
                          await api.removeFromQueue(qs.id);
                          setQueueAdded(false);
                        }
                      } catch (err) { alert(`Remove failed: ${err.message}`); }
                    }}
                    className="px-2 py-0.5 text-xs font-mono text-gray-500 hover:text-red-400 border border-gray-600 hover:border-red-400/50 rounded transition-colors"
                  >
                    Remove from queue
                  </button>
                </div>
              </div>
            );
          }

          if (queueState === 'rendering' || renderStatus === 'rendering') {
            return (
              <div className="mt-2 border border-blue-500/30 bg-blue-500/5 rounded px-3 py-2">
                <span className="text-xs font-mono text-blue-400 font-bold animate-pulse">Rendering...</span>
              </div>
            );
          }

          if (queueState === 'failed' || renderStatus === 'failed') {
            return (
              <div className="mt-2 border border-red-500/30 bg-red-500/5 rounded px-3 py-2">
                <span className="text-xs font-mono text-red-400 font-bold">Render failed</span>
              </div>
            );
          }

          // Default: not queued, ready to render
          return (
            <div className="mt-2 border border-accent/30 bg-accent/5 rounded px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-accent font-bold">Ready to render</span>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      try {
                        await api.addToQueue({
                          json_path: iteration.json_path,
                          clip_name: iteration.json_filename?.replace('.json', '') || `Iteration #${iteration.iteration_number}`,
                          iteration_id: iteration.id,
                          seed: iteration.seed_used || null,
                          source: 'iteration'
                        });
                        setQueueAdded('queued');
                      } catch (err) {
                        alert(`Queue failed: ${err.message}`);
                      }
                    }}
                    className="bg-surface-overlay text-gray-300 border border-gray-600 hover:border-accent hover:text-accent px-3 py-1 text-xs font-mono font-bold rounded transition-colors"
                  >
                    Add to Queue
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        setRenderStatus('submitting');
                        // Add to queue at top priority + auto-start
                        await api.addToQueue({
                          json_path: iteration.json_path,
                          clip_name: iteration.json_filename?.replace('.json', '') || `Iteration #${iteration.iteration_number}`,
                          iteration_id: iteration.id,
                          seed: iteration.seed_used || null,
                          source: 'iteration',
                          priority: 0
                        });
                        // Auto-start queue if not running
                        try { await api.startQueue(); } catch {}
                        setQueueAdded('queued');
                        setRenderStatus(null);
                      } catch (err) {
                        setRenderStatus(null);
                        alert(`Render failed: ${err.message}`);
                      }
                    }}
                    disabled={renderStatus === 'submitting'}
                    className={`px-3 py-1 text-xs font-mono font-bold rounded transition-colors ${
                      renderStatus === 'submitting'
                        ? 'bg-accent/50 text-black/50 cursor-wait'
                        : 'bg-accent text-black hover:bg-accent/90'
                    }`}
                  >
                    {renderStatus === 'submitting' ? 'Submitting...' : 'Render Now'}
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(iteration.json_path)}
                    className="px-3 py-1 text-xs font-mono bg-surface-overlay text-gray-400 hover:text-gray-200 rounded transition-colors"
                    title="Copy JSON path for manual rendering"
                  >
                    Copy JSON
                  </button>
                </div>
              </div>
              <p className="text-xs font-mono text-gray-600 truncate" title={iteration.json_path}>{iteration.json_path}</p>
            </div>
          );
        })()}
        {/* Tags */}
        <div className="mt-2">
          <TagInput
            tags={localTags}
            onChange={(newTags) => {
              setLocalTags(newTags);
              api.updateIteration(iteration.id, { tags: newTags }).catch(() => {});
            }}
            readOnly={isReadOnly}
          />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
         STAGE 1: EVALUATE — what did you see?
         ════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Evaluate</h4>

        {/* Video diff — side by side comparison with previous iteration */}
        <VideoDiff
          currentVideoPath={currentVideoPath}
          previousVideoPath={comparisonVideoPath || previousVideoPath}
          currentLabel={`Iteration #${iteration.iteration_number}`}
          previousLabel={comparisonIter ? `Iteration #${comparisonIter.iteration_number}` : parentIteration ? `Iteration #${parentIteration.iteration_number}` : 'Previous'}
          currentIterationId={iteration.id}
          previousIterationId={comparisonIter?.id || parentIteration?.id}
          onCurrentPathSet={(path) => setCurrentVideoPath(path)}
          onPreviousPathSet={(path) => setPreviousVideoPath(path)}
          allIterations={allIterations}
          onPreviousIterationChange={(iter) => {
            setComparisonIter(iter);
            setComparisonVideoPath(iter.render_path);
          }}
        />

        {/* Import / Auto-score — between frames and scoring */}
        {!isReadOnly && !isEvaluated && !aiScores && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex-1 py-2.5 border border-dashed border-accent/40 rounded text-sm font-mono text-accent hover:bg-accent/5 hover:border-accent/60 transition-colors"
            >
              Import from Tenzing / Claude
            </button>
            <button
              onClick={async () => {
                try {
                  setAutoScoring(true);
                  const characterName = (typeof clip !== 'undefined' && clip?.characters?.[0]) || null;
                  const result = await api.visionScore(iteration.id, characterName);
                  // Pre-fill scores like Tenzing import
                  setAiScores({
                    identity: { ...result.scores.identity },
                    location: { ...result.scores.location },
                    motion: { ...result.scores.motion }
                  });
                  setIdentity(prev => ({ ...prev, ...result.scores.identity }));
                  setLocation(prev => ({ ...prev, ...result.scores.location }));
                  setMotion(prev => ({ ...prev, ...result.scores.motion }));
                  if (result.attribution) setAttribution(result.attribution);
                  if (result.qualitative_notes) setNotes(result.qualitative_notes);
                  setScoringSource('vision_api');
                  setShowImportConfirm(true);
                  setTimeout(() => setShowImportConfirm(false), 8000);
                } catch (err) {
                  alert(`Auto-score failed: ${err.message}`);
                } finally {
                  setAutoScoring(false);
                }
              }}
              disabled={autoScoring}
              className={`flex-1 py-2.5 border border-dashed rounded text-sm font-mono transition-colors ${
                autoScoring
                  ? 'border-blue-400/40 text-blue-400 bg-blue-400/5 animate-pulse'
                  : 'border-purple-400/40 text-purple-400 hover:bg-purple-400/5 hover:border-purple-400/60'
              }`}
            >
              {autoScoring ? 'Scoring with Vision API...' : 'Auto-Score with Vision API'}
            </button>
          </div>
        )}

        {/* Score sliders */}
        <ScoreGroup title="Identity" fields={IDENTITY_FIELDS} scores={identity}
          onChange={isReadOnly ? undefined : (key, val) => setIdentity(prev => ({ ...prev, [key]: val }))}
          readOnly={isReadOnly} historyScores={identityHistory} />
        <ScoreGroup title="Location" fields={LOCATION_FIELDS} scores={location}
          onChange={isReadOnly ? undefined : (key, val) => setLocation(prev => ({ ...prev, [key]: val }))}
          readOnly={isReadOnly} historyScores={locationHistory} />
        <ScoreGroup title="Motion" fields={MOTION_FIELDS} scores={motion}
          onChange={isReadOnly ? undefined : (key, val) => setMotion(prev => ({ ...prev, [key]: val }))}
          readOnly={isReadOnly} historyScores={motionHistory} />

        {/* Ghost marker legend */}
        {(identityHistory.length > 0 || locationHistory.length > 0 || motionHistory.length > 0) && (
          <div className="flex items-center gap-4 text-xs font-mono text-gray-600">
            <span>Previous scores:</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{backgroundColor:'#22c55e40',border:'1px solid #22c55e80'}} /> improved</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{backgroundColor:'#66666660',border:'1px solid #66666680'}} /> same</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{backgroundColor:'#ef444440',border:'1px solid #ef444480'}} /> regressed</span>
            <span className="text-gray-700">hover for details</span>
          </div>
        )}

        {/* Regression warnings — flag unexpected score drops in non-targeted categories */}
        {(() => {
          // Only show when: parent exists with evaluation, current has been scored (not default 45),
          // and a rope is selected that targets a specific category
          const parentEval = parentIteration?.evaluation?.scores;
          const ropeId = attribution?.rope;
          const targetCategory = ropeId ? ROPE_CATEGORY_MAP[ropeId] : null;
          if (!parentEval || !targetCategory || targetCategory === 'all' || grandTotal === 45) return null;

          const identityTotal = IDENTITY_FIELDS.reduce((s, f) => s + (identity[f.key] || 1), 0);
          const locationTotal = LOCATION_FIELDS.reduce((s, f) => s + (location[f.key] || 1), 0);
          const motionTotal = MOTION_FIELDS.reduce((s, f) => s + (motion[f.key] || 1), 0);

          const parentIdentity = parentEval.identity ? IDENTITY_FIELDS.reduce((s, f) => s + (parentEval.identity[f.key] || 1), 0) : null;
          const parentLocation = parentEval.location ? LOCATION_FIELDS.reduce((s, f) => s + (parentEval.location[f.key] || 1), 0) : null;
          const parentMotion = parentEval.motion ? MOTION_FIELDS.reduce((s, f) => s + (parentEval.motion[f.key] || 1), 0) : null;

          const categories = [
            { name: 'Identity', current: identityTotal, parent: parentIdentity, max: 40, key: 'identity' },
            { name: 'Location', current: locationTotal, parent: parentLocation, max: 20, key: 'location' },
            { name: 'Motion', current: motionTotal, parent: parentMotion, max: 15, key: 'motion' }
          ];

          const ropeLabel = ROPES.find(r => r.id === ropeId)?.label || ropeId;

          const regressions = categories
            .filter(c => c.key !== targetCategory && c.parent !== null && (c.parent - c.current) >= 3)
            .map(c => `${c.name} regressed from ${c.parent}/${c.max} to ${c.current}/${c.max} but change was to ${ropeLabel} (${targetCategory} lever). Possible side effect.`);

          if (regressions.length === 0) return null;

          return (
            <div className="border border-amber-500/50 bg-amber-500/10 rounded px-3 py-2 space-y-1">
              {regressions.map((msg, i) => (
                <p key={i} className="text-xs font-mono text-accent">{msg}</p>
              ))}
            </div>
          );
        })()}

        {/* Grand total */}
        <div className="border-t border-gray-700 pt-3 flex items-center justify-between">
          <span className="text-sm font-mono text-gray-400 uppercase">Grand Total</span>
          {isEvaluated || grandTotal !== 45 ? (
            <span className={`text-3xl font-mono font-bold ${
              canLock ? 'text-score-high' : grandTotal / GRAND_MAX < 0.5 ? 'text-score-low' : 'text-score-mid'
            }`}>
              {grandTotal}/{GRAND_MAX}
            </span>
          ) : (
            <span className="text-xl font-mono text-gray-600">—/{GRAND_MAX}</span>
          )}
        </div>

        {/* Qualitative notes */}
        <div>
          <label className="text-xs font-mono text-gray-500 block mb-1">Qualitative Notes</label>
          <textarea
            value={notes} onChange={isReadOnly ? undefined : (e) => setNotes(e.target.value)}
            readOnly={isReadOnly}
            rows={3} placeholder="What did you notice?"
            className={`w-full bg-surface border border-gray-600 rounded px-2 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600 resize-none ${isReadOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
          />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
         REFERENCE MATERIAL — input JSON and diff (between stages)
         ════════════════════════════════════════════════════════════════════ */}

      {/* Input JSON */}
      <JsonViewer
        label={`Input JSON — settings that produced this render (${iteration.json_filename})`}
        json={iteration.json_contents}
      />

      {/* JSON diff from parent iteration */}
      {parentIteration && (
        <JsonDiffPanel
          previousJson={parentIteration.json_contents}
          currentJson={iteration.json_contents}
        />
      )}

      {/* Tiered settings display — Tier 1 always visible, Tier 2 accordion, Tier 3 hidden */}
      <SettingsPanel
        jsonContents={iteration.json_contents}
        parentJsonContents={parentIteration?.json_contents}
      />

      {/* ════════════════════════════════════════════════════════════════════
         STAGE 2: ACT — what do you do about it?
         ════════════════════════════════════════════════════════════════════ */}
      <div className="border-t border-gray-700 pt-4 space-y-4">
        <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Act</h4>

        {/* Attribution */}
        <AttributionPanel attribution={attribution} onChange={isReadOnly ? undefined : setAttribution} readOnly={isReadOnly} modelType={iteration.model_type} />

        {/* Generated output info — persistent, shows on revisit via childIteration */}
        {(generatedPath || childIteration) && (
          <div className="border border-score-high/50 bg-score-high/10 rounded p-3 space-y-2">
            <p className="text-sm font-mono text-score-high font-bold">
              Next iteration {childIteration ? `#${childIteration.iteration_number}` : ''} generated
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-500 shrink-0">JSON:</span>
                <span className="text-xs font-mono text-gray-300 break-all select-all flex-1">
                  {generatedPath || childIteration?.json_path || childIteration?.json_filename}
                </span>
                <CopyBtn text={generatedPath || childIteration?.json_path || childIteration?.json_filename || ''} />
              </div>
              {(renderPath || childIteration?.render_path) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500 shrink-0">Render:</span>
                  <span className="text-xs font-mono text-accent break-all select-all flex-1">
                    {renderPath || childIteration?.render_path}
                  </span>
                  <CopyBtn text={renderPath || childIteration?.render_path || ''} />
                </div>
              )}
            </div>
            <p className="text-xs font-mono text-gray-600">Load JSON in Wan2GP. Save render to the path above.</p>
            {onGoToIteration && childIteration && (
              <button
                onClick={() => onGoToIteration(childIteration)}
                className="mt-1 px-3 py-1.5 bg-accent text-black text-xs font-mono font-bold rounded hover:bg-accent/90"
              >
                Go to Iteration #{childIteration.iteration_number} &rarr;
              </button>
            )}
          </div>
        )}

        {/* Output JSON */}
        <JsonViewer
          label="Output JSON — settings for the next iteration"
          json={outputJson}
        />

        {/* Action buttons */}
        {!isReadOnly && (
          <div className="space-y-1.5">
            <div className="flex gap-2 flex-wrap">
              {!isEvaluated && (
                <>
                  <button onClick={handleSave} disabled={saving}
                    className="px-4 py-2 bg-surface-overlay text-gray-200 text-sm font-mono rounded hover:bg-gray-600 disabled:opacity-50 border border-gray-600">
                    Save Evaluation
                  </button>
                  <button onClick={handleSaveAndGenerate} disabled={saving || !attribution.rope}
                    className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50"
                    title={!attribution.rope ? 'Select a rope attribution below before generating' : undefined}>
                    Save &amp; Generate Next
                  </button>
                </>
              )}
              {isEvaluated && !hasChild && (
                <button onClick={handleNext} disabled={saving || !attribution.rope}
                  className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50"
                  title={!attribution.rope ? 'Select a rope attribution below before generating' : undefined}>
                  Generate Next Iteration
                </button>
              )}
              {canLock && !hasChild && (
                <button onClick={handleLock} disabled={saving}
                  className="px-4 py-2 bg-score-high text-black text-sm font-mono font-bold rounded hover:bg-green-400 disabled:opacity-50">
                  Lock as Production
                </button>
              )}
            </div>
            {!attribution.rope && !isEvaluated && (
              <p className="text-xs font-mono text-gray-600">
                Select a rope in the Attribution section below to enable Generate
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
