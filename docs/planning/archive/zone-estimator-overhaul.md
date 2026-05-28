# Zone Estimator Overhaul — Analysis & Implementation Plan

_Datum: 2026-05-29 · Skriven som: statistisk analytiker + träningsforskare_

---

## 1. Problemrapport — vad är fel och varför

### 1.1 Observerade symptom

| Symptom | Värde | Förväntat |
|---|---|---|
| LT1 (Combined) | 138 bpm (75% maxHR) | 148–155 bpm (80–84% maxHR) |
| LT2 (Combined) | 147 bpm (80% maxHR) | 158–168 bpm (86–91% maxHR) |
| LT1-tempo | 5:15/km | ~4:20–4:35/km |
| LT2-tempo | 4:45/km | ~3:45–4:10/km |
| Laps only | No data | Borde ge data |
| Kalibreringens metod | "fallback" | "statistical" |

Samtliga trösklar understigs med 10–20 bpm. Det är inte ett litet systematiskt fel — det är ett fundamentalt metodfel.

---

### 1.2 Root-cause analys

#### Bug 1 (PRIMÄR): `zoneProximity`-vikten förstör bucket-percentilen

Nuvarande kod beräknar viktat 80:e percentil-HR per bucket:

```typescript
const zoneProximity = hrFrac >= 0.62 && hrFrac <= 0.85 ? 1.5 : 0.75;
return { gap, hr: r.avgHR, weight: tempWeight * recency * zoneProximity * raceBoost };
// ... används sedan i viktad 80:e percentil per bucket
```

**Felet:** `zoneProximity` sätts till 1.5 för HR i 62–85% av maxHR (ca 114–156 bpm för maxHR=184). I snabba tempo-buckets (t.ex. 4:45/km) är de flesta löparna vid 88–93% maxHR (162–171 bpm). Dessa får vikt 0.75. De FÅ datapunkter som råkar ha HR under 156 bpm i den bucketen (t.ex. värmerensning av ett intervallpass, GPS-glitch) får vikt 1.5 — dubbelt så hög.

**Konsekvens:** Det viktade 80:e percentilen i snabba buckets dras ned mot ~80–85% maxHR (156 bpm) istället för att reflektera den verkliga 80:e percentilen (165–172 bpm). Hela HR:tempo-kurvan ser "plattare" ut och LT2-breakpointen placeras vid fel (för låg HR, för långsamt tempo).

**Analogin:** Man vill mäta genomsnittslönen i ett företag men ger direktörens lön halv vikt för att den är "utanför normalzonen." Resultatet underskattar systematiskt lönespridningen.

**Fix:** Beräkna bucket-HR med **oviktat** (count-based) 80:e percentil. Vikterna (recency, temperatur, raceBoost) används enbart i regressionssteget via `bucketWeights`, inte inuti bucket-HR-beräkningen.

---

#### Bug 2: Cooldown-filtret tar bort för mycket data → Laps Only = tomt

```typescript
const isHardActivity = actMaxHR > maxHR * 0.87;  // 0.87 × 184 = 160 bpm
// exclude laps: isHardActivity && lap.hr < maxHR * 0.80  // 147 bpm
```

Med maxHR=184 klassas alla aktiviteter där maxHR överstiger 160 bpm som "hård." Det innefattar de flesta löpningar — till och med lugna aeroba runs brukar ha ett enstaka GPS-spike eller hjärtslagsökning. Alla deras laps under 147 bpm filtreras bort.

**Konsekvens:** Nästan alla laps i easy-zonen tas bort. Laps Only-estimatorn får ingen data och returnerar null.

**Fix:** Ta bort cooldown-filtret helt. Det löser ett problem (cooldown-laps med inflerad HR) men skapar ett värre (tar bort all träningsdata). Det ursprungliga 80:e percentil-bucketsystemet är tillräckligt robust mot enskilda cooldown-laps — de är alltid en minoritet i varje bucket.

---

#### Bug 3: 2-segmentsoptimering av LT2 ≠ jointoptimering

