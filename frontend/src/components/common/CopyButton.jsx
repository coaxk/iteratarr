import { useState } from 'react';

/**
 * CopyButton — reusable clipboard copy button with confirmation feedback.
 *
 * Props:
 *   text       — string to copy to clipboard
 *   label      — button label (default: "Copy")
 *   copiedLabel — label shown after copy (default: "Copied")
 *   title      — tooltip text (optional)
 *   className  — additional classes (optional, has sensible defaults)
 *   compact    — if true, uses minimal padding (for inline use)
 *   onClick    — optional extra handler called after copy
 */
export default function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied', title, className, compact, onClick }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      if (onClick) onClick();
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  };

  const defaultClass = compact
    ? 'px-1 py-0.5 rounded text-xs font-mono'
    : 'px-1.5 py-0.5 rounded text-xs font-mono';

  return (
    <button
      onClick={handleCopy}
      title={title}
      className={className || `${defaultClass} ${
        copied
          ? 'bg-score-high/20 text-score-high'
          : 'bg-surface-overlay text-gray-500 hover:text-gray-300'
      } transition-colors`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
