import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SCORE_LOCK_THRESHOLD, GRAND_MAX } from '../../constants';
import { useCharacters, useSeedAnalytics, useSeedPersonalityProfileStatus, useVisionStatus } from '../../hooks/useQueries';
import { api } from '../../api';

const PROFILE_FLAGS_STORAGE_KEY = 'iteratarr.seedProfileFlags.v1';

function statusForSeed(seed) {
  const retiredBranches = (seed.abandoned_branch_count || 0) + (seed.superseded_branch_count || 0);
  if (
    (seed.branch_count || 0) > 0 &&
    (seed.active_branch_count || 0) === 0 &&
    (seed.locked_count || 0) === 0 &&
    retiredBranches > 0
  ) {
    return { label: 'Abandoned', className: 'text-gray-400 bg-gray-500/10' };
  }
  if (seed.evaluated_count === 0) {
    return { label: 'Untested', className: 'text-gray-500 bg-gray-500/10' };
  }
  if ((seed.best_score ?? 0) >= SCORE_LOCK_THRESHOLD || seed.locked_count > 0) {
    return { label: 'Proven', className: 'text-green-400 bg-green-400/10' };
  }
  if ((seed.best_score ?? 0) >= 55 || seed.selected_count > 0) {
    return { label: 'Promising', className: 'text-accent bg-accent/10' };
  }
  if (seed.branch_count > 1 || seed.evaluated_count >= 3) {
    return { label: 'Mixed', className: 'text-amber-400 bg-amber-400/10' };
  }
  return { label: 'Early', className: 'text-blue-400 bg-blue-400/10' };
}

function scoreColor(score) {
  if (score == null) return 'text-gray-600';
  if (score >= SCORE_LOCK_THRESHOLD) return 'text-green-400';
  if (score >= 43) return 'text-amber-400';
  return 'text-red-400';
}

const SummaryCard = memo(function SummaryCard({ label, value, color = 'text-gray-200' }) {
  return (
    <div className="bg-surface-raised border border-gray-700 rounded-lg px-5 py-3 font-mono">
      <div className="text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
});

const Sparkline = memo(function Sparkline({ points, width = 120, height = 30 }) {
  const numericPoints = (points || [])
    .map(point => point.score)
    .filter(score => score != null);

  if (numericPoints.length < 2) {
    return <span className="text-gray-600 text-xs font-mono">n/a</span>;
  }

  const min = 0;
  const max = GRAND_MAX;
  const stepX = width / Math.max(numericPoints.length - 1, 1);
  const coords = numericPoints.map((score, idx) => {
    const x = idx * stepX;
    const norm = (score - min) / Math.max(max - min, 1);
    const y = height - norm * height;
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-accent"
        points={coords.join(' ')}
      />
    </svg>
  );
});

const SeedRow = memo(function SeedRow({
  seed,
  isSelected,
  onSelect,
  compareSeedA,
  compareSeedB,
  onSetCompareA,
  onSetCompareB
}) {
  const status = statusForSeed(seed);
  const progressPct = seed.best_score != null
    ? Math.min((seed.best_score / SCORE_LOCK_THRESHOLD) * 100, 100)
    : 0;
  const progressColor = seed.best_score == null
    ? 'bg-gray-700'
    : seed.best_score >= SCORE_LOCK_THRESHOLD
      ? 'bg-green-500'
      : seed.best_score >= 43
        ? 'bg-amber-500'
        : 'bg-red-500';

  return (
    <tr
      onClick={() => onSelect(seed.seed)}
      className={`border-b border-gray-800 cursor-pointer transition-colors ${
        isSelected ? 'bg-accent/20 border-l-2 border-accent' : 'hover:bg-surface-overlay border-l-2 border-transparent'
      } ${seed.evaluated_count === 0 ? 'opacity-60' : ''}`}
    >
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onSetCompareA(seed.seed); }}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
              compareSeedA === seed.seed ? 'bg-accent/20 text-accent' : 'bg-surface text-gray-500 hover:text-gray-300'
            }`}
            title="Set as compare seed A"
          >
            A
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSetCompareB(seed.seed); }}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
              compareSeedB === seed.seed ? 'bg-purple-500/20 text-purple-300' : 'bg-surface text-gray-500 hover:text-gray-300'
            }`}
            title="Set as compare seed B"
          >
            B
          </button>
        </div>
      </td>
      <td className="py-2.5 px-3 text-gray-200 font-bold">{seed.seed}</td>
      <td className="py-2.5 px-3">
        <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${status.className}`}>
          {status.label}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right text-gray-400">{seed.clip_count}</td>
      <td className="py-2.5 px-3 text-right text-gray-400">{seed.branch_count}</td>
      <td className="py-2.5 px-3 text-right text-gray-400">{seed.evaluated_count}</td>
      <td className={`py-2.5 px-3 text-right font-bold ${scoreColor(seed.best_score)}`}>
        {seed.best_score != null
          ? <>{seed.best_score}<span className="text-gray-600 font-normal">/{GRAND_MAX}</span></>
          : <span className="text-gray-600">—</span>}
      </td>
      <td className="py-2.5 px-3 text-right text-gray-400">{seed.avg_score ?? '—'}</td>
      <td className="py-2.5 px-3 text-right text-gray-400">{seed.selected_count}</td>
      <td className="py-2.5 px-3 text-right text-gray-400">{seed.locked_count}</td>
      <td className="py-2.5 px-3 text-right text-gray-400">{seed.screening_rating_avg ?? '—'}</td>
      <td className="py-2.5 px-3 text-center">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${seed.has_profile ? 'bg-green-400' : 'bg-gray-700'}`}
          title={seed.has_profile ? 'Seed vision profile exists' : 'No seed vision profile yet'}
        />
      </td>
      <td className="py-2.5 px-3">
        <div className="bg-gray-800 rounded h-1.5 w-full min-w-28">
          <div className={`rounded h-1.5 ${progressColor}`} style={{ width: `${progressPct}%` }} />
        </div>
      </td>
      <td className="py-2.5 px-3 text-xs font-mono text-purple-400">
        {seed.character_names.length > 0 ? seed.character_names.join(', ') : '—'}
      </td>
    </tr>
  );
});

