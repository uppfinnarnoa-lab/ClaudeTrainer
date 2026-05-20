/**
 * AI Coach tool definitions and executor.
 * Tools let the AI create/read planned workouts and update the athlete profile.
 *
 * Both Claude (tools array) and Gemini (functionDeclarations) use these.
 * The executor runs server-side; results are returned to the AI as tool_result.
 */

import { prisma } from "@/lib/db/prisma";
import { addDays, format } from "date-fns";

// ── Tool schema (Claude format — converted to Gemini format in the Gemini client) ──

export const COACH_TOOLS = [
  {
    name: "create_workout",
    description:
      "Add a planned workout session to the training calendar. Use this when the athlete asks to schedule training.",
    input_schema: {
      type: "object" as const,
      properties: {
        date:              { type: "string", description: "Date in YYYY-MM-DD format" },
        name:              { type: "string", description: "Workout name, e.g. 'Lätt löpning 8km' or 'Tröskelintervaller'" },
        sportType:         { type: "string", description: "Sport: Run | Cycling | NordicSki | RollerSki | WeightTraining | Other" },
        targetDurationMin: { type: "number", description: "Target duration in minutes (optional)" },
        targetDistanceKm:  { type: "number", description: "Target distance in km (optional)" },
        targetIntensity:   { type: "string", description: "Intensity: Easy | Moderate | Hard | Race (optional)" },
        notes:             { type: "string", description: "Additional notes, workout description, or instructions (optional)" },
      },
      required: ["date", "name", "sportType"],
    },
  },
  {
    name: "get_upcoming_plan",
    description: "Fetch the athlete's upcoming planned workouts. Use this to check what's already scheduled before adding new sessions.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: { type: "number", description: "How many days ahead to fetch (default: 14, max: 60)" },
      },
    },
  },
  {
    name: "delete_workout",
    description: "Remove a planned workout from the calendar. Use only when the athlete explicitly asks to cancel or remove a session.",
    input_schema: {
      type: "object" as const,
      properties: {
        workoutId: { type: "string", description: "The ID of the workout to delete" },
      },
      required: ["workoutId"],
    },
  },
  {
    name: "update_profile",
    description: "Update the athlete's profile data. Use when the athlete states new goals, reports weight changes, or updates training history.",
    input_schema: {
      type: "object" as const,
      properties: {
        primaryGoal:    { type: "string", description: "Primary training goal, e.g. 'sub-38 10K', 'orienteering elite'" },
        yearsTraining:  { type: "number", description: "Years of structured training" },
        weightKg:       { type: "number", description: "Body weight in kg" },
      },
    },
  },
] as const;

// Gemini uses "functionDeclarations" with slightly different key names
export function toGeminiTools() {
  return COACH_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  }));
}

// ── Executor ──────────────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  message: string;       // shown in the chat as an action card
  data?: unknown;        // passed back to the AI model as tool_result content
}

export async function executeCoachTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  try {
    switch (toolName) {

      case "create_workout": {
        const date = new Date(input.date as string);
        if (isNaN(date.getTime())) return { success: false, message: "Ogiltigt datum.", data: "error: invalid date" };
        const workout = await prisma.plannedWorkout.create({
          data: {
            userId,
            name:            input.name as string,
            sportType:       input.sportType as string,
            date,
            targetDuration:  input.targetDurationMin ? Math.round((input.targetDurationMin as number) * 60) : null,
            targetDistance:  input.targetDistanceKm  ? (input.targetDistanceKm as number) * 1000 : null,
            targetIntensity: input.targetIntensity as string | null ?? null,
            notes:           input.notes as string | null ?? null,
            status:          "planned",
          },
        });
        const dateStr = format(date, "EEE d MMM");
        return {
          success: true,
          message: `Lade till: ${workout.name} · ${dateStr}`,
          data: `Created workout ${workout.id}: "${workout.name}" on ${dateStr}`,
        };
      }

      case "get_upcoming_plan": {
        const days = Math.min(60, Math.max(1, (input.days as number) ?? 14));
        const workouts = await prisma.plannedWorkout.findMany({
          where: {
            userId,
            date:   { gte: new Date(), lte: addDays(new Date(), days) },
            status: "planned",
          },
          orderBy: { date: "asc" },
          select: { id: true, name: true, sportType: true, date: true, targetDistance: true, targetDuration: true, notes: true },
        });
        if (workouts.length === 0) {
          return { success: true, message: `Inga planerade pass de nästa ${days} dagarna.`, data: "No planned workouts." };
        }
        type W = { id: string; name: string; sportType: string; date: Date; targetDistance: number | null; targetDuration: number | null; notes: string | null };
        const list = (workouts as W[]).map(w => {
          const dateStr = format(new Date(w.date), "EEE d MMM");
          const dist = w.targetDistance ? ` ${(w.targetDistance / 1000).toFixed(0)}km` : "";
          const dur  = w.targetDuration ? ` ${Math.round(w.targetDuration / 60)}min` : "";
          return `${dateStr}: ${w.name} (${w.sportType})${dist}${dur} [id:${w.id}]`;
        }).join("\n");
        return { success: true, message: `Plan (${days}d)`, data: list };
      }

      case "delete_workout": {
        const wid = input.workoutId as string;
        const existing = await prisma.plannedWorkout.findUnique({ where: { id: wid }, select: { userId: true, name: true } });
        if (!existing || existing.userId !== userId)
          return { success: false, message: "Pass hittades inte.", data: "error: not found" };
        await prisma.plannedWorkout.delete({ where: { id: wid } });
        return { success: true, message: `Raderade: ${existing.name}`, data: `Deleted workout "${existing.name}"` };
      }

      case "update_profile": {
        const data: Record<string, unknown> = {};
        if (input.primaryGoal   !== undefined) data.primaryGoal   = input.primaryGoal;
        if (input.yearsTraining !== undefined) data.yearsTraining = input.yearsTraining;
        if (input.weightKg      !== undefined) data.weightKg      = input.weightKg;
        if (Object.keys(data).length === 0)
          return { success: false, message: "Inga värden att uppdatera.", data: "error: empty update" };
        await prisma.athleteProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
        const parts = Object.entries(data).map(([k, v]) => `${k}=${v}`).join(", ");
        return { success: true, message: `Profil uppdaterad: ${parts}`, data: `Profile updated: ${parts}` };
      }

      default:
        return { success: false, message: `Okänt verktyg: ${toolName}`, data: `error: unknown tool ${toolName}` };
    }
  } catch (e) {
    console.error(`[coach-tool] ${toolName} failed:`, e);
    return { success: false, message: "Verktyget misslyckades.", data: `error: ${e instanceof Error ? e.message : "unknown"}` };
  }
}
