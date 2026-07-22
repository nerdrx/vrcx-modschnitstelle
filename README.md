# VRCX with Mods

An **unofficial fork of [VRCX](https://github.com/vrcx-team/VRCX)** that adds a
small, update-stable **mod/plugin API** — plus two mods built on top of it.

*Deutsche Version weiter unten. / German version below.*

VRCX upstream is only touched in **3 marked lines** (`// MOD-API`); everything
else lives in `src/mods/`. Mods never import VRCX internals directly — they code
against a stable `ModContext` (events, DB access, UI/nav registration, i18n,
selected API helpers), so rebasing onto new VRCX releases is usually painless.

## Included mods

- **Status Tracker** — records how long each friend spent on which status
  (Join Me / Active / Ask Me / Busy), with filters, sorting and a
  "last known instance" view incl. live occupancy.
- **Friend Care** — friendship maintenance: when did you last share an
  instance with each friend, and who has been inactive for a long time.
  Color-coded categories, filters, CSV export.

## Building

Same as upstream VRCX (Windows):

```bash
npm install --include=dev
npm run prod
dotnet build Dotnet\VRCX-Cef.csproj -c Release
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
einer schlanken, **update-stabilen Mod-/Plugin-Schnittstelle** — plus zwei
darauf aufbauenden Mods.

Der VRCX-Upstream-Code wird nur an **3 markierten Zeilen** (`// MOD-API`)
berührt; alles Weitere liegt in `src/mods/`. Mods importieren nie
VRCX-Interna direkt, sondern programmieren gegen einen stabilen `ModContext`
(Events, DB-Zugriff, UI-/Nav-Registrierung, i18n, ausgewählte API-Helfer) —
ein Rebase auf neue VRCX-Releases ist dadurch meist schmerzfrei.

## Enthaltene Mods

- **Status Tracker** — zeichnet auf, wie lange jeder Freund auf welchem Status
  stand (Join Me / Active / Ask Me / Busy), mit Filtern, Sortierung und einer
  Ansicht „Letzte bekannte Instanz" inkl. Live-Belegung.
- **Friend Care (Freundschaftspflege)** — wann warst du zuletzt mit jedem
  Freund in einer gemeinsamen Instanz, und wer ist schon lange inaktiv?
  Farbkategorien, Filter, CSV-Export.

## Selbst bauen

Wie beim offiziellen VRCX (Windows):

```bash
npm install --include=dev
npm run prod
dotnet build Dotnet\VRCX-Cef.csproj -c Release
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
