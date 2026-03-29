import { useState } from 'react';
import { useCharacters, useClips, useSeedsAnalytics } from '../../hooks/useQueries';
import CharacterCard from './CharacterCard';
import CreateCharacterModal from '../forms/CreateCharacterModal';

export default function CharacterRegistry({ onNavigateToClip }) {
  const { data: characters, isLoading: loading, error: queryError, refetch } = useCharacters();
  const { data: clips } = useClips();
  const { data: seedAnalytics } = useSeedsAnalytics();
  const error = queryError?.message || null;
  const [showCreate, setShowCreate] = useState(false);

  if (loading) return <p className="text-gray-500 font-mono text-sm">Loading characters...</p>;
  if (error) return <p className="text-red-400 font-mono text-sm">Error: {error}</p>;

  const list = characters || [];

  // Count clips per character
  const clipCounts = {};
  for (const clip of (clips || [])) {
    for (const char of (clip.characters || [])) {
      clipCounts[char] = (clipCounts[char] || 0) + 1;
    }
  }

  // Build per-character seed stats from analytics data.
  // We match by character name first and also allow trigger-word fallback.
  const seedsByCharacterKey = {};
  for (const seed of (seedAnalytics?.seeds || [])) {
    for (const charName of (seed.character_names || [])) {
      const key = String(charName).toLowerCase();
      if (!seedsByCharacterKey[key]) seedsByCharacterKey[key] = [];
      seedsByCharacterKey[key].push(seed);
    }
  }

  function getCharacterSeedStats(character) {
    const keys = [character.name, character.trigger_word]
      .filter(Boolean)
      .map(value => String(value).toLowerCase());

    const merged = [];
    const seen = new Set();
    for (const key of keys) {
      for (const seed of (seedsByCharacterKey[key] || [])) {
        if (seen.has(seed.seed)) continue;
        seen.add(seed.seed);
        merged.push(seed);
      }
    }

    merged.sort((a, b) => {
      if (a.best_score == null && b.best_score == null) return b.evaluated_count - a.evaluated_count;
      if (a.best_score == null) return 1;
      if (b.best_score == null) return -1;
      return b.best_score - a.best_score;
    });

    const provenCount = merged.filter(seed => (seed.best_score ?? 0) >= 65 || seed.locked_count > 0).length;
    return {
      count: merged.length,
      provenCount,
      items: merged.slice(0, 6)
    };
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-sm font-mono font-bold text-gray-200 uppercase tracking-wider">Character Registry</h2>
        <span className="text-xs font-mono text-gray-500">{list.length}</span>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto text-xs font-mono text-accent hover:text-accent/80 border border-accent/30 rounded px-3 py-1"
        >
          + New Character
        </button>
      </div>
      <p className="text-xs font-mono text-gray-600 mb-4">LoRA-trained characters for your production. Register each character with their trigger word and LoRA files.</p>
      {list.length === 0 ? (
        <div className="border border-dashed border-gray-700 rounded-lg p-8 text-center">
          <p className="text-sm font-mono text-gray-400 mb-2">No characters registered</p>
          <p className="text-xs font-mono text-gray-600 mb-4">Add your first character to track their LoRA files, trigger words, and proven generation settings.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-accent text-black text-sm font-mono font-bold rounded hover:bg-accent/90"
          >
            + Register First Character
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(character => (
            <CharacterCard
              key={character.id}
              character={character}
              clipCount={clipCounts[character.name] || 0}
              seedStats={getCharacterSeedStats(character)}
              onUpdated={refetch}
              onDeleted={refetch}
              onNavigateToClip={onNavigateToClip}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateCharacterModal
          onCreated={() => {
            setShowCreate(false);
            refetch();
          }}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
