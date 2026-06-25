import { useRef, useEffect, useCallback } from 'react';
import { ScanBarcode } from 'lucide-react';

/**
 * Captures USB/Bluetooth barcode scanner input (rapid keystrokes + Enter).
 * Also works when the user types a code and presses Enter.
 */
export default function BarcodeScannerInput({
  onScan,
  placeholder = 'Scan barcode or type & press Enter…',
  autoFocus = true,
  disabled = false,
  className = '',
  showIcon = true,
  label,
}) {
  const inputRef = useRef(null);
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);

  useEffect(() => {
    if (autoFocus && !disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus, disabled]);

  const flush = useCallback((value) => {
    const code = String(value || '').trim();
    bufferRef.current = '';
    if (inputRef.current) inputRef.current.value = '';
    if (code && onScan) onScan(code);
  }, [onScan]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      flush(e.currentTarget.value || bufferRef.current);
      return;
    }
    const now = Date.now();
    if (now - lastKeyTimeRef.current > 120) {
      bufferRef.current = '';
    }
    lastKeyTimeRef.current = now;
    if (e.key.length === 1) {
      bufferRef.current += e.key;
    }
  };

  return (
    <div className={`barcode-scanner-wrap ${className}`}>
      {label && <label className="form-label">{label}</label>}
      <div className="barcode-scanner-input-row">
        {showIcon && <ScanBarcode size={18} className="barcode-scanner-icon" aria-hidden />}
        <input
          ref={inputRef}
          type="text"
          className="form-input barcode-scanner-input"
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onKeyDown={handleKeyDown}
          onBlur={() => { bufferRef.current = ''; }}
        />
      </div>
    </div>
  );
}
