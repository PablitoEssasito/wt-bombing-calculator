import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ErrorTracking } from "@/components/error-tracking";
import { ReadyMarker } from "@/components/ready-marker";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { Toaster } from "@/components/toaster";
import { messagesFor } from "@/i18n/messages";
import { withBasePath } from "@/lib/base-path";
import { canonicalOf, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const { title: TITLE, shortTitle: SHORT_TITLE, description: DESCRIPTION } = messagesFor("en").site;

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
    template: `%s · ${SHORT_TITLE}`,
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
  // Search Console's "Google Analytics" ownership-verification method reads
  // raw HTML without running JS — it can't see the gtag snippet below, since
  // next/script's afterInteractive strategy only inserts that after
  // hydration. The HTML-tag method sidesteps that entirely.
  verification: {
    google: "ahfYWOKM6KOdZ6kVxtzDFvuWdj7xXmByI1ASNROH4uU",
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

/**
 * What every page shares whatever its language: the document, fonts, global
 * metadata, analytics and the toaster. The header, footer and the words
 * themselves come from the (en), pl and ru layouts' SiteShell.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Every language shares this layout, so it can only state English; the
    // site shell's HtmlLang corrects it for the others (and `lang` on the
    // shell's own header, main and footer says so from the first paint).
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="font-sans min-h-full flex flex-col">
        {/* GA's own dataLayer only exists once next/third-parties' afterInteractive
            script has actually run, which can lose a race against an error thrown
            early in hydration — ErrorTracking/ErrorBoundary's track() calls would
            silently drop. beforeInteractive runs ahead of hydration entirely, so
            the array is always there first, GA_ID or not. (A direct child of
            <body> is where next/script's docs place beforeInteractive scripts —
            <html> itself, before <body>, isn't a supported spot: it produced a
            real hydration error.) */}
        <Script id="datalayer-init" strategy="beforeInteractive">
          {"window.dataLayer = window.dataLayer || [];"}
        </Script>
        {children}
        <ErrorTracking />
        <ReadyMarker />
        <Toaster />
        <ServiceWorkerRegistration />
      </body>
      {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
    </html>
  );
}