Nuvarande LT2-sökning:
```typescript
// Steg 1: Hitta bp1 med 2-segments LS (LT2 marginalt)
for (let i = 1; i < nb - 2; i++) {
  const err = segErr(0, i) + segErr(i, nb-1);  // ignorerar bp2
  ...
}
// Steg 2: D-max för bp2 (LT1) givet bp1
```

**Felet:** Den marginala 2-segmentssökningen för bp1 hittar en annan breakpoint än den som den ursprungliga joint 3-segmentsoptimeringen hittade. Eftersom LT2-bucketen ofta har ett modererat (inte extremt) lutningsskifte, kan den 2-segments-optimala bp1 hamna i fel position. Den joint-optimala bp1 tar hänsyn till att bp2 (LT1) "tar hand om" den lätta zonen.

**Fix:** Återgå till joint 3-segment LS för LT2-placering. Behåll D-max-konceptet men som refinement (se §2.3).

---

#### Bug 4: D-max från fältdata är opålitlig för LT1

D-max (Cheng et al. 1992) är designad för laboratoriedata med täta, jämnt fördelade ansträngningsnivåer (t.ex. 20 steg i ett VO2max-test). Fältdata har:

- Ojämn fördelning (massor av easy-laps, få threshold-laps)
- Hög intra-bucket-variation
- Felplacerad LT2-ankarpunkt (Bug 3) → fel kordadragning → fel D-max

Dessutom: den aktuella D-max-implementeringen hittar max positiv deviation FRÅN LT2-bucketen till LÅNGSAMMASTE bucketen. Om LT2-bucketen är felplacerad (för långsamt) är hela kordan fel.

**Fix:** Ersätt D-max med VT1/VT2-hastighetskvotsmetoden (se §2.3).

---

#### Bug 5: Kalibreringens data-path vs stats-sidans data-path

`updateHRZones()` (kalibrering, "Estimera zoner"-knappen) och `updateVO2maxAndPaces()` (auto-path, stats-sidan) använder **olika datasätt med olika filter**. Kalibreringen har striktare filter (≥4km, ≥900s, WU/CD-filtrering på aktivitetsnamn) som kan utesluta tillräckliga data för statistical-metoden. Resultatet: statistical estimatorn lyckas på stats-sidan (visas R²=0.98) men misslyckas på kalibreringens path.

**Fix:** Bör använda identisk dataselektion. Alternativt: enhetlig estimator-klass som båda path:ar anropar med samma argument.

---

## 2. Ny modelldesign

### 2.1 Principer

1. **Bucket-HR mäts utan biasade vikter** — oviktad percentil för bucket-representation
2. **Joint optimering** — LT2 och LT1 placeras simultant med joint 3-segment LS
3. **LT1 från fysiologisk kvot** — inte från geometrisk algoritm på brusig fältdata
4. **Enhetlig dataselektion** — samma filter för stats-visning och kalibrering
5. **Separata, oberoende estimatorer** — ingen kodar ett "aktivt" resultat in i ett annat

---

### 2.2 Bucket-byggnad (fix av Bug 1 + 2)

```
För varje datapunkt (löpning/lap):
  - GAP-korrigering av tempo (Minetti 2002)
  - Recency-halvering: exp(-daysAgo / halfLife)
  - Temperaturvikt: 0.35 vid >25°C, 0.75 vid 20–25°C, 1.0 annars
  - Avvisa >30°C, >96% maxHR, <52% maxHR
  
Bucket HR = oviktat (count-based) P80 av raw HR-värden
  → inga zoneProximity-vikter inuti bucket-beräkningen

Bucket-inflytande i regressionen = 1/sqrt(bucket_count)
  → sparse threshold-buckets ges samma inflytande som täta easy-buckets
  → raceBoost appliceras på enskilda ras-runs via recency×3.0 i data-vikter,
     men påverkar inte bucket-HR-beräkningen
```

Ta bort: `zoneProximity`-vikten från punkt-vikterna.
Ta bort: Cooldown-filtret på laps.

