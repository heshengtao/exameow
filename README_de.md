<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Exameow — KI-gestützter Generator für Prüfungsfragen: Lernmaterialien hochladen, Prüfungsfragen in Sekundenschnelle erhalten">
</p>

<p align="center">
  <a href="https://github.com/heshengtao/exameow/releases"><img src="https://img.shields.io/github/v/release/heshengtao/exameow?style=flat-square&color=1A6CFF" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-1A6CFF?style=flat-square" alt="Lizenz: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20/%20macOS%20/%20Linux%20/%20Android%20/%20Web-1A6CFF?style=flat-square" alt="Plattformen: Windows, macOS, Linux, Android, Web">
  <a href="https://hub.docker.com/r/ailm32442/exameow"><img src="https://img.shields.io/docker/pulls/ailm32442/exameow?style=flat-square&color=1A6CFF" alt="Docker-Downloads"></a>
</p>

<p align="center">
  <a href="README_zh.md"><b>简体中文</b></a> ·
  <a href="README_zh_TW.md"><b>繁體中文</b></a> ·
  <a href="README.md"><b>English</b></a> ·
  <a href="README_ja.md"><b>日本語</b></a> ·
  <a href="README_ko.md"><b>한국어</b></a> ·
  <a href="README_es.md"><b>Español</b></a> ·
  <a href="README_fr.md"><b>Français</b></a> ·
  <a href="README_de.md"><b>Deutsch</b></a> ·
  <a href="README_ru.md"><b>Русский</b></a> ·
  <a href="README_ar.md"><b>العربية</b></a>
</p>

<p align="center">
  <a href="https://exam.superagentparty.com/"><b>Live-Demo</b></a> ·
  <a href="https://github.com/heshengtao/exameow/releases">Download</a> ·
  <a href="https://hub.docker.com/r/ailm32442/exameow">Docker Hub</a>
</p>

## Was ist Exameow?

**Exameow (过了喵)** ist ein **Open-Source KI-Prüfungsfragengenerator**, der Ihre Lernmaterialien in Sekundenschnelle in prüfungsreife Fragen verwandelt. Laden Sie PDFs, Word-Dokumente, PowerPoint-Präsentationen, Bilder oder Text hoch — die KI liest den Inhalt und erstellt auf Ihre Bedürfnisse zugeschnittene Einfachauswahl-, Mehrfachauswahl-, Wahr/Falsch-, Lückentext- und Kurzantwort-Fragen.

Im Gegensatz zu anderen KI-Quiz-Generatoren, die Kontoregistrierungen oder kostenpflichtige Abonnements erfordern oder Ihre Daten in die Cloud senden, ist Exameow **Local-First und auf Datenschutz ausgerichtet**. Ihre Fragenkataloge, Übungsprotokolle und Fehler-Historien bleiben auf Ihrem Gerät. Die Desktop- und Mobil-Apps funktionieren **vollständig offline** mit Ihrem eigenen OpenAI-kompatiblen API-Schlüssel (OpenAI, DeepSeek, Qwen, GLM oder jedem selbst gehosteten Modell).

Für Lehrkräfte und Trainer enthält Exameow ein integriertes **Online-Prüfungssystem** — veröffentlichen Sie Prüfungen aus Ihren lokalen Fragenkatalogen, teilen Sie einen 6-stelligen Code und Studierende nehmen über jeden beliebigen Browser teil. Sofortige Auswertung, Lehrer-Dashboard und Anti-Missbrauchsschutz sind inklusive. Hosten Sie den gesamten Stack mit einem einzigen Docker-Befehl selbst.

<p align="center">
  <a href="https://exam.superagentparty.com/"><img src="screenshots/Cover.png" width="100%" alt="Exameow Desktop- und Mobil-Oberfläche"></a>
</p>

## Live-Demo

