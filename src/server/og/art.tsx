import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { appName } from "@/config";
import type { Lang } from "@/game/types";
import { type Figure, figureSvg } from "@/lib/figures";
import { FONT } from "./fonts";

// The share images (Open Graph / Twitter / Discord embeds), 1200×630, drawn in
// satori's flexbox subset. Same look as the home's game card: light canvas,
// character cards on the table, a "?" card, a question and its answer.

export const OG_SIZE = { width: 1200, height: 630 };

/** Light theme colours from globals.css. */
const C = {
  canvas: "#F3F5F9",
  surface: "#FFFFFF",
  sunken: "#E8ECF3",
  line: "#D3D9E4",
  ink: "#1E2433",
  muted: "#566075",
  sky: "#2B69C8",
  skySoft: "#DCE8FA",
  butter: "#F6E3A1",
  butterSoft: "#FBF3D3",
  onButter: "#3A2E05",
  yes: "#0B7A75",
  yesSoft: "#D5EFEC",
} as const;

const SHADOW = "0 2px 6px rgba(30,36,51,0.08), 0 24px 56px rgba(30,36,51,0.16)";

const brand = (file: string) =>
  `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), "public/brand", file)).toString("base64")}`;
const ICON = brand("icon.svg");
/** The logo for the image's language (だれ in Japanese), and its viewBox's width over height. */
const LOGO = {
  en: { src: brand("logo.svg"), ratio: 2880 / 838 },
  ja: { src: brand("logo-ja.svg"), ratio: 2201 / 838 },
};
const logoOf = (lang: Lang) => (lang === "ja" ? LOGO.ja : LOGO.en);

/** A figure as a data URI (satori fetches nothing). */
const figure = (name: Figure) =>
  `data:image/svg+xml;base64,${Buffer.from(figureSvg(name)).toString("base64")}`;

const fonts = (lang: Lang) =>
  lang === "ja"
    ? { display: FONT.japanese, body: FONT.japanese }
    : { display: FONT.display, body: FONT.body };

/** Texts the images need, already in the image's language. */
export interface OgText {
  lang: Lang;
  tagline: string;
  /** The game pages' pills. */
  chips: string[];
  /** The home page's pills: it has no player count, the games differ. */
  homeChips: string[];
  game: string;
  pitch: string;
  question: string;
  yes: string;
  probably: string;
}

function Frame({
  lang,
  background,
  children,
}: {
  lang: Lang;
  background: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background,
        fontFamily: fonts(lang).body,
        color: C.ink,
      }}
    >
      {children}
    </div>
  );
}

/** A soft round light, like the blurred spots on the home cards. */
function Glow({
  x,
  y,
  size,
  color,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: size,
        backgroundImage: `radial-gradient(circle, ${color} 0%, rgba(255,255,255,0) 70%)`,
      }}
    />
  );
}

/** Someone else's card: a character's picture, a grey line for the name. */
function Card({
  figure: name,
  width,
  x,
  y,
  rotate,
  ring,
}: {
  figure: Figure;
  width: number;
  x: number;
  y: number;
  rotate: number;
  ring?: string;
}) {
  const inner = width - 24;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        display: "flex",
        flexDirection: "column",
        padding: 12,
        gap: 12,
        borderRadius: 26,
        background: C.surface,
        boxShadow: SHADOW,
        border: ring ? `5px solid ${ring}` : "none",
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <div
        style={{
          display: "flex",
          width: inner,
          height: inner * 1.25,
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: satori only knows <img> */}
        <img src={figure(name)} width={inner} height={inner * 1.25} alt="" />
      </div>
      <div
        style={{
          display: "flex",
          width: inner * 0.62,
          height: 12,
          margin: "0 6px 4px",
          borderRadius: 12,
          background: C.line,
        }}
      />
    </div>
  );
}

/** Your own card, face down: a big "?". */
function MysteryCard({
  width,
  x,
  y,
  rotate,
}: {
  width: number;
  x: number;
  y: number;
  rotate: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        height: width * 1.4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 26,
        background: C.surface,
        boxShadow: SHADOW,
        color: C.sky,
        fontFamily: FONT.display,
        fontSize: width * 0.62,
        transform: `rotate(${rotate}deg)`,
      }}
    >
      ?
    </div>
  );
}

