import { fireEvent, screen, waitFor } from '@testing-library/react';

import ShortenForm from './ShortenForm';
import { linksState, renderWithStore } from '../test/renderWithStore';
import { mockApi, mockFetch } from '../test/mockApi';

const input = () => screen.getByLabelText(/long url/i);
const submit = () => screen.getByRole('button', { name: 'Create short URL' });

const type = (value) => fireEvent.change(input(), { target: { value } });

describe('ShortenForm', () => {
  test('renders a labelled field and the named button', () => {
    mockApi();
    renderWithStore(<ShortenForm />);

    expect(input()).toBeInTheDocument();
    expect(submit()).toBeEnabled();
  });

  test('an empty submit shows a message and issues NO request (AC-9)', async () => {
    const fetchMock = mockApi();
    renderWithStore(<ShortenForm />);

    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a URL to shorten.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('whitespace-only input is treated as empty', async () => {
    const fetchMock = mockApi();
    renderWithStore(<ShortenForm />);

    type('    ');
    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a URL to shorten.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ['javascript:alert(1)', 'Only http and https links can be shortened.'],
    ['http://127.0.0.1/', "Links to local or private network addresses can't be shortened."],
    ['not a url', "That doesn't look like a valid URL. Try something like https://example.com/page"],
  ])('%s is blocked client-side with its own message', async (value, message) => {
    const fetchMock = mockApi();
    renderWithStore(<ShortenForm />);

    type(value);
    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('marks the field invalid and describes it by the message (AC-15)', async () => {
    mockApi();
    renderWithStore(<ShortenForm />);

    type('javascript:alert(1)');
    fireEvent.click(submit());

    const alert = await screen.findByRole('alert');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(input()).toHaveAttribute('aria-describedby', alert.id);
  });

  test('editing the field clears the previous error (AC-16)', async () => {
    mockApi();
    renderWithStore(<ShortenForm />);

    type('javascript:alert(1)');
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    type('https://example.com');

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(input()).not.toHaveAttribute('aria-invalid');
  });

  test('a valid URL dispatches the create request', async () => {
    const fetchMock = mockApi();
    renderWithStore(<ShortenForm />);

    type('https://example.com/a/long/path');
    fireEvent.click(submit());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/links');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body).url).toBe('https://example.com/a/long/path');
  });

  test('the button is disabled and labelled busy while creating', () => {
    mockApi();
    renderWithStore(<ShortenForm />, {
      preloadedState: linksState({ createStatus: 'loading' }),
    });

    const busy = screen.getByRole('button', { name: /creating/i });
    expect(busy).toBeDisabled();
  });

  test('a server-side rejection is shown against the field', async () => {
    mockFetch(() => ({
      status: 400,
      json: {
        error: { code: 'BLOCKED_HOST', message: 'Server says no.', field: 'url' },
      },
    }));
    renderWithStore(<ShortenForm />);

    type('https://example.com');
    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent('Server says no.');
    expect(input()).toHaveValue('https://example.com');
  });
});
