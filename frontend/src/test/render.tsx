import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { KEY_PREFIX, storageKey } from '../lib/accountKey';

export const UID = '1300000000';

export const KEY = `${KEY_PREFIX}0jvXwPnJHo0d8H8rWc2vQKPzE4mDwK5f`;

const ROUTES = [
  '/',
  '/account/:uid',
  '/account/:uid/agents',
  '/account/:uid/agents/new',
  '/account/:uid/agents/:agentId',
  '/account/:uid/agents/:agentId/edit',
  '/account/:uid/teams',
  '/account/:uid/teams/new',
  '/account/:uid/teams/:teamId/edit',
  '/account/:uid/key',
  '/account/:uid/chronicle/:section',
];

export function renderScreen(path: string, screen: ReactNode): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {ROUTES.map((route) => (
          <Route key={route} path={route} element={screen} />
        ))}
      </Routes>
    </MemoryRouter>,
  );
}

export function render(node: ReactNode): string {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

export function stubStoredKey(uid: string | null): void {
  const entries = new Map(uid ? [[storageKey(uid), KEY]] : []);
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => entries.set(name, value),
    removeItem: (name: string) => entries.delete(name),
  });
}
