# Notes — Buggar & idéer

_Datum-format: ÅÅÅÅ-MM-DD. En rad per post. Flytta till archive när löst._

---

## Buggar

<!-- exempel: 2026-05-26 · [BUG] Tooltip på stats-sidan försvinner vid hover på kanten -->

---

## Idéer / features

2026-05-27 · [IDEA] Easy run pace trend-statistik — **IMPLEMENTERAD** (commit 9f756ed)

---

2026-05-28 · [IDEA] Item L — Ersätt LS-breakpoint-sökning för LT1 med modified D-max

**Vad**: I bucket-estimatorn används en exhaustive piecewise linear LS-sökning för att hitta LT1-breakpointen. LS-estimatorn är matematiskt bimodal när sluttpunktsförändringen är liten (Baek 2018) — LT1-knicket är bara ~10–15% lutningsförändring, vilket gör att LS drar breakpointen mot den täta easy-zonen.

**Föreslagen fix**: Ersätt LS-sökningen *för LT1* med **modified D-max**:
1. Fitta ett polynom (grad 3–4) på de buckettade HR:pace-punkterna
2. Dra en linje från första till sista bucketen
3. LT1 = punkten med maximalt vinkelrätt avstånd från den linjen (geometriskt mest "krökt")

LS behålls för LT2 (stor lutningsförändring = pålitlig). PMC20508457 och Jang & Ko (2017) visar att D-max har bättre limits-of-agreement mot referensmetoder än bi-segmented regression för tröskeldetektion.

**Komplexitet**: Måttlig refaktor av `estimateZonesFromStatisticalAnalysis()` i `lib/fitness/zones.ts`. Se `docs/planning/bucket-estimator-improvements.md` Item L för fullständig analys.

---

2026-05-28 · [IDEA] Tanaka-formel som UI-hint i Settings (inte automatisk korrigering)

**Vad**: När `dateOfBirth` är satt, visa bredvid maxHR-fältet: "Åldersformel (Tanaka): 183 bpm" som informationstext. Användaren kan då manuellt justera om data-estimatet avviker mycket.

**Varför inte automatisk korrigering**: Tanaka ±18 bpm 95% CI — för stor individuell variation för att vara "tyst golv". Se Item D-analys i `docs/planning/bucket-estimator-improvements.md`.

**Implementation**: Ren UI-ändring i `app/(dashboard)/settings/page.tsx` — beräkna `208 - 0.7 * age` och rendera som muted text bredvid maxHR-input.

---

2026-05-28 · [IDEA] CS som valideringssignal för LT1/LT2

**Vad**: Critical Speed (CS) justeras nära LT2/MLSS. Eftersom VT1/VT2 hastighetskvotvid ≈ 0.844, bör LT1-hastigheten ligga i intervallet [CS × 0.77, CS × 0.91]. Om bucket-estimatorn ger ett LT1 utanför detta intervall → visa varning i kalibreringspanelen ("LT1 estimate may be inaccurate — consider manual calibration").

**Komplexitet**: Liten — CS beräknas redan i cache. Kräver att CS-värdet passas till zones-logiken som ett sanity-check.

<!-- exempel: 2026-05-26 · [IDEA] Visa träningsbelastning som heatmap per månad -->

---

## Övrigt
Väderstatistik
Backfill - Hr estimat och kurva going back