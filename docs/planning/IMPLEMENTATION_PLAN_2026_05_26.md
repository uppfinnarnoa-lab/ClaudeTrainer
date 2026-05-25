# Implementationsplan — 2026-05-26

Se även: [Security Audit](../security/SECURITY_AUDIT_2026_05_26.md)

---

## Fixar gjorda i denna session

| # | Vad | Filer |
|---|---|---|
| ✅ | Competition/tävling → gul för ALLA sporter i colors.ts | `lib/planner/colors.ts` |
| ✅ | Svart bar längst ned i planner — ändrat till `md:h-screen` | `app/(dashboard)/planner/page.tsx` |
| ✅ | Drag-and-drop tillåter idag (ej bara framtid) | `components/planner/PlannerCalendar.tsx`, `WorkoutPill.tsx` |
| ✅ | Block-bakgrundsfärg synligare (opacity `0D` → `22`) | `components/planner/PlannerCalendar.tsx` |
| ✅ | Manuell maxHR/restHR i settings triggar omedelbar recalibrering | `app/api/settings/profile/route.ts` |
| ✅ | Strength-färg ändrad till #D97706 (skild från orange #FB923C) | `lib/planner/colors.ts` |

---

## Kan decoupling och HR-pace regression estimera LT2?

**Kort svar:** Ja för HR-pace regression, nej för decoupling.

**HR-pace regression:**
LT2 (anaerob tröskel, ~FTP) syns som en deflektionspunkt i HR/pace-kurvan — den punkt där pace-effektiviteten bryter ned snabbt. Den statistiska zonsanalysen i `lib/fitness/zones.ts` (`estimateZonesFromStatisticalAnalysis`) estimerar redan LT1 OCH LT2 via bucketed deflektionspunkter och returnerar `lt2HR`. Denna används för HR-zoners z4-gräns. Alltså: LT2 estimeras redan.

**Aerob decoupling:**
Decoupling mäter drift i Z2-träningspass (steady-state under LT1). Det säger ingenting om LT2 direkt — det är per definition ett LT1-fenomen. Man kan inte använda decoupling för att estimera LT2 utan att göra specifika tröskeltester eller använda andra datatyper (t.ex. MLSS-test, kritisk hastighet från BP-analys).

**Möjlig utbyggnad:** Kritisk hastighet (Critical Speed) från best efforts — tangentpunkten i speed-duration-kurvan — ger en bra proxy för LT2/FTP. Det finns delvis data för detta redan via `bestEfforts`. Detta kan implementeras som ett tredje parallellt estimat.

---

## Prioriterad backlog

### P1 — Säkerhetsåtgärder (se security audit)

Se [docs/security/SECURITY_AUDIT_2026_05_26.md](../security/SECURITY_AUDIT_2026_05_26.md).

**Prioriterat att fixa:**
- [ ] **H1** Login brute-force rate limiting — IP-räknare i `authorize()` i `auth.ts`
- [ ] **H4** Security headers — lägg till `headers()` + `poweredByHeader: false` i `next.config.ts`
- [ ] **H5+H6** OAuth redirect_uri + state-parameter — hardkoda från `NEXTAUTH_URL`, lägg till CSRF-cookie
- [ ] **M7** `Cache-Control: public` → `private` på `/api/activities/[id]/streams`
- [ ] **H2** OAuth tokens (Strava/Garmin) krypteras i DB — wrap med `encryptIfNeeded/safeDecrypt`
- [ ] **M2+M3** FK ownership-check för WorkoutType och WorkoutTemplate
- [ ] **L2** Deployment hardening (ufw, fail2ban, chmod 600 på .env.local)

---

### P2 — Edit aktivitet = samma formulär som add template

**Nuläge:** `WorkoutEditModal` används för att redigera framtida planerade workouts. `WorkoutBuilder` används för att skapa nya (inkl. templates). De är helt separata komponenter.

