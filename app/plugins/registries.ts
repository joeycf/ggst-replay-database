import characters from '../../data/characters.json';
import players from '../../data/players.json';
import stats from '../../data/stats.json';
import type { Character, KnownStats, Player } from '@engine/types';

/**
 * Hand the small registries to the engine at build time.
 *
 * PROVIDED, not fetched: bundled once and synchronously available during
 * prerender, which is what makes /characters/:id and /players/:id emit real
 * HTML with data-derived titles instead of an empty shell the crawler sees.
 * A prerender-time $fetch cannot read the app's own public/ (STACK §5.6), so
 * "just fetch it" is not an option for anything a prerendered page renders.
 *
 * The two client-fetched files are deliberately NOT here: replays.json is the
 * whale, and summary.json is the apex selector's card payload rather than a
 * registry. Both are copied into public/data by nuxt.config's build:before
 * hook and read under the base path at runtime.
 *
 * The static import of players.json costs more on this game than on any
 * sibling — Strive's registry is the platform's largest, several thousand
 * handles parsed out of a five-year archive of 21,944 catalogue entries, and
 * it is the same array that seeds the prerender routes in nuxt.config. It
 * still gets provided rather than fetched: a player page that 404s or
 * hydrates empty is indistinguishable from a player who never played, and
 * that failure is silent in exactly the place (a crawler's first fetch) where
 * nobody is looking.
 */
export default defineNuxtPlugin(() => {
  provideRegistries({
    characters: characters as Character[],
    players: players as Player[],
    stats: stats as KnownStats,
  });
});
