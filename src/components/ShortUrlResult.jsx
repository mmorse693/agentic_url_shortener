import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

import { selectLastCreated } from '../store/linksSlice';
import CopyButton from './CopyButton';

export default function ShortUrlResult() {
  const link = useSelector(selectLastCreated);
  const inputRef = useRef(null);

  useEffect(() => {
    if (link && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [link]);

  const shortUrl = link ? link.shortUrl : '';

  return (
    // The region is always in the DOM, not mounted on success: a live region
    // that appears at the same moment as its content is not reliably announced.
    <div className="result" aria-live="polite">
      <label className="field-label" htmlFor="short-url-output">
        Short URL
      </label>

      <div className="field-row">
        <input
          id="short-url-output"
          ref={inputRef}
          className="field-input field-input-readonly"
          type="text"
          readOnly
          value={shortUrl}
          placeholder="Your short URL will appear here"
        />
        <CopyButton value={shortUrl} />
      </div>
    </div>
  );
}