---

### 2.3 LT2-detektering (fix av Bug 3)

Återgå till **joint 3-segment LS** (som i den ursprungliga koden):

```
for bp1 in [1..nb-3]:
  for bp2 in [bp1+1..nb-2]:
    err = segErr(0,bp1) + segErr(bp1,bp2) + segErr(bp2,nb-1)
    if err < bestErr: best = (bp1, bp2)

LT2 = paceArr[bp1]  (snabbare breakpoint)
```

Med bucket-vikter `1/sqrt(count)` är regressionen redan skyddad mot dominans av easy-zonen.

**Sanity check:** LT2 måste vara i intervallet 82–95% maxHR. Om utanför → förkasta result (returnera null).

---

### 2.4 LT1-detektering (fix av Bug 4)

**Byt D-max mot VT1/VT2-hastighetskvotsmetoden:**

Forskning (Londeree 1986, PMC12845794, n=1411):
- VT1/VT2 hastighetskvot ≈ 0.844 (95% CI: 0.82–0.87)
- LT1-hastighet = LT2-hastighet × 0.844
- LT1-pace (s/km) = LT2-pace / 0.844

**Implementering:**
```typescript
const lt1PaceSecPerKm = lt2PaceSecPerKm / 0.844;
// Hitta närmaste bucket i paceArr för att få LT1 HR
const lt1HR = interpolateHR(lt1PaceSecPerKm, paceArr, hrArr);
```

HR-interpolation: linjär interpolation på de två närmaste bucket-punkterna.

**Varför detta är bättre:**
- Robust mot brus (baseras på väl-fastställt LT2-tempo, inte en geometrisk detektion)
- Fysiologiskt välgrundat (stor studie, n=1411)
- Parametrisk → kan justeras med ett enda tal (0.844) om ny forskning motiverar det
- Eliminerar beroendet av tillräckliga threshold-zone-datapunkter (som D-max kräver)

**Sanity check:** LT1 måste vara 74–87% maxHR, och < LT2 − 6 bpm.

---

### 2.5 R²-beräkning (behålls)

```
R² = 1 − bestErr / totalVar  (med bucket-vikter)
```

Threshold: R² ≥ 0.80 för att acceptera statistical-estimatorn.
Threshold ≥ 0.62 för att returnera ett resultat (med lägre konfidens, visas i UI).

---

## 3. Estimatorarkitektur — fyra oberoende modeller

### Princip

Varje estimator är **helt oberoende**. Användaren väljer EN aktiv estimator. Den valda estimatorn laddar sina värden in i HR-zonerna och alla grafer. Ingen estimator läser en annans resultat.

```
┌─────────────────────────────────────────────────────┐
│          ZoneCalibrationButton (UI)                  │
│                                                     │
│  [Statistical]  [Race PBs]  [% maxHR]  [Manual]    │
│       ↓              ↓          ↓          ↓        │
│   kör resp.       kör resp.  kör resp.  kör resp.   │
│   estimator       estimator  estimator  estimator   │
│       ↓              ↓          ↓          ↓        │
│            → sparar till fitnessCache.zones         │
│            → laddar om stats-sidan                  │
└─────────────────────────────────────────────────────┘
```

### Estimator 1: Statistical (från träningsdata)

**Källa:** Alla löpaktiviteter + lap splits sista 2 åren  
**Algoritm:** Joint 3-segment LS för LT2; VT1/VT2-kvot för LT1  
**Kräver:** ≥ 40 datapunkter, ≥ 6 giltiga buckets, R² ≥ 0.80  
**Returnerar:** `{ lt1HR, lt2HR, lt1PaceSecPerKm, lt2PaceSecPerKm, rSquared, method: "statistical" }`

### Estimator 2: Race PBs (befintlig, men utan HR-regressionsbug)

