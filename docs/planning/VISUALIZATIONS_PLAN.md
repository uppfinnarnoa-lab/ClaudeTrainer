# TrainingLab — Visualiseringar, Jämförelser & Dataanalys

> **Status:** 2026-05-21 — Bred research + implementationsplan  
> **Syfte:** Vad kan vi utvinna ur 2800+ aktiviteter? Var placeras det?

---

## 1. Långsiktiga prestandatrender (Statistics → Overview / nytt "Trends"-flik)

### 1A. Aerob effektivitetstrend (AEI) — redan delvis implementerat
Implementerat som veckobar. Saknar: 12-månaders glidande medelvärde, annoterat
med viktiga träningsepoker (Base/Build/Peak). Visar om aerob motor förbättras år för år.

### 1B. Paceutveckling per distans över tid
- För varje standard-distans (5K, 10K, HM): best effort per kalenderhalvår
- Linjediagram med trendlinje
- Visar verklig prestationsutveckling, frikopplad från enstaka tävlingar
- **Datakälla:** RaceRecord + activities.bestEfforts

### 1C. HR-drift (cardiac drift) trend
- Senaste 12 månaderna: %-drift av HR under långa pass (>60 min)
- Approximation: avgHR sista 30% av passet ÷ avgHR första 30%
- Kräver splitsMetric — kan beräknas för aktiviteter som synkats individuellt
- **Datakälla:** splitsMetric (partiellt tillgänglig)

### 1D. VO2max/VDOT-kurva per månad
- Estimerat VDOT per månad (rullande 3-månaders fönster)
- Visar karriärens toppvärde och återhämtning efter skador/pauser
- **Datakälla:** Alla races + quality sessions i activities

---

## 2. Säsongsmönster (Statistics → nytt "Seasons"-flik eller Overview)

### 2A. Månadsvis volym — 3-årsöverlay
- Stapeldiagram med jan–dec på X, varje år som en serie
- Visa var träningsvolymen typiskt toppar/dalar (vinterdip, vårbygge etc.)
- **Datakälla:** activities.distance grupperat per månad/år

### 2B. Intensitetsprofil per månad
- Stackat stapeldiagram: % lättpass / % tempopass / % hårda pass per månad
- Visar om träningen periodiseras korrekt (bas → build → peak-mönster)
- **Datakälla:** activities.averageHeartrate + hrZones

### 2C. Bästa träningsblock (top-5 historiskt)
- Identifiera 4-veckorsblock med högst CTL-ökning + prestation
- Visa vad som utmärkte dem (volym, intensitetsfördelning, vila)
- **Datakälla:** DailyLoad-kurvan + activities

### 2D. Aktiv streak — längsta sammanhängande perioder
- Histogram av streak-längder per år
- Längsta streak highlight
- **Datakälla:** activities.startDate

---

## 3. Jämförande analys (Statistics → Overview / Races-sidan)

### 3A. År-för-år volymkarta (heatmap)
- GitHub-stil: varje ruta = en vecka, färg = distans/tid
- 3-4 år side-by-side
- **Datakälla:** activities.distance + startDate
- **Placering:** Statistics → Overview, nytt "History"-avsnitt

### 3B. Prestation per kurs/segment
- Om samma aktivitetsnamn förekommer flera gånger ("Tisdagsbana"):
  plotta tid/km per datum → visar förbättring på specifika banor
- **Datakälla:** activities.name (grupp på keyword) + avgPace

### 3C. Löparkalendern — race progression
- Tidslinje av alla tävlingar med PB-markörerer
- Visa karriärnivå: VDOT-equivalentlinje över tid
- **Placering:** Races & PBs-sidan

### 3D. Bästa vs sämsta träningsperioder (scatter)
- X = CTL, Y = VDOT-estimat per månad
- Visar relationen fitness → prestation
- **Datakälla:** FitnessCache.ctl + racePBs per period

---

## 4. Tävlingsanalys (Activities-sidan / Races-sidan)

