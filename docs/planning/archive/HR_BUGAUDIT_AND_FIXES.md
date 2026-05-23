# HR Estimering — Full Bug Audit + Alla Fixes

> **Status:** 2026-05-21 — Buggar identifierade, åtgärder planerade

---

## 1. LT1 / LT2 — Definitioner (vad är vad?)

**LT1 (Lactate Threshold 1 = Aerob tröskel)**
- Första punkten där laktat börjar stiga ≈ 2 mmol/L
- Under LT1 = Z1-Z2 = lätta/aeroba pass
- Typiskt ≈ 75-80% HRmax

**LT2 (Lactate Threshold 2 = Anaerob tröskel / Laktattröskel)**
- Punkten där laktatanhopning överstiger clearance ≈ 4 mmol/L
- LT2-tempo = halvmaratontempo (ca)
- Typiskt ≈ 85-91% HRmax

**Korrekt zonstruktur:**
```
Z1 Recovery:   restHR → LT1 - buffer       (under LT1)
Z2 Aerobic:    LT1 - buffer → LT1          (vid LT1-golvet)
Z3 Tempo:      LT1 → LT2                   (mellan LT1 och LT2)
Z4 Threshold:  LT2 → LT2 + 8 bpm          (vid LT2)
Z5 VO2max:     LT2 + 8 → maxHR
```

**Zones.ts nuläge:**
- `z3[0]` = LT1 (underkant Z3 = LT1) ✓
- `z4[0]` = LT2 (underkant Z4 = LT2) ✓

**Buggar i terminologin:**

### BUG-1: "Training range" för LT1 visar Z3 (tempo) — FELAKTIGT
- `atTrainingRange = [zones.z3[0], zones.z4[0]]` = [LT1, LT2] = tempo-zonen
- Men "aerob träning" (LT1-träning) sker i Z2, UNDER LT1
- Ska vara: `atTrainingRange = [zones.z2[0], zones.z2[1]]` = Z2-zonen
- **Fix:** Ändra `atTrainingRange` till Z2 och byta namn till "Aerobic base training"

### BUG-2: Training range visas i fel ordning
- `ltTrainingRange` = [LT2, 91% maxHR] → visas som "169–173"
- Stämmer tekniskt (LT2 = 169, 91% = ~173), men **"training range" borde vara bredare**
- Threshold-träning sker i Z4 + lite Z5 = [LT2, LT2+12] ungefär
- **Fix:** Visa Z4 som LT2-träningszon istället

### BUG-3: LT-estimaten stämmer inte med visade zoner
- `stats/page.tsx` beräknar `ltBounds = ltBoundaries(hrZones)` — läser från `hrZones`
- Men `hrZones` kan vara beräknad MED de kalibrerade zonerna OR med default-formeln
- Om kalibrerade zoner används men LT-display beräknas om från `ltBoundaries()` = kan ge diskrepans
- **Fix:** Säkerställ att LT1/LT2 i displayen alltid kommer från `hrZones.z3[0]` / `hrZones.z4[0]`
  (vilket de borde, men kontrollera konsekvensen)

### BUG-4: AI-coachen använder fel zoner (context-builder)
- `context-builder.ts` bygger HR-zoner med `buildHRZones(maxHR, restHR)` direkt
- Ignorerar de kalibrerade zonerna i FitnessCache
- **Fix:** Läs `fitnessCache.zones` om tillgängligt, annars fall back

---

## 2. Calibrate/Route — Skriver fortfarande till profile (FIXAT)
✅ Borttaget i förra commit

---

## 3. AthleteProfile.maxHeartRate = 190 (FIXAT)
✅ Rensat ur DB

---

## 4. Model Selector-knappar syns inte i Fitness-fliken

**Orsak:** I fast-path returneras `modelPredictions = {}` och `modelVdots = {}`.
FitnessMetrics visar inte selector-panelen när `Object.keys(modelVdots).length <= 1`.
`modelVdots` har bara `{ "Weighted (default)": vdot }` → panels villkor: `> 1` → visas inte.

**Fix:** Fyll alltid in åtminstone 2-3 modell-poster i fast path från `vo2max.breakdown`.
(Broken i fast path, funkar i slow path)

---

## 5. / Kommando i AI-chat — laddar exempelprompt istället för tomt

**Nuläge:** `selectTool(tool.example)` → sätter exempeltext som input
**Önskat:** Välj verktyg → lägg till verktygsetikett + kolon som prefix, låt user skriva
**Fix:**
```typescript
function selectTool(toolLabel: string, toolDescription: string) {
  setInput("");  // töm input
  setSelectedToolHint({ label: toolLabel, desc: toolDescription });
  setShowToolMenu(false);
  textareaRef.current?.focus();
}
```
Visa sedan en liten tag ovanför inputfältet: `[get_activities_in_range] Skriv din fråga...`

---

## 6. "Hitta mina tisdagsbanor" returnerade fel resultat

**Orsak:** `search_activities` kör AI:s tool-check först (fas 2 i chat/route.ts).
Om AI:n inte detekterar tool-use, faller den igenom till normal streaming och svarar
från sin 90-dagars kontext (utan att kalla verktyget).

**Möjlig fix:**
- Aktiviteter kan ha "Tisdagsbana!" (med utropstecken) i Strava-namn
- Bekräfta att `{ contains: "tisdagsbana", mode: "insensitive" }` hittar det
- Alternativt: gör search_activities till ett WRITE_TOOL-krav att kalla explicit

---

## 7. Race Records — koppla till aktiviteter från samma datum (§12 VISUALIZATIONS)

**Bakgrund:** Många PBs i RaceRecord-tabellen saknar `stravaActivityId`.
Matchningslogik: leta efter löpaktiviteter med `startDate ≈ record.date ±1 dag`
och `distance ≈ record.distanceM ±10%`.

**Script:** `scripts/match-pbs-to-activities.mjs`
```
1. Hämta alla RaceRecord utan stravaActivityId
2. För varje: sök Activity WHERE sportType=Run AND date BETWEEN record.date-1 AND record.date+1
3. Filtrera: distans ±10% av record.distanceM
4. Matcha bäst och uppdatera stravaActivityId
```

---

## 8. Vägfilter — ta bort från Races & PBs

Filterknappen "Vägfilter på / Visa alla" i races-client.tsx döljer OL-pass.
Användaren vill inte ha detta filter alls.
**Fix:** Ta bort smartFilter-state och hela filterknappen.

---

## 9. PMC Paper Relevans: https://pmc.ncbi.nlm.nih.gov/articles/PMC10765723/

Undersöka om artikeln (troligen om HRmax estimation från submaximal data eller 
HR-baserade modeller) kan förbättra vår estimering.
**Action:** Läsa artikeln och notera relevanta algoritmer i detta dokument.

---

## 10. Implementationsordning

| # | Fix | Filer | Prioritet |
|---|---|---|---|
| 1 | LT1/LT2 visning + training range | stats-client.tsx | ⭐⭐⭐ |
| 2 | AI-context använder kalibrerade zoner | context-builder.ts | ⭐⭐⭐ |
| 3 | Model selector i fast path | stats/page.tsx | ⭐⭐ |
| 4 | / kommando — töm input, visa hint | ChatInterface.tsx | ⭐⭐ |
| 5 | Match PBs till aktiviteter | script | ⭐⭐ |
| 6 | Ta bort vägfilter | races-client.tsx | ⭐ |
| 7 | Tisdagsbana-sökning debug | tools.ts / chat | ⭐⭐ |
| 8 | Bygg och pusha | — | ⭐⭐⭐ |

---

*Last updated: 2026-05-21*
