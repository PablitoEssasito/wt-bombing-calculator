import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Coffee } from "lucide-react";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { BombMark } from "@/components/bomb-mark";
import { withBasePath } from "@/lib/base-path";
import { meta } from "@/lib/dataset";
import { canonicalOf, KOFI_URL, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "War Thunder Base Bombing Calculator";
const DESCRIPTION =
  "How many bombs to take, and what to drop on each base, for every bomber and attacker in War Thunder.";

// Unset locally and in any build that doesn't supply it, so `next dev` and a
// plain `npm run build` never phone home — only the deploy workflow, which
// reads this from a repository variable rather than a hardcoded id, sets it.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

// Matches --color-ground — the phone's own chrome (status bar, address bar)
// should read as part of the page, not a lighter bar bolted on top of it.
export const viewport: Viewport = {
  themeColor: "#0b0f14",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · WT Bombing Calculator",
  },
  description: DESCRIPTION,
  // Unlike alternates.canonical and openGraph/twitter's images, these hrefs
  // don't compose against metadataBase — Next ships them exactly as given,
  // so they need the same manual prefix every plain <Image src> does.
  //
  // `?v=` is a manual cache-buster: the file lives at the same stable path
  // across every deploy, and browsers cache a favicon far more stubbornly
  // than a normal asset, so redrawing the icon without changing the URL
  // leaves old tabs showing the old one indefinitely. Bump it whenever
  // scripts/pwa-icons's drawing changes.
  icons: {
    icon: `${withBasePath("/icons/app-icon-32.png")}?v=5`,
    apple: `${withBasePath("/icons/app-icon-180.png")}?v=5`,
  },
  // Correct for the home page, which sets no metadata of its own; every other
  // page restates it for its own path, for the same replace-not-deepen reason
  // openGraph/twitter do below.
  ...canonicalOf("/"),
  // A page below overrides title/description but keeps this shape — Next
  // merges Metadata one key at a time, replacing rather than deepening a
  // nested object, so siteName/type/locale only reach a page that repeats them.
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const NAV = [
  { href: "/", label: "Aircraft" },
  { href: "/bombs", label: "Bomb chart" },
  { href: "/about", label: "About" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-full flex flex-col">
        <header className="border-b border-line sticky top-0 z-30 bg-ground/85 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-2 sm:gap-6">
            <Link href="/" className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <BombMark size={30} className="text-accent shrink-0" />
              <span className="font-semibold text-lg tracking-tight whitespace-nowrap">
                Bombing<span className="text-ink-dim">Calc</span>
              </span>
            </Link>
            <nav className="flex items-center gap-0.5 sm:gap-1 text-sm min-w-0">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-2 sm:px-3 py-1.5 rounded-md text-ink-dim hover:text-ink hover:bg-surface-2 transition-colors whitespace-nowrap"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <a
              href={KOFI_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-auto flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md text-accent border border-accent/30 hover:bg-accent-dim hover:border-accent/60 transition-colors whitespace-nowrap shrink-0 text-sm font-medium"
            >
              <Coffee size={16} className="shrink-0" />
              <span className="hidden sm:inline">Buy me a coffee</span>
            </a>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line mt-16">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink-faint space-y-2">
            <p>
              All loadout and bomb data comes from{" "}
              <a
                href={meta.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-ink-dim underline underline-offset-4 hover:text-accent"
              >
                LEGION&apos;s Loadouts
              </a>
              {meta.sheetVersion ? ` (v${meta.sheetVersion})` : null}.
            </p>
            <p>
              Not affiliated with or endorsed by Gaijin Entertainment. Imported{" "}
              {new Date(meta.generatedAt).toISOString().slice(0, 10)}.
            </p>
          </div>
        </footer>
      </body>
      {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
    </html>
  );
}