**Källa:** `RaceRecord`-tabellen  
**Algoritm:** Distansspecifika omvandlingsfaktorer → LT2-tempo → LT2 HR via enkel HR-% (INTE via regression)  
**LT2 HR:** `lt2HR = round(maxHR × 0.88)` (standard för vältränade löpare), inte från regression  
**LT1 HR:** `lt1HR = round(lt2HR × 0.844)` (VT1/VT2-kvot)  
**Returnerar:** `{ lt1HR, lt2HR, lt1PaceSecPerKm, lt2PaceSecPerKm, method: "race-pbs" }`

**Notera:** Det nuvarande systemet för att bestämma LT2 HR från HR-pace-regressionen är felaktigt — regressions-extrapolering till snabba tempon ger inflerade värden (97% maxHR observerat). Ersätt med fast fysiologisk procent.

### Estimator 3: % av maxHR (befintlig)

**Källa:** Manuell inmatning av LT1% och LT2%  
**Defaults:** LT1 = 83%, LT2 = 89%  
**Returnerar:** `{ lt1HR, lt2HR, method: "pct-maxhr" }`

### Estimator 4: Manuell (befintlig)

**Källa:** `athleteProfile.manualLT1HR`, `athleteProfile.manualLT2HR`  
**Vinner alltid** om satt — överskriver alla andra estimatorer  

---

## 4. UI-rensningsplan

### 4.1 Zoner-sektionen (Zones tab)

**Behåll:**
- HR zone table (Z1–Z5 med HR-intervall)
- LT1 / LT2 block (HR, tempo, träningsrekommendation)
- ZoneCalibrationButton med 4 separata knappar

**Ta bort:**
- ~~LT1 — Parallel estimates~~ (redan borttaget)
- ~~LT2 — Parallel estimates~~ (redan borttaget)

**Kvar att göra:** Inget nytt behöver tas bort i denna sektion.

### 4.2 ZoneCalibrationButton

Nuvarande layout: dropdown/toggle för metod + kalibreringsknappar.

**Ny layout:** Fyra tydliga separata knappar, var och en anropar sin estimator:

```
┌──────────────────────────────────────────────────────┐
│  HR Zone Calibration                                 │
│                                                      │
│  [Statistical]  [Race PBs]  [% maxHR]  [Manual]      │
│                                                      │
│  Senast uppdaterat: Statistical · R² 0.98 · 2026-05-29 │
└──────────────────────────────────────────────────────┘
```

- Varje knapp kör sin estimator direkt
- Visar vilket estimat som är aktivt (från cache)
- `% maxHR`: öppnar inline LT1%/LT2%-inputs
- `Manual`: öppnar länk till Settings → Athlete Profile

### 4.3 Stats-sektionen (Statistisk zonanalys-kortet)

Ändra displayen av statZones så att det tydligt framgår att detta är ett FÖRHANDSVISNING av vad Statistical-estimatorn skulle ge, INTE de aktiva zonerna. Lägg till "Tillämpa dessa zoner"-knapp direkt i kortet.

**Alternativ (renare):** Ta bort statZones-kortet från stats-sidan helt och hållet. Flytta det till ZoneCalibrationButton som en expanderbar preview. Användaren ser "Vad Statistical-estimatorn uppskattar" i kalibreringspanelen och trycker Apply för att använda.

### 4.4 HR Zones table — visa metodinfo

Lägg till en rad under HR-tabellen som visar:

```
Aktiv metod: Statistical (R² 0.98 · 13 buckets · 2026-05-28)
```

Tydlig, minimal, inte intrusive.

---

## 5. Implementationsplan

### Fas 1: Fixa bucket-modellen (kritisk)

**Fil:** `lib/fitness/zones.ts` → `estimateZonesFromStatisticalAnalysis()`

**Steg 1.1:** Ta bort `zoneProximity` från punkt-vikterna
```typescript
// Bort:
const zoneProximity = hrFrac >= 0.62 && hrFrac <= 0.85 ? 1.5 : 0.75;
return { gap, hr: r.avgHR, weight: tempWeight * recency * zoneProximity * raceBoost };

// Nytt:
return { gap, hr: r.avgHR, weight: tempWeight * recency * raceBoost };
```

