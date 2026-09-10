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

/** El pedazo de HTML de la card de retrato que nombra a `name`. */
export function portraitFor(html: string, name: string): string {
  const found = html.split('ne-portrait-card').find((chunk) => chunk.includes(`>${name}</h4>`));
  if (found === undefined) throw new Error(`La pantalla no dibuja la card de ${name}`);
  return found;
}

/** Dónde aparece cada texto, para afirmar sobre el orden de una lista. */
export function orderOf(html: string, ...texts: string[]): number[] {
  return texts.map((text) => {
    const at = html.indexOf(text);
    if (at < 0) throw new Error(`La pantalla no dice «${text}»`);
    return at;
  });
}

/** El valor que la pantalla dibuja justo después de una etiqueta. */
export function valueAfter(html: string, label: string): string {
  const at = html.indexOf(`>${label}<`);
  if (at < 0) throw new Error(`La pantalla no dice «${label}»`);
  const match = /<span[^>]*>([^<>]*)<\/span>/.exec(html.slice(at + label.length + 2));
  if (match === null) throw new Error(`«${label}» no tiene ningún valor detrás`);
  return match[1];
}

/** El valor que la pantalla dibuja justo antes de una etiqueta. */
export function valueBefore(html: string, label: string): string {
  const at = html.indexOf(`>${label}<`);
  if (at < 0) throw new Error(`La pantalla no dice «${label}»`);
  const values = [...html.slice(0, at).matchAll(/>([^<>]*)<\/span>/g)];
  if (values.length === 0) throw new Error(`«${label}» no tiene ningún valor delante`);
  return values[values.length - 1][1];
}
