# VRCX Mod System

Eine schlanke, update-stabile Schnittstelle für eigene Erweiterungen ("Mods")
in diesem VRCX-Fork. Mods leben komplett in `src/mods/` und berühren keinen
Upstream-Code.

## Upstream-Berührungspunkte (bewusst minimal)

Beim Rebase auf ein neues Upstream-Release können nur diese Stellen
kollidieren — alles andere sind neue Dateien:

| Datei | Änderung |
|---|---|
| `src/app.js` | `import { initMods } from './mods';` + `await initMods({ app });` vor `app.mount` |
| `src/plugins/router.js` | `name: 'main-layout'` auf der `/`-Route (für `router.addRoute`) |

Beide Zeilen sind mit `// MOD-API` markiert → nach einem Rebase einfach nach
`MOD-API` greppen um zu prüfen, ob sie noch da sind.

## Update-Workflow (neues VRCX-Release einpflegen)

```bash
git remote add upstream https://github.com/vrcx-team/VRCX.git   # einmalig
git fetch upstream
git rebase upstream/master        # oder: git merge upstream/master
grep -rn "MOD-API" src/app.js src/plugins/router.js   # Hooks noch da?
npx vitest run src/mods           # Mod-Tests grün?
```

Konflikte sind nur in den zwei Hook-Dateien möglich und in Sekunden gelöst.
Sollte Upstream `feedStore.addFeedEntry` oder die Feed-Tabellen umbenennen,
muss nur `src/mods/api.js` (Event-Bridge) bzw. die betroffene Mod-DB-Query
angepasst werden — die Mod-API nach außen bleibt gleich.

## Einen Mod schreiben

```js
// src/mods/my-mod/index.js
export default {
    id: 'mymod',            // [a-z0-9], eindeutig
    name: 'My Mod',
    version: '1.0.0',
    async setup(ctx) {
        ctx.on('feed:Status', (feed) => ctx.log(feed.displayName, feed.status));
        ctx.onLogin(async () => {
            await ctx.db.exec(`CREATE TABLE IF NOT EXISTS ${ctx.db.prefix()}_stuff (...)`);
        });
    }
};
```

Dann in `src/mods/registry.js` registrieren.

### ModContext (`ctx`) — stabile API

- **Events**: `ctx.on(event, handler)` → `'feed'`, `'feed:Status'`, `'feed:Online'`,
  `'feed:Offline'`, `'feed:GPS'`, `'feed:Avatar'`, `'feed:Bio'`, `'login'`, `'logout'`.
  Feed-Events feuern für *jedes* Ereignis, unabhängig von UI-Filtern.
  `ctx.onLogin(handler)` feuert auch sofort, wenn schon eingeloggt.
- **DB**: `ctx.db.query(sql, args)` (SELECT, Rows als Arrays),
  `ctx.db.exec(sql, args)` (DDL/DML), `ctx.db.prefix()` (eigener Tabellen-Präfix
  `<user>_mod_<modid>`), `ctx.db.corePrefix()` (lesender Zugriff auf
  VRCX-Kerntabellen wie `<user>_feed_status`). Args als `{'@key': value}`.
- **Stores** (read/subscribe): `ctx.stores.friends`, `ctx.stores.user`, `ctx.stores.feed`.
- **UI**: `ctx.ui.addNavView({ key, component, icon, label: { en, de } })` —
  registriert Route + Eintrag im Nav-Menü (erscheint automatisch, auch bei
  gespeichertem Custom-Layout).
- **Logging**: `ctx.log/warn/error` (mit Mod-Präfix).

## Enthaltene Mods

### Status Tracker (`status-tracker/`)

Zeichnet auf, wer wie lange auf Join Me (Blau) / Active (Grün) / Ask Me
(Gelb/Orange) / Busy (Rot) stand.

- **Historisch**: berechnet rückwirkend aus den vorhandenen VRCX-Tabellen
  `*_feed_status` (Statuswechsel) und `*_feed_online_offline` (Sessions).
- **Live**: schreibt beim Online-/Offline-Gehen eines Freundes einen exakten
  Status-Snapshot in `<user>_mod_statustracker_snapshots`, damit das erste
  Intervall einer Session nicht geraten werden muss.
- **UI**: Nav-Eintrag „Status Tracker" — Zeitraum 7/30/90/365 Tage, Suche,
  Farbbalken + Zeiten pro Status, sortiert nach Online-Gesamtzeit.
- **Grenzen**: erfasst nur, was VRCX gesehen hat (App muss laufen); Zeiten sind
  Untergrenzen. „Active"-Web-Präsenz (nicht im Spiel) zählt nicht als online.
  Spannen ohne Statusinfo werden als „Unbekannt" ausgewiesen statt geraten —
  per Backfill (`previous_status` des nächsten Wechsels) meist auflösbar.

Tests: `npx vitest run src/mods`
