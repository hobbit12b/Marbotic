# Flitsvis – educatief spel groep 1-2

Een iPad-first flitsspel rond het thema **De mooiste vis van de zee**. Het leerdoel is hoeveelheden herkennen zonder één-voor-één te tellen.

## Didactische opzet

- De hoeveelheid verschijnt kort en verdwijnt vóór het kind antwoordt.
- Startniveau is instelbaar op 1–3, 1–4 of 1–6.
- Het spel schaalt pas op na meerdere goede eerste antwoorden, met extra aandacht voor de hoogste hoeveelheden in het actieve bereik.
- Bij een fout verschijnt dezelfde hoeveelheid nog eenmaal langer en gegroepeerd.
- Standaard maximum is 8; 7–9 zijn bewust een plusuitdaging met gestructureerde groepjes. Het hoofddoel blijft t/m 6.
- Na 15 rondes staat in het leerkrachtvenster een korte resultaatanalyse per hoeveelheid.

## Marbotic

De meegeleverde oude JavaScript-library bevat niet de originele Marbotic Smart Numbers-patronen. Daarom gebruikt Flitsvis een lokale kalibratie:

1. Open het tandwiel.
2. Zet **Marbotic gebruiken** aan.
3. Tik in *Marbotic kalibreren* op cijfer 1.
4. Plaats dat fysieke cijfer drie keer op de iPad en til het tussendoor op.
5. Herhaal dit voor de cijfers die je wilt gebruiken.

De kalibratie vergelijkt de vorm van de drie gelijktijdige touchpunten via schaal- en rotatie-onafhankelijke driehoeksverhoudingen. De gegevens blijven alleen in `localStorage` van die browser/iPad.

## Gebruik op iPad

Open de GitHub Pages-versie in Safari. Na het eerste bezoek cachet de service worker de spelbestanden voor offline gebruik. Voeg de pagina desgewenst via **Deel > Zet op beginscherm** toe.

## Bestanden

- `index.html` – schermen en leerkrachtvenster
- `styles.css` – iPad-layout, onderwaterstijl en animaties
- `app.js` – spelregels, adaptiviteit, resultaten en Marbotic-kalibratie
- `sw.js` – eenvoudige offline cache
- `manifest.webmanifest` / `icon.svg` – web-app metadata
