import { useState, useEffect } from 'react';
import ScoreGroup from './ScoreGroup';
import ScoreRing from './ScoreRing';
import AttributionPanel from './AttributionPanel';
import JsonViewer from './JsonViewer';
import ImportEvalModal from './ImportEvalModal';
import JsonDiffPanel from './JsonDiffPanel';
import FrameStrip from './FrameStrip';
import VideoDiff from './VideoDiff';
import GeneratedModal from './GeneratedModal';
import TagInput from '../clips/TagInput';
import { api } from '../../api';
import { IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS, SCORE_LOCK_THRESHOLD, GRAND_MAX, ROPE_CATEGORY_MAP, ROPES } from '../../constants';

const defaultScores = (fields) => Object.fromEntries(fields.map(f => [f.key, 3]));

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className={`px-1.5 py-0.5 rounded text-xs font-mono shrink-0 ${copied ? 'bg-score-high/20 text-score-high' : 'bg-surface-overlay text-gray-600 hover:text-gray-400'}`}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function EvaluationPanel({ iteration, childIteration, parentIteration, ancestorChain = [], onSaved, onNext, onLocked, onGoToIteration, onScoreChange }) {
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
    // Try to derive video paths from iteration data (render_path stored on iteration)
    setCurrentVideoPath(iteration.render_path || null);
    setPreviousVideoPath(parentIteration?.render_path || null);
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
      await api.lock(iteration.id);
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
          onClose={() => setShowGenerated(false)}
          onGoToIteration={generatedChild && onGoToIteration ? () => {
            setShowGenerated(false);
            onGoToIteration(generatedChild);
          } : null}
        />
      )}

      {/* Read-only banner */}
      {isReadOnly && (
        <div className="border border-gray-600 bg-surface-overlay rounded px-3 py-2">
          <p className="text-xs font-mono text-gray-400">
            This iteration has been evaluated and its next iteration generated. Viewing in read-only mode.
          </p>
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

      {/* Header with iteration info */}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-mono text-gray-200">{iteration.json_filename}</h3>
          {scoringSource !== 'manual' && (
            <span className="px-1.5 py-0.5 text-xs font-mono bg-accent/10 text-accent rounded">
              {scoringSource === 'ai_assisted' ? 'AI-Assisted' : scoringSource}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 font-mono mt-1">
          Iteration {iteration.iteration_number} — Seed: {iteration.seed_used || 'none'}
        </p>
        {iteration.change_from_parent && (
          <p className="text-xs text-accent font-mono mt-1 break-words">Changed: {iteration.change_from_parent}</p>
        )}
        {/* Tags */}
        <div className="mt-2">
          <TagInput
            tags={iteration.tags || []}
            onChange={(newTags) => {
              // Optimistically update iteration object and persist
              iteration.tags = newTags;
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
          previousVideoPath={previousVideoPath}
          currentLabel={`Iteration #${iteration.iteration_number}`}
          previousLabel={parentIteration ? `Iteration #${parentIteration.iteration_number}` : 'Previous'}
          currentIterationId={iteration.id}
          previousIterationId={parentIteration?.id}
          onCurrentPathSet={(path) => setCurrentVideoPath(path)}
          onPreviousPathSet={(path) => setPreviousVideoPath(path)}
        />

        {/* Render frame thumbnails */}
        <FrameStrip iterationId={iteration.id} renderPath={iteration.render_path} />

        {/* Import evaluation — between frames and scoring */}
        {!isReadOnly && !isEvaluated && !aiScores && (
          <button
            onClick={() => setShowImport(true)}
            className="w-full py-2.5 border border-dashed border-accent/40 rounded text-sm font-mono text-accent hover:bg-accent/5 hover:border-accent/60 transition-colors"
          >
            Import Evaluation from Tenzing / Claude
          </button>
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

      {/* ════════════════════════════════════════════════════════════════════
         STAGE 2: ACT — what do you do about it?
         ════════════════════════════════════════════════════════════════════ */}
      <div className="border-t border-gray-700 pt-4 space-y-4">
        <h4 className="text-xs font-mono text-gray-500 uppercase tracking-wider">Act</h4>

        {/* Attribution */}
        <AttributionPanel attribution={attribution} onChange={isReadOnly ? undefined : setAttribution} readOnly={isReadOnly} />

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
          <div className="flex gap-2 flex-wrap">
            {!isEvaluated && (
              <>
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2 bg-surface-overlay text-gray-200 text-sm font-mono rounded hover:bg-gray-600 disabled:opacity-50 border border-gray-600">
                  Save Evaluation
                </button>
                <button onClick={handleSaveAndGenerate} disabled={saving || !attribution.rope}
                  className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50">
                  Save &amp; Generate Next
                </button>
              </>
            )}
            {isEvaluated && !hasChild && (
              <button onClick={handleNext} disabled={saving || !attribution.rope}
                className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50">
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
        )}
      </div>
    </div>
  );
}
