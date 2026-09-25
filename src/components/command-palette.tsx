"use client";

import { Command } from "cmdk";
import Fuse from "fuse.js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BombIcon } from "@/components/bomb-glyph";
import { Flag } from "@/components/flag";
import { useSwitchLanguage } from "@/components/language";
import type { Nation } from "@/domain/constants";
import { useI18n } from "@/i18n/client";
import { LOCALE_NAMES, LOCALES } from "@/i18n/locales";
import { track } from "@/lib/analytics";
import { withBasePath } from "@/lib/base-path";
import { useFavoriteAircraft, useRecentAircraft } from "@/lib/local-list";
import type { SearchIndex } from "@/lib/search-index";

const PAGES = [
  { href: "/", key: "aircraft" },
  { href: "/bombs/", key: "bombs" },
  { href: "/changelog/", key: "changelog" },
  { href: "/about/", key: "about" },
] as const;

/** Enough to scan, few enough to render instantly: 50 results at most. */
const MAX_AIRCRAFT = 30;
const MAX_BOMBS = 20;

type Plane = SearchIndex["aircraft"][number];

/**
 * Jump anywhere: any aircraft, any bomb, any page — from any page, by name.
 * Loaded (with its index) only the first time it is opened; see
 * CommandPaletteTrigger. Searching reuses fuse.js, tuned as the aircraft list's
 * own search is, so the two agree on what "Ju 88" finds.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { m, path, locale } = useI18n();
  const switchLanguage = useSwitchLanguage();
  const router = useRouter();
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [query, setQuery] = useState("");
  const recent = useRecentAircraft();
  const favorites = useFavoriteAircraft();

  useEffect(() => {
    fetch(withBasePath(path("/search-index.json")))
      .then((response) => response.json() as Promise<SearchIndex>)
      .then(setIndex)
      .catch(() => setIndex({ aircraft: [], bombs: [] }));
  }, [path]);

  const search = useMemo(
    () =>
      index && {
        aircraft: new Fuse(index.aircraft, { keys: ["name"], threshold: 0.35, ignoreLocation: true }),
        bombs: new Fuse(index.bombs, { keys: ["name"], threshold: 0.35, ignoreLocation: true }),
        byId: new Map(index.aircraft.map((a) => [a.id, a])),
      },
    [index],
  );

  const term = query.trim();
  const pages = PAGES.map((page) => ({ href: page.href, label: m.nav[page.key] })).filter(
    (page) => !term || page.label.toLowerCase().includes(term.toLowerCase()),
  );
  // The header's picker hides on the narrowest phones, so the palette offers them too.
  const languages = LOCALES.filter(
    (l) =>
      l !== locale &&
      (!term || LOCALE_NAMES[l].toLowerCase().includes(term.toLowerCase()) || l === term.toLowerCase()),
  );
  const aircraft = search && term ? search.aircraft.search(term, { limit: MAX_AIRCRAFT }).map((r) => r.item) : [];
  const bombs = search && term ? search.bombs.search(term, { limit: MAX_BOMBS }).map((r) => r.item) : [];
  const pick = (ids: string[]) => (search ? ids.flatMap((id) => search.byId.get(id) ?? []) : []);

  const go = (href: string, transitionTypes?: string[]) => {
    onOpenChange(false);
    setQuery("");
    router.push(path(href), { transitionTypes });
  };
  const goToPlane = (plane: Plane) => {
    track("palette_used", { kind: "aircraft", value: plane.id });
    go(`/aircraft/${plane.id}/`, ["nav-forward"]);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={m.nav.search}
      shouldFilter={false}
      loop
      overlayClassName="fixed inset-0 z-50 bg-black/60"
      contentClassName="fixed left-1/2 top-[10vh] z-50 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-line-bright bg-surface shadow-2xl"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder={m.palette.placeholder}
        className="w-full border-b border-line bg-transparent px-4 py-3.5 text-base outline-none placeholder:text-ink-faint"
      />
      <Command.List className="max-h-[min(60vh,28rem)] overflow-y-auto p-2 text-sm">
        {!index ? <Command.Loading>{m.palette.loading}</Command.Loading> : null}
        <Command.Empty className="px-3 py-6 text-center text-ink-dim">{m.palette.empty}</Command.Empty>

        {!term && favorites.length > 0 ? (
          <Group heading={m.common.favorites}>
            {pick(favorites).map((plane) => (
              <PlaneItem key={`fav-${plane.id}`} group="fav" plane={plane} onSelect={() => goToPlane(plane)} />
            ))}
          </Group>
        ) : null}
        {!term && recent.length > 0 ? (
          <Group heading={m.common.recentlyViewed}>
            {pick(recent).map((plane) => (
              <PlaneItem key={`recent-${plane.id}`} group="recent" plane={plane} onSelect={() => goToPlane(plane)} />
            ))}
          </Group>
        ) : null}

        {aircraft.length > 0 ? (
          <Group heading={m.palette.aircraft}>
            {aircraft.map((plane) => (
              <PlaneItem key={plane.id} group="found" plane={plane} onSelect={() => goToPlane(plane)} />
            ))}
          </Group>
        ) : null}
        {bombs.length > 0 ? (
          <Group heading={m.palette.bombs}>
            {bombs.map((bomb) => (
              <Command.Item
                key={bomb.id}
                value={`bomb:${bomb.id}`}
                onSelect={() => {
                  track("palette_used", { kind: "bomb", value: bomb.id });
                  go(`/bombs/?q=${encodeURIComponent(bomb.name)}`, ["nav-fade"]);
                }}
                className={ITEM}
              >
                <BombIcon bomb={{ id: bomb.id, chartName: "", fullName: bomb.name }} size={20} />
                <span className="truncate">{bomb.name}</span>
              </Command.Item>
            ))}
          </Group>
        ) : null}
        {pages.length > 0 ? (
          <Group heading={m.palette.pages}>
            {pages.map((page) => (
              <Command.Item
                key={page.href}
                value={`page:${page.href}`}
                onSelect={() => go(page.href, ["nav-fade"])}
                className={ITEM}
              >
                {page.label}
              </Command.Item>
            ))}
          </Group>
        ) : null}
        {languages.length > 0 ? (
          <Group heading={m.nav.language}>
            {languages.map((l) => (
              <Command.Item
                key={l}
                value={`language:${l}`}
                onSelect={() => {
                  onOpenChange(false);
                  setQuery("");
                  switchLanguage(l);
                }}
                className={ITEM}
              >
                <span lang={l}>{LOCALE_NAMES[l]}</span>
                <span className="ml-auto text-xs uppercase text-ink-faint">{l}</span>
              </Command.Item>
            ))}
          </Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}

const ITEM =
  "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-ink-dim data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink";

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-accent"
    >
      {children}
    </Command.Group>
  );
}

function PlaneItem({ group, plane, onSelect }: { group: string; plane: Plane; onSelect: () => void }) {
  return (
    <Command.Item value={`${group}:${plane.id}`} onSelect={onSelect} className={ITEM}>
      <Flag nation={plane.nation as Nation} size={13} />
      <span className="truncate">{plane.name}</span>
      <span className="nums ml-auto text-accent">{plane.br.toFixed(1)}</span>
    </Command.Item>
  );
}