function Question({
  lang,
  text,
  x,
  y,
  size,
}: {
  lang: Lang;
  text: string;
  x: number;
  y: number;
  size: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        display: "flex",
        padding: `${size * 0.55}px ${size * 0.85}px`,
        borderRadius: `${size}px ${size}px ${size}px 8px`,
        background: C.surface,
        boxShadow: SHADOW,
        fontFamily: fonts(lang).display,
        fontSize: size,
        letterSpacing: lang === "ja" ? 0 : -0.5,
        color: C.ink,
      }}
    >
      {text}
    </div>
  );
}

type Answer = "yes" | "probably";
const ANSWER_LOOK: Record<Answer, { bg: string; fg: string; dot: string }> = {
  yes: { bg: C.yes, fg: "#FFFFFF", dot: "#FFFFFF" },
  probably: { bg: C.yesSoft, fg: C.ink, dot: C.yes },
};

/** An answer chip, like the ones on the turn screen. */
function Chip({
  lang,
  kind,
  label,
  x,
  y,
  size,
  rotate = 0,
}: {
  lang: Lang;
  kind: Answer;
  label: string;
  x: number;
  y: number;
  size: number;
  rotate?: number;
}) {
  const look = ANSWER_LOOK[kind];
  const hollow = kind === "probably";
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        display: "flex",
        alignItems: "center",
        gap: size * 0.45,
        padding: `${size * 0.4}px ${size * 0.8}px ${size * 0.4}px ${size * 0.6}px`,
        borderRadius: 999,
        background: look.bg,
        border: `3px solid ${kind === "probably" ? C.yesSoft : look.bg}`,
        boxShadow: SHADOW,
        color: look.fg,
        fontFamily: fonts(lang).body,
        fontWeight: 700,
        fontSize: size,
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <div
        style={{
          display: "flex",
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: size,
          background: hollow ? "transparent" : look.dot,
          border: hollow ? `${size * 0.13}px solid ${look.dot}` : "none",
        }}
      />
      {label}
    </div>
  );
}

function Pills({ lang, items }: { lang: Lang; items: string[] }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      {items.map((item) => (
        <div
          key={item}
          style={{
            display: "flex",
            padding: "10px 22px",
            flexShrink: 0,
            whiteSpace: "nowrap",
            borderRadius: 999,
            background: C.surface,
            border: `2px solid ${C.line}`,
            fontFamily: fonts(lang).body,
            fontWeight: 700,
            fontSize: 24,
            color: C.ink,
          }}
        >
          {item}
        </div>
      ))}
    </div>
  );
}

/** Home: the logo in the middle, the game's pieces scattered around it. */
export function HomeArt({ text }: { text: OgText }) {
  const { lang } = text;
  const logoHeight = 168;
  return (
    <Frame lang={lang} background={C.canvas}>
      <Glow x={160} y={80} size={620} color={C.skySoft} />
      <Glow x={1080} y={600} size={680} color={C.butterSoft} />
      <Glow x={1100} y={40} size={420} color={C.skySoft} />

      <Card figure="lady" width={190} x={-30} y={360} rotate={-12} />
      <Card figure="king" width={190} x={1040} y={330} rotate={11} />
      <MysteryCard width={128} x={1010} y={-40} rotate={14} />
      <Question lang={lang} text={text.question} x={70} y={56} size={30} />
      <Chip
        lang={lang}
        kind="yes"
        label={text.yes}
        x={86}
        y={150}
        size={26}
        rotate={-4}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: OG_SIZE.width,
          height: OG_SIZE.height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
          paddingTop: 10,
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: satori only knows <img> */}
        <img
          src={logoOf(lang).src}
          width={logoHeight * logoOf(lang).ratio}
          height={logoHeight}
          alt=""
        />
        <div
          style={{
            display: "flex",
            maxWidth: 700,
            textAlign: "center",
            fontFamily: fonts(lang).display,
            fontSize: lang === "ja" ? 50 : 56,
            lineHeight: 1.08,
            letterSpacing: lang === "ja" ? 0 : -1.2,
            color: C.ink,
          }}
        >
          {text.tagline}
        </div>
        <Pills lang={lang} items={text.homeChips} />
      </div>
    </Frame>
  );
}