### 4A. Pacing-strategi (negativa vs positiva splits)
- För aktiviteter med splitsMetric: beräkna km 1-3 vs sista km
- Scatter: pacing-ratio vs slutresultat
- Visar om du tjänar på negativ splitting
- **Datakälla:** splitsMetric

### 4B. HR-distribution under tävlingar
- Vilken % av tävlingstid spenderas >LT2 (Z4-Z5)?
- Jämför med träning
- **Datakälla:** activities.isRace + averageHeartrate + hrZones

### 4C. Väderkorrelation med prestation
- Scatterplot: temperatur → pace-avvikelse från förväntat
- Beräkna personlig "heat penalty" (sec/km per 5°C)
- **Datakälla:** activities.weatherTemp + avgPace + VDOT-förväntad pace

---

## 5. Skaderisk-indikatorer (Dashboard)

### 5A. Belastningsspets-detektor
- Flagga veckor med >15% ökning i TSS vs 4-veckors medel
- Visa historiska spikemönster kopplat till aktivitetsgap (lediga dagar = potentiell skada)
- **Datakälla:** dailyTSS + activity gaps

### 5B. Löpekonomi-trend
- Pace vid fast HR-nivå (75% maxHR) per 6-veckorsblock
- Försämring kan signalera trötthet/överbelastning
- **Datakälla:** activities.avgPace + avgHR (redan implementerat som RE-proxy)

### 5C. Successivt HR-stegring på lätta pass
- Om avgHR stiger med >5 bpm på identiska lätta pass under 2 veckor → varningsflagga
- **Datakälla:** activities där avgHR < LT1 och namn liknar (keyword matching)

---

## 6. Avancerade löpmetriker (Statistics → Fitness)

### 6A. Critical Speed-kurva från stora dataset
- Med 2800 aktiviteter: beräkna CS för varje 6-månadersfönster
- Plotta CS-trenden över karriären
- Visar verklig uthållighetskapacitet utan att behöva tävla
- **Datakälla:** racePBs + quality sessions per period

### 6B. HR-recovery rate
- Från aktiviteter med HR-data: hur snabbt sjunker HR minuterna efter avslutat
- Bättre återhämtning = bättre kondition
- **Kräver:** stravaStreams (per-sekund data) — tillgänglig on-demand

### 6C. Exponentiell HR-pace modell
- Kurva-fitting: HR = a × pace^b per atletuppgifter
- Extrapolera till teoretisk maxpuls
- Mer datarik version av Firstbeat-modellen
- **Datakälla:** 2800 aktiviteter ger exceptionellt bra kurv-anpassning

### 6D. Effektivitetsindex per väderförhållanden
- Separat AEI för: kallt (<5°C), tempererat (5-20°C), varmt (>20°C)
- Personlig klimatprofil
- **Datakälla:** activities.weatherTemp + avgSpeed + avgHR

---

## 7. Orienteringsspecifikt (Activities-sidan)

### 7A. Terrängfaktor-analys
- OL-pass vs väglöpning: pace-skillnad vid samma HR
- Visa "terrain efficiency" — hur pass på OL-terräng påverkar löpekonomin
- **Datakälla:** activities.name (OL-keywords) + avgPace + avgHR

### 7B. Teknisk träning vs fysisk träning
- Andel OL-aktiviteter per år vs löpning
- Korrelation mellan OL-volym och orientering-specifik form
- **Datakälla:** activities.sportType (orienteering)

---

## 8. Runalyze/intervals.icu-funktioner att implementera

| Funktion | Platform | Prioritet | Tillgänglig data |
|---|---|---|---|
| Prestandautveckling per distans | Runalyze | ⭐⭐⭐ | bestEfforts |
| Månadsvis volymheatmap | intervals.icu | ⭐⭐⭐ | activities |
| CTL vs performance scatter | TrainingPeaks | ⭐⭐ | FitnessCache |
| HR recovery rate | Runalyze | ⭐ | Streams (on-demand) |
| Power estimation (W/kg) | Runalyze | ⭐⭐ | pace+elevation |
| Terrängfaktor | Unik för OL | ⭐⭐ | sportType+pace+HR |
| Streak calendar | Strava + | ⭐⭐ | activities.startDate |

