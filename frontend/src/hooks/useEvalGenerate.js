import { useState, useEffect, useMemo } from 'react';

/**
 * Manages generation output state and JSON override editing.
 */
export function useEvalGenerate(iteration, childIteration, attribution) {
  const [generatedPath, setGeneratedPath] = useState(null);
  const [renderPath, setRenderPath] = useState(null);
  const [outputJson, setOutputJson] = useState(null);
  const [generatedIterNum, setGeneratedIterNum] = useState(null);
  const [generatedChild, setGeneratedChild] = useState(null);
  const [showGenerated, setShowGenerated] = useState(false);

  const [showJsonPatch, setShowJsonPatch] = useState(false);
  const [jsonPatchText, setJsonPatchText] = useState('');
  const [jsonPatchError, setJsonPatchError] = useState(null);
  const [jsonPatchPromptWarning, setJsonPatchPromptWarning] = useState(null);

  // Sync from child iteration on iteration change
  useEffect(() => {
    if (childIteration) {
      setOutputJson(childIteration.json_contents);
      setGeneratedPath(childIteration.json_path || childIteration.json_filename);
    } else {
      setOutputJson(null);
      setGeneratedPath(null);
    }
  }, [iteration.id]);

  // Proposed next iteration JSON — parent contents with eval attribution changes applied
  const proposedNextJson = useMemo(() => {
    if (!iteration?.json_contents) return null;
    const next = { ...iteration.json_contents };
    if (attribution?.next_changes && typeof attribution.next_changes === 'object') {
      Object.assign(next, attribution.next_changes);
    } else if (attribution?.next_change_json_field && attribution?.next_change_value !== undefined) {
      next[attribution.next_change_json_field] = attribution.next_change_value;
    }
    return next;
  }, [iteration?.json_contents, attribution]);

  const NEGATIVE_QUALITY_TERMS = ['blurry', 'distorted', 'deformed', 'low quality', 'video game', 'CGI', 'over-rendered'];

  const handleJsonPatchChange = (val) => {
    setJsonPatchText(val);
    try {
      const parsed = JSON.parse(val);
      setJsonPatchError(null);
      const prompt = parsed?.prompt || '';
      const found = NEGATIVE_QUALITY_TERMS.filter(t => prompt.toLowerCase().includes(t.toLowerCase()));
      setJsonPatchPromptWarning(found.length > 0
        ? `Positive prompt contains negative quality terms: ${found.join(', ')} — did the negative_prompt get pasted into prompt by mistake?`
        : null);
    } catch (e) {
      setJsonPatchError(e.message);
      setJsonPatchPromptWarning(null);
    }
  };

  const handleOpenJsonPatch = () => {
    setShowJsonPatch(true);
    if (!jsonPatchText && proposedNextJson) {
      setJsonPatchText(JSON.stringify(proposedNextJson, null, 2));
    }
  };

  const getJsonOverride = () => {
    if (!showJsonPatch || !jsonPatchText || jsonPatchError) return undefined;
    try { return JSON.parse(jsonPatchText); } catch { return undefined; }
  };

  // Set generation results after a successful generate call
  const setGenerationResult = (next) => {
    setGeneratedPath(next.json_path || next.json_filename);
    setRenderPath(next.render_path || null);
    setOutputJson(next.json_contents);
    setGeneratedIterNum(next.iteration_number);
    setGeneratedChild(next);
    setShowGenerated(true);
  };

  return {
    generatedPath, renderPath, outputJson,
    generatedIterNum, generatedChild,
    showGenerated, setShowGenerated,
    showJsonPatch, setShowJsonPatch,
    jsonPatchText, jsonPatchError, jsonPatchPromptWarning,
    proposedNextJson,
    handleJsonPatchChange, handleOpenJsonPatch, getJsonOverride,
    setGenerationResult,
  };
}