/** A game ("Who am I?"): the name and pitch on the left, the table on the right. */
export function GameArt({ text }: { text: OgText }) {
  const { lang } = text;
  return (
    <Frame lang={lang} background={C.canvas}>
      <Glow x={120} y={560} size={560} color={C.butterSoft} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 620,
          padding: "64px 0 64px 72px",
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: satori only knows <img> */}
        <img
          src={logoOf(lang).src}
          width={64 * logoOf(lang).ratio}
          height={64}
          alt=""
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontFamily: fonts(lang).display,
              fontSize: lang === "ja" ? 72 : text.game.length > 10 ? 82 : 104,
              lineHeight: 1,
              letterSpacing: lang === "ja" ? 0 : -3,
              color: C.ink,
            }}
          >
            {text.game}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: lang === "ja" ? 26 : 29,
              lineHeight: 1.35,
              color: C.muted,
            }}
          >
            {text.pitch}
          </div>
        </div>
        <Pills lang={lang} items={text.chips} />
      </div>

      <div
        style={{
          position: "absolute",
          left: 640,
          top: 40,
          width: 520,
          height: 550,
          display: "flex",
          borderRadius: 44,
          overflow: "hidden",
          background: C.skySoft,
        }}
      >
        <Glow x={60} y={40} size={360} color="rgba(255,255,255,0.7)" />
        <Glow x={480} y={540} size={380} color="rgba(246,227,161,0.8)" />
        <Card figure="lady" width={160} x={14} y={290} rotate={-10} />
        <Card figure="king" width={160} x={346} y={290} rotate={10} />
        <Card
          figure="cat"
          width={176}
          x={172}
          y={250}
          rotate={0}
          ring={C.yes}
        />
        <Question lang={lang} text={text.question} x={36} y={48} size={32} />
        <Chip
          lang={lang}
          kind="yes"
          label={text.yes}
          x={300}
          y={150}
          size={26}
          rotate={4}
        />
        <Chip
          lang={lang}
          kind="probably"
          label={text.probably}
          x={56}
          y={160}
          size={22}
          rotate={-5}
        />
      </div>
    </Frame>
  );
}

/** A room link: "you're invited", the code in big tiles, on brand blue. */
export function InviteArt({
  text,
  invited,
  join,
  codeLabel,
  code,
}: {
  text: OgText;
  invited: string;
  join: string;
  codeLabel: string;
  code: string;
}) {
  const { lang } = text;
  return (
    <Frame lang={lang} background={C.sky}>
      <Glow x={140} y={100} size={700} color="rgba(255,255,255,0.14)" />
      <Glow x={1100} y={620} size={640} color="rgba(246,227,161,0.32)" />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: 720,
          padding: "60px 0 56px 72px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "10px 24px",
              borderRadius: 999,
              background: C.butter,
              color: C.onButter,
              fontWeight: 700,
              fontSize: 28,
            }}
          >
            {invited}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: fonts(lang).display,
              fontSize: lang === "ja" ? 74 : 92,
              lineHeight: 1,
              letterSpacing: lang === "ja" ? 0 : -2.5,
              color: "#FFFFFF",
            }}
          >
            {join}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              color: "rgba(255,255,255,0.78)",
            }}
          >
            {codeLabel}
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {code.split("").map((letter, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: letters repeat
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 100,
                  height: 118,
                  borderRadius: 22,
                  background: C.surface,
                  boxShadow: "0 10px 0 rgba(17,46,94,0.35)",
                  color: C.sky,
                  fontFamily: FONT.display,
                  fontSize: 76,
                }}
              >
                {letter}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* biome-ignore lint/performance/noImgElement: satori only knows <img> */}
          <img src={ICON} width={52} height={52} alt="" />
          <div
            style={{
              display: "flex",
              fontFamily: fonts(lang).display,
              fontSize: 32,
              color: "#FFFFFF",
            }}
          >
            {`${text.game} · ${appName(lang)}`}
          </div>
        </div>
      </div>

      <Card figure="lady" width={190} x={800} y={250} rotate={-9} />
      <Card figure="king" width={190} x={980} y={300} rotate={9} />
      <MysteryCard width={170} x={900} y={70} rotate={4} />
      <Chip
        lang={lang}
        kind="yes"
        label={text.yes}
        x={770}
        y={110}
        size={26}
        rotate={-6}
      />
    </Frame>
  );
}
