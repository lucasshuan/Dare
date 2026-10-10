"use client";

import { Clock, Download, Mail, Trash2 } from "lucide-react";
import { m } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import { LayoutMotion } from "@/components/ui/layout-motion";
import { PageHead } from "@/components/ui/page-head";
import { Screen } from "@/components/ui/screen";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/features/data/use-me";
import { HubActions, HubBrand } from "@/features/home/hub-actions";
import { AccountDialog } from "@/features/settings/account-dialog";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { ease } from "@/lib/motion";
import { NEWS, PRIVACY, TERMS } from "@/lib/routes";

/** Where the legal texts stand: the day they last changed, and their version. */
export const LEGAL_DATE = Date.UTC(2026, 9, 9, 12);
const VERSION = 1;
export const CONTACT_EMAIL = "contato@4dare.com";

type Doc = "privacy" | "terms";

type Block =
  | { p: string }
  | { ul: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { acts: true };

interface Section {
  id: string;
  t: string;
  blocks: Block[];
}

const GO: Record<string, string> = {
  privacy: PRIVACY,
  terms: TERMS,
  news: NEWS,
};

/**
 * The texts' few marks, turned into elements: <b>, <law> (a grey reference
 * tag), <go to="…"> (a page of the app), <ext href="…"> (outside) and
 * <mail></mail> (the contact address).
 */
function rich(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /<b>(.*?)<\/b>|<law>(.*?)<\/law>|<go to="(\w+)">(.*?)<\/go>|<ext href="([^"]+)">(.*?)<\/ext>|<mail><\/mail>/g;
  let last = 0;
  let k = 0;
  for (const match of text.matchAll(re)) {
    const i = match.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const key = k++;
    if (match[1] !== undefined) out.push(<b key={key}>{match[1]}</b>);
    else if (match[2] !== undefined)
      out.push(
        <span
          key={key}
          className="mx-0.5 whitespace-nowrap rounded-pill bg-sunken px-[7px] py-px font-medium font-mono text-[11.5px] text-ink-muted"
        >
          {match[2]}
        </span>,
      );
    else if (match[3] !== undefined)
      out.push(
        <Link
          key={key}
          href={GO[match[3]] ?? "/"}
          className="font-semibold text-sky underline decoration-1 underline-offset-[3px]"
        >
          {match[4]}
        </Link>,
      );
    else if (match[5] !== undefined)
      out.push(
        <a
          key={key}
          href={match[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-sky underline decoration-1 underline-offset-[3px]"
        >
          {match[6]}
        </a>,
      );
    else
      out.push(
        <a
          key={key}
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-semibold text-sky underline decoration-1 underline-offset-[3px]"
        >
          {CONTACT_EMAIL}
        </a>,
      );
    last = i + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * /privacy and /terms, one page each: the essentials in 30 seconds, then the
 * whole text, in plain words. An index beside it marks the part being read; the rights part
 * downloads the reader's data, opens the account's delete and writes to us.
 */
export function LegalScreen({ doc }: { doc: Doc }) {
  const t = useTranslations("legal");
  const format = useFormatter();
  const sections = t.raw(`${doc}.sections`) as Section[];
  const tldr = t.raw(`${doc}.tldr`) as { e: string; x: string }[];
  const minutes = t.raw(`${doc}.readMinutes`) as number;
  const current = useInView(sections.map((s) => `lg-${s.id}`));
  return (
    <Screen left={<HubBrand />} right={<HubActions />}>
      <PageHead
        eyebrow={t("eyebrow")}
        title={t(`${doc}.title`)}
        lead={t("lead")}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav
          aria-label={t("toc")}
          className="grid gap-3 lg:sticky lg:top-24 max-lg:hidden"
        >
          <span className="font-semibold text-[12px] text-ink-muted uppercase tracking-[0.08em]">
            {t("toc")}
          </span>
          <LayoutMotion>
            <ol className="grid gap-0.5">
              {sections.map((s, i) => {
                const on = current === `lg-${s.id}`;
                return (
                  <li key={s.id}>
                    <a
                      href={`#lg-${s.id}`}
                      aria-current={on ? "true" : undefined}
                      className={cn(
                        "relative flex gap-2 rounded-[10px] py-1.5 pr-2 pl-3 text-[13.5px] leading-snug transition-colors",
                        on
                          ? "font-semibold text-ink"
                          : "text-ink-muted hover:text-ink",
                      )}
                    >
                      {on ? (
                        <m.span
                          layoutId="legal-toc"
                          className="absolute inset-y-1 left-0 w-[3px] rounded-pill bg-sky"
                        />
                      ) : null}
                      <span className="font-medium font-mono text-[11px] tabular-nums opacity-70">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {s.t}
                    </a>
                  </li>
                );
              })}
            </ol>
          </LayoutMotion>
          <div className="grid gap-1 rounded-[18px] bg-surface p-3.5 text-[13px]">
            <b>{t("help")}</b>
            <span className="text-ink-muted">
              {rich(t.raw("helpLine") as string)}
            </span>
          </div>
        </nav>
        <article className="min-w-0 max-w-[760px]">
          <header className="mb-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" strokeWidth={1.75} />
                {t("updated", {
                  date: format.dateTime(LEGAL_DATE, { dateStyle: "long" }),
                })}
              </span>
              <span>{t("read", { n: minutes })}</span>
              <span className="rounded-pill bg-sunken px-2 py-0.5 font-medium font-mono text-[11.5px]">
                {t("version", { n: VERSION })}
              </span>
            </div>
          </header>
          <m.section
            key={doc}
            initial={{ opacity: 0, y: 12, rotate: -0.6 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.5, ease: ease.soft }}
            aria-labelledby="lg-tldr"
            className="mb-9 rounded-[24px] bg-butter-soft p-5 sm:p-6"
          >
            <h3
              id="lg-tldr"
              className="mb-3.5 flex items-center gap-2.5 font-bold font-display text-[19px]"
            >
              <span className="-rotate-3 rounded-pill bg-butter px-2 py-[3px] font-mono font-semibold text-[11px] text-on-butter">
                {t("seconds")}
              </span>
              {t("essentials")}
            </h3>
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {tldr.map((item, i) => (
                <m.li
                  key={item.x}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    ease: ease.soft,
                    delay: 0.1 + i * 0.05,
                  }}
                  className="flex gap-2.5 text-[14.5px] leading-snug"
                >
                  <span aria-hidden="true" className="text-[18px] leading-none">
                    {item.e}
                  </span>
                  <span>{item.x}</span>
                </m.li>
              ))}
            </ul>
          </m.section>
          <div className="grid gap-9">
            {sections.map((s, i) => (
              <section
                key={s.id}
                id={`lg-${s.id}`}
                className="grid scroll-mt-24 gap-3"
              >
                <h3 className="flex items-baseline gap-3 font-bold font-display text-[20px] leading-tight tracking-[-0.01em]">
                  <span className="font-medium font-mono text-[13px] text-ink-muted tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.t}
                </h3>
                {s.blocks.map((b, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a text's fixed parts
                  <Fragment key={j}>
                    <BlockView block={b} />
                  </Fragment>
                ))}
              </section>
            ))}
          </div>
          <p className="mt-10 border-line border-t pt-5 text-[14px] text-ink-muted">
            {rich(
              t.raw(doc === "privacy" ? "seeTerms" : "seePrivacy") as string,
            )}
          </p>
        </article>
      </div>
    </Screen>
  );
}

function BlockView({ block }: { block: Block }) {
  if ("p" in block)
    return <p className="text-[15.5px] leading-[1.65]">{rich(block.p)}</p>;
  if ("ul" in block)
    return (
      <ul className="grid list-disc gap-1.5 pl-5 text-[15.5px] leading-[1.6] marker:text-ink-muted">
        {block.ul.map((li) => (
          <li key={li}>{rich(li)}</li>
        ))}
      </ul>
    );
  if ("table" in block)
    return (
      <div className="overflow-x-auto rounded-[16px] border border-line">
        <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
          <thead className="bg-sunken">
            <tr>
              {block.table.head.map((h) => (
                <th key={h} className="px-3.5 py-2.5 font-semibold text-[13px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.table.rows.map((row) => (
              <tr
                key={row.join("|")}
                className="border-line border-t align-top"
              >
                {row.map((cell) => (
                  <td key={cell} className="px-3.5 py-2.5 leading-snug">
                    {rich(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return <Acts />;
}

/** Download my data, delete my account, write to us. */
function Acts() {
  const t = useTranslations("legal.acts");
  const toast = useToast();
  const { me } = useMe();
  const [deleting, setDeleting] = useState(false);
  const account = me && !me.isGuest ? me : null;
  const button =
    "inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong bg-surface px-3.5 font-semibold text-[14px] transition-colors hover:bg-sunken";
  return (
    <div className="flex flex-wrap gap-2">
      {account ? (
        <a href="/api/me/export" download className={button}>
          <Download className="size-4" strokeWidth={2} />
          {t("export")}
        </a>
      ) : (
        <button
          type="button"
          onClick={() => toast(t("guest"))}
          className={button}
        >
          <Download className="size-4" strokeWidth={2} />
          {t("export")}
        </button>
      )}
      <button
        type="button"
        onClick={() => (account ? setDeleting(true) : toast(t("guest")))}
        className={button}
      >
        <Trash2 className="size-4" strokeWidth={2} />
        {t("delete")}
      </button>
      <a href={`mailto:${CONTACT_EMAIL}`} className={button}>
        <Mail className="size-4" strokeWidth={2} />
        {t("mail")}
      </a>
      {account ? (
        <AccountDialog
          open={deleting}
          onOpenChange={setDeleting}
          me={account}
        />
      ) : null}
    </div>
  );
}

/** The section nearest the top of the window, among those showing. */
function useInView(ids: string[]) {
  const [current, setCurrent] = useState(ids[0]);
  const key = ids.join(",");
  useEffect(() => {
    const list = key.split(",");
    const showing = new Set<string>();
    const watch = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) showing.add(e.target.id);
          else showing.delete(e.target.id);
        const first = list.find((id) => showing.has(id));
        if (first) setCurrent(first);
      },
      { rootMargin: "-96px 0px -60% 0px" },
    );
    for (const id of list) {
      const el = document.getElementById(id);
      if (el) watch.observe(el);
    }
    return () => watch.disconnect();
  }, [key]);
  return current;
}
