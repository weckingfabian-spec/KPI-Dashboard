# Fabian Wecking — Life Dashboard

Persönliches Life-Dashboard als lokale Web-App. Einfach `index.html` im Browser öffnen — kein Server, keine Installation.

---

## Tabs

### Übersicht
- 3 KPI-Karten: **Notartermine in Vorlage** (aus Pipeline), **Einkommen MTD**, **Gemeldetes Volumen**
- Fortschrittsbalken: KAI S2 Termine und Notartermine vs. Monatsziel
- Heute: Morgen- und Abendroutine-Status + Streak-Zähler

### Daily
**Morgenroutine (6 Punkte):**
1. 5:00 – 5:30 aufstehen
2. Bewegung / Sport
3. TOP 5 Ziele aufschreiben
4. Kalte Dusche
5. Affirmationen
6. Vision Board gecheckt?

**Abendroutine (6 Punkte):**
1. 10 Min aufräumen
2. Wofür bin ich heute besonders dankbar?
3. Welche neuen Ideen hatte ich heute?
4. Welche wichtigen To-Dos gibt es morgen?
5. Was ist die EINE Sache für morgen?
6. 30 min lesen oder Englisch lernen

### Weekly
Vollständiger Sonntagsfahrplan mit 6 Sektionen: Reflexion, Zielvereinbarung, Gewohnheiten, Terminlage, Wochenziel, Monatsziel.

### Monthly
- **KPI Tracker**: Kunden im Portal, BGA-Veranstaltungen, Aktiver Beratungsprozess (KAI S2, Notartermine) — Felder mit Pipeline-Symbol werden automatisch aus der Pipeline befüllt
- **Controlling**: Gemeldetes/Eingereichtes Volumen, Produktivität, Einkommen, Kundenzahl

### Pipeline (CRM)
Einzel-Einträge mit: Name, Typ, Betrag, Datum, Notizen.

**Typen:** Notartermin in Vorlage · KAI S2 Termin · Reservierungsberatung · Neuer Interessent · BGA Anmeldung

Einträge speisen automatisch die Übersicht und den Monthly-Tab.

### Training
Push/Pull/Legs/Optional — je Übung 3–4 Sätze mit Wdh + kg Eingabe, täglich gespeichert.

### TV Mode
Fullscreen-Ansicht (Button oben rechts) mit Live-Uhr und 3 großen Karten: Notartermine in Vorlage · KAI S2 · Einkommen MTD. Für Büro-TV geeignet. Schließen mit ESC.

---

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Struktur & alle Tabs |
| `styles.css` | Design (hell, clean, blauer Akzent) |
| `app.js` | Gesamte App-Logik |

## Datenspeicherung

Alle Daten lokal im Browser (`localStorage`, Key: `fw_dashboard_v2`). Kein Server, kein Cloud-Sync. Export: Browser-DevTools → Application → Local Storage.

## Ziel

**GM · 01.03.2028**
