/**
 * `role="alert"` so the message is announced the moment it appears. The id is
 * forwarded so the field it belongs to can point at it with aria-describedby.
 */
export default function ErrorMessage({ id, message, tone = 'error' }) {
  if (!message) return null;

  return (
    <p id={id} role="alert" className={`message message-${tone}`}>
      {message}
    </p>
  );
}