export default function SeedsTab({ data, isLoading, isError, onRetry }) {
  const [selectedSeed, setSelectedSeed] = useState(null);
  const detailRef = useRef(null);
  const [compareSeedA, setCompareSeedA] = useState(null);
  const [compareSeedB, setCompareSeedB] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [characterFilter, setCharacterFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [evidenceFilter, setEvidenceFilter] = useState('all');
  const [promotionTargetId, setPromotionTargetId] = useState('');
  const [promotionStatus, setPromotionStatus] = useState('');
  const [promoting, setPromoting] = useState(false);
  const [newCharacterName, setNewCharacterName] = useState('');
  const [newCharacterTrigger, setNewCharacterTrigger] = useState('');
  const [profiling, setProfiling] = useState(false);
  const [profilingStatus, setProfilingStatus] = useState('');
  const [profileRunToken, setProfileRunToken] = useState(0);
  const [compareStatus, setCompareStatus] = useState('');
  const [visionStatusNote, setVisionStatusNote] = useState('');
  const [profileSeedFlags, setProfileSeedFlags] = useState(() => {
    try {
      const raw = localStorage.getItem(PROFILE_FLAGS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [sortConfig, setSortConfig] = useState({ key: 'best_score', direction: 'desc' });
  const rawSeeds = data?.seeds || [];
  const seeds = useMemo(
    () => rawSeeds.map(seed => ({ ...seed, has_profile: !!seed.has_profile || !!profileSeedFlags[String(seed.seed)] })),
    [profileSeedFlags, rawSeeds]
  );
  const summary = data?.summary || null;
  const { data: characters = [] } = useCharacters();
  const {
    data: visionStatus,
    isFetching: visionStatusFetching,
    refetch: refetchVisionStatus
  } = useVisionStatus({ refetchOnMount: 'always' });
  const queryClient = useQueryClient();
  const setProfileFlag = (seedValue) => {
    const key = String(seedValue);
    setProfileSeedFlags(prev => {
      if (prev[key]) return prev;
      const next = { ...prev, [key]: true };
      try {
        localStorage.setItem(PROFILE_FLAGS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (seeds.length === 0) {
      setSelectedSeed(null);
      setCompareSeedA(null);
      setCompareSeedB(null);
      return;
    }
    // Use functional update to read current selectedSeed without adding it to deps —
    // this prevents the effect from re-running on every user click.
    setSelectedSeed(prev => {
      const exists = seeds.some(seed => seed.seed === prev);
      return exists ? prev : seeds[0].seed;
    });
    if (compareSeedA != null && !seeds.some(seed => seed.seed === compareSeedA)) setCompareSeedA(null);
    if (compareSeedB != null && !seeds.some(seed => seed.seed === compareSeedB)) setCompareSeedB(null);
  }, [compareSeedA, compareSeedB, seeds]);

  useEffect(() => {
    const profiledSeeds = seeds.filter(seed => seed.has_profile);
    if (profiledSeeds.length === 0) return;
    for (const seed of profiledSeeds) setProfileFlag(seed.seed);
  }, [seeds]);

  const {
    data: seedDetail,
    isLoading: seedDetailLoading,
    isError: seedDetailError,
    refetch: refetchSeedDetail
  } = useSeedAnalytics(selectedSeed, { enabled: selectedSeed != null && !isLoading && !isError });
  const {
    data: profileJobStatus,
    isError: profileJobError,
    error: profileJobErrorValue,
    refetch: refetchProfileJobStatus
  } = useSeedPersonalityProfileStatus(selectedSeed, {
    enabled: selectedSeed != null && profileRunToken > 0,
    retry: false
  });

  const allCharacters = useMemo(
    () => [...new Set(seeds.flatMap(seed => seed.character_names || []))].sort(),
    [seeds]
  );
  const promotionCandidates = useMemo(() => {
    const suggestedNameSet = new Set((seedDetail?.summary?.character_names || []).map(name => String(name).toLowerCase()));
    const all = [...characters];
    all.sort((left, right) => {
      const leftSuggested = suggestedNameSet.has(String(left.name || '').toLowerCase()) || suggestedNameSet.has(String(left.trigger_word || '').toLowerCase());
      const rightSuggested = suggestedNameSet.has(String(right.name || '').toLowerCase()) || suggestedNameSet.has(String(right.trigger_word || '').toLowerCase());
      if (leftSuggested && !rightSuggested) return -1;
      if (!leftSuggested && rightSuggested) return 1;
      return String(left.name || '').localeCompare(String(right.name || ''));
    });
    return all.map(character => ({
      ...character,
      suggested: suggestedNameSet.has(String(character.name || '').toLowerCase()) || suggestedNameSet.has(String(character.trigger_word || '').toLowerCase())
    }));
  }, [characters, seedDetail?.summary?.character_names]);

  const promotionCandidateIds = useMemo(
    () => promotionCandidates.map(candidate => candidate.id).join(','),
    [promotionCandidates]
  );

  useEffect(() => {
    if (promotionCandidates.length === 0) {
      setPromotionTargetId('__new__');
      return;
    }
    if (promotionTargetId === '__new__') return;
    if (!promotionCandidates.some(candidate => candidate.id === promotionTargetId)) {
      setPromotionTargetId(promotionCandidates[0].id);
    }
  }, [promotionCandidateIds, promotionCandidates, promotionTargetId]);
  const filteredSeeds = useMemo(() => seeds.filter(seed => {
    if (searchTerm.trim()) {
      const search = searchTerm.trim().toLowerCase();
      const seedText = String(seed.seed);
      const chars = (seed.character_names || []).join(' ').toLowerCase();
      if (!seedText.includes(search) && !chars.includes(search)) return false;
    }

    if (characterFilter !== 'all' && !(seed.character_names || []).includes(characterFilter)) {
      return false;
    }

    if (statusFilter !== 'all') {
      const status = statusForSeed(seed).label.toLowerCase();
      if (status !== statusFilter) return false;
    }

    if (evidenceFilter === 'evaluated' && seed.evaluated_count === 0) return false;
    if (evidenceFilter === 'proven' && !((seed.best_score ?? 0) >= SCORE_LOCK_THRESHOLD || seed.locked_count > 0)) return false;
    if (evidenceFilter === 'selected' && seed.selected_count === 0) return false;

    return true;
  }), [characterFilter, evidenceFilter, searchTerm, seeds, statusFilter]);

  const sortedFilteredSeeds = useMemo(() => {
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    const valueFor = (seed, key) => {
      switch (key) {
        case 'status': return statusForSeed(seed).label;
        case 'characters': return (seed.character_names || []).join(', ');
        case 'progress': return seed.best_score ?? -1;
        case 'has_profile': return seed.has_profile ? 1 : 0;
        default: return seed[key];
      }
    };

    return [...filteredSeeds].sort((a, b) => {
      const left = valueFor(a, sortConfig.key);
      const right = valueFor(b, sortConfig.key);
      const leftNull = left == null;
      const rightNull = right == null;
      if (leftNull && rightNull) return 0;
      if (leftNull) return 1;
      if (rightNull) return -1;
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
      return String(left).localeCompare(String(right)) * direction;
    });
  }, [filteredSeeds, sortConfig.direction, sortConfig.key]);

  const toggleSort = (key) => {
    setSortConfig(prev => (
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'seed' ? 'asc' : 'desc' }
    ));
  };

  const sortIndicator = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const { comparedSeedA, comparedSeedB } = useMemo(() => ({
    comparedSeedA: seeds.find(seed => seed.seed === compareSeedA) || null,
    comparedSeedB: seeds.find(seed => seed.seed === compareSeedB) || null
  }), [compareSeedA, compareSeedB, seeds]);
  const canCompare = !!comparedSeedA && !!comparedSeedB && comparedSeedA.seed !== comparedSeedB.seed;
  const profileScopeLine = useMemo(() => {
    if (!seedDetail || selectedSeed == null) return null;
    const sampleCount = seedDetail.personality_profile?.sample_count ?? null;
    const clipNames = (seedDetail.clips || []).map(clip => clip.clip_name).filter(Boolean);
    const characters = seedDetail.summary?.character_names || [];

    const clipEvidence = clipNames.length === 1
      ? clipNames[0]
      : `${clipNames.length} clips`;
    const characterEvidence = characters.length === 0
      ? null
      : characters.length === 1
        ? characters[0]
        : `${characters.slice(0, 2).join(', ')}${characters.length > 2 ? ` +${characters.length - 2} more` : ''}`;

    return `Scope: Seed ${selectedSeed} • Evidence: ${clipEvidence}${sampleCount != null ? ` (${sampleCount} samples)` : ''}${characterEvidence ? ` • Characters: ${characterEvidence}` : ''}`;
  }, [seedDetail, selectedSeed]);

  const handleSelectSeed = useCallback((seedValue) => {
    setSelectedSeed(seedValue);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }, []);

  const handleSetCompareA = useCallback((seedValue) => {
    setCompareStatus('');
    if (compareSeedA === seedValue) {
      setCompareSeedA(null);
      return;
    }
    if (compareSeedB === seedValue) {
      setCompareStatus('A/B must be different seeds. Clear B first or pick another seed.');
      return;
    }
    setCompareSeedA(seedValue);
  }, [compareSeedA, compareSeedB]);

  const handleSetCompareB = useCallback((seedValue) => {
    setCompareStatus('');
    if (compareSeedB === seedValue) {
      setCompareSeedB(null);
      return;
    }
    if (compareSeedA === seedValue) {
      setCompareStatus('A/B must be different seeds. Clear A first or pick another seed.');
      return;
    }
    setCompareSeedB(seedValue);
  }, [compareSeedA, compareSeedB]);

  function deltaText(a, b) {
    if (a == null || b == null) return '—';
    const delta = b - a;
    if (delta > 0) return `+${delta.toFixed(1)}`;
    return delta.toFixed(1);
  }

  const handlePromoteSeed = async () => {
    if (!promotionTargetId || selectedSeed == null) return;
    setPromoting(true);
    setPromotionStatus('');
    try {
      let targetCharacterId = promotionTargetId;
      let createdCharacter = null;

      if (promotionTargetId === '__new__') {
        const name = newCharacterName.trim();
        const trigger = newCharacterTrigger.trim();
        if (!name || !trigger) {
          setPromotionStatus('Promotion failed: New character name and trigger word are required.');
          setPromoting(false);
          return;
        }
        createdCharacter = await api.createCharacter({
          name,
          trigger_word: trigger,
          lora_files: [],
          lora_dir: '',
          locked_identity_block: '',
          locked_negative_block: '',
          proven_settings: {},
          notes: ''
        });
        targetCharacterId = createdCharacter.id;
      }

      const result = await api.promoteCharacterSeed(targetCharacterId, { seed: selectedSeed });
      await queryClient.invalidateQueries({ queryKey: ['characters'] });
      setPromotionStatus(`Promoted seed ${selectedSeed} for ${result.character?.name || 'character'}.`);
      if (createdCharacter) {
        setNewCharacterName('');
        setNewCharacterTrigger('');
      }
    } catch (err) {
      setPromotionStatus(`Promotion failed: ${err.message}`);
    } finally {
      setPromoting(false);
    }
  };

  const handleGenerateProfile = async (force = false) => {
    if (selectedSeed == null) return;
    setProfiling(true);
    setProfilingStatus('');
    setVisionStatusNote('');
    try {
      const result = await api.startSeedPersonalityProfile(selectedSeed, { force, max_samples: 6 });
      if (result.cached) {
        setProfileFlag(selectedSeed);
        queryClient.setQueryData(['analytics', 'seeds'], prev => {
          if (!prev?.seeds) return prev;
          return {
            ...prev,
            seeds: prev.seeds.map(seed => (
              Number(seed.seed) === Number(selectedSeed)
                ? { ...seed, has_profile: true }
                : seed
            ))
          };
        });
        await queryClient.invalidateQueries({ queryKey: ['analytics', 'seeds'] });
        await queryClient.invalidateQueries({ queryKey: ['analytics', 'seed', selectedSeed] });
        setProfiling(false);
        const sampleCount = result.profile?.sample_count ?? 0;
        setProfilingStatus(`Loaded cached profile (${sampleCount} samples).`);
      } else {
        setProfileRunToken(Date.now());
        setProfilingStatus('Profiling queued. Running Vision analysis in background...');
        await refetchProfileJobStatus();
      }
    } catch (err) {
      setProfiling(false);
      setProfilingStatus(`Profile failed: ${err.message}`);
    }
  };

  const handleRecheckVision = async () => {
    setVisionStatusNote('');
    const result = await refetchVisionStatus();
    const status = result.data;
    if (!status) {
      setVisionStatusNote('Vision status check failed.');
      return;
    }
    if (status.available) {
      setVisionStatusNote('Vision API is available.');
    } else {
      setVisionStatusNote(`Vision still unavailable: ${status.reason || 'configure ANTHROPIC_API_KEY'}.`);
    }
  };

  useEffect(() => {
    if (!profiling || !profileJobStatus) return;
    if (profileJobStatus.status === 'running' || profileJobStatus.status === 'queued') return;

    if (profileJobStatus.status === 'completed') {
      setProfileFlag(selectedSeed);
      queryClient.setQueryData(['analytics', 'seeds'], prev => {
        if (!prev?.seeds) return prev;
        return {
          ...prev,
          seeds: prev.seeds.map(seed => (
            Number(seed.seed) === Number(selectedSeed)
              ? { ...seed, has_profile: true }
              : seed
          ))
        };
      });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'seeds'] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'seed', selectedSeed] });
      setProfilingStatus('Profile generated and synced.');
    } else if (profileJobStatus.status === 'failed') {
      setProfilingStatus(`Profile failed: ${profileJobStatus.job?.error || 'unknown error'}`);
    }
    setProfiling(false);
  }, [profileJobStatus, profiling, queryClient, selectedSeed]);

  useEffect(() => {
    if (!seedDetail?.personality_profile || selectedSeed == null) return;
    setProfileFlag(selectedSeed);
  }, [seedDetail?.personality_profile, selectedSeed]);

  useEffect(() => {
    if (!profiling || !profileJobError) return;
    setProfiling(false);
    setProfilingStatus(`Profile job status unavailable. ${profileJobErrorValue?.message || 'The backend may have restarted; re-run profile.'}`);
  }, [profileJobError, profileJobErrorValue, profiling]);

  useEffect(() => {
    if (!profiling) return undefined;
    const timeout = setTimeout(() => {
      setProfiling(false);
      setProfilingStatus('Profile timed out waiting for job status. Re-run profile to continue.');
    }, 3 * 60_000);
    return () => clearTimeout(timeout);
  }, [profiling, profileRunToken]);

  useEffect(() => {
    setPromotionStatus('');
    setProfilingStatus('');
    setCompareStatus('');
    setVisionStatusNote('');
    setNewCharacterName('');
    setNewCharacterTrigger('');
    setProfiling(false);
    setProfileRunToken(0);
  }, [selectedSeed]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-gray-500 font-mono text-sm">Loading seed intelligence...</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-red-400 font-mono text-sm mb-2">Failed to load seed analytics</p>
          <button onClick={onRetry} className="px-3 py-1 text-xs font-mono bg-surface-overlay text-gray-400 rounded hover:text-gray-200">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (seeds.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-gray-600 font-mono text-sm">No seeds found yet — generate or launch some seed branches first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3 flex-wrap">
        <SummaryCard label="Seeds" value={summary?.seed_count ?? 0} />
        <SummaryCard label="Evaluated" value={summary?.evaluated_seed_count ?? 0} />
        <SummaryCard label="Proven" value={summary?.proven_seed_count ?? 0} color="text-green-400" />
        <SummaryCard label="Selected" value={summary?.selected_seed_count ?? 0} color="text-accent" />
      </div>

      <div className="space-y-2">
        <div className="text-xs font-mono text-gray-500 uppercase tracking-wider">
          Seed performance across clips, branches, and screenings
        </div>
        <p className="text-xs font-mono text-gray-600">
          This is observational seed evidence: where each seed has been used, how often it has been evaluated, and the best score it has achieved so far.
        </p>
      </div>

      <div className="border border-gray-700 rounded-lg p-3 bg-surface-raised">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-2">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search seed or character"
            className="bg-surface border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-300 placeholder:text-gray-600"
          />
          <select
            value={characterFilter}
            onChange={(e) => setCharacterFilter(e.target.value)}
            className="bg-surface border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-300"
          >
            <option value="all">All characters</option>
            {allCharacters.map(char => (
              <option key={char} value={char}>{char}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-300"
          >
            <option value="all">All statuses</option>
            <option value="proven">Proven</option>
            <option value="promising">Promising</option>
            <option value="mixed">Mixed</option>
            <option value="early">Early</option>
            <option value="untested">Untested</option>
            <option value="abandoned">Abandoned</option>
          </select>
          <select
            value={evidenceFilter}
            onChange={(e) => setEvidenceFilter(e.target.value)}
            className="bg-surface border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-300"
          >
            <option value="all">All evidence levels</option>
            <option value="evaluated">Evaluated only</option>
            <option value="proven">Proven only</option>
            <option value="selected">Selected in screening</option>
          </select>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="text-xs font-mono text-gray-600">
            Showing {filteredSeeds.length} of {seeds.length} seeds
          </div>
          <button
            onClick={() => {
              setSearchTerm('');
              setCharacterFilter('all');
              setStatusFilter('all');
              setEvidenceFilter('all');
            }}
            className="text-xs font-mono text-gray-500 hover:text-gray-300"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="border border-gray-700 rounded-lg p-3 bg-surface-raised">
        <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">Seed Compare</div>
        {!canCompare ? (
          <p className="text-xs font-mono text-gray-600">Set two seeds with A/B controls in the table to compare side-by-side.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs font-mono">
              <div className="border border-gray-800 rounded px-2 py-1.5">
                <div className="text-gray-500">Best score Δ (B-A)</div>
                <div className={`${(comparedSeedB.best_score ?? 0) >= (comparedSeedA.best_score ?? 0) ? 'text-green-400' : 'text-red-400'} font-bold`}>
                  {deltaText(comparedSeedA.best_score, comparedSeedB.best_score)}
                </div>
              </div>
              <div className="border border-gray-800 rounded px-2 py-1.5">
                <div className="text-gray-500">Avg score Δ (B-A)</div>
                <div className={`${(comparedSeedB.avg_score ?? 0) >= (comparedSeedA.avg_score ?? 0) ? 'text-green-400' : 'text-red-400'} font-bold`}>
                  {deltaText(comparedSeedA.avg_score, comparedSeedB.avg_score)}
                </div>
              </div>
              <div className="border border-gray-800 rounded px-2 py-1.5">
                <div className="text-gray-500">Evaluated Δ (B-A)</div>
                <div className={`${comparedSeedB.evaluated_count >= comparedSeedA.evaluated_count ? 'text-green-400' : 'text-red-400'} font-bold`}>
                  {comparedSeedB.evaluated_count - comparedSeedA.evaluated_count}
                </div>
              </div>
              <div className="border border-gray-800 rounded px-2 py-1.5">
                <div className="text-gray-500">Locked Δ (B-A)</div>
                <div className={`${comparedSeedB.locked_count >= comparedSeedA.locked_count ? 'text-green-400' : 'text-red-400'} font-bold`}>
                  {comparedSeedB.locked_count - comparedSeedA.locked_count}
                </div>
              </div>
            </div>
            <p className="text-xs font-mono text-gray-500">
              A: <span className="text-accent">{comparedSeedA.seed}</span> vs B: <span className="text-purple-300">{comparedSeedB.seed}</span>
            </p>
          </div>
        )}
        {compareStatus && (
          <p className="mt-2 text-xs font-mono text-amber-400">{compareStatus}</p>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="border-b border-gray-700 text-gray-500 text-xs uppercase tracking-wider">
              <th className="text-left py-2 px-3">Compare</th>
              <th className="text-left py-2 px-3">
                <button onClick={() => toggleSort('seed')} className="hover:text-gray-300">Seed{sortIndicator('seed')}</button>
              </th>
              <th className="text-left py-2 px-3">
                <button onClick={() => toggleSort('status')} className="hover:text-gray-300">Status{sortIndicator('status')}</button>
              </th>
              <th className="text-right py-2 px-3">
                <button onClick={() => toggleSort('clip_count')} className="hover:text-gray-300">Clips{sortIndicator('clip_count')}</button>
              </th>
              <th className="text-right py-2 px-3">
                <button onClick={() => toggleSort('branch_count')} className="hover:text-gray-300">Branches{sortIndicator('branch_count')}</button>
              </th>
              <th className="text-right py-2 px-3">
                <button onClick={() => toggleSort('evaluated_count')} className="hover:text-gray-300">Evaluated{sortIndicator('evaluated_count')}</button>
              </th>
              <th className="text-right py-2 px-3">
                <button onClick={() => toggleSort('best_score')} className="hover:text-gray-300">Best{sortIndicator('best_score')}</button>
              </th>
              <th className="text-right py-2 px-3">
                <button onClick={() => toggleSort('avg_score')} className="hover:text-gray-300">Avg{sortIndicator('avg_score')}</button>
              </th>
              <th className="text-right py-2 px-3">
                <button onClick={() => toggleSort('selected_count')} className="hover:text-gray-300">Selected{sortIndicator('selected_count')}</button>
              </th>
              <th className="text-right py-2 px-3">
                <button onClick={() => toggleSort('locked_count')} className="hover:text-gray-300">Locked{sortIndicator('locked_count')}</button>
              </th>
              <th className="text-right py-2 px-3">
                <button onClick={() => toggleSort('screening_rating_avg')} className="hover:text-gray-300">Screening ★{sortIndicator('screening_rating_avg')}</button>
              </th>
              <th className="text-center py-2 px-3">
                <button onClick={() => toggleSort('has_profile')} className="hover:text-gray-300">Profile{sortIndicator('has_profile')}</button>
              </th>
              <th className="text-left py-2 px-3 min-w-32">
                <button onClick={() => toggleSort('progress')} className="hover:text-gray-300">Progress{sortIndicator('progress')}</button>
              </th>
              <th className="text-left py-2 px-3">
                <button onClick={() => toggleSort('characters')} className="hover:text-gray-300">Characters{sortIndicator('characters')}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedFilteredSeeds.map(seed => (
              <SeedRow
                key={seed.seed}
                seed={seed}
                isSelected={seed.seed === selectedSeed}
                onSelect={handleSelectSeed}
                compareSeedA={compareSeedA}
                compareSeedB={compareSeedB}
                onSetCompareA={handleSetCompareA}
                onSetCompareB={handleSetCompareB}
              />
            ))}
          </tbody>
        </table>
        {sortedFilteredSeeds.length === 0 && (
          <div className="py-6 text-center text-sm font-mono text-gray-600">
            No seeds match the current filters.
          </div>
        )}
      </div>

      <div ref={detailRef} className="border border-gray-700 rounded-lg p-4 bg-surface-raised">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-mono text-gray-500 uppercase tracking-wider">
            Seed Detail {selectedSeed != null ? `- ${selectedSeed}` : ''}
          </div>
          <button
            onClick={() => refetchSeedDetail()}
            className="text-xs font-mono text-gray-600 hover:text-gray-400 transition-colors"
          >
            Refresh Detail
          </button>
        </div>

        {seedDetailLoading && (
          <p className="text-sm font-mono text-gray-500">Loading seed detail...</p>
        )}

        {seedDetailError && (
          <div className="text-sm font-mono text-red-400">
            Failed to load seed detail.
          </div>
        )}

        {!seedDetailLoading && !seedDetailError && seedDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="border border-gray-700 rounded p-2 font-mono">
                <div className="text-xs text-gray-500">Best</div>
                <div className={`text-sm font-bold ${scoreColor(seedDetail.summary.best_score)}`}>
                  {seedDetail.summary.best_score ?? '—'}
                  {seedDetail.summary.best_score != null && <span className="text-gray-600 font-normal">/{GRAND_MAX}</span>}
                </div>
              </div>
              <div className="border border-gray-700 rounded p-2 font-mono">
                <div className="text-xs text-gray-500">Avg</div>
                <div className="text-sm font-bold text-gray-300">{seedDetail.summary.avg_score ?? '—'}</div>
              </div>
              <div className="border border-gray-700 rounded p-2 font-mono">
                <div className="text-xs text-gray-500">Evaluated</div>
                <div className="text-sm font-bold text-gray-300">{seedDetail.summary.evaluated_count}</div>
              </div>
              <div className="border border-gray-700 rounded p-2 font-mono">
                <div className="text-xs text-gray-500">Characters</div>
                <div className="text-sm font-bold text-purple-400 truncate" title={(seedDetail.summary.character_names || []).join(', ')}>
                  {(seedDetail.summary.character_names || []).join(', ') || '—'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="border border-gray-700 rounded p-2 font-mono">
                <div className="text-xs text-gray-500">Identity Avg</div>
                <div className="text-sm font-bold text-gray-300">{seedDetail.summary.dimension_averages?.identity ?? '—'}</div>
              </div>
              <div className="border border-gray-700 rounded p-2 font-mono">
                <div className="text-xs text-gray-500">Location Avg</div>
                <div className="text-sm font-bold text-gray-300">{seedDetail.summary.dimension_averages?.location ?? '—'}</div>
              </div>
              <div className="border border-gray-700 rounded p-2 font-mono">
                <div className="text-xs text-gray-500">Motion Avg</div>
                <div className="text-sm font-bold text-gray-300">{seedDetail.summary.dimension_averages?.motion ?? '—'}</div>
              </div>
            </div>

            <div className="border border-gray-700 rounded p-3 bg-surface">
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-1">
                Recommendation
              </div>
              <p className="text-sm font-mono text-gray-300">{seedDetail.insights?.recommendation || 'No recommendation yet.'}</p>
            </div>

            <div className="border border-gray-700 rounded p-3 bg-surface">
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
                Promote Seed To Character
              </div>
              <p className="text-xs font-mono text-gray-600 mb-2">
                Use this only when a seed is proven for the character identity baseline and should carry forward as a character-level default.
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={promotionTargetId}
                    onChange={(e) => setPromotionTargetId(e.target.value)}
                    className="bg-surface-overlay border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-300"
                  >
                    <option value="__new__">Create New Character</option>
                    {promotionCandidates.map(candidate => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.suggested ? 'Suggested - ' : ''}{candidate.name} ({candidate.trigger_word})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handlePromoteSeed}
                    disabled={!promotionTargetId || promoting || (promotionTargetId === '__new__' && (!newCharacterName.trim() || !newCharacterTrigger.trim()))}
                    className="px-3 py-1.5 text-xs font-mono font-bold rounded bg-accent text-black hover:bg-accent/90 disabled:opacity-50"
                  >
                    {promoting ? 'Promoting...' : promotionTargetId === '__new__' ? 'Create + Promote' : 'Promote'}
                  </button>
                </div>
                {promotionTargetId === '__new__' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <input
                      value={newCharacterName}
                      onChange={(e) => setNewCharacterName(e.target.value)}
                      placeholder="New character name"
                      className="bg-surface-overlay border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-300 placeholder:text-gray-600"
                    />
                    <input
                      value={newCharacterTrigger}
                      onChange={(e) => setNewCharacterTrigger(e.target.value)}
                      placeholder="Trigger word (e.g. mckdhn)"
                      className="bg-surface-overlay border border-gray-700 rounded px-2 py-1.5 text-xs font-mono text-gray-300 placeholder:text-gray-600"
                    />
                  </div>
                )}
              </div>
              {promotionStatus && (
                <p className={`mt-2 text-xs font-mono ${promotionStatus.startsWith('Promotion failed') ? 'text-red-400' : 'text-green-400'}`}>
                  {promotionStatus}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="border border-gray-700 rounded p-3 bg-surface">
                <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
                  Trait Signals
                </div>
                {(seedDetail.insights?.trait_signals || []).length === 0 ? (
                  <p className="text-sm font-mono text-gray-600">No consistent trait signals detected yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {seedDetail.insights.trait_signals.map(signal => (
                      <div key={signal.key} className="flex items-center justify-between text-xs font-mono border border-gray-800 rounded px-2 py-1.5">
                        <span className="text-gray-300">{signal.label}</span>
                        <span className="text-gray-500">{signal.count}/{seedDetail.summary.evaluated_count}</span>
                        <span className="text-amber-400">{signal.prevalence}%</span>
                        <span className={`${
                          signal.confidence === 'high' ? 'text-green-400' :
                          signal.confidence === 'medium' ? 'text-accent' : 'text-gray-500'
                        }`}>
                          {signal.confidence}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-gray-700 rounded p-3 bg-surface">
                <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
                  Stability
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex items-center justify-between border border-gray-800 rounded px-2 py-1.5">
                    <span className="text-gray-400">Grand score stddev</span>
                    <span className="text-gray-300">{seedDetail.insights?.stability?.grand_stddev ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between border border-gray-800 rounded px-2 py-1.5">
                    <span className="text-gray-400">Identity stddev</span>
                    <span className="text-gray-300">{seedDetail.insights?.stability?.identity_stddev ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between border border-gray-800 rounded px-2 py-1.5">
                    <span className="text-gray-400">Location stddev</span>
                    <span className="text-gray-300">{seedDetail.insights?.stability?.location_stddev ?? '—'}</span>
                  </div>
                  <div className="flex items-center justify-between border border-gray-800 rounded px-2 py-1.5">
                    <span className="text-gray-400">Motion stddev</span>
                    <span className="text-gray-300">{seedDetail.insights?.stability?.motion_stddev ?? '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-gray-700 rounded p-3 bg-surface space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                    Seed Vision Personality Profile
                  </div>
                  <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleGenerateProfile(false)}
                    disabled={profiling || !visionStatus?.available}
                    className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-accent text-black hover:bg-accent/90 disabled:opacity-50"
                  >
                    {profiling ? 'Profiling...' : 'Run Profile'}
                  </button>
                  <button
                    onClick={() => handleGenerateProfile(true)}
                    disabled={profiling || !visionStatus?.available}
                    className="px-2.5 py-1 rounded text-xs font-mono border border-gray-600 text-gray-300 hover:border-gray-400 disabled:opacity-50"
                  >
                    Re-run
                  </button>
                </div>
                </div>
              <p className="text-xs font-mono text-gray-600">
                This profile reflects how this seed behaved in the observed context, not a universal seed truth across all future clips/characters.
              </p>
              {profileScopeLine && (
                <p className="text-xs font-mono text-gray-500">{profileScopeLine}</p>
              )}
              {!visionStatus?.available && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-mono text-amber-400">
                    Vision API unavailable: {visionStatus?.reason || 'configure ANTHROPIC_API_KEY'}.
                  </p>
                  <button
                    onClick={handleRecheckVision}
                    disabled={visionStatusFetching}
                    className="px-2 py-1 rounded text-xs font-mono border border-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-60"
                  >
                    {visionStatusFetching ? 'Rechecking...' : 'Recheck'}
                  </button>
                </div>
              )}
              {visionStatusNote && (
                <p className={`text-xs font-mono ${visionStatusNote.includes('available') ? 'text-green-400' : 'text-amber-400'}`}>
                  {visionStatusNote}
                </p>
              )}
              {profilingStatus && (
                <p className={`text-xs font-mono ${profilingStatus.startsWith('Profile failed') ? 'text-red-400' : 'text-green-400'}`}>
                  {profilingStatus}
                </p>
              )}
              {!seedDetail.personality_profile ? (
                <p className="text-xs font-mono text-gray-600">
                  No vision personality profile yet. Run profile to analyze extracted frames across this seed’s iterations/screens.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 text-xs font-mono">
                    <div className="border border-gray-800 rounded px-2 py-1.5">
                      <div className="text-gray-500">Samples</div>
                      <div className="text-gray-300 font-bold">{seedDetail.personality_profile.sample_count}</div>
                    </div>
                    <div className="border border-gray-800 rounded px-2 py-1.5">
                      <div className="text-gray-500">Avg score</div>
                      <div className="text-gray-300 font-bold">{seedDetail.personality_profile.avg_grand_score ?? '—'}</div>
                    </div>
                    <div className="border border-gray-800 rounded px-2 py-1.5">
                      <div className="text-gray-500">Score stddev</div>
                      <div className="text-gray-300 font-bold">{seedDetail.personality_profile.grand_score_stddev ?? '—'}</div>
                    </div>
                    <div className="border border-gray-800 rounded px-2 py-1.5">
                      <div className="text-gray-500">Frame consistency</div>
                      <div className="text-gray-300 font-bold">{seedDetail.personality_profile.avg_frame_consistency ?? '—'}</div>
                    </div>
                    <div className="border border-gray-800 rounded px-2 py-1.5">
                      <div className="text-gray-500">Cache hits</div>
                      <div className="text-gray-300 font-bold">{seedDetail.personality_profile.cache_hits ?? 0}</div>
                    </div>
                  </div>
                  {(seedDetail.personality_profile.trait_signals || []).length > 0 && (
                    <div className="space-y-1">
                   {(seedDetail.personality_profile.trait_signals || []).map(signal => (
                      <div key={signal.key} className="flex items-center justify-between text-xs font-mono border border-gray-800 rounded px-2 py-1.5">
                        <span className="text-gray-300">{signal.label}</span>
                        <span className="text-amber-400">
                          {signal.prevalence}%
                          {seedDetail.personality_profile.sample_count < 5 ? ' (early)' : ''}
                        </span>
                        <span className="text-gray-500">{signal.count}/{seedDetail.personality_profile.sample_count}</span>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
                Branches
              </div>
              {seedDetail.branches.length === 0 ? (
                <p className="text-sm font-mono text-gray-600">No branches yet for this seed.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse font-mono text-xs">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-500 uppercase tracking-wider">
                        <th className="text-left py-1.5 pr-3">Clip</th>
                        <th className="text-left py-1.5 pr-3">Branch</th>
                        <th className="text-left py-1.5 pr-3">Status</th>
                        <th className="text-right py-1.5 pr-3">Iters</th>
                        <th className="text-right py-1.5 pr-3">Best</th>
                        <th className="text-right py-1.5 pr-3">Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seedDetail.branches.map(branch => (
                        <tr key={branch.branch_id} className="border-b border-gray-800">
                          <td className="py-1.5 pr-3 text-gray-300">{branch.clip_name}</td>
                          <td className="py-1.5 pr-3 text-gray-300">{branch.branch_name}</td>
                          <td className="py-1.5 pr-3 text-gray-500">{branch.status}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-400">{branch.iteration_count}</td>
                          <td className={`py-1.5 pr-3 text-right font-bold ${scoreColor(branch.best_score)}`}>{branch.best_score ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-right text-gray-400">{branch.avg_score ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
                Score Progression
              </div>
              {seedDetail.score_progression.length === 0 ? (
                <p className="text-sm font-mono text-gray-600">No progression data yet.</p>
              ) : (
                <div className="space-y-2">
                  {seedDetail.score_progression.map(line => {
                    const scored = line.points.filter(point => point.score != null);
                    const best = scored.length > 0 ? Math.max(...scored.map(point => point.score)) : null;
                    const last = scored.length > 0 ? scored[scored.length - 1].score : null;
                    return (
                      <div key={line.branch_id} className="flex items-center gap-3 border border-gray-800 rounded px-2 py-1.5">
                        <div className="w-44 shrink-0">
                          <div className="text-xs font-mono text-gray-300 truncate">{line.branch_name}</div>
                          <div className="text-[10px] font-mono text-gray-600 truncate">{line.clip_name}</div>
                        </div>
                        <Sparkline points={line.points} />
                        <div className="ml-auto flex items-center gap-3 text-xs font-mono">
                          <span className="text-gray-500">Best</span>
                          <span className={`font-bold ${scoreColor(best)}`}>{best ?? '—'}</span>
                          <span className="text-gray-500">Last</span>
                          <span className={`font-bold ${scoreColor(last)}`}>{last ?? '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
                Rope Effectiveness
              </div>
              {seedDetail.rope_effectiveness.length === 0 ? (
                <p className="text-sm font-mono text-gray-600">Not enough evaluated consecutive iterations yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {seedDetail.rope_effectiveness.map(rope => (
                    <div key={rope.rope} className="flex items-center justify-between font-mono text-xs border border-gray-800 rounded px-2 py-1.5">
                      <span className="text-gray-300">{rope.label}</span>
                      <span className={`${rope.avg_delta >= 0 ? 'text-green-400' : 'text-red-400'} font-bold`}>
                        {rope.avg_delta > 0 ? `+${rope.avg_delta}` : rope.avg_delta}
                      </span>
                      <span className="text-gray-500">{rope.count} uses</span>
                      <span className="text-gray-400">{rope.success_rate}% success</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
