import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Plus } from 'lucide-react';

/**
 * Searchable dropdown with optional "add new" action.
 * options: [{ id, label, sublabel? }]
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  onAddNew,
  addNewLabel = '+ Add new',
  placeholder = 'Search…',
  disabled = false,
  required = false,
  error = false,
  fallbackLabel = '',
  fallbackSublabel = '',
  widePanel = false,
  id,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  const selected = options.find(o => String(o.id) === String(value));
  const displayLabel = selected?.label || fallbackLabel || '';
  const displaySublabel = selected?.sublabel || fallbackSublabel || '';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = query.trim()
    ? options.filter(o =>
        (o.label || '').toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel || '').toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const pick = (optId) => {
    onChange(optId);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className={`searchable-select ${disabled ? 'searchable-select-disabled' : ''} ${error ? 'searchable-select-error' : ''}`} ref={wrapRef} id={id}>
      <button
        type="button"
        className={`searchable-select-trigger form-input ${error ? 'form-input-error' : ''}`}
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={displayLabel ? 'searchable-select-value' : 'searchable-select-placeholder'}>
          {displayLabel ? (
            <>
              <span className="searchable-select-value-label">{displayLabel}</span>
              {displaySublabel && (
                <span className="searchable-select-value-sub">{displaySublabel}</span>
              )}
            </>
          ) : placeholder}
        </span>
        <ChevronDown size={16} className="searchable-select-chevron" />
      </button>

      {open && (
        <div
          className={`searchable-select-panel ${widePanel ? 'searchable-select-panel-wide' : ''}`}
          role="listbox"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="searchable-select-search">
            <Search size={14} />
            <input
              type="text"
              className="searchable-select-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to search…"
              autoFocus
            />
          </div>
          <div className="searchable-select-list">
            {filtered.length === 0 && (
              <div className="searchable-select-empty">No matches</div>
            )}
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === value}
                className={`searchable-select-option ${String(o.id) === String(value) ? 'searchable-select-option-active' : ''}`}
                onClick={() => pick(o.id)}
              >
                <span className="searchable-select-option-label">{o.label}</span>
                {o.sublabel && <span className="searchable-select-option-sub">{o.sublabel}</span>}
              </button>
            ))}
          </div>
          {onAddNew && (
            <button type="button" className="searchable-select-add" onClick={() => { setOpen(false); onAddNew(); }}>
              <Plus size={14} /> {addNewLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
