import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads .env.local.
 *
 * Next.js does this for `next dev` and `next build`, but the ETL runs as a plain
 * tsx script, which gets no such treatment.
 */
export function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

/** The Sheets API key, or null when it has not been set up yet. */
export function sheetsApiKey(): string | null {
  const key = process.env.GOOGLE_SHEETS_API_KEY?.trim();
  return key ? key : null;
}
