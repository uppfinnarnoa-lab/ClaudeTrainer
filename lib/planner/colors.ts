/**
 * Centralized color logic for the planner.
 *
 * Running → color depends on workout TYPE:
 *   Race / Tävling          → Yellow       #FBBF24
 *   Easy run / Distans      → Ljusblå      #7DD3FC
 *   Tempo                   → Grönturkos   #2DD4BF
 *   LT (Lactate Threshold)  → Rosa         #F472B6
 *   AT (Aerobic Threshold)  → Lila         #818CF8
 *   Speedwork / Intervall   → Mörkblå      #3B82F6
 *
 * Other sports → color depends on SPORT:
 *   Cycling / Cykel         → Orange  #FB923C
 *   Orienteering / OL       → Teal    #14B8A6
 *   Strength / Styrka / Gym → Amber   #F97316
 *   Nordic Skiing           → Ice     #BAE6FD
 *   Roller Skiing           → Sky     #38BDF8
 *   Swimming                → Blue    #60A5FA
 *
 * Status markings (separate from color — overlaid on the pill):
 *   Completed  → green left border  #22C55E
 *   Missed     → red left border    #EF4444
 *   Planned (past, unlogged) → orange accent border
 */

// ── Workout type / sport colors ──────────────────────────────────────────

export const STATUS_COLORS = {
  completed: "#22C55E",
  missed:    "#EF4444",
  partial:   "#F97316",
  unlogged:  "#FBBF24", // past workout not yet marked
  planned:   null,      // future — uses workout color only
} as const;

export function workoutColor(sportName: string, typeName?: string | null): string {
  const s = sportName.toLowerCase();
  const t = (typeName ?? "").toLowerCase();

  // Competition / race / tävling → yellow for ANY sport
  if (/tävl|race|lopp|mila|stafett|sic\b|2dagars|competition|comp\b/.test(t)) return "#FBBF24";

  // Non-running sports → colour by sport
  if (/cycl|ride|cykel|bike/.test(s)) return "#FB923C";       // orange
  if (/orienteer|ol\b/.test(s))        return "#14B8A6";       // teal (distinct from tempo)
  if (/strength|styrka|gym|weight/.test(s)) return "#D97706";  // amber (distinct from orange)
  if (/nordicski|klassisk|backcountry|längdski/.test(s)) return "#BAE6FD"; // ice blue
  if (/rollerski|rullski/.test(s))     return "#38BDF8";       // sky blue
  if (/swim|sim/.test(s))              return "#60A5FA";       // blue

  // Running (and trail run, virtual run) → colour by type
  if (/run|trail|virtual/.test(s)) {
    if (/tävl|race|lopp|mila|stafett|sic\b|2dagars|competition|comp\b/.test(t)) return "#FBBF24"; // yellow  — race
    if (/\bat\b|aerob tröskel|aerobic threshold/.test(t))                         return "#818CF8"; // lila    — AT  (check before LT)
    if (/\blt\b|tröskel|threshold|lång tröskel|lactate/.test(t))                  return "#F472B6"; // rosa    — LT
    if (/\btempo\b/.test(t))                                                       return "#2DD4BF"; // grönturkos — Tempo
    if (/speed|speedwork|intervall|interval|fartlek|tabata|korta|mosse|4x|5x/.test(t)) return "#3B82F6"; // mörkblå — Speedwork
    return "#7DD3FC"; // ljusblå — easy / distans / default
  }

  return "#7DD3FC"; // fallback
}

/** Colour from a sport name alone (for non-running sports in templates) */
export function sportOnlyColor(sportName: string): string {
  return workoutColor(sportName, null);
}

/** The border/indicator colour that shows completion status, layered ON TOP of workout colour */
export function statusBorderColor(
  status: string,
  workoutDate: string,
): string | null {
  if (status === "completed" || status === "partial") return STATUS_COLORS.completed;
  if (status === "missed")                             return STATUS_COLORS.missed;
  // Past workout not yet logged
  const isPast = workoutDate < new Date().toISOString().split("T")[0];
  if (status === "planned" && isPast)                  return STATUS_COLORS.unlogged;
  return null; // future planned — no status border
}
