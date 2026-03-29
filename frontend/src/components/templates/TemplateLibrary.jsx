import { useState } from 'react';
import { useCharacters, useTemplates } from '../../hooks/useQueries';
import { api } from '../../api';

/**
 * TemplateLibrary — browse, create, and generate Wan2GP starter JSONs from
 * reusable prompt templates. Each template has placeholder tokens that get
 * filled with a character's locked identity block, proven settings, plus
 * user-supplied location and action.
 */

// --- Sub-components ---

function TemplateCard({ template, onGenerate, onDelete, onEdit }) {
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    await onDelete(template.id);
    setConfirming(false);
  };

  return (
    <div className="border border-gray-700 rounded-lg p-4 bg-surface hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-mono font-bold text-gray-200 truncate">{template.name}</h3>
          {template.description && (
            <p className="text-xs font-mono text-gray-500 mt-1 line-clamp-2">{template.description}</p>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={() => onGenerate(template)}
            className="px-3 py-1.5 text-xs font-mono font-bold bg-accent text-black rounded hover:bg-accent/90 transition-colors"
          >
            Generate JSON
          </button>
          <button
            onClick={() => onEdit(template)}
            className="px-2 py-1.5 text-xs font-mono text-gray-400 hover:text-gray-200 border border-gray-600 rounded transition-colors"
          >
            View
          </button>
          <button
            onClick={handleDelete}
            onBlur={() => setConfirming(false)}
            className={`px-2 py-1.5 text-xs font-mono rounded transition-colors ${
              confirming
                ? 'bg-score-low text-white'
                : 'text-gray-500 hover:text-score-low border border-gray-700'
            }`}
          >
            {confirming ? 'Confirm?' : 'Del'}
          </button>
        </div>
      </div>

      {/* Preview of prompt template */}
      <div className="mt-3 p-2 bg-surface-raised rounded border border-gray-700">
        <p className="text-xs font-mono text-gray-400 truncate" title={template.prompt_template}>
          <span className="text-gray-600">prompt: </span>{template.prompt_template}
        </p>
        {template.alt_prompt_template && (
          <p className="text-xs font-mono text-gray-400 truncate mt-1" title={template.alt_prompt_template}>
            <span className="text-gray-600">alt: </span>{template.alt_prompt_template}
          </p>
        )}
      </div>

      {/* Settings summary */}
      {template.default_settings && Object.keys(template.default_settings).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(template.default_settings).map(([key, val]) => (
            <span key={key} className="text-xs font-mono text-gray-500 bg-surface-overlay rounded px-1.5 py-0.5">
              {key}: {val}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateTemplateModal({ onCreated, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [altPromptTemplate, setAltPromptTemplate] = useState('');
  const [negativePromptTemplate, setNegativePromptTemplate] = useState('');
  const [guidanceScale, setGuidanceScale] = useState('6.0');
  const [guidance2Scale, setGuidance2Scale] = useState('3.0');
  const [lorasMultipliers, setLorasMultipliers] = useState('');
  const [videoLength, setVideoLength] = useState('32');
  const [numInferenceSteps, setNumInferenceSteps] = useState('30');
  const [filmGrainIntensity, setFilmGrainIntensity] = useState('0.01');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !promptTemplate.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const defaultSettings = {};
      if (guidanceScale !== '') defaultSettings.guidance_scale = parseFloat(guidanceScale);
      if (guidance2Scale !== '') defaultSettings.guidance2_scale = parseFloat(guidance2Scale);
      if (lorasMultipliers.trim()) defaultSettings.loras_multipliers = lorasMultipliers.trim();
      if (videoLength !== '') defaultSettings.video_length = parseInt(videoLength, 10);
      if (numInferenceSteps !== '') defaultSettings.num_inference_steps = parseInt(numInferenceSteps, 10);
      if (filmGrainIntensity !== '') defaultSettings.film_grain_intensity = parseFloat(filmGrainIntensity);

      await api.createTemplate({
        name: name.trim(),
        description: description.trim(),
        prompt_template: promptTemplate.trim(),
        alt_prompt_template: altPromptTemplate.trim(),
        negative_prompt_template: negativePromptTemplate.trim(),
        default_settings: defaultSettings
      });
      onCreated();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-raised border border-gray-700 rounded-lg w-[620px] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-mono text-gray-200 font-bold">New Template</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
              placeholder="e.g. Character at Location — Standard"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600" />
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What this template is for"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600" />
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Prompt Template *</label>
            <textarea value={promptTemplate} onChange={e => setPromptTemplate(e.target.value)} rows={3}
              placeholder="({{trigger}}:1.3), ({{identity_condensed}}:1.1), {{action}}, ({{location}}:0.9), cinematic"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600 resize-y" />
            <p className="text-xs font-mono text-gray-600 mt-1">
              Placeholders: {'{{trigger}}'} {'{{identity_condensed}}'} {'{{identity_full}}'} {'{{location}}'} {'{{action}}'} {'{{negative_block}}'}
            </p>
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Alt Prompt Template</label>
            <textarea value={altPromptTemplate} onChange={e => setAltPromptTemplate(e.target.value)} rows={2}
              placeholder="{{identity_full}}"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600 resize-y" />
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Negative Prompt Template</label>
            <textarea value={negativePromptTemplate} onChange={e => setNegativePromptTemplate(e.target.value)} rows={2}
              placeholder="{{negative_block}}, jittery motion, watermark"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600 resize-y" />
          </div>

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-2">Default Settings</label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-mono text-gray-600 block mb-1">guidance_scale</label>
                <input type="number" step="0.1" value={guidanceScale} onChange={e => setGuidanceScale(e.target.value)}
                  className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200" />
              </div>
              <div>
                <label className="text-xs font-mono text-gray-600 block mb-1">guidance2_scale</label>
                <input type="number" step="0.1" value={guidance2Scale} onChange={e => setGuidance2Scale(e.target.value)}
                  className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200" />
              </div>
              <div>
                <label className="text-xs font-mono text-gray-600 block mb-1">num_inference_steps</label>
                <input type="number" step="1" value={numInferenceSteps} onChange={e => setNumInferenceSteps(e.target.value)}
                  className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200" />
              </div>
              <div>
                <label className="text-xs font-mono text-gray-600 block mb-1">video_length</label>
                <input type="number" step="1" value={videoLength} onChange={e => setVideoLength(e.target.value)}
                  className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200" />
              </div>
              <div>
                <label className="text-xs font-mono text-gray-600 block mb-1">film_grain_intensity</label>
                <input type="number" step="0.01" value={filmGrainIntensity} onChange={e => setFilmGrainIntensity(e.target.value)}
                  className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200" />
              </div>
              <div>
                <label className="text-xs font-mono text-gray-600 block mb-1">loras_multipliers</label>
                <input type="text" value={lorasMultipliers} onChange={e => setLorasMultipliers(e.target.value)}
                  placeholder="1.0;0.3 0.3;1.2"
                  className="w-full bg-surface border border-gray-600 rounded px-3 py-1.5 text-sm font-mono text-gray-200 placeholder:text-gray-600" />
              </div>
            </div>
          </div>

          {error && (
            <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
              <p className="text-xs font-mono text-score-low">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-mono text-gray-400 hover:text-gray-200">Cancel</button>
            <button type="submit" disabled={!name.trim() || !promptTemplate.trim() || submitting}
              className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ViewTemplateModal({ template, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-raised border border-gray-700 rounded-lg w-[600px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-mono text-gray-200 font-bold">{template.name}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {template.description && (
            <p className="text-xs font-mono text-gray-400">{template.description}</p>
          )}

          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Prompt Template</label>
            <pre className="text-xs font-mono text-gray-200 bg-surface rounded p-3 border border-gray-700 whitespace-pre-wrap">{template.prompt_template}</pre>
          </div>

          {template.alt_prompt_template && (
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Alt Prompt Template</label>
              <pre className="text-xs font-mono text-gray-200 bg-surface rounded p-3 border border-gray-700 whitespace-pre-wrap">{template.alt_prompt_template}</pre>
            </div>
          )}

          {template.negative_prompt_template && (
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Negative Prompt Template</label>
              <pre className="text-xs font-mono text-gray-200 bg-surface rounded p-3 border border-gray-700 whitespace-pre-wrap">{template.negative_prompt_template}</pre>
            </div>
          )}

          {template.default_settings && Object.keys(template.default_settings).length > 0 && (
            <div>
              <label className="text-xs font-mono text-gray-500 block mb-1">Default Settings</label>
              <pre className="text-xs font-mono text-gray-200 bg-surface rounded p-3 border border-gray-700">{JSON.stringify(template.default_settings, null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-mono text-gray-400 hover:text-gray-200">Close</button>
        </div>
      </div>
    </div>
  );
}

function GenerateModal({ template, onClose, onGenerated }) {
  const { data: characters, isLoading: charsLoading } = useCharacters();
  const [characterId, setCharacterId] = useState('');
  const [location, setLocation] = useState('');
  const [action, setAction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    if (!characterId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await api.generateFromTemplate(template.id, {
        character_id: characterId,
        location: location.trim(),
        action: action.trim()
      });
      setResult(res);
      if (onGenerated) onGenerated(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyJson = () => {
    if (result?.generated_json) {
      navigator.clipboard.writeText(JSON.stringify(result.generated_json, null, 2));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-raised border border-gray-700 rounded-lg w-[640px] max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div>
            <h3 className="text-sm font-mono text-gray-200 font-bold">Generate Starter JSON</h3>
            <p className="text-xs font-mono text-gray-500 mt-0.5">{template.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Character select */}
          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Character *</label>
            {charsLoading ? (
              <p className="text-xs font-mono text-gray-600">Loading characters...</p>
            ) : (
              <select value={characterId} onChange={e => setCharacterId(e.target.value)}
                className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200">
                <option value="">Select a character...</option>
                {(characters || []).map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.trigger_word})</option>
                ))}
              </select>
            )}
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Location</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Monaco harbour balcony at golden hour"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600" />
          </div>

          {/* Action */}
          <div>
            <label className="text-xs font-mono text-gray-500 block mb-1">Action</label>
            <input type="text" value={action} onChange={e => setAction(e.target.value)}
              placeholder="e.g. man gazes out then turns to camera"
              className="w-full bg-surface border border-gray-600 rounded px-3 py-2 text-sm font-mono text-gray-200 placeholder:text-gray-600" />
          </div>

          {error && (
            <div className="border border-score-low/50 bg-score-low/10 rounded px-3 py-2">
              <p className="text-xs font-mono text-score-low">{error}</p>
            </div>
          )}

          {/* Result preview */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono font-bold text-score-high">Generated Successfully</h4>
                <button onClick={handleCopyJson}
                  className="text-xs font-mono text-accent hover:text-accent/80 border border-accent/30 rounded px-2 py-1">
                  Copy JSON
                </button>
              </div>
              <pre className="text-xs font-mono text-gray-300 bg-surface rounded p-3 border border-gray-700 max-h-64 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(result.generated_json, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-mono text-gray-400 hover:text-gray-200">
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button onClick={handleGenerate} disabled={!characterId || generating}
              className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90 disabled:opacity-50">
              {generating ? 'Generating...' : 'Generate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---

export default function TemplateLibrary() {
  const { data: templates, isLoading: loading, error: queryError, refetch } = useTemplates();
  const error = queryError?.message || null;
  const [showCreate, setShowCreate] = useState(false);
  const [viewTemplate, setViewTemplate] = useState(null);
  const [generateTemplate, setGenerateTemplate] = useState(null);

  const handleDelete = async (id) => {
    try {
      await api.deleteTemplate(id);
      refetch();
    } catch {
      // Deletion failed — template may already be gone
      refetch();
    }
  };

  if (loading) return <p className="text-gray-500 font-mono text-sm">Loading templates...</p>;
  if (error) return <p className="text-red-400 font-mono text-sm">Error: {error}</p>;

  const list = templates || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-mono font-bold text-gray-200 uppercase tracking-wider">Prompt Templates</h2>
        <span className="text-xs font-mono text-gray-500">{list.length}</span>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto text-xs font-mono text-accent hover:text-accent/80 border border-accent/30 rounded px-3 py-1"
        >
          + New Template
        </button>
      </div>

      {list.length === 0 ? (
        <div className="border border-gray-700 rounded-lg p-6 text-center">
          <p className="text-gray-500 text-xs font-mono mb-3">No templates yet</p>
          <p className="text-gray-600 text-xs font-mono mb-4">
            Templates let you reuse prompt structures across clips. Define placeholders for character identity, location, and action — the generate step fills them in automatically.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs font-mono text-accent hover:text-accent/80 border border-accent/30 rounded px-3 py-1.5"
          >
            Create your first template
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onGenerate={setGenerateTemplate}
              onDelete={handleDelete}
              onEdit={setViewTemplate}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTemplateModal
          onCreated={() => { setShowCreate(false); refetch(); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {viewTemplate && (
        <ViewTemplateModal
          template={viewTemplate}
          onClose={() => setViewTemplate(null)}
        />
      )}

      {generateTemplate && (
        <GenerateModal
          template={generateTemplate}
          onClose={() => setGenerateTemplate(null)}
        />
      )}
    </div>
  );
}