**Steg 1.2:** Ändra bucket-HR till oviktat P80 (count-baserat)
```typescript
// Bort: viktad percentil
const sorted = pts.sort((a, b) => a.hr - b.hr);
const totalW = sorted.reduce(...); let cum = 0, pct80HR = ...;

// Nytt: oviktad percentil
const sortedHR = pts.map(p => p.hr).sort((a, b) => a - b);
const p80idx = Math.floor(sortedHR.length * 0.80);
const pct80HR = sortedHR[Math.min(p80idx, sortedHR.length - 1)];
```

**Steg 1.3:** Behåll bucket-vikter `1/sqrt(count)` i LS-regressionen (påverkas ej).

**Steg 1.4:** Återgå till joint 3-segment LS för LT2 + LT1:
```typescript
let bestErr = Infinity, bp1 = 2, bp2 = 4;
for (let i = 1; i < nb - 2; i++) {
  for (let j = i + 1; j < nb - 1; j++) {
    const err = segErr(paceArr, hrArr, 0, i, bucketWeights) +
                segErr(paceArr, hrArr, i, j, bucketWeights) +
                segErr(paceArr, hrArr, j, nb - 1, bucketWeights);
    if (err < bestErr) { bestErr = err; bp1 = i; bp2 = j; }
  }
}
// LT2 = bp1 (snabbare, högre HR)
// UTAN D-max: LT1 = beräknas med VT1/VT2-kvot nedan
```

**Steg 1.5:** Ersätt D-max med VT1/VT2-kvotbaserad LT1:
```typescript
const lt2PaceSecPerKm = paceArr[bp1];
const lt1PaceTargetSecPerKm = lt2PaceSecPerKm / 0.844;  // PMC12845794

// Hitta närmaste bucket eller interpolera HR
let lt1HR: number;
const lt1Idx = paceArr.findIndex(p => p >= lt1PaceTargetSecPerKm);
if (lt1Idx < 0 || lt1Idx >= nb) {
  lt1HR = Math.round(maxHR * 0.83);  // fallback
} else if (lt1Idx === 0) {
  lt1HR = hrArr[0];
} else {
  const t = (lt1PaceTargetSecPerKm - paceArr[lt1Idx - 1]) / 
            (paceArr[lt1Idx] - paceArr[lt1Idx - 1]);
  lt1HR = Math.round(hrArr[lt1Idx - 1] + t * (hrArr[lt1Idx] - hrArr[lt1Idx - 1]));
}
```

**Steg 1.6:** Ta bort cooldown-filtret i `cache.ts` (både auto-path och `updateHRZones`-path). Enkel radering av isHardActivity-blocket.

**Steg 1.7:** Enhetlig dataselektion — `updateHRZones` och `updateVO2maxAndPaces` använder identiska filter för statLapRuns (utan cooldown-filter).

---

### Fas 2: Fix Race PBs LT2 HR (viktig)

**Fil:** `lib/fitness/zones.ts` → `estimateLTFromRaces()`

Ta bort HR-pace-regressionsanvändning för att bestämma LT2 HR. Sätt istället:
```typescript
const lt2HR = Math.round(maxHR * 0.88);
const lt1HR = Math.round(lt2HR * 0.844);
```

Regression-extrapolering till tempon utanför träningsdata är opålitlig. 88% × maxHR är välbelagt för vältränade löpare (Seiler 2010).

---

### Fas 3: UI-rensning

**Fil:** `app/(dashboard)/stats/stats-client.tsx`

**3.1:** Uppdatera `ZoneCalibrationButton`:
- Fyra separata knappar (Statistical, Race PBs, % maxHR, Manual)
- Varje knapp kör sin endpoint direkt utan shared state
- Visa aktivt estimat och metadata under knapparna

**3.2:** Uppdatera statZones-kortet:
- Lägg till "Tillämpa dessa zoner"-knapp i kortet
- Eller: ta bort kortet och integrera preview i ZoneCalibrationButton

