import { fireEvent, screen, waitFor } from '@testing-library/react';

import LinkList from './LinkList';
import { linksState, makeLink, renderWithStore } from '../test/renderWithStore';
import { mockApi } from '../test/mockApi';

describe('LinkList', () => {
  test('renders an empty state with nothing to show', () => {
    renderWithStore(<LinkList />);

    expect(screen.getByText(/no links yet/i)).toBeInTheDocument();
  });

  test('says it is loading while the list is in flight', () => {
    renderWithStore(<LinkList />, {
      preloadedState: linksState({ listStatus: 'loading' }),
    });

    expect(screen.getByText(/loading your links/i)).toBeInTheDocument();
  });

  test('renders each link with its click count', () => {
    renderWithStore(<LinkList />, {
      preloadedState: linksState({
        items: [
          makeLink({ code: 'aaa1111', shortUrl: 'http://localhost/r/aaa1111', clickCount: 12 }),
          makeLink({ code: 'bbb2222', shortUrl: 'http://localhost/r/bbb2222', clickCount: 0 }),
        ],
      }),
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  test('deleting dispatches with the right code', async () => {
    const fetchMock = mockApi();
    renderWithStore(<LinkList />, {
      preloadedState: linksState({
        items: [makeLink({ code: 'gone999', shortUrl: 'http://localhost/r/gone999' })],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/links/gone999');
    expect(options.method).toBe('DELETE');
  });

  test('the row disappears once the delete succeeds', async () => {
    mockApi();
    renderWithStore(<LinkList />, {
      preloadedState: linksState({
        items: [makeLink({ code: 'gone999', shortUrl: 'http://localhost/r/gone999' })],
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(screen.queryByRole('listitem')).not.toBeInTheDocument());
    expect(screen.getByText(/no links yet/i)).toBeInTheDocument();
  });

  test('a destination with an unsafe scheme is never turned into a link (AC-34)', () => {
    renderWithStore(<LinkList />, {
      preloadedState: linksState({
        items: [
          makeLink({
            code: 'evil111',
            shortUrl: 'http://localhost/r/evil111',
            // Could only exist if validation were ever bypassed — rendering it
            // as an href would make it a click-to-run XSS.
            originalUrl: 'javascript:alert(1)',
          }),
        ],
      }),
    });

    expect(screen.getByText('javascript:alert(1)').tagName).toBe('SPAN');
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['http://localhost/r/evil111']);
  });

  test('safe destinations open in a new tab without leaking the referrer', () => {
    renderWithStore(<LinkList />, {
      preloadedState: linksState({
        items: [makeLink({ code: 'safe111', originalUrl: 'https://example.com/ok' })],
      }),
    });

    const dest = screen.getByRole('link', { name: 'https://example.com/ok' });
    expect(dest).toHaveAttribute('rel', 'noopener noreferrer');
    expect(dest).toHaveAttribute('target', '_blank');
  });
});
