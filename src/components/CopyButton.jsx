import { useCallback, useEffect, useRef, useState } from 'react';

const RESET_MS = 2000;

const MANUAL_HINT = 'Copy failed — press Ctrl+C to copy.';

/**
 * The async Clipboard API is unavailable on non-HTTPS origins and can reject
 * even where it exists, so there are two fallbacks behind it.
 */
function legacyCopy(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(area);
    return Boolean(copied);
  } catch {
    return false;
  }
}

async function writeToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }
  return legacyCopy(text);
}

export default function CopyButton({ value }) {
  const [status, setStatus] = useState('idle');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = useCallback(async () => {
    const copied = await writeToClipboard(value);
    setStatus(copied ? 'copied' : 'failed');

    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), RESET_MS);
  }, [value]);

  const label = status === 'copied' ? 'Copied!' : 'Copy';

  return (
    <div className="copy">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleCopy}
        disabled={!value}
        data-status={status}
      >
        {label}
      </button>

      {status === 'failed' && <p className="message message-warn">{MANUAL_HINT}</p>}

      <span className="visually-hidden" aria-live="polite">
        {status === 'copied' ? 'Short URL copied to clipboard.' : ''}
      </span>
    </div>
  );
}

export { MANUAL_HINT };