**Mål:** Klick på en framtida workout öppnar `WorkoutBuilder` i edit-läge (pre-populerat med befintlig data), inte `WorkoutEditModal`.

**Plan:**
1. Utöka `WorkoutBuilder` props med `editWorkout?: PlannedWorkout` (parallellt med befintlig `editTemplate`)
2. Vid edit-mode: pre-populera builder med workoutens data (sport, typ, distans, tid, sektioner)
3. Save → `PUT /api/planner/workouts/:id` med ny data
4. Ta bort `WorkoutEditModal` eller bevara som fallback för enkla uppdateringar (status, datum)
5. I `planner-client.tsx`: byt `setEditWorkout` → öppna builder med `editWorkout` prop

**Formulärskillnad:** `WorkoutBuilder` har en "Spara som template"-checkbox. För redigering av befintlig workout: checkbox default unchecked, visa som "Uppdatera även template" om workout är länkad till en template.

---

### P3 — Templates — "Spara som template" alltid checked

**Nuläge:** WorkoutBuilder har en checkbox "Spara som template" som kan vara unchecked.

**Plan:**
- När `WorkoutBuilder` öppnas via "New template" (från TemplateLibrary): dölj checkboxen, spara alltid som template
- Lägg till `mode: "template" | "workout" | "edit"` prop till WorkoutBuilder
- I "template" mode: ingen checkbox, alltid sparas till `workoutTemplates`
- I "workout" mode (dag-klick): checkbox visas, optional
- I "edit" mode: checkbox visas som "Uppdatera template" om workout har templateId

---

### P4 — Lägga till types manuellt för alla sporter

**Nuläge:** I settings (sports), kan typer läggas till för sporter. Kontrollera om UI begränsar till bara Running-sporter — bug om så.

**Plan:**
- Läs `app/(dashboard)/settings/sports-client.tsx` och verifiera att alla sporter kan ha typer tillagda
- Om buggy: se till att "Add type"-knappen visas för alla SportCategory-poster, inte bara Running
- Competition-typ: ge tydlig hint i UI: "Tip: lägg till en 'Competition'-typ för alla idrotter för att få gul färg automatiskt"

---

### P5 — PB-tracker: anpassade distanser och multi-activity linking

**Nuläge:** PB-tracker visar standard tävlingsdistanser från `raceRecord`-tabellen. En aktivitet kan vara länkad till ett lopp via `RaceActivity`-tabellen.

**Mål:**
1. Användaren kan lägga till egna distanser (t.ex. "17km Stafett", "42.5km Ultra") i PB-trackern
2. En enskild Strava-aktivitet kan vara kopplad till FLERA PB-poster (t.ex. samma lopp räknas som 10km-PB och halvmarathon-PB om det var en dubbelstafett)
3. Anpassade distanser visas i prediktionstabellen på stats-sidan

**Plan:**

**Schema:**
```prisma
model CustomPBDistance {
  id        String   @id @default(cuid())
  userId    String
  label     String   // "Stafett 4x2km"
  distanceM Float    // 8000
  user      User     @relation(fields: [userId], references: [id])
  @@unique([userId, label])
}
```

**PB linking:**
- `raceRecord` har `activityId String?` — gör om till many-to-many
- Ny junction-tabell `RaceRecordActivity { raceRecordId, activityId }`
- Uppdatera PB-tracker UI för multi-select av kopplade aktiviteter

**API:**
- `POST /api/pb-distances` — skapa/ta bort anpassad distans
- `GET /api/pb-distances` — lista
- Uppdatera `GET /api/stats` — inkludera anpassade distanser i prediktioner

---

### P6 — Drag and drop mellan dagar (förbättringar)

**Nuläge (efter fix):** Drag från WorkoutPill fungerar för idag + framtid. Drop på idag + framtid fungerar.

