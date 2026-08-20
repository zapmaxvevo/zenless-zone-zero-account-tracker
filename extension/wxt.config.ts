import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'ZZZ Tracker — Import HoYoLAB',
    description:
      'Importa el Battle Chronicle de Zenless Zone Zero desde tu sesión de HoYoLAB al tracker.',
    permissions: ['storage', 'tabs'],
    host_permissions: [
      'http://127.0.0.1:8000/*',
      // Placeholder: reemplazar por el dominio real cuando exista el deploy en Vercel.
      'https://personal-zzz.vercel.app/*',
      'https://act.hoyolab.com/*',
    ],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'zzz-tracker@zapmaxvevo.dev', strict_min_version: '121.0' },
          },
        }
      : {}),
  }),
  hooks: {
    // Firefox MV3 arranca el background desde `scripts`; Chrome desde `service_worker`.
    // El build de Firefox lleva las dos claves para que el mismo manifest sirva en ambos.
    'build:manifestGenerated': (wxt, manifest) => {
      if (wxt.config.browser !== 'firefox' || !manifest.background) return;
      const background = manifest.background as {
        service_worker?: string;
        scripts?: string[];
      };
      if (background.service_worker && !background.scripts) {
        background.scripts = [background.service_worker];
      }
      if (!background.service_worker && background.scripts?.length) {
        background.service_worker = background.scripts[0];
      }
    },
  },
});
