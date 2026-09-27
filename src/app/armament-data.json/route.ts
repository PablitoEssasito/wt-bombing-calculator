import { compareData } from "@/lib/dataset";

/**
 * Every weapon's figures for the comparison, as one static file — fetched the
 * first time a comparison opens, so no other page carries them. Numbers and
 * keys only, the same in every language; each page hands in its own words.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(compareData());
}
