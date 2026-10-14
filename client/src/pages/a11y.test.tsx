import { render } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage, RegisterPage } from './AuthPages';
import { WelcomePage } from './WelcomePage';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), register: vi.fn() }),
}));

async function violations(ui: ReactNode) {
  const { container } = render(<MemoryRouter>{ui}</MemoryRouter>);
  // Colour contrast can't be computed in jsdom; it is checked manually (see docs/MANUAL_TEST_CHECKLIST.md).
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

describe('accessibility basics', () => {
  it('welcome page has no axe violations', async () => {
    expect(await violations(<WelcomePage />)).toEqual([]);
  });
  it('sign-in form has no axe violations', async () => {
    expect(await violations(<LoginPage />)).toEqual([]);
  });
  it('registration form has no axe violations', async () => {
    expect(await violations(<RegisterPage />)).toEqual([]);
  });
});
