import { useState, useRef, useEffect } from 'react';

const SUGGESTED_TAGS = ['breakthrough', 'dead end', 'baseline', 'test', 'rollback', 'locked'];

export default function TagInput({ tags = [], onChange, readOnly = false }) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handle = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const addTag = (tag) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput('');
    setShowSuggestions(false);
  };

  const removeTag = (tag) => {
    onChange(tags.filter(t => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      // Remove last tag on backspace when input is empty
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  // Filter suggestions: show when input is empty (and focused) or matching typed text
  const filteredSuggestions = SUGGESTED_TAGS.filter(
    s => !tags.includes(s) && (input === '' || s.includes(input.toLowerCase()))
  );

  if (readOnly) {
    if (!tags.length) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <span key={tag} className="bg-accent/20 text-accent text-xs font-mono px-2 py-0.5 rounded-full">
            {tag}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
        {tags.map(tag => (
          <span key={tag} className="bg-accent/20 text-accent text-xs font-mono px-2 py-0.5 rounded-full flex items-center gap-0.5">
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="ml-1 text-accent/50 hover:text-accent leading-none"
              aria-label={`Remove tag ${tag}`}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? 'Add tags...' : ''}
          className="bg-transparent border-none text-xs font-mono text-gray-300 outline-none placeholder:text-gray-600 min-w-[80px] flex-1"
        />
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 bg-surface-overlay border border-gray-600 rounded text-xs font-mono shadow-lg max-h-40 overflow-y-auto">
          {filteredSuggestions.map(suggestion => (
            <button
              key={suggestion}
              onClick={() => addTag(suggestion)}
              className="block w-full text-left px-3 py-1.5 text-gray-300 hover:bg-accent/10 hover:text-accent transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
