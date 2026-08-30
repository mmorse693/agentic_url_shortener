import { useDispatch } from 'react-redux';

import { deleteLink } from '../store/linksSlice';
import { isSafeHttpUrl } from '../utils/validateUrl';

/**
 * AC-34: neither URL reaches an href without its scheme being re-checked.
 * Validating on the way in is not a reason to trust stored data on the way out.
 */
function MaybeLink({ href, className, children }) {
  if (!isSafeHttpUrl(href)) {
    return <span className={className}>{children}</span>;
  }
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function LinkListItem({ link }) {
  const dispatch = useDispatch();

  return (
    <li className="link-row">
      <div className="link-urls">
        <MaybeLink href={link.shortUrl} className="link-short">
          {link.shortUrl}
        </MaybeLink>
        <MaybeLink href={link.originalUrl} className="link-dest">
          {link.originalUrl}
        </MaybeLink>
      </div>

      <span className="link-count">
        <span className="visually-hidden">Clicks: </span>
        {link.clickCount}
      </span>

      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => dispatch(deleteLink(link.code))}
      >
        Delete
        <span className="visually-hidden"> {link.shortUrl}</span>
      </button>
    </li>
  );
}
