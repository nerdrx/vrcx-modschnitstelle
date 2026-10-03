# VRCX Mod System

Eine schlanke Schnittstelle für eigene Erweiterungen ("Mods") in diesem
VRCX-Fork. Loader, API und Mods leben in `src/mods/`; die Integration berührt
zusätzlich Renderer- und nativen Overlay-Code.

## Integrationspunkte

Beim Rebase können Änderungen an diesen Stellen Konflikte oder Anpassungen
erfordern:

| Datei | Änderung |
|---|---|
| `src/app.js` | Mod-Loader-Aufruf und Notification-Polyfill |
| `src/plugins/router.js`, `src/shared/constants/ui.js` | Benannte Layout-Route und reaktive Nav-Einträge für Mod-Views |
| `src/shared/constants/settings.js` | Stable- und Nightly-Updater verweisen auf `nerdrx/vrcx-modschnitstelle` |
| `Dotnet/Overlay*`, `Dotnet/AppApi/*`, `src/public/vr-chat.html` | VR-Chat-Panel, Overlay-Nachrichten und Voice-Sidecar |
| `src-electron/`, `build-scripts/download-dotnet-runtime.js` | Markierte Launcher- und Runtime-Download-Fixes |

Nach einem Rebase alle Integrationsmarkierungen prüfen, nicht nur die Loader-
und Router-Hooks. Die Mod-Bridge in `src/mods/api.js` greift auf VRCX-Stores,
Datenbankdienste, Feed-Aktionen, i18n und weitere Interna zu; Änderungen dort
können ebenfalls Anpassungen erfordern.

## Update-Workflow (neues VRCX-Release einpflegen)

```bash
git remote add vrcx-upstream https://github.com/vrcx-team/VRCX.git  # einmalig
git fetch vrcx-upstream
git rebase vrcx-upstream/master  # oder: git merge vrcx-upstream/master
rg -n 'MOD-API|MOD-FIX' src src-electron Dotnet build-scripts
npx vitest run src/mods
npm run prod
dotnet build Dotnet/VRCX-Cef.csproj -p:Configuration=Release -p:WarningLevel=0 -p:Platform=x64 -p:PlatformTarget=x64 -t:"Clean;Build" -maxcpucount --runtime win-x64 --self-contained
```

`vrcx-upstream` zeigt direkt auf `vrcx-team/VRCX` und bleibt getrennt vom
`upstream`-Remote des Zwischen-Forks `Arikazei/vrcx-modschnitstelle`. Updater
und Release-Downloads verwenden `nerdrx/vrcx-modschnitstelle`. Prüfe beim
Rebase die markierten Renderer- und .NET-Stellen sowie Installer und Updater;
ein grüner Mod-Test allein deckt diese Integration nicht ab.

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
