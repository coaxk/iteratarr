import { useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import CharacterCard from './CharacterCard';
import CreateCharacterModal from '../forms/CreateCharacterModal';

export default function CharacterRegistry() {
  const { data: characters, loading, error, refetch } = useApi(() => api.listCharacters(), []);
  const [showCreate, setShowCreate] = useState(false);

  if (loading) return <p className="text-gray-500 font-mono text-sm">Loading characters...</p>;
  if (error) return <p className="text-red-400 font-mono text-sm">Error: {error}</p>;

  const list = characters || [];

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
            <CharacterCard key={character.id} character={character} />
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
