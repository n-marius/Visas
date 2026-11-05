# Passage – Pässe, ETAs & Visa

Statische PWA (kein Build, kein Server). Alle Daten bleiben lokal im Gerät.

## Installation (iPhone)
1. GitHub Pages aktivieren: Repo → Settings → Pages → Branch `main`, Ordner `/ (root)`.
2. `https://n-marius.github.io/Visas/` in **Safari** öffnen → Teilen → **Zum Home-Bildschirm**.
3. Nur die vom Home-Bildschirm gestartete App kann Mitteilungen (iOS ≥ 16.4).

## Funktionen
- **Dokumente**: Pass (Staatsbürgerschaft), ETA/Reisegenehmigung, Visum – je mit Ablaufdatum, optional „gültig ab“; ETA/Visum für mehrere Länder (inkl. Schengen-Raum). Liste nach Ablauf sortiert.
- **Karte** (3 Ansichten): Reisefreiheit je Staatsbürgerschaft · plus gültige ETA/Visa grün · nur eigene Dokumente. Tippen auf ein Land zeigt Details; Suche für Kleinstaaten.
- **Erinnerungen** X Monate vor Ablauf (je Dokumenttyp einstellbar): Mitteilung/Badge beim Öffnen, **Kalender-Export (.ics)** mit Alarmen (funktioniert auf dem iPhone ohne Server), optional echter Server-Push.
- Sicherung/Import als JSON (Einstellungen).

## Datenquellen
- Einreisebestimmungen: [Passport Index Dataset](https://github.com/ilyankou/passport-index-dataset) (`passport-index-tidy-iso2.csv`). Die App ruft die Datei live ab (alle 7 Tage bzw. per Knopf in den Einstellungen), Fallback: eingebauter Snapshot `data/`. Zusätzlich aktualisiert `.github/workflows/update-data.yml` den Snapshot wöchentlich.
- Zuordnung: Zahl/„visa free“ → grün; ETA, e-Visa, Visa on arrival → gelb (e-Visa/VoA in den Einstellungen auf orange umstellbar); „visa required“ → dunkelorange; „no admission“ → rot. Das Passport Index Dataset ist ein Community-Datensatz, **keine amtliche Quelle** (eine amtliche, frei abrufbare Gesamtquelle für Visaregeln gibt es nicht; IATA Timatic ist kostenpflichtig). Wie aktuell einzelne Einträge sind, ist nicht garantiert.
- **Rot** = „no admission“ der Quelle plus manuell festgelegt: Nordkorea, Russland (`data/overrides.json`, frei änderbar). Reisewarnungen fließen **nicht** ein. Eigene Staatsbürgerschaft ist immer grün.
- Einzige Korrektur der Quelle: UK-ETA für Deutsche (`data/overrides.json`; gov.uk/guidance/electronic-travel-authorisation-eta: Europäer brauchen i. d. R. eine ETA).
- **Besetzte Gebiete** (Krim, Donbas u. a. besetzte Teile der Ukraine; Abchasien, Zchinwali-Gebiet) werden in der Farbe Russlands schraffiert. Geometrie: DeepState (OSINT, nicht amtlich), Snapshot `data/occupied.json`, wöchentlich per Workflow aktualisiert.
- Weltkarte: Natural Earth (world-atlas, 50m), vorab nach `data/world.json` projiziert (`tools/build-map.mjs`).
- Alle Angaben ohne Gewähr; verbindlich sind Auswärtiges Amt bzw. die jeweilige Botschaft.

## Echte Push-Nachrichten (optional, kostenlos, Gerüst – nicht getestet)
GitHub Pages hat kein Backend; Hintergrund-Push braucht einen kleinen Server. Gerüst in `worker/` (Cloudflare Workers, Gratis-Plan):
1. `cd worker && npm i && npx web-push generate-vapid-keys` (Public/Private Key notieren).
2. `npx wrangler kv namespace create SUBS` → ID in `wrangler.toml`; dort auch `VAPID_SUBJECT` setzen.
3. `npx wrangler secret put VAPID_PUBLIC` und `VAPID_PRIVATE`, dann `npx wrangler deploy`.
4. In der App: Einstellungen → Push-Server → Worker-URL + Public Key eintragen → „Push aktivieren“.
Der Worker prüft täglich 07:00 UTC und sendet am Erinnerungstag sowie 30/7/1/0 Tage vor Ablauf.

## Entwicklung
`python3 -m http.server` im Ordner starten. Version des Service Workers in `sw.js` (`V`) bei Änderungen erhöhen.
