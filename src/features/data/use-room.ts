"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { BACKEND } from "@/config";
import type { RoomView } from "@/game/types";
import { subscribeRoom } from "@/lib/realtime";
import type { ElsewhereRoom } from "@/server/contract";

export type RoomFetchError = "not_found" | "not_member" | "unknown";

export class RoomError extends Error {
  constructor(
    public code: RoomFetchError,
    /** not_member: the room the player sits in instead, if any. */
    public elsewhere: ElsewhereRoom | null = null,
  ) {
    super(code);
    this.name = "RoomError";
  }
}

export interface RoomData {
  view: RoomView;
  /** serverNow − local clock, so `Date.now() + offset` is the server's time. */
  offset: number;
}

// Realtime pings make polling a safety net in Supabase mode, slow while the
// channel is joined and quick while it is down; local mode has no pings.
const pollMs = (connected: boolean) =>
  BACKEND === "local" ? 1000 : connected ? 45_000 : 10_000;

export const roomKey = (code: string) => ["room", code] as const;

/** The room, names in `lang` (the page's). */
async function fetchRoom(code: string, lang: string): Promise<RoomData> {
  const sentAt = Date.now();
  const res = await fetch(
    `/api/rooms/${encodeURIComponent(code)}?lang=${lang}`,
    { cache: "no-store" },
  );
  const receivedAt = Date.now();
  if (res.status === 404) throw new RoomError("not_found");
  if (res.status === 403) {
    const body = (await res.json().catch(() => null)) as {
      elsewhere?: ElsewhereRoom | null;
    } | null;
    throw new RoomError("not_member", body?.elsewhere ?? null);
  }
  if (!res.ok) throw new RoomError("unknown");
  const view = (await res.json()) as RoomView;
  return { view, offset: view.serverNow - (sentAt + receivedAt) / 2 };
}

/** The room as the current player sees it, kept fresh by realtime pings, polling and the step clock. */
export function useRoom(code: string) {
  const client = useQueryClient();
  const lang = useLocale();
  const [connected, setConnected] = useState(false);
  const query = useQuery({
    queryKey: roomKey(code),
    queryFn: async () => {
      const next = await fetchRoom(code, lang);
      // A slow response must never replace a newer state.
      const current = client.getQueryData<RoomData>(roomKey(code));
      return current && current.view.version > next.view.version
        ? current
        : next;
    },
    refetchInterval: pollMs(connected),
    refetchOnWindowFocus: true,
    // a hidden tab is still a page open on the room: its polls keep the room listed
    refetchIntervalInBackground: true,
    retry: (count, error) => !(error instanceof RoomError) && count < 2,
  });

  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey: roomKey(code) }),
    [client, code],
  );

  /** Shows a room an action returned, unless a newer one is already on screen. */
  const apply = useCallback(
    (view: RoomView) => {
      client.setQueryData<RoomData>(roomKey(code), (current) =>
        current && current.view.version >= view.version
          ? current
          : { view, offset: current?.offset ?? view.serverNow - Date.now() },
      );
    },
    [client, code],
  );

  // A ping for a version we already have (usually our own action) needs no
  // refetch. Joining (or rejoining after a drop) refetches: pings sent before
  // it never arrive.
  useEffect(() => {
    let joined = false;
    const unsubscribe = subscribeRoom(
      code,
      ({ version }) => {
        const current = client.getQueryData<RoomData>(roomKey(code));
        if (version && current && current.view.version >= version) return;
        void refresh();
      },
      (now) => {
        if (now && !joined) void refresh();
        joined = now;
        setConnected(now);
      },
    );
    return () => {
      unsubscribe();
      setConnected(false);
    };
  }, [client, code, refresh]);

  // When the step's clock runs out, or a closed page's grace (a seat to free),
  // the server settles it on the next read.
  const deadline = query.data?.view.deadline ?? null;
  const sweepAt = query.data?.view.sweepAt ?? null;
  const offset = query.data?.offset ?? 0;
  useEffect(() => {
    const due = [deadline, sweepAt].filter((t): t is number => t !== null);
    if (!due.length) return;
    const wait = Math.max(0, Math.min(...due) - (Date.now() + offset)) + 300;
    const id = window.setTimeout(() => void refresh(), wait);
    return () => window.clearTimeout(id);
  }, [deadline, sweepAt, offset, refresh]);

  const error =
    query.error instanceof RoomError
      ? query.error.code
      : query.error
        ? "unknown"
        : null;

  return {
    data: query.data ?? null,
    error: error as RoomFetchError | null,
    elsewhere: query.error instanceof RoomError ? query.error.elsewhere : null,
    isLoading: query.isPending,
    refresh,
    apply,
  };
}
