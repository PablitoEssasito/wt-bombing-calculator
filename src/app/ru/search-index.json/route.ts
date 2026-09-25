import { searchIndexFor } from "@/lib/search-index";

/** The Russian command-palette index — see lib/search-index. */
export const dynamic = "force-static";

export function GET() {
  return Response.json(searchIndexFor("ru"));
}
