Zeitrechner + automatischer ATOSS-Handoff

Inhalt:
- index.html -> Zeitrechner
- atoss-zeitrechner.user.js -> Tampermonkey-Script für ATOSS

So funktioniert es:
1. index.html auf GitHub Pages bereitstellen
2. Tampermonkey-Script in Tampermonkey anlegen und aktivieren
3. In ATOSS erscheint:
   - "Zum Zeitrechner"
   - "Auto-Sync: Aus/An"
4. Klick auf "Zum Zeitrechner" öffnet/aktualisiert den Zeitrechner automatisch mit den sichtbaren ATOSS-Daten
5. Auto-Sync aktualisiert den Zeitrechner automatisch alle 2 Sekunden, wenn sich die sichtbaren Einträge ändern

Wichtig:
- kein Clipboard nötig
- kein externer Server
- kein Schreiben in ATOSS
- nur Browser-Weitergabe per URL
