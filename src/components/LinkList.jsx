import { useSelector } from 'react-redux';

import { selectLinks, selectListStatus } from '../store/linksSlice';
import LinkListItem from './LinkListItem';

export default function LinkList() {
  const links = useSelector(selectLinks);
  const status = useSelector(selectListStatus);

  return (
    <section className="links" aria-labelledby="links-heading">
      <div className="links-head">
        <h2 id="links-heading" className="section-heading">
          Your links
        </h2>
        {links.length > 0 && <span className="links-count">{links.length}</span>}
      </div>

      {links.length === 0 ? (
        <p className="empty">
          {status === 'loading'
            ? 'Loading your links…'
            : 'No links yet. Shorten one above and it will appear here.'}
        </p>
      ) : (
        <ul className="link-rows">
          {links.map((link) => (
            <LinkListItem key={link.code} link={link} />
          ))}
        </ul>
      )}
    </section>
  );
}
