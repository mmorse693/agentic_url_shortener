import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  clearError,
  createLink,
  selectCreateStatus,
  selectLinksError,
} from '../store/linksSlice';
import { validateUrl } from '../utils/validateUrl';
import ErrorMessage from './ErrorMessage';

const ERROR_ID = 'url-error';

export default function ShortenForm() {
  const dispatch = useDispatch();
  const createStatus = useSelector(selectCreateStatus);
  const serverError = useSelector(selectLinksError);

  const [value, setValue] = useState('');
  const [localError, setLocalError] = useState(null);

  const isBusy = createStatus === 'loading';
  const error = localError || serverError;

  const handleChange = (event) => {
    setValue(event.target.value);
    if (localError) setLocalError(null);
    if (serverError) dispatch(clearError());
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const result = validateUrl(value);
    if (!result.ok) {
      // AC-9: the message appears without a request ever being issued.
      setLocalError({ code: result.code, message: result.message });
      return;
    }

    setLocalError(null);
    dispatch(createLink({ url: value }));
  };

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <label className="field-label" htmlFor="url-input">
        Long URL
      </label>

      <div className="field-row">
        {/* type="text", not "url": validation and its wording are ours, not the
            browser's, so the messages stay identical to the server's. */}
        <input
          id="url-input"
          name="url"
          type="text"
          className="field-input"
          placeholder="https://example.com/a/very/long/path"
          value={value}
          onChange={handleChange}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck="false"
        />

        <button type="submit" className="btn btn-primary" disabled={isBusy}>
          {isBusy ? 'Creating…' : 'Create short URL'}
        </button>
      </div>

      <ErrorMessage id={ERROR_ID} message={error ? error.message : null} />
    </form>
  );
}