---

## 9. AI-assistent — systematisk historikanalys

### Problem
AI-coachen ser bara senaste 90 dagars aktiviteter och har begränsad verktygstillgång.
När användaren ber om djupanalys behövs tillgång till hela 5-årshistoriken.

### Lösning: `deep_analysis`-verktyg

Nytt tool för AI-coachen som aktiveras vid explicit begäran ("analysera min träningshistorik"):

```typescript
{
  name: "get_full_training_history",
  description: "Fetch comprehensive training history for deep analysis. Use ONLY when user explicitly asks for analysis of their full history, career trends, or multi-year patterns. This fetches large amounts of data.",
  parameters: {
    years: { type: "number", description: "How many years back to fetch (max 5, default 2)" },
    sport: { type: "string", description: "Filter by sport (optional)" },
    include_metrics: { 
      type: "array",
      items: { enum: ["volume", "intensity", "hr_trends", "race_performance", "load_curve"] }
    }
  }
}
```

**Returnerar aggregerad data:**
- Månadsvis volym per sport (sista N år)
- VDOT-trend per kvartal
- Topplöpveckor och bästa träningsblock
- Skade-gap historik (perioder utan aktivitet)
- Progression per distance PR

**Säkerhetsgräns:** Max 5 år, max 2 anrop per konversation (kostnadshantering).

---

## 10. Prioriterad implementationsordning

| # | Feature | Effort | Impact | Tab |
|---|---|---|---|---|
| 1 | Månadsvis volymheatmap (YoY) | Low | ⭐⭐⭐ | Statistics → Overview |
| 2 | Prestandautveckling per distans | Low | ⭐⭐⭐ | Races & PBs |
| 3 | AI deep_analysis verktyg | Medium | ⭐⭐⭐ | Coach |
| 4 | Bästa träningsblock | Medium | ⭐⭐ | Statistics → Load |
| 5 | Pacing-strategi scatter | Medium | ⭐⭐ | Activities / Races |
| 6 | Terrängfaktor OL-analys | Medium | ⭐⭐ | Statistics → Fitness |
| 7 | HR recovery rate | High (streams) | ⭐ | Activity detail |

---

## 11. Research-synthes (webbresearch 2026-05-21)

**Heart Rate Efficiency (HRE)** — distance (km) ÷ avgHR, rullande trend = bästa enskilda indikator
på aerob utveckling. Visar förbättring som pace-data missar (effektivare hjärta = mer per slag).

**Cardiac Drift** — %HR-ökning under lång löpning vid konstant fart. >5% = undertankning eller trötthet.
Kräver splitsMetric men kan approximeras från hel-aktivitet.

**Critical Pace-kurva** — från bästa 3-min + 9-min snitt i stora dataset → konfidensband. Med
2800 aktiviteter: robusta trendinjer per kalenderhalvår. Formula: `(P₃min + P₉min) / 2 × 0.9`

**Periodiseringsdetektion** — elite orienterare kör ~14.9h/v i GPP, ~11.5h/v i SPP, ~10.6h/v
under tävlingssäsong. Klustrera volume+intensitet per månad → detektera faser automatiskt.

**Skaderisk utöver ACWR** — månadsvis volymökning >15% (absolut, inte ratio) + HRV-dip >5%
från baseline = starkare prediktor än ACWR. Kombination av dessa varnar 7-14 dagar i förväg.

**Terrängeffektivitet OL** — separera OL vs väglöpning, beräkna speed-per-slope-ratio.
Identifiera vilka terrängtyper som kostar mest energi (kräver GPS + elevation per sektion).

**Källor:** ArXiv HR efficiency 2024, TrainingPeaks EF, IJSPP Orienteering periodization,
PMC Marathon cardiac drift, NCBI Critical Power, Intervals.icu review.

---

*Last updated: 2026-05-21*
