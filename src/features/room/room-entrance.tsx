"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";
import { Loader } from "@/components/ui/loader";
import { LobbyBackdrop } from "@/features/lobby/lobby-backdrop";
import type { GameKey } from "@/game/games";
import { usePathname } from "@/i18n/navigation";
import { ease } from "@/lib/motion";

type Entrance = {
  path: string;
  loading: boolean;
  label: string;
  game?: GameKey;
};
type Backdrop = { path: string; game: GameKey | null };
const EntranceContext = createContext<{
  setEntrance: Dispatch<SetStateAction<Entrance | null>>;
  setBackdrop: (value: Backdrop) => void;
} | null>(null);

/** Lives above route changes: the same hand keeps shuffling from /new to /r. */
export function RoomEntranceProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const t = useTranslations("common");
  const reduced = useReducedMotion();
  const [entrance, setEntrance] = useState<Entrance | null>(null);
  const [backdrop, setBackdrop] = useState<Backdrop | null>(null);
  const [settled, setSettled] = useState<string | null>(null);
  const creating = path === "/new";
  // Match RoomPage's alphabet: rejected links must show their 404, never a loader.
  const code = /^\/r\/([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5})$/i
    .exec(path)?.[1]
    .toUpperCase();
  const room = !!code;
  const current = entrance?.path === path;
  const loading = !current || entrance.loading;
  const visible = (creating || room) && (loading || (room && settled !== path));
  const game =
    current && !loading && !entrance.game
      ? null
      : backdrop?.path === path
        ? backdrop.game
        : room
          ? (entrance?.game ?? null)
          : null;

  useEffect(() => {
    if (!room) {
      // An intercepted modal can temporarily change the URL over the same room.
      return;
    }
    // Let the canvas dissolve into the room even when its data arrives at once.
    const timer = window.setTimeout(() => setSettled(path), reduced ? 0 : 850);
    return () => window.clearTimeout(timer);
  }, [path, room, reduced]);

  return (
    <EntranceContext value={{ setEntrance, setBackdrop }}>
      <m.div
        inert={room && visible}
        initial={false}
        animate={{ opacity: room && visible ? 0 : 1 }}
        transition={{ duration: reduced ? 0.15 : 0.55, ease: ease.soft }}
      >
        {children}
      </m.div>
      {game ? <LobbyBackdrop game={game} /> : null}
      <AnimatePresence>
        {visible ? (
          <m.div
            key="room-entrance"
            data-room-entrance={room ? "room" : "creating"}
            className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden pb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: 0,
              transition: { duration: 0.45, ease: ease.soft },
            }}
          >
            <Loader
              label={entrance?.label ?? t("loading")}
              roomCode={code}
              className="relative"
            />
          </m.div>
        ) : null}
      </AnimatePresence>
    </EntranceContext>
  );
}

/** The route supplies its own translated status; polling never restarts the hand. */
export function useRoomEntrance(
  loading: boolean,
  label: string,
  game?: GameKey,
) {
  const context = useContext(EntranceContext);
  const path = usePathname();
  const setEntrance = context?.setEntrance;
  useEffect(() => {
    setEntrance?.((previous) => ({
      path,
      loading,
      label,
      game:
        game ??
        (loading && (previous?.path === "/new" || previous?.path === path)
          ? previous.game
          : undefined),
    }));
  }, [setEntrance, path, loading, label, game]);
}

/** The stage owns the backdrop after joining; its DOM and colour clock survive. */
export function EntranceLobbyBackdrop({ game }: { game: GameKey | null }) {
  const context = useContext(EntranceContext);
  const path = usePathname();
  const setBackdrop = context?.setBackdrop;
  useEffect(() => {
    setBackdrop?.({ path, game });
  }, [setBackdrop, path, game]);
  return context ? null : game ? <LobbyBackdrop game={game} /> : null;
}
