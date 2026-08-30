import { useEffect } from 'react';
import { useDispatch } from 'react-redux';

import LinkList from '../components/LinkList';
import ShortUrlResult from '../components/ShortUrlResult';
import ShortenForm from '../components/ShortenForm';
import { fetchLinks } from '../store/linksSlice';

export default function ShortenPage() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchLinks());
  }, [dispatch]);

  return (
    <main className="page">
      <header className="page-head">
        <h1 className="page-title">Shorten a URL</h1>
        <p className="page-sub">Paste a long link, get a short one back.</p>
      </header>

      <div className="card">
        <ShortenForm />
        <ShortUrlResult />
      </div>

      <LinkList />
    </main>
  );
}
