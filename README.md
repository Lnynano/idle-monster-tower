# Idle Monster Tower

Offline-first idle monster game. Vanilla HTML/CSS/JS PWA, no build step, no image assets.

Play: https://lnynano.github.io/idle-monster-tower/

## Files

- `index.html`, `style.css`: shell and theme
- `game.js`: all game rules, views and UI
- `sync.js`: Supabase cloud sync (REST, email login, backups)
- `sw.js`: offline cache. **Bump `V` on every deploy**, or phones keep the old version
- `dev/test.js`: headless regression tests (`node dev/test.js`)

## Run locally

```bash
python -m http.server 8123
```

Then open http://localhost:8123/. The service worker caches files, so unregister it (DevTools → Application) when iterating.

## Cloud

Supabase project `idle-monster-tower`: table `saves` (one row per user, RLS) and `save_backups` (last 5, hourly, filled by trigger).

## Art credits

Monster parts and UI frames by [Kenney](https://kenney.nl) (CC0): Monster Builder Pack and Fantasy UI Borders. License files are in `assets/`.
