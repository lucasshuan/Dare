import { GameError, HEARTBEAT_MS } from "@/game/types";
import { toView } from "@/game/view";
import { getBackend } from "@/server/backend";
import { langParam } from "@/server/http";
import {
  applyDueTimeouts,
  dispatch,
  normalizeCode,
  seatedElsewhere,
} from "@/server/rooms";

const noStore = { "Cache-Control": "no-store" };

/** The room as the caller may see it, names in `?lang=`. Fires any clock timeouts that are due first. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/rooms/[code]">,
) {
  const code = normalizeCode((await ctx.params).code);
  if (!code)
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: noStore },
    );
  const { auth } = getBackend();
  // The room read and the identity check don't depend on each other.
  const [stored, me] = await Promise.all([
    applyDueTimeouts(code),
    auth.me("en"),
  ]);
  if (!stored || stored.state.phase === "closed") {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: noStore },
    );
  }
  const mine = stored.state.players.find((p) => p.id === me.id);
  if (!mine) {
    // A seat given up for another room (one room at a time) says which one.
    const elsewhere = await seatedElsewhere(me.id, code, langParam(request));
    return Response.json(
      { error: "not_member", elsewhere },
      { status: 403, headers: noStore },
    );
  }
  // Their page is open again (a reload, or back after a dropped connection).
  let room = stored;
  if (mine.goneAt != null) {
    try {
      room = await dispatch(code, () => ({ type: "BACK", playerId: me.id }));
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
    }
  } else if (Date.now() - stored.state.updatedAt >= HEARTBEAT_MS) {
    // A page is open: touch the room, so only a room with no page left ages out of the list.
    try {
      room = await dispatch(code, () => ({ type: "SEEN", playerId: me.id }), {
        quiet: true,
      });
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
    }
  }
  return Response.json(
    toView(room.state, room.version, me.id, Date.now(), langParam(request)),
    { headers: noStore },
  );
}
