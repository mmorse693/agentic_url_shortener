import { act, fireEvent, render, screen } from '@testing-library/react';

import CopyButton, { MANUAL_HINT } from './CopyButton';

const VALUE = 'http://localhost/r/abc1234';

function setClipboard(impl) {
  Object.defineProperty(navigator, 'clipboard', {
    value: impl ? { writeText: impl } : undefined,
    configurable: true,
    writable: true,
  });
}

const click = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
  });
};

afterEach(() => {
  setClipboard(undefined);
  delete document.execCommand;
});

describe('CopyButton', () => {
  test('is disabled when there is nothing to copy (AC-26)', () => {
    render(<CopyButton value="" />);

    expect(screen.getByRole('button', { name: /copy/i })).toBeDisabled();
  });

  test('writes exactly the short URL to the clipboard (AC-24)', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    setClipboard(writeText);

    render(<CopyButton value={VALUE} />);
    await click();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(VALUE);
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  test('the confirmation clears itself', async () => {
    jest.useFakeTimers();
    setClipboard(jest.fn().mockResolvedValue(undefined));

    render(<CopyButton value={VALUE} />);
    await click();

    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    jest.useRealTimers();
  });

  test('falls back to execCommand when the clipboard API rejects (AC-25)', async () => {
    setClipboard(jest.fn().mockRejectedValue(new Error('denied')));
    document.execCommand = jest.fn().mockReturnValue(true);

    render(<CopyButton value={VALUE} />);
    await click();

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    expect(screen.queryByText(MANUAL_HINT)).not.toBeInTheDocument();
  });

  test('uses execCommand directly when there is no clipboard API at all', async () => {
    setClipboard(undefined);
    document.execCommand = jest.fn().mockReturnValue(true);

    render(<CopyButton value={VALUE} />);
    await click();

    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  test('shows the manual hint when both paths fail (AC-25)', async () => {
    setClipboard(jest.fn().mockRejectedValue(new Error('denied')));
    document.execCommand = jest.fn().mockReturnValue(false);

    render(<CopyButton value={VALUE} />);
    await click();

    expect(screen.getByText(MANUAL_HINT)).toBeInTheDocument();
  });

  test('does not leave the textarea behind', async () => {
    setClipboard(undefined);
    document.execCommand = jest.fn().mockReturnValue(true);

    render(<CopyButton value={VALUE} />);
    await click();

    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
