# Contributing (Mods)

This fork stays **minimal-invasive**: upstream VRCX code is only touched in
3 marked lines (`// MOD-API`) plus a few marked `// MOD-FIX` bugfixes.
Every PR must keep that promise.

## Rules for mod PRs

1. **Everything lives in `src/mods/<your-mod-id>/`.** A PR must not change
   files outside `src/mods/` (the only exception: registering your mod in
   `src/mods/registry.js`).
2. **Use the mod API only.** Mods never import VRCX internals
   (`../../stores/...`, services, coordinators, plugins). Everything you
   need comes from the `ModContext` (`ctx`) — events, `ctx.db`, `ctx.stores`,
   `ctx.api`, `ctx.ui`. Missing something? Propose a new ctx surface in
   `src/mods/api.js` instead of importing around it.
3. **Database discipline.** Write only to your own tables
   (`ctx.db.prefix()` = `<user>_mod_<id>_...`). Core tables are read-only.
4. **No dependency changes.** Don't touch `package.json`, lockfiles,
   `global.json` or build configs. New runtime dependencies need prior
   discussion in an issue.
5. **Tests are mandatory.** Put pure logic into an `engine.js`/`db.js` and
   cover it in `__tests__/`. Before pushing:

   ```bash
   npx vitest run src/mods   # must be green
   npm run prod              # must build
   ```

   Ideally also smoke-test the CEF build (`build\Cef\VRCX.exe`) — the app
   our users actually run.
6. **Be gentle with the VRChat API.** Use `ctx.api.*` (routed through
   VRCX's request layer) and throttle bulk lookups (≥0.5 s between calls,
   with a visible stop/progress UI).
7. **Environment workarounds stay out.** Fixes for your personal dev setup
   (Electron on Windows, SDK pins, etc.) belong in a separate branch or as
   an upstream PR to [vrcx-team/VRCX](https://github.com/vrcx-team/VRCX) —
   not in a mod PR.

Structure template: see `src/mods/status-tracker/` (index.js + engine.js +
db.js + runtime.js + View.vue + `__tests__/`). API docs: `src/mods/README.md`.
