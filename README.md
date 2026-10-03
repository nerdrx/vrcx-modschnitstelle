# VRCX with Mods

An **unofficial fork of [VRCX](https://github.com/vrcx-team/VRCX)** that adds a
small, update-stable **mod/plugin API** — plus four mods built on top of it.

*Deutsche Version weiter unten. / German version below.*

The mods themselves live in `src/mods/` and use a `ModContext` (events, DB
access, UI/nav registration, i18n, selected API helpers). The integration also
touches VRCX renderer and native overlay code, so each base update needs checks
at those boundaries.

**Transparency — every change to upstream VRCX code:**

- `src/app.js`, `src/plugins/router.js`, and `src/shared/constants/ui.js` —
  initialize mods and allow mod views to register in the router and reactive
  navigation.
- `src/shared/constants/settings.js` — updater URLs point to
  [this fork's releases](https://github.com/nerdrx/vrcx-modschnitstelle/releases)
  so updates keep users on the modded app.
- `Dotnet/Overlay*`, `Dotnet/AppApi/*`, and `src/public/vr-chat.html` — native
  VR chat panel, overlay message routing, and voice-sidecar integration.
- `src-electron/` and `build-scripts/download-dotnet-runtime.js` — marked
  `// MOD-FIX` launcher and runtime-download fixes.
- `src/mods/` contains the loader, stable-facing API, and bundled mods; its
  bridge still adapts to VRCX stores, database services, and other internals.
- Full diff against official VRCX:
  [upstream comparison](https://github.com/vrcx-team/VRCX/compare/master...nerdrx:vrcx-modschnitstelle:mod-api)

For base updates, add `vrcx-team/VRCX` as a separate `vrcx-upstream` remote;
keep the existing `upstream` remote to `Arikazei/vrcx-modschnitstelle`. See the
[sync workflow](src/mods/README.md#update-workflow-neues-vrcx-release-einpflegen).

## Included mods

- **Status Tracker** — records how long each friend spent on which status
  (Join Me / Active / Ask Me / Busy), with filters, sorting and a
  "last known instance" view incl. live occupancy.
- **Friend Care** — friendship maintenance: when did you last share an
  instance with each friend, and who has been inactive for a long time.
  Color-coded categories, filters, CSV export.
- **Global DB** — opt-in trusted-pool sync with pool chat (global + DMs),
  VR chat panel with wrist mini, media in chat, notification sounds, and an
  optional voice sidecar (PTT dictation, TTS readout, live translator).
- **Orbit Graph** — relation graph built from your own gamelog: who shares
  instances with you (and with each other), friends *and* non-friends,
  weighted by time actually spent together. Local data only, no API calls.

## Building

Same as upstream VRCX (Windows):

```bash
npm install --include=dev
npm run prod
dotnet build Dotnet/VRCX-Cef.csproj -p:Configuration=Release -p:WarningLevel=0 -p:Platform=x64 -p:PlatformTarget=x64 -t:"Clean;Build" -maxcpucount --runtime win-x64 --self-contained
```

The app then lives in `build\Cef\VRCX.exe`. Mod API docs, how to write your own
mod and the release/rebase workflow: see [`src/mods/README.md`](src/mods/README.md).

For everything about VRCX itself (features, screenshots, full docs), see the
[upstream README](https://github.com/vrcx-team/VRCX#readme).

**Note:** this fork shares the database (`%AppData%\VRCX\VRCX.sqlite3`) with a
regular VRCX installation — close one before starting the other, and consider a
backup first. The mods only create their own `*_mod_*` tables and read core
tables read-only.

## Credits & License

All credit for VRCX itself goes to the [VRCX team](https://github.com/vrcx-team/VRCX).
This fork is **not affiliated with or endorsed by** the VRCX team or VRChat Inc.
Use at your own risk. Licensed under the [MIT License](LICENSE), same as upstream.

---

# VRCX mit Mods (Deutsch)

Ein **inoffizieller Fork von [VRCX](https://github.com/vrcx-team/VRCX)** mit
einer schlanken, **update-stabilen Mod-/Plugin-Schnittstelle** — plus vier
darauf aufbauenden Mods.

Die Mods selbst liegen in `src/mods/` und verwenden einen `ModContext`
(Events, DB-Zugriff, UI-/Nav-Registrierung, i18n, ausgewählte API-Helfer).
Die Integration berührt auch Renderer- und nativen Overlay-Code von VRCX;
bei jedem Base-Update müssen diese Schnittstellen geprüft werden.

**Transparenz — jede Änderung am Upstream-Code von VRCX:**

- `src/app.js`, `src/plugins/router.js` und `src/shared/constants/ui.js` —
  initialisieren Mods und erlauben Mod-Views in Router und reaktiver Navigation.
- `src/shared/constants/settings.js` — die Updater-URLs zeigen auf
  [die Releases dieses Forks](https://github.com/nerdrx/vrcx-modschnitstelle/releases),
  damit Updates bei der gemoddeten App bleiben.
- `Dotnet/Overlay*`, `Dotnet/AppApi/*` und `src/public/vr-chat.html` — natives
  VR-Chat-Panel, Overlay-Nachrichtenrouting und Voice-Sidecar-Integration.
- `src-electron/` und `build-scripts/download-dotnet-runtime.js` — markierte
  `// MOD-FIX`-Korrekturen am Launcher und Runtime-Download.
- `src/mods/` enthält Loader, Mod-API und Mods; die Bridge passt weiterhin
  VRCX-Stores, Datenbankdienste und andere Interna an.
- Kompletter Diff gegen das offizielle VRCX:
  [Upstream-Vergleich](https://github.com/vrcx-team/VRCX/compare/master...nerdrx:vrcx-modschnitstelle:mod-api)

Für Base-Updates `vrcx-team/VRCX` als separates Remote `vrcx-upstream`
hinzufügen; das bestehende Remote `upstream` zu `Arikazei/vrcx-modschnitstelle`
beibehalten. Der [Sync-Workflow](src/mods/README.md#update-workflow-neues-vrcx-release-einpflegen)
enthält die Schritte.

## Enthaltene Mods

- **Status Tracker** — zeichnet auf, wie lange jeder Freund auf welchem Status
  stand (Join Me / Active / Ask Me / Busy), mit Filtern, Sortierung und einer
  Ansicht „Letzte bekannte Instanz" inkl. Live-Belegung.
- **Friend Care (Freundschaftspflege)** — wann warst du zuletzt mit jedem
  Freund in einer gemeinsamen Instanz, und wer ist schon lange inaktiv?
  Farbkategorien, Filter, CSV-Export.
- **Global DB** — Opt-in-Sync über einen Vertrauens-Pool mit Pool-Chat
  (global + DMs), VR-Chat-Panel mit Wrist-Mini, Medien im Chat,
  Benachrichtigungstönen und optionalem Voice-Sidecar (PTT-Diktat,
  TTS-Vorlesen, Live-Übersetzer).
- **Orbit Graph** — Beziehungsgraph aus dem eigenen Gamelog: wer teilt
  Instanzen mit dir (und untereinander), Freunde *und* Nicht-Freunde,
  gewichtet nach tatsächlich gemeinsam verbrachter Zeit. Nur lokale Daten,
  keine API-Aufrufe.

## Selbst bauen

Wie beim offiziellen VRCX (Windows):

```bash
npm install --include=dev
npm run prod
dotnet build Dotnet/VRCX-Cef.csproj -p:Configuration=Release -p:WarningLevel=0 -p:Platform=x64 -p:PlatformTarget=x64 -t:"Clean;Build" -maxcpucount --runtime win-x64 --self-contained
```

Die App liegt danach unter `build\Cef\VRCX.exe`. Mod-API-Doku, eigene Mods
schreiben und der Update-/Rebase-Workflow: siehe
[`src/mods/README.md`](src/mods/README.md).

Alles zu VRCX selbst (Features, Screenshots, volle Doku) steht im
[Upstream-README](https://github.com/vrcx-team/VRCX#readme).

**Hinweis:** Dieser Fork teilt sich die Datenbank (`%AppData%\VRCX\VRCX.sqlite3`)
mit einer regulären VRCX-Installation — nie beide gleichzeitig starten, vorher
Backup empfohlen. Die Mods legen nur eigene `*_mod_*`-Tabellen an und lesen
Kerntabellen ausschließlich lesend.

## Credits & Lizenz

Alle Ehre für VRCX selbst gebührt dem [VRCX-Team](https://github.com/vrcx-team/VRCX).
Dieser Fork ist **nicht mit dem VRCX-Team oder VRChat Inc. verbunden** und wird
von ihnen nicht unterstützt. Nutzung auf eigene Gefahr. Lizenz:
[MIT](LICENSE), wie beim Upstream.
