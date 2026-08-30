import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="page page-narrow">
      <header className="page-head">
        <h1 className="page-title">Page not found</h1>
        <p className="page-sub">There is nothing at this address.</p>
      </header>
      <p>
        <Link className="text-link" to="/">
          Back to the shortener
        </Link>
      </p>
    </main>
  );
}
