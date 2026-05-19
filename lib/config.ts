// Resolve integration credentials: DB first, env vars as fallback.
// This lets users configure everything via the Settings UI.

import { prisma } from "@/lib/db/prisma";

export interface AppCredentials {
  stravaClientId:     string;
  stravaClientSecret: string;
  garminClientId:     string;
  garminClientSecret: string;
}

let _cache: { userId: string; creds: AppCredentials; at: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30s — avoids a DB hit on every API call

export async function getCredentials(userId: string): Promise<AppCredentials> {
  if (_cache && _cache.userId === userId && Date.now() - _cache.at < CACHE_TTL_MS) {
    return _cache.creds;
  }

  const config = await prisma.appConfig.findUnique({ where: { userId } });

  const creds: AppCredentials = {
    stravaClientId:     config?.stravaClientId     || process.env.STRAVA_CLIENT_ID     || "",
    stravaClientSecret: config?.stravaClientSecret || process.env.STRAVA_CLIENT_SECRET || "",
    garminClientId:     config?.garminClientId     || process.env.GARMIN_CLIENT_ID     || "",
    garminClientSecret: config?.garminClientSecret || process.env.GARMIN_CLIENT_SECRET || "",
  };

  _cache = { userId, creds, at: Date.now() };
  return creds;
}

// Invalidate cache when credentials are updated
export function invalidateCredentialsCache() {
  _cache = null;
}
