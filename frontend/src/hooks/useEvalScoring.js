import { useState, useEffect, useMemo } from 'react';
import { IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS, GRAND_MAX, SCORE_LOCK_THRESHOLD } from '../constants';

const defaultScores = (fields) => Object.fromEntries(fields.map(f => [f.key, 3]));

/**
 * Manages evaluation scoring state — identity/location/motion scores,
 * AI scores, scoring source, notes, and derived totals.
 */
export function useEvalScoring(iteration, { onScoreChange, onUnsavedScoresChange } = {}) {
  const [identity, setIdentity] = useState(defaultScores(IDENTITY_FIELDS));
  const [location, setLocation] = useState(defaultScores(LOCATION_FIELDS));
  const [motion, setMotion] = useState(defaultScores(MOTION_FIELDS));
  const [attribution, setAttribution] = useState({});
  const [notes, setNotes] = useState('');
  const [aiScores, setAiScores] = useState(null);
  const [scoringSource, setScoringSource] = useState('manual');

  const isEvaluated = !!iteration.evaluation;

  // Sync from iteration evaluation data
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
  }, [iteration.id]);

  const grandTotal =
    IDENTITY_FIELDS.reduce((s, f) => s + (identity[f.key] || 1), 0) +
    LOCATION_FIELDS.reduce((s, f) => s + (location[f.key] || 1), 0) +
    MOTION_FIELDS.reduce((s, f) => s + (motion[f.key] || 1), 0);

  const canLock = grandTotal >= SCORE_LOCK_THRESHOLD;

  // Push live score up to parent
  useEffect(() => {
    onScoreChange?.(grandTotal);
  }, [grandTotal]);

  // Signal unsaved scores + warn before navigating away
  useEffect(() => {
    onUnsavedScoresChange?.(!!(aiScores && !isEvaluated));
  }, [aiScores, isEvaluated]);

  useEffect(() => {
    if (!aiScores || isEvaluated) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = 'You have unsaved Vision API scores. Leave without saving?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [aiScores, isEvaluated]);

  // Import scores from AI (Vision API or Tenzing)
  const importScores = (imported) => {
    setAiScores({
      identity: { ...imported.scores.identity },
      location: { ...imported.scores.location },
      motion: { ...imported.scores.motion }
    });
    setIdentity(prev => ({ ...prev, ...imported.scores.identity }));
    setLocation(prev => ({ ...prev, ...imported.scores.location }));
    setMotion(prev => ({ ...prev, ...imported.scores.motion }));
    if (imported.attribution) setAttribution(imported.attribution);
    if (imported.qualitative_notes) setNotes(imported.qualitative_notes);
    setScoringSource(imported.scoring_source || 'ai_assisted');
  };

  return {
    identity, setIdentity,
    location, setLocation,
    motion, setMotion,
    attribution, setAttribution,
    notes, setNotes,
    aiScores, setAiScores,
    scoringSource, setScoringSource,
    grandTotal, canLock,
    importScores,
  };
}