Online ausprobieren: **[exam.superagentparty.com](https://exam.superagentparty.com/)**

Die Demo läuft auf Cloudflare Workers mit dem kostenlosen Workers-AI-Tarif:

- ⏳ **Tägliches Kontingent ist begrenzt** — Cloudflares kostenloses KI-Kontingent wird täglich zurückgesetzt
- 📄 **Kontextfenster-Begrenzung** — Große Dokumente werden gekürzt, um in das Kontextfenster des Modells zu passen

Für unbegrenzte Nutzung hosten Sie die Anwendung selbst mit Docker oder nutzen Sie die Desktop-/Mobil-Apps mit Ihrem eigenen API-Schlüssel.

## Funktionen

### ✨ KI-Fragenerstellung — Dateiverarbeitung & Prüfungsgenerierung

Exameow analysiert Lernmaterialien in **über 10 Dateiformaten** — PDF, DOCX, XLSX, PPTX, EPUB, ODT, TXT, CSV, HTML sowie Bilder (PNG/JPG/WEBP/GIF/BMP). Laden Sie eine Datei hoch oder ziehen Sie mehrere Dateien per Drag & Drop hinein. Die KI generiert Fragen in **5 Fragetypen**: Einfachauswahl, Mehrfachauswahl, Wahr/Falsch, Lückentext und Kurzantwort. Steuern Sie die Anzahl der Fragen pro Typ, den Schwierigkeitsgrad (einfach/mittel/schwer), die Ausgabesprache sowie die Themen- oder Kapitelfilterung. Große Dokumente werden automatisch aufgeteilt und in Batches mit Duplikatsprüfung generiert. Funktioniert mit jeder OpenAI-kompatiblen API — OpenAI, DeepSeek, Qwen, GLM etc. — oder nutzen Sie die integrierte kostenlose Cloudflare-KI auf der Demo-Website. Exportieren Sie die Ergebnisse als XLSX oder CSV.

- **Umfangreiche Eingabeformate** — PDF, DOCX, XLSX, PPTX, EPUB, ODT, TXT, CSV, HTML, Bilder (PNG/JPG/WEBP/GIF/BMP) und jede Text-/Codedatei; Mehrdatei-Upload per Drag & Drop
- **5 Fragetypen** — Einfachauswahl, Mehrfachauswahl, Wahr/Falsch, Lückentext, Kurzantwort mit Steuerung der Anzahl pro Typ
- **Feingranulare Steuerung** — Schwierigkeit (einfach/mittel/schwer), Ausgabesprache und Themen-/Kapitelfilterung
- **Intelligente Batch-Verarbeitung** — Große Dokumente werden automatisch aufgeteilt und in Batches mit Duplikatsprüfung generiert
- **Jede OpenAI-kompatible API** — OpenAI, DeepSeek, Qwen, GLM etc.; oder nutzen Sie die integrierte kostenlose Cloudflare-KI in der Demo
- **Export** — Ergebnisse als XLSX oder CSV herunterladen

### 📚 Übungsmodi — Intelligenter lernen, nicht härter

Verwandeln Sie generierte Fragen in interaktive Lernsitzungen. Üben Sie sequenziell, mischen Sie Fragen und Optionen zufällig oder legen Sie eine zeitgesteuerte Probeklausur mit automatisch erstellten Bogen ab. Falsch beantwortete Fragen werden automatisch erfasst und wiederholt — beantworten Sie eine Frage mehrmals hintereinander richtig, wird sie aus der Fehlerliste entfernt. Wechseln Sie frei zwischen Prüfungsmodus (blind antworten) und Karteikartenmodus (Antworten sichtbar). Kurzantwort-Fragen werden von der KI anhand von Referenzantworten bewertet, wobei eine manuelle Nachbewertung unterstützt wird. Importieren und exportieren Sie Fragenkataloge über XLSX/CSV mit intelligenter Spaltenzuordnung.

- **Sequenzielles Üben** — Gehen Sie den Fragenkatalog der Reihe nach durch
- **Zufallsorientiertes Üben** — Fragen und Optionen zufällig gemischt für bessere Merkfähigkeit
- **Probeklausur** — Automatische Erstellung einer zufälligen Prüfung aus jedem Katalog mit konfigurierbarer Typenanzahl
- **Fehler-Wiederholung** — Erfassen Sie Fehler, üben Sie gezielt falsche Fragen und sehen Sie zu, wie sie bei Fortschritt gelöscht werden
- **Prüfungs- / Karteikartenmodus** — Blind antworten oder Fragen mit sichtbaren Antworten durchblättern
- **KI-Bewertung** — Kurzantworten werden von der KI anhand der Referenzantwort mit Feedback bewertet; manuelle Nachbewertung unterstützt
- **Verwaltung von Fragenkatalogen** — Importieren Sie Kataloge aus XLSX/CSV mit intelligenter Spaltenzuordnung; jederzeit exportierbar

### 📝 Online-Prüfungen — Veröffentlichen und Studierende einladen

Stellen Sie Prüfungen aus mehreren lokalen Fragenkatalogen mit konfigurierbarer Fragenanzahl und Punktevergabe pro Typ zusammen. Legen Sie Titel, Startzeit und Prüfungsdauer fest. Teilen Sie einen **6-stelligen Code** oder Prüfungslink — Studierende nehmen über den Browser jedes beliebigen Geräts teil, ohne App-Installation. Ein lokaler Countdown-Timer mit automatischer Abgabe sorgt für Fairness; der Fortschritt bleibt beim Aktualisieren der Seite erhalten. Objektive Fragen werden beim Einreichen serverseitig ausgewertet, Antworten und Erklärungen werden sofort angezeigt. Das Lehrer-Dashboard zeigt nach Punktzahl sortierte Ergebnisse mit Detaileinsicht pro Frage. Prüfungsdaten werden aus Datenschutzgründen nach 7 Tagen automatisch gelöscht. Anti-Missbrauch: 20 Veröffentlichungen pro IP und Tag, Ein-Klick-Meldungen von Studierenden sperren die Prüfung automatisch ab 3 Meldungen von unterschiedlichen IPs. Das **Docker-Image ist vollständig autark** — das Prüfungssystem läuft auf SQLite ohne Abhängigkeit von der Demo-Website.

- **Prüfungen aus Katalogen starten** — Prüfungen aus mehreren lokalen Katalogen mit Fragenanzahl und Punkten pro Typ zusammenstellen; Titel, Startzeit und Dauer festlegen
- **6-stelliger Code + Prüfungslink** — Teilnahme über jeden Gerät-Browser ohne App-Installation
- **Zeitgesteuerte Sitzungen** — Lokaler Countdown mit automatischer Abgabe; Fortschritt bleibt beim Seitenneuladen erhalten
- **Sofortige Auswertung** — Objektive Fragen werden serverseitig mit Antworten und Erklärungen bei der Abgabe bewertet; Ergebnisse lokal gespeichert
- **Lehrer-Dashboard** — Nach Punktzahl sortierte Ergebnisse mit Detailansicht pro Frage; lokal zwischengespeichert, sodass Ergebnisse nach Prüfungsende nur einmal abgerufen werden; Lehrkräfte können Prüfungen jederzeit löschen (sperrt den Zugang sofort und löscht Ergebnisse)
- **Datenschutz an erster Stelle** — Prüfungsdaten verbleiben maximal 7 Tage auf Cloudflare D1 vor der automatischen Löschung; Antworten werden vor der Abgabe niemals an Studierende gesendet
- **Anti-Missbrauchs-Mechanismus** — Limit von 20 Veröffentlichungen pro IP und Tag; Meldung von Studierenden sperrt automatisch ab 3 verschiedenen IPs; Administratoren prüfen, stellen wieder her oder löschen über `#/admin`
- **Vollständig selbst gehostet** — Das Docker-Image enthält dasselbe Prüfungssystem (SQLite) ohne Abhängigkeit von der Demo-Website; nutzen Sie `ADMIN_TOKEN` zur Sicherung der Admin-Seite (Standard `pass`, muss beim ersten Besuch von `#/admin` geändert werden)

### 🔍 Suchmodi — Antworten schnell finden

Durchsuchen Sie lokale Fragenkataloge durch Eingabe oder Einfügen einer Frage — die optionale KI-Beantwortung liefert Erklärungen. Die **Foto-Suche** nutzt On-Device-OCR zur Erkennung von Fragen über Ihre Kamera oder hochgeladene Bilder (Verarbeitung erfolgt lokal im Browser, kein Upload). Die **Kamera-Live-Suche** richtet Ihre Kamera auf einen Bildschirm oder ein Papier und die KI sucht in Echtzeit nach passenden Fragen. Die **Bildschirmaufnahme-Suche** ermöglicht das Zeichnen eines Erfassungsrahmens über jedem Fenster — die KI überwacht diesen und zeigt Antworten in einem schwebenden Overlay an (Windows/macOS/Linux/Android; auf iOS aufgrund von Systembeschränkungen nicht verfügbar).

- **Textsuche** — Frage eingeben oder einfügen, um Treffer in lokalen Katalogen zu finden, mit optionalen KI-Antworten
- **Foto-Suche** — Foto einer Frage aufnehmen oder hochladen; On-Device-OCR (läuft lokal im Browser, kein Upload)
- **Kamera-Live-Suche** — Kamera auf Bildschirm/Papier richten; KI überwacht und gleicht Fragen in Echtzeit ab
- **Bildschirmaufnahme-Suche** — Erfassungsrahmen über beliebigem Fenster zeichnen; KI überwacht und findet Fragen live mit schwebendem Antwort-Overlay (Windows / macOS / Linux / Android; auf iOS aufgrund von Systembeschränkungen nicht verfügbar)

### 🌐 Cross-Plattform & Datenschutz — Ihre Daten, Ihr Gerät

Exameow läuft auf **Windows, macOS, Linux, Android und Web** (iOS via Selbstkompilierung). Bereitstellung der Webversion mit **einem Docker-Befehl**. Alle Fragenkataloge, Übungsprotokolle und Fehler-Historien werden lokal gespeichert — nichts wird auf einen Server hochgeladen, es sei denn, Sie nutzen das Online-Prüfungssystem. API-Schlüssel werden auf dem Desktop mit **AES-256-GCM** verschlüsselt. Die Benutzeroberfläche erkennt automatisch die System-Sprache mit Schnellumschaltung.

- **Desktop & Mobil** — Windows, macOS, Linux, Android (iOS via Selbstkompilierung)
- **Self-Hosted Web** — Docker-Ein-Befehl-Deployment
- **Local-First** — Fragenkataloge und Protokolle bleiben auf Ihrem Gerät; API-Schlüssel auf dem Desktop mit AES-256-GCM verschlüsselt
- **Zweisprachige / Mehrsprachige UI** — Automatische Erkennung der Systemsprache, Umschaltung mit einem Klick

## Installation

Die vorgebauten Installationspakete für alle Plattformen sind auf der [GitHub Releases](https://github.com/heshengtao/exameow/releases)-Seite verfügbar.

### Plattform-Unterstützung

| Plattform | Status | Download |
|-----------|--------|----------|
| Windows | ✅ Unterstützt | `.msi`-Installer / portable `.zip` |
| macOS (Apple Silicon / Intel) | ✅ Unterstützt | `.dmg` (siehe Release-Notes zur Quarantäne-Entfernung) |
| Linux (x86_64 / ARM64) | ✅ Unterstützt | `.AppImage` / `.deb` |
| Android (ARM64) | ✅ Unterstützt | `.apk` |
| iOS | ⚠️ Selbstkompilierung erforderlich | Siehe Hinweis unten |
| Web / Docker (Self-Hosted) | ✅ Unterstützt | Docker-Image |

> **Hinweis zu iOS:** Ein Apple-Entwicklerzertifikat kostet 99 $/Jahr, daher wird vorerst kein vorgebautes iOS-Paket bereitgestellt — Sie müssen es selbst mit Xcode kompilieren (`pnpm tauri ios build`). Sollten zukünftige Spenden die Zertifikatskosten decken, wird ein offiziell signierter iOS-Build auf GitHub Releases veröffentlicht.

### Docker (Self-Hosted)

```bash
git clone https://github.com/heshengtao/exameow.git
cd exameow

# Frontend bauen
cd frontend && pnpm install && pnpm build && cd ..

# KI-Anbieter konfigurieren
export AI_ENDPOINT=https://api.openai.com/v1
export AI_API_KEY=sk-ihr-schluessel-hier
export AI_MODEL=gpt-4o

# Bauen und ausführen
docker compose up -d --build
```

Öffnen Sie `http://localhost:3000`.

> **🔐 Admin-Token (erforderlich für die Online-Prüfungsverwaltung):** Die Admin-Seite unter `http://localhost:3000/#/admin` ist durch `ADMIN_TOKEN` geschützt. Wenn Sie dieses nicht festlegen, ist der Standardwert **`pass`** und Sie werden **beim ersten Login gezwungen, es zu ändern**, bevor Sie Aktionen ausführen können. Um dies zu überspringen, legen Sie es beim Start fest:
>
> ```bash
> ADMIN_TOKEN=ihr-starkes-token docker compose up -d --build
> ```
>
> Das geänderte Token bleibt im Volume `exameow-data` (`/app/data/admin_token.txt`) über Container-Neustarts hinweg erhalten. Prüfungsdaten (SQLite) werden im selben Volume gespeichert.

### Docker (Vorgebautes Image)

```bash
docker pull ailm32442/exameow:latest
docker run -d -p 3000:3000 \
  -e AI_ENDPOINT=https://api.openai.com/v1 \
  -e AI_API_KEY=sk-ihr-schluessel-hier \
  -e AI_MODEL=gpt-4o \
  -e ADMIN_TOKEN=ihr-starkes-token \
  -v exameow-data:/app/data \
  ailm32442/exameow:latest
```

Wenn `ADMIN_TOKEN` nicht gesetzt ist, ist der Standardwert `pass` und muss beim ersten Besuch von `/#/admin` geändert werden.

## Umgebungsvariablen

| Variable | Standard | Beschreibung |
|----------|----------|--------------|
| `AI_ENDPOINT` | `https://api.openai.com/v1` | OpenAI-kompatibler API-Endpunkt |
| `AI_API_KEY` | — | Ihr KI-API-Schlüssel |
| `AI_MODEL` | `gpt-4o` | Zu verwendendes Standardmodell |
| `PORT` | `3000` | Server-Listen-Port |
| `STATIC_DIR` | `/app/static` | Verzeichnis für statische Dateien |
| `ADMIN_TOKEN` | `pass` | Admin-Seiten-Token; `pass` erzwingt eine Änderung beim ersten Login unter `/#/admin` |
| `EXAM_DB_PATH` | `/app/data/exameow.db` | SQLite-Pfad für das Online-Prüfungssystem |
| `ADMIN_TOKEN_FILE` | `/app/data/admin_token.txt` | Speicherort des geänderten Admin-Tokens |
| `RUST_LOG` | `info` | Log-Level |

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/api/models` | Verfügbare KI-Modelle auflisten |
| `POST` | `/api/generate` | Datei hochladen + Prüfungsfragen generieren |
| `GET` | `/api/export` | Fragen als CSV exportieren |
| `POST` | `/api/export/xlsx` | Fragen als XLSX exportieren |
| `POST` | `/api/config/save` | KI-Konfiguration speichern |
| `GET` | `/api/config/load` | Gespeicherte KI-Konfiguration laden |

### Prüfungsfragen generieren (Beispiel)

```bash
curl -X POST http://localhost:3000/api/generate \
  -F "file=@lernmaterial.pdf" \
  -F 'params={"question_types":["single_choice","multi_choice"],"count":10,"difficulty":"medium","language":"German"}'
```

## Architektur

Exameow verfügt über eine **Drei-Backend-Architektur**, die sich ein Vue-3-Frontend teilt. Die gleiche SPA erkennt zur Laufzeit automatisch die Plattform und leitet an das entsprechende Backend weiter:

- **Tauri (Desktop/Mobil)**: Rust-Befehle in `src-tauri/` rufen direkt die Rust-Kernbibliothek auf.
- **Cloudflare Workers**: TypeScript in `workers/` nutzt Cloudflare AI + D1 für das Online-Prüfungssystem.
- **Axum (Self-Hosted/Docker)**: Rust-HTTP-Server in `packages/server/` mit SQLite für das Prüfungssystem.

Die Kernlogik (Dateiparser, KI-Client, Prüfungsgenerierung, Export) befindet sich in der gemeinsamen Rust-Crate `packages/core/` und ist in TypeScript für den Workers-Pfad dupliziert.

## Häufig gestellte Fragen (FAQ)

### Wie generiere ich Prüfungsfragen aus einer PDF-Datei?

Laden Sie Ihre PDF-Datei per Drag & Drop auf der [Demo-Website](https://exam.superagentparty.com/) oder in der Desktop-App hoch. Wählen Sie die Fragetypen (Einfachauswahl, Mehrfachauswahl, Wahr/Falsch, Lückentext, Kurzantwort), legen Sie die Anzahl der Fragen und die Schwierigkeit fest und klicken Sie auf Generieren. Die KI liest Ihr Dokument und erstellt in Sekundenschnelle Fragen. Die Ergebnisse können als XLSX oder CSV exportiert werden.

### Ist Exameow wirklich kostenlos?

Ja. Exameow ist Open Source unter Apache 2.0 und 100 % kostenlos. Keine kostenpflichtigen Tarife, keine Enterprise-Stufen, keine Funktionseinschränkungen. Die Demo-Website bietet kostenlose KI-Generierung (begrenzt durch das tägliche Kontingent des kostenlosen Cloudflare-Tarifs). Für Desktop-/Mobil-Apps benötigen Sie Ihren eigenen KI-API-Schlüssel, den Sie direkt an Ihren KI-Anbieter zahlen — Exameow berechnet Ihnen niemals etwas.

### Kann ich Exameow offline nutzen?

Ja. Die Desktop- und Mobil-Apps funktionieren vollständig offline. Fragenkataloge, Übungsprotokolle und Fehler-Historien werden lokal gespeichert. Eine Internetverbindung ist nur erforderlich, wenn die KI-API zur Fragenerstellung aufgerufen wird.

### Welche KI-Modelle unterstützt Exameow?

Jede OpenAI-kompatible API funktioniert: OpenAI (GPT-4o, GPT-4, GPT-3.5), DeepSeek, Qwen, GLM und selbst gehostete Modelle über Ollama oder Ähnliches. Sie können auch die integrierte kostenlose Cloudflare-KI auf der Demo-Website nutzen.

### Wie funktioniert die Online-Prüfungsfunktion?

Lehrkräfte veröffentlichen Prüfungen aus lokalen Fragenkatalogen mit einem 6-stelligen Code. Studierende nehmen von jedem Browser aus mit diesem Code oder einem geteilten Link teil. Die Prüfung ist zeitlich begrenzt mit automatischer Abgabe. Objektive Fragen werden sofort ausgewertet. Prüfungsdaten werden nach 7 Tagen automatisch gelöscht. Self-Hoster erhalten dasselbe System über Docker.

### Sind meine Daten sicher?

Ja. Standardmäßig verbleiben alle Daten (Fragenkataloge, Übungsprotokolle, API-Schlüssel) auf Ihrem Gerät. API-Schlüssel werden mit AES-256-GCM verschlüsselt. Die einzige Ausnahme sind Online-Prüfungsdaten, die vorübergehend auf Cloudflare D1 (7 Tage automatische Löschung) oder in Ihrem selbst gehosteten SQLite gespeichert werden.

## Entwicklung

```bash
# Rust-Server
cargo run -p exameow-server

# Frontend-Entwicklungsserver
cd frontend && pnpm dev

# Tauri-Desktop-App
pnpm tauri dev
```

### Projektstruktur

```
exameow/
├── frontend/          # Vue 3 SPA
├── packages/
│   ├── core/          # Gemeinsame Rust-Bibliothek (KI, Parser, Export, Konfiguration)
│   ├── server/        # Axum HTTP-Server
│   └── shared/        # Gemeinsame TypeScript-Typen
├── src-tauri/         # Tauri Desktop- + Mobil-App
├── workers/           # Cloudflare Workers (Hono)
├── scripts/           # Build- und Deployment-Skripte
├── Dockerfile
└── docker-compose.yml
```

## Haftungsausschluss

- Dieses Projekt ist ein **Open-Source-Lernwerkzeug**, das ausschließlich für das persönliche Studium, den Unterricht und interne Schulungen bestimmt ist.
- **Die Genauigkeit von KI-generierten Inhalten wird nicht garantiert.** Fragen und Erklärungen können Fehler enthalten — bitte prüfen Sie diese vor der Verwendung. Die Autoren übernehmen keine Haftung für Folgen, die aus der Nutzung generierter Inhalte entstehen.
- **Benutzergenerierte Inhalte (UGC) liegen in der alleinigen Verantwortung des Veröffentlichers.** Nutzen Sie die Online-Prüfungsfunktion nicht zur Speicherung oder Verbreitung rechtswidriger, urheberrechtsverletzender oder sensibler Inhalte. Der Betreiber kann Regelverstöße ohne Vorankündigung entfernen. Meldekanäle: ① Die integrierte **Melden-Schaltfläche** auf jeder Prüfungsseite — wenn 3 oder mehr unterschiedliche IPs dieselbe Prüfung melden, wird deren Link **automatisch gesperrt und unzugänglich gemacht**, bis eine Prüfung durch den Administrator erfolgt; ② GitHub Issues. Bestätigte Verstöße werden entfernt; fälschlicherweise gesperrte Prüfungen können vom Administrator wiederhergestellt werden.
- Die Demo-Website (exam.superagentparty.com) ist ein kostenloser öffentlicher Dienst **ohne Garantie für Verfügbarkeit oder Datendauerhaftigkeit** (Prüfungsdaten werden maximal 7 Tage aufbewahrt). Sichern Sie wichtige Daten selbst.
- Durch die Nutzung dieses Projekts akzeptieren Sie alle damit verbundenen Risiken und stimmen zu, die Gesetze Ihrer Gerichtsbarkeit einzuhalten.

## Unterstützung

### Geben Sie uns einen Stern!
⭐ Ihre Unterstützung ist der Antrieb für uns, weiter voranzukommen!

### Spenden willkommen!
<div align="center" style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/agentparty)
[![爱发电](https://img.shields.io/badge/爱发电-支持我们-946ce6?style=for-the-badge&logo=affine&logoColor=white)](https://afdian.com/a/agentparty)

</div>

### Folgen Sie uns
<div align="center">
  <a href="https://space.bilibili.com/26978344">
    <img src="screenshots/B.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="bilibili"/>
  </a>
  <a href="https://www.youtube.com/@agentParty">
    <img src="screenshots/YT.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="youtube"/>
  </a>
</div>

### Treten Sie der Community bei
Wenn Sie Fragen oder Probleme mit dem Projekt haben, sind Sie herzlich eingeladen, unserer Community beizutreten.

1. QQ-Gruppe: `931057213` (Voll) / `902882342` (Gruppe 2)

2. Discord: [Discord-Link](https://discord.gg/f2dsAKKr2V)

## Mitwirkende

<a href="https://github.com/heshengtao/exameow/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=heshengtao/exameow" alt="Mitwirkende von heshengtao/exameow" />
</a>

## Lizenz

Apache-2.0

## Lizenzen Dritter

Dieses Projekt verwendet Open-Source-Software von Drittanbietern. Eine vollständige Liste der Abhängigkeiten, ihrer Lizenzen und Lizenz-URLs finden Sie in [THIRD_PARTY_LICENSES.csv](THIRD_PARTY_LICENSES.csv).
