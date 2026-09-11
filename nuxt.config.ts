import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinURL } from 'ufo';

import charactersData from './data/characters.json';
import playersData from './data/players.json';

const rootDir = fileURLToPath(new URL('.', import.meta.url));
const engineDir = fileURLToPath(
  new URL(process.env.ENGINE_PATH || '../replay-engine', new URL('.', import.meta.url)),
);

// Prerender EVERYTHING entity-shaped: the full 34-fighter roster + every player
// profile (players parsed from titles must not 404 on static hosting), plus the
// core routes. The engine seeds '/', '/health' and '/not-found' itself and
// emits sitemap/robots/manifest/404.html from the REAL prerendered list
// (modules/static-artifacts).
//
// Strive keeps the engine's default 'characters' route segment, and here that
// is a positive check rather than a default falling through: Arc System Works'
// own site files the roster at guiltygear.com/ggst/en/character/, so the
// vocabulary matches. Tōkon overrides to /fighters/ because its game says
// fighters; this one says characters.
//
// The player list is the reason this array is long. Strive's registry runs to
// several thousand handles across a five-year archive, which is the largest
// prerender on the platform — and every one of them must exist as a file,
// because a player page that 404s is indistinguishable from a player who never
// played.
const characters = charactersData as { id: string }[];
const players = playersData as { id: string }[];
const appRoutes = [
  '/stats',
  '/characters',
  '/players',
  ...characters.map((c) => `/characters/${c.id}`),
  ...players.map((p) => `/players/${p.id}`),
];

export default defineNuxtConfig({
  // The replay-engine layer: local checkout during co-development (ENGINE_PATH
  // in .env), the pinned tag everywhere else (Vercel leaves ENGINE_PATH unset).
  // Never track a branch — bump the pin deliberately. `install: true` is
  // REQUIRED for git layers: without it the cloned layer gets no node_modules
  // and its runtime deps (@tailwindcss/vite, ufo, …) don't resolve.
  //
  // v0.12.1 is the floor for this app, not a preference. v0.12.0 shipped the
  // partner registry and the `Combos ↗` nav item the ComboForge block depends
  // on; v0.12.1 added GameConfig.artCredit, the footer line that satisfies the
  // Fan Kit licence's copyright-notice term — and this is the first game that
  // needs it. THE TAG MUST BE PUSHED BEFORE THE FIRST VERCEL BUILD: Vercel
  // leaves ENGINE_PATH unset and clones the pinned tag, so a tag that exists
  // only locally fails the remote build on a missing ref.
  extends: [process.env.ENGINE_PATH || ['github:joeycf/replay-engine#v0.13.3', { install: true }]],

  compatibilityDate: '2025-07-01',

  app: {
    // MUST stay an env expression, never a literal. A literal shadows the
    // engine's own env read (app config wins the layer merge) and
    // NUXT_APP_BASE_URL alone then flips only the runtime router, leaving the
    // prerender seeds root-based → every route 404s the build (STACK §5.3
    // desync). The committed default IS production truth: Strive is born
    // behind the shell at replaydatabase.com/ggst.
    baseURL: process.env.NUXT_APP_BASE_URL || '/ggst/',
  },

  // The Strive skin (palette + three @fontsource families) — loads after the
  // engine's CSS, so its unlayered :root custom properties shadow the umbrella
  // defaults. MUST stay :root, never @theme (STACK §5.13 — see theme.css).
  css: ['~/assets/theme.css'],

  modules: [
    // Seed the entity routes under the final resolved base (same mechanism as
    // the engine's own seeds — static prerender arrays are not base-prefixed).
    function appPrerenderSeeds(_options, nuxt) {
      nuxt.hook('nitro:init', (nitro) => {
        for (const route of appRoutes) {
          nitro.options.prerender.routes.push(joinURL(nuxt.options.app.baseURL, route));
        }
      });
    },
  ],

  nitro: {
    prerender: {
      // The /dev curation pages guard themselves behind import.meta.dev and
      // 404 outside `nuxt dev`; keep the crawler from discovering and
      // prerendering them, so every REAL page failure stays a hard build error.
      ignore: ['/dev'],
    },
  },

  hooks: {
    // The client-fetched files: data/*.json (committed, pipeline-emitted) →
    // public/data/ (gitignored). Lives in the BUILD because Vercel never runs
    // the pipeline. replays.json is the engine's whale; summary.json is the
    // apex selector's card payload, fetched same-origin through the shell's
    // /ggst rewrite.
    'build:before'() {
      const dataDir = join(rootDir, 'public/data');
      mkdirSync(dataDir, { recursive: true });
      for (const f of ['replays.json', 'summary.json']) {
        cpSync(join(rootDir, `data/${f}`), join(dataDir, f));
        console.log(`✓ copied data/${f} → public/data/${f}`);
      }
    },
  },

  typescript: {
    typeCheck: false,
    nodeTsConfig: {
      compilerOptions: {
        paths: {
          '@engine': [engineDir],
          '@engine/*': [`${engineDir}/*`],
        },
      },
    },
  },
});
