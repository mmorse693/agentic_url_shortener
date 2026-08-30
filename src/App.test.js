import { fireEvent, screen, waitFor } from '@testing-library/react';

import App from './App';
import { makeLink, renderWithStore } from './test/renderWithStore';
import { apiError, mockApi, mockFetch } from './test/mockApi';

const urlField = () => screen.getByLabelText(/long url/i);
const outputField = () => screen.getByLabelText(/short url/i);
const submit = () => screen.getByRole('button', { name: 'Create short URL' });

function setClipboard(impl) {
  Object.defineProperty(navigator, 'clipboard', {
    value: impl ? { writeText: impl } : undefined,
    configurable: true,
    writable: true,
  });
}

afterEach(() => setClipboard(undefined));

describe('the shortener, end to end', () => {
  test('paste a long URL, create it, and copy the result', async () => {
    mockApi();
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    renderWithStore(<App />);

    fireEvent.change(urlField(), {
      target: { value: 'https://example.com/a/very/long/path?utm_source=x' },
    });
    fireEvent.click(submit());

    await waitFor(() => expect(outputField()).not.toHaveValue(''));

    const shortUrl = outputField().value;
    expect(shortUrl).toMatch(/^http:\/\/localhost\/r\/.+/);

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(shortUrl));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  test('the new link joins the list immediately', async () => {
    mockApi();
    renderWithStore(<App />);

    expect(await screen.findByText(/no links yet/i)).toBeInTheDocument();

    fireEvent.change(urlField(), { target: { value: 'https://example.com/one' } });
    fireEvent.click(submit());

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
    expect(screen.getByRole('link', { name: 'https://example.com/one' })).toBeInTheDocument();
  });

  test('a server rejection renders its exact message and keeps the input', async () => {
    mockFetch(({ method }) => {
      if (method === 'GET') return { status: 200, json: { links: [] } };
      return apiError(
        400,
        'BLOCKED_HOST',
        "Links to local or private network addresses can't be shortened.",
        'url'
      );
    });

    renderWithStore(<App />);

    // Something the client validator allows, so the rejection has to come back
    // from the server rather than being caught locally.
    fireEvent.change(urlField(), { target: { value: 'https://example.com/allowed' } });
    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Links to local or private network addresses can't be shortened."
    );
    expect(urlField()).toHaveValue('https://example.com/allowed');
    expect(urlField()).toHaveAttribute('aria-invalid', 'true');
  });

  test('a network failure surfaces without crashing the page', async () => {
    mockFetch(({ method }) => {
      if (method === 'GET') return { status: 200, json: { links: [] } };
      return new TypeError('Failed to fetch');
    });

    renderWithStore(<App />);

    fireEvent.change(urlField(), { target: { value: 'https://example.com/x' } });
    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
    expect(submit()).toBeEnabled();
  });

  test('existing links load on mount', async () => {
    mockApi({
      links: [
        makeLink({ code: 'aaa1111', shortUrl: 'http://localhost/r/aaa1111', clickCount: 7 }),
        makeLink({ code: 'bbb2222', shortUrl: 'http://localhost/r/bbb2222', clickCount: 3 }),
      ],
    });

    renderWithStore(<App />);

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