**Kvarstående:**
- [ ] Visuell feedback vid drag (opacity på WorkoutPill under drag)
- [ ] `handleMoveWorkout` i `planner-client.tsx` — verifiera att API-anropet är `PUT /api/planner/workouts/:id` med `{ date: newDate }`
- [ ] Toast/konfirmation efter flytt
- [ ] Undo-möjlighet (snooze 5 sek med undo-knapp)

---

### P7 — Block-hue synligare i kalenderrader

**Nuläge (efter fix):** Opacity ökad till `22` hex (~13%). Fortfarande subtil.

**Förbättringar:**
- [ ] Visa blockfärg som en tunn stripe i vänsterkanten av varje dagcell (3px vänsterborder i blockfärg) — tydligare utan att förstöra läsbarheten
- [ ] I PlannerCalendar: om `blockHere`, lägg till en `borderLeftColor: blockHere.color` + `borderLeftWidth: 3`
- [ ] BlockBanner "hue" ska matcha — bakgrundsfärg i veckoraden för block-veckor

---

### P8 — Critical Speed som tredje LT2-estimat

**Nuläge:** LT1 estimeras via HR-pace regression och aerob decoupling. LT2 via statistisk zonsanalys.

**Plan:**
```typescript
// lib/fitness/critical-speed.ts
export function estimateCriticalSpeed(
  bestEfforts: Array<{ distance: number; elapsed_time: number }>
): { cs: number; anaerobi: number } | null
// Critical Speed (CS) = intercept of 1/distance vs time regression
// W' (anaerobic capacity) = slope
// Returns CS in m/s (= LT2-proxy)
```
- CS visas som parallellt LT2-estimat i HRZoneTable på stats-sidan
- Kräver minst 3 best efforts på olika distanser (200m–10km)

---

### P9 — Security: HTTP headers i next.config.ts

```typescript
// next.config.ts
poweredByHeader: false,
async headers() {
  return [{
    source: "/(.*)",
    headers: [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ],
  }];
},
```
**Notera:** CSP kräver whitelist för CartoDB tiles och eventuell Leaflet CDN (om ej self-hosted). Implementera CSP i separat steg.

---

### P10 — Security: login rate limiting

```typescript
// auth.ts — i authorize() callback
const ip = "server"; // NextAuth v5 ger inte req direkt i authorize(), använd server-state
// Alternativ: custom route handler för credentials POST
```
Primär approach: Intercept `/api/auth/callback/credentials` POST i en custom route och applicera DB-backed räknare (5 försök / 15 min per IP) innan delegering till NextAuth handlers.

---

## Färgschema — referens

| Sport/typ | Hex | Tailwind |
|---|---|---|
| Competition / Tävling (ALLA sporter) | `#FBBF24` | yellow-400 |
| Running — Easy / Distans | `#7DD3FC` | sky-300 |
| Running — Tempo | `#2DD4BF` | teal-400 |
| Running — LT/Tröskel | `#F472B6` | pink-400 |
| Running — AT/Aerob tröskel | `#818CF8` | indigo-400 |
| Running — Speedwork/Intervall | `#3B82F6` | blue-500 |
| Cycling | `#FB923C` | orange-400 |
| Orienteering | `#14B8A6` | teal-500 |
| Strength/Gym | `#D97706` | amber-600 |
| Nordic Skiing | `#BAE6FD` | sky-200 |
| Roller Skiing | `#38BDF8` | sky-400 |
| Swimming | `#60A5FA` | blue-400 |
| Completed (status) | `#22C55E` | green-500 |
| Missed (status) | `#EF4444` | red-500 |
| Unlogged past (status) | `#FBBF24` | yellow-400 |

**Alla färger är unika** (Strength ändrades från `#F97316` → `#D97706` för att särskilja från Cycling orange `#FB923C`). Competition delar gul med "unlogged past" — detta är medvetet (tävling = gult är prioriterat och visas annorlunda).

---

_Uppdaterat: 2026-05-26_
