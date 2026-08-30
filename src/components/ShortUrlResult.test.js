import { screen } from '@testing-library/react';

import ShortUrlResult from './ShortUrlResult';
import { linksState, makeLink, renderWithStore } from '../test/renderWithStore';

const output = () => screen.getByLabelText(/short url/i);

describe('ShortUrlResult', () => {
  test('shows an empty, read-only field before anything is created', () => {
    renderWithStore(<ShortUrlResult />);

    expect(output()).toHaveValue('');
    expect(output()).toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: /copy/i })).toBeDisabled(); // AC-26
  });

  test('renders the short URL once one exists (AC-23)', () => {
    const link = makeLink({ shortUrl: 'http://localhost/r/xyz9876' });
    renderWithStore(<ShortUrlResult />, {
      preloadedState: linksState({ lastCreated: link }),
    });

    expect(output()).toHaveValue('http://localhost/r/xyz9876');
    expect(screen.getByRole('button', { name: /copy/i })).toBeEnabled();
  });

  test('the field lives inside a polite live region (AC-23)', () => {
    renderWithStore(<ShortUrlResult />);

    const region = output().closest('[aria-live]');
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  test('focus moves to the output when a link arrives', () => {
    const link = makeLink({ shortUrl: 'http://localhost/r/focus11' });
    renderWithStore(<ShortUrlResult />, {
      preloadedState: linksState({ lastCreated: link }),
    });

    expect(output()).toHaveFocus();
  });
});