**3.3:** Visa aktiv metod i HR zone table header.

---

### Fas 4: Verifiering (QA)

**4.1 Enhetliga data-checks:**
- Bekräfta att `statLapRuns` i `updateVO2maxAndPaces` och `statLapRunsZones` i `updateHRZones` använder identiska filter
- Bekräfta att "Laps only" ger data (inga filter tar bort all data)

**4.2 Fysiologisk validering:**
- Med maxHR=184: förväntat LT1 ≈ 148–155 bpm (80–84%), LT2 ≈ 158–168 bpm (86–91%)
- R² ≥ 0.80 för Statistical-estimatorn
- Statistical-metod bör väljas när "Estimera zoner" körs (inte fallback)

**4.3 Cross-path-konsistens:**
- Stats-sidans statZones (auto-path) och kalibreringens resultat ska ge liknande LT1/LT2
- Om de skiljer sig >5 bpm → undersök dataselektion

**4.4 Laps Only-test:**
- Byta till "Laps only" → ska visa data
- Skillnad mot Combined: förväntas vara <10 bpm i LT1/LT2 med god data

**4.5 Race PBs-test:**
- Kör Race PBs-estimatorn
- Kontrollera att LT2 HR ≈ 88% × maxHR (= 162 bpm för maxHR=184)
- Kontrollera att LT1 HR ≈ LT2 × 0.844

**4.6 Regression-test:**
- Pressa "Estimera zoner" tre gånger i rad → ska ge identiska värden
- Kontrollera att det inte finns race conditions i cache-uppdateringen

---

## 6. Borttagna features

Följande tas bort permanent (redan delvis gjort):

| Feature | Status | Anledning |
|---|---|---|
| Aerobic decoupling (LT1-estimator) | Borttagen | Opålitlig utan backfill-data |
| Critical Speed (LT2-parallel) | Borttagen | CS ≈ LT2, inte informativt |
| CS-valideringsvarning | Borttagen | Falska positiver |
| HR threshold history-diagram | Borttagen | Tog för mycket data, sällan tillförlitligt |
| D-max LT1-detektion | Tas bort i Fas 1 | Opålitlig på fältdata med fel LT2-ankare |
| Cooldown-filter på laps | Tas bort i Fas 1 | Tar bort för mycket data |
| zoneProximity-vikter i bucket | Tas bort i Fas 1 | Systematisk downbias av höga HR |
| LT2 HR via HR-pace regression (race-pbs) | Tas bort i Fas 2 | Extrapolering utanför data, 97%-maxHR-bug |

---

## 7. Bevarade features

| Feature | Anledning |
|---|---|
| 80:e percentil per bucket (men oviktat) | Robustare mot outliers än median |
| Pool-adjacent-violators (PAV) | Nödvändigt för monoton HR:tempo-kurva |
| Grade-adjusted pace (GAP) | Korrekt för all terräng |
| Recency halvering (90/180 dagar) | Trackrader nutida kondition |
| Temperaturvikt | Värme driver upp HR artificiellt |
| Bucket-vikt 1/sqrt(count) | Förhindrar easy-zon-dominans i regression |
| R²-tröskelvärde 0.80 | Förhindrar dåliga data från att tas |
| Joint 3-segment LS | Återinförs — var korrekt från start |
| VT1/VT2-kvot 0.844 för LT1 | Välbelagd (PMC12845794, n=1411) |

---

## 8. Prioritetsordning

1. **Omedelbart (Fas 1):** `zoneProximity`-fix + oviktat P80 + joint LS + VT1/VT2-kvot + ta bort cooldown-filter → löser alla primärbuggs
2. **Sedan (Fas 2):** Race PBs HR-fix → löser LT2-inflation vid race-pbs-metoden
3. **Sedan (Fas 3):** UI-rensning → renare UX
4. **Sist (Fas 4):** Verifiering → QA-genomgång

Fas 1 är tillräcklig för att lösa användarens omedelbart observerade problem.
