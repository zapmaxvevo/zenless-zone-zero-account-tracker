import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { vi } from 'vitest';

export interface Reply {
  status?: number;
  body?: unknown;
}

/** Rutas por `"MÉTODO /path"`; un array contesta distinto en cada llamada sucesiva. */
export type Routes = Record<string, Reply | Reply[]>;

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

export function stubFetch(routes: Routes): string[] {
  const calls: string[] = [];
  const seen = new Map<string, number>();

  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    const signature = `${init?.method ?? 'GET'} ${String(input).replace(/^\/api/, '')}`;
    calls.push(signature);

    const route = routes[signature];
    if (route === undefined)
      return Promise.resolve(reply({ status: 404, body: { detail: signature } }));

    const turn = seen.get(signature) ?? 0;
    seen.set(signature, turn + 1);
    const chosen = Array.isArray(route) ? route[Math.min(turn, route.length - 1)] : route;
    return Promise.resolve(reply(chosen));
  });

  return calls;
}

const WITHOUT_BODY = [204, 205, 304];

function reply({ status = 200, body = {} }: Reply): Response {
  if (WITHOUT_BODY.includes(status)) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Monta una pantalla de verdad y deja que sus efectos terminen. */
export async function mount(path: string, screen: ReactNode): Promise<RenderResult> {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {ROUTES.map((route) => (
          <Route key={route} path={route} element={screen} />
        ))}
      </Routes>
    </MemoryRouter>,
  );
  await settle();
  return view;
}

/** Deja correr las promesas pendientes y los renders que disparan. */
export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
