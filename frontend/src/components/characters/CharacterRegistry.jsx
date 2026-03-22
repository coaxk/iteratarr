import { useApi } from '../../hooks/useApi';
import { api } from '../../api';
import CharacterCard from './CharacterCard';

export default function CharacterRegistry() {
  const { data: characters, loading, error } = useApi(() => api.listCharacters(), []);

  if (loading) return <p className="text-gray-500 font-mono text-sm">Loading characters...</p>;
  if (error) return <p className="text-red-400 font-mono text-sm">Error: {error}</p>;

  const list = characters || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-sm font-mono font-bold text-gray-200 uppercase tracking-wider">Character Registry</h2>
        <span className="text-xs font-mono text-gray-500">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-gray-600 text-xs font-mono">No characters registered</p>
      ) : (
        <div className="space-y-2">
          {list.map(character => (
            <CharacterCard key={character.id} character={character} />
          ))}
        </div>
      )}
    </div>
  );
}
