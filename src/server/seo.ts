import "server-only";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { appName } from "@/config";
import type { Lang } from "@/game/types";
import { routing } from "@/i18n/routing";
import type { OgText } from "./og/art";

// Search and share metadata shared by the pages: canonical and hreflang links,
// Open Graph and Twitter cards, and the texts drawn on the share images.

/** Where the site lives. SITE_URL wins; on Vercel the production domain comes in on its own. */
const vercelHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
export const SITE_URL = (
  process.env.SITE_URL ||
  (vercelHost ? `https://${vercelHost}` : "http://localhost:3000")
).replace(/\/$/, "");

const OG_LOCALE: Record<Lang, string> = {
  en: "en_US",
  es: "es_LA",
  pt: "pt_BR",
  ja: "ja_JP",
};
export const HREFLANG: Record<Lang, string> = {
  en: "en",
  es: "es",
  pt: "pt-BR",
  ja: "ja",
};

/** "/" in Portuguese is "/pt"; "/who-am-i" is "/pt/who-am-i". */
export const localePath = (lang: Lang, path: string) =>
  `/${lang}${path === "/" ? "" : path}`;

/** The same page in every language; x-default is the unprefixed path, which picks the visitor's language. */
export function languageLinks(path: string): Record<string, string> {
  return {
    ...Object.fromEntries(
      routing.locales.map((l) => [HREFLANG[l], localePath(l, path)]),
    ),
    "x-default": path,
  };
}

export function pageMetadata({
  lang,
  path,
  title,
  description,
  shareTitle = typeof title === "string"
    ? `${title} · ${appName(lang)}`
    : title,
  index = true,
}: {
  lang: Lang;
  path: string;
  /** The tab title; the layout adds " · 4Dare" (" · 4だれ" in Japanese). */
  title: Metadata["title"];
  description: string;
  /** The title in embeds; by default the tab title with the site's name. */
  shareTitle?: Metadata["title"];
  /** Rooms and the profile stay out of search results, but still embed. */
  index?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: localePath(lang, path),
      languages: index ? languageLinks(path) : undefined,
    },
    openGraph: {
      type: "website",
      siteName: appName(lang),
      locale: OG_LOCALE[lang],
      alternateLocale: routing.locales
        .filter((l) => l !== lang)
        .map((l) => OG_LOCALE[l]),
      url: localePath(lang, path),
      title: shareTitle ?? undefined,
      description,
    },
    twitter: { card: "summary_large_image" },
    robots: index ? undefined : { index: false, follow: true },
  };
}

/** What the share images say, in `lang`. */
export async function ogText(lang: Lang): Promise<OgText> {
  const [meta, home, common] = await Promise.all([
    getTranslations({ locale: lang, namespace: "meta" }),
    getTranslations({ locale: lang, namespace: "home.games.whoAmI" }),
    getTranslations({ locale: lang, namespace: "common.answers" }),
  ]);
  return {
    lang,
    tagline: meta("tagline"),
    chips: [meta("chips.free"), meta("chips.players"), meta("chips.browser")],
    homeChips: [meta("chips.free"), meta("chips.browser")],
    game: home("name"),
    pitch: meta("whoAmI.pitch"),
    question: home("demoQuestion"),
    yes: common("yes"),
    probably: common("probably_yes"),
  };
}

/** A <script type="application/ld+json"> body, safe to inline. */
export const jsonLd = (data: object) =>
  JSON.stringify(data).replace(/</g, "\\u003c");
