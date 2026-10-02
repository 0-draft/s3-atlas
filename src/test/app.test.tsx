import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, beforeEach } from 'vitest';
import { AppRoutes } from '../App';
import { LangProvider } from '../lib/LangProvider';

function renderAt(path: string) {
  return render(
    <LangProvider initial="en">
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </LangProvider>,
  );
}

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
});

describe('app', () => {
  it('renders the home page in English by default', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'from the surface to the seabed',
    );
  });

  it('switches to Japanese', async () => {
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: '日本語' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('水面から海底まで');
    expect(document.documentElement.lang).toBe('ja');
  });

  it('filters commands by search', async () => {
    renderAt('/commands');
    const box = await screen.findByRole('searchbox');
    const before = document.querySelectorAll('.cmd-list > li').length;
    await userEvent.type(box, 'presign');
    const after = document.querySelectorAll('.cmd-list > li').length;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

  it('answers a quiz question', async () => {
    renderAt('/quiz');
    await screen.findByRole('heading', { level: 1 });
    const choices = document.querySelectorAll<HTMLButtonElement>('.choice');
    expect(choices.length).toBe(4);
    await userEvent.click(choices[0]);
    expect(screen.getByText(/Correct\.|Not quite\./)).toBeInTheDocument();
  });

  it('shows a 404 for unknown routes', async () => {
    renderAt('/nope');
    expect(await screen.findByText('This page is not in the atlas.')).toBeInTheDocument();
  });

  it('lists every chapter on the docs index', async () => {
    renderAt('/docs');
    await screen.findByRole('heading', { level: 1, name: /Eighteen chapters/ });
    const main = screen.getByRole('main');
    expect(within(main).getAllByRole('link').length).toBeGreaterThanOrEqual(18);
  });
});
