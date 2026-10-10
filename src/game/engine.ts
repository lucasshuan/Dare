// The room's rules: seats, settings, the theme steps the games share and the
// event switch. Each game's own rules live in its folder (who-am-i, impostor,
// lineup). Pure functions: same input, same output; no clock, no randomness,
// no I/O of their own.

import { GAME_SEATS, isGameKey } from "./games";
import { findPlayer, goneFor, isPresent, presenceDue } from "./helpers";
import {
  accuse,
  beginImpostor,
  dontKnow,
  impLeft,
  impTimeout,
  lastGuess,
  point,
  reply,
  unaccuse,
  unreply,
} from "./impostor/engine";
import type { ImpDeal } from "./impostor/types";
import {
  answerOffer,
  beginLineup,
  bid,
  cancelOffer,
  chooseMission,
  fold,
  giveVerdict,
  hunch,
  judge,
  cue as luCue,
  luLeft,
  luTimeout,
  markDone,
  offer,
  presented,
  rate,
  react,
  saveBoard,
  setQueue,
} from "./lineup/engine";
import {
  COINS,
  HOST_MIN_PEOPLE,
  LOTS_PER_SEAT,
  OFF_MISSIONS_MAX,
  ROUNDS,
} from "./lineup/rules";
import { LU_PHASES } from "./lineup/types";
import { pickColorSlot } from "./seat-colors";
import {
  cleanText,
  cutClock,
  fail,
  handOverHost,
  longShows,
  type Part,
  requireSeated,
  stage,
  startStep,
  stepMs,
  stopClock,
} from "./steps";
import { isTaste, TASTE_KEYS } from "./tastes";
import {
  type Ctx,
  DEFAULT_SETTINGS,
  type GameEvent,
  HOST_THEME_SECONDS,
  type Identity,
  KICK_MS,
  MAX_THEME,
  OFF_THEMES_MAX,
  PICK_SECONDS,
  type PlayerId,
  ROOM_NAME_MAX,
  ROOM_PASSWORD_MAX,
  type RoomSettings,
  type RoomState,
  type RuleExamples,
  SHOW_TIMING,
  STEP_SECONDS_MAX,
  STEP_SECONDS_MIN,
  STEP_TIMES,
  THEME_IDEAS,
  THEME_OPTIONS,
  type Theme,
} from "./types";
import {
  answer,
  ask,
  beginMatch,
  draft,
  giveUp,
  guess,
  passGuess,
  pick,
  validate,
  whoLeft,
  whoTimeout,
} from "./who-am-i/engine";

// --- settings ----------------------------------------------------------------

/** A theme id as theme-id.ts makes it. */
const THEME_ID = /^[a-z0-9-]{1,80}$/;

function mergeSettings(
  base: RoomSettings,
  patch: Partial<RoomSettings>,
  seated: number,
): RoomSettings {
  const allowed = new Set([
    "game",
    "name",
    "visibility",
    "password",
    "seats",
    ...STEP_TIMES,
    "mode",
    "themeMode",
    "offTastes",
    "offThemes",
    "impostors",
    "coins",
    "lotsPerSeat",
    "rounds",
    "interval",
    "trades",
    "heavy",
    "offMissions",
  ]);
  if (Object.keys(patch).some((k) => !allowed.has(k))) fail("invalid_input");
  const next = { ...DEFAULT_SETTINGS, ...base, ...patch };
  // another game keeps the seats where its range allows
  if (
    patch.game !== undefined &&
    patch.seats === undefined &&
    isGameKey(next.game)
  ) {
    const range = GAME_SEATS[next.game];
    next.seats = Math.min(range.max, Math.max(range.min, seated, next.seats));
  }
  const impostors: unknown = next.impostors;
  const offTastes: unknown = next.offTastes ?? [];
  const offThemes: unknown = next.offThemes ?? [];
  const offMissions: unknown = next.offMissions ?? [];
  const rounds: unknown = next.rounds;
  const inRange = (v: unknown, r: { min: number; max: number }) =>
    Number.isInteger(v) && (v as number) >= r.min && (v as number) <= r.max;
  const name: unknown = next.name;
  const password: unknown = next.password;
  const ok =
    isGameKey(next.game) &&
    typeof name === "string" &&
    name.trim().length <= ROOM_NAME_MAX &&
    (next.visibility === "public" || next.visibility === "private") &&
    typeof password === "string" &&
    password.trim().length <= ROOM_PASSWORD_MAX &&
    // a private room needs a password to ask for
    (next.visibility === "public" || password.trim().length > 0) &&
    Number.isInteger(next.seats) &&
    next.seats >= GAME_SEATS[next.game].min &&
    next.seats <= GAME_SEATS[next.game].max &&
    next.seats >= seated &&
    STEP_TIMES.every(
      (k) =>
        Number.isInteger(next[k]) &&
        next[k] >= STEP_SECONDS_MIN &&
        next[k] <= STEP_SECONDS_MAX,
    ) &&
    (next.mode === "classic" || next.mode === "host") &&
    (impostors === null ||
      (Number.isInteger(impostors) &&
        (impostors as number) >= 1 &&
        (impostors as number) <= Math.floor(GAME_SEATS.impostor.max / 3))) &&
    (next.themeMode === "vote" || next.themeMode === "host") &&
    Array.isArray(offTastes) &&
    offTastes.every(isTaste) &&
    Array.isArray(offThemes) &&
    offThemes.length <= OFF_THEMES_MAX &&
    offThemes.every((id) => typeof id === "string" && THEME_ID.test(id)) &&
    inRange(next.coins, COINS) &&
    inRange(next.lotsPerSeat, LOTS_PER_SEAT) &&
    (rounds === null || inRange(rounds, ROUNDS)) &&
    typeof next.interval === "boolean" &&
    typeof next.trades === "boolean" &&
    typeof next.heavy === "boolean" &&
    Array.isArray(offMissions) &&
    offMissions.length <= OFF_MISSIONS_MAX &&
    offMissions.every((id) => typeof id === "string" && THEME_ID.test(id));
  if (!ok) fail("invalid_input");
  // Each taste once, in the order the screens show them; one stays on.
  const off = TASTE_KEYS.filter((k) => (offTastes as string[]).includes(k));
  if (off.length === TASTE_KEYS.length) fail("invalid_input");
  // a room made before tastes carries its old theme sets: they go
  const { themeSets: _sets, ...rest } = next as RoomSettings & {
    themeSets?: unknown;
  };
  return {
    ...rest,
    name: next.name.trim(),
    // a public room keeps no password around
    password: next.visibility === "private" ? next.password.trim() : "",
    offTastes: off,
    offThemes: [...new Set(offThemes as string[])].sort(),
    offMissions: [...new Set(offMissions as string[])].sort(),
  };
}

// --- shared steps --------------------------------------------------------------

/**
 * A new round needs a theme: the host types it, or everyone votes on `themes`.
 * The opening plays first: the lobby leaves, then the cold open ("Who am I?"'s
 * long match, see longShows) or "Round N", then the vote or the host's form comes in.
 */
function beginTheme(
  s: RoomState,
  themes: Theme[] | undefined,
  examples: (RuleExamples | null)[] | undefined,
  deals: ImpDeal[] | undefined,
  ctx: Ctx,
) {
  const T = SHOW_TIMING;
  // the cold open tells "Who am I?"'s rules; the Impostor's deal show tells its own
  const coldOpen = s.settings.game === "who-am-i" && longShows(s, s.round + 1);
  const open: Part[] = [
    ["curtain", T.curtain],
    coldOpen ? ["intro", T.intro] : ["round", T.round],
  ];
  // the Impostor always votes: its cards come with the themes
  if (s.settings.game === "impostor")
    return beginVote(
      s,
      themes,
      examples,
      [...open, ["entrance", T.entrance.vote]],
      ctx,
      deals ?? fail("invalid_input"),
    );
  if (s.settings.themeMode === "host")
    return beginTheming(
      s,
      themes,
      [...open, ["entrance", T.entrance.theming]],
      ctx,
    );
  beginVote(s, themes, examples, [...open, ["entrance", T.entrance.vote]], ctx);
}

/** The host types the theme; `ideas` help them. If the clock runs out, everyone votes instead. */
function beginTheming(
  s: RoomState,
  ideas: Theme[] | undefined,
  opening: Part[],
  ctx: Ctx,
) {
  s.ideas = (ideas ?? []).slice(0, THEME_IDEAS).map((t) => ({ ...t }));
  s.vote = null;
  s.theme = null;
  s.reveal = null;
  s.turnPlayerId = null;
  s.phase = "theming";
  stage(s, "opening", s.round + 1, longShows(s, s.round + 1), opening, ctx);
  startStep(s, ctx, HOST_THEME_SECONDS * 1000);
}

/** Puts THEME_OPTIONS themes to the vote, once the opening is over; the match starts once the vote is. */
function beginVote(
  s: RoomState,
  themes: Theme[] | undefined,
  examples: (RuleExamples | null)[] | undefined,
  opening: Part[],
  ctx: Ctx,
  deals?: ImpDeal[],
) {
  if (!themes || themes.length !== THEME_OPTIONS) fail("invalid_input");
  if (examples && examples.length !== THEME_OPTIONS) fail("invalid_input");
  if (deals && deals.length !== THEME_OPTIONS) fail("invalid_input");
  s.vote = {
    options: (themes ?? []).map((t) => ({ ...t })),
    votes: {},
    cuts: {},
    chosen: null,
    tied: [],
    ...(examples ? { examples: structuredClone(examples) } : {}),
    ...(deals ? { deals: structuredClone(deals) } : {}),
  };
  s.ideas = [];
  s.theme = null;
  s.reveal = null;
  s.turnPlayerId = null;
  s.phase = "voting";
  stage(s, "opening", s.round + 1, longShows(s, s.round + 1), opening, ctx);
  startStep(s, ctx, stepMs(s, "voteSeconds"));
}

/** Most votes wins; a tie (or nobody voting) is drawn. Then the match starts behind the theme show. */
function closeVote(s: RoomState, ctx: Ctx) {
  const v = s.vote ?? fail("wrong_phase");
  const counts = v.options.map(() => 0);
  for (const p of s.players) {
    const option = v.votes[p.id];
    if (option !== undefined) counts[option] += 1;
  }
  const most = Math.max(...counts);
  v.tied = counts.flatMap((n, i) => (n === most ? [i] : []));
  v.chosen = v.tied[Math.floor(ctx.random() * v.tied.length)];
  if (s.settings.game === "impostor") {
    const deal = v.deals?.[v.chosen] ?? fail("invalid_input");
    // the other themes' cards are never needed again
    delete v.deals;
    return beginImpostor(s, v.options[v.chosen], deal, v.tied.length > 1, ctx);
  }
  beginMatch(s, v.options[v.chosen], ctx);
  showTheme(
    s,
    {
      tie: v.tied.length > 1,
      typed: false,
      rule: v.examples?.[v.chosen] ?? null,
    },
    ctx,
  );
}

/**
 * The theme show: the vote's result (a tie spins first), the theme, the rule
 * (a long match), the draw and "you pick for…", then the pick table
 * comes in. Picking starts when it ends. Two players can only pick for each
 * other, so they skip the draw: "you pick for…" comes in on its own.
 */
function showTheme(
  s: RoomState,
  o: { tie: boolean; typed: boolean; rule: RuleExamples | null },
  ctx: Ctx,
) {
  const first = longShows(s, s.round);
  const v = first ? "first" : "later";
  const T = SHOW_TIMING;
  const rule = first
    ? o.rule && !o.typed
      ? T.rule.cards
      : T.rule.sentence
    : 0;
  const drawn = s.players.length > 2;
  stage(
    s,
    "theme",
    s.round,
    first,
    [
      ["tie_spin", o.tie ? T.tieSpin : 0],
      ["settle", o.typed ? 0 : T.settle[v]],
      ["theme", rule ? T.theme.withRule : T.theme.alone],
      ["rule", rule],
      ["draw", drawn ? T.draw[v] : 0],
      ["target", T.target[v] + (drawn ? 0 : T.targetLead)],
      ["entrance", T.entrance.pick],
    ],
    ctx,
    first ? (o.typed ? null : o.rule) : undefined,
  );
  startStep(s, ctx, PICK_SECONDS * 1000);
}

function setTheme(s: RoomState, playerId: PlayerId, text: string, ctx: Ctx) {
  if (s.phase !== "theming") fail("wrong_phase");
  requireSeated(s, playerId);
  if (playerId !== s.hostId) fail("not_host");
  const t = cleanText(text.replace(/\s+/g, " "), MAX_THEME);
  beginMatch(s, { en: t, es: t, ja: t, pt: t, set: null }, ctx);
  showTheme(s, { tie: false, typed: true, rule: null }, ctx);
}

const everyoneVoted = (s: RoomState) =>
  s.players.every((p) => s.vote?.votes[p.id] !== undefined);

function vote(s: RoomState, playerId: PlayerId, option: number, ctx: Ctx) {
  if (s.phase !== "voting") fail("wrong_phase");
  requireSeated(s, playerId);
  const v = s.vote ?? fail("wrong_phase");
  if (!Number.isInteger(option) || option < 0 || option >= v.options.length)
    fail("invalid_input");
  const first = v.votes[playerId] === undefined;
  v.votes[playerId] = option;
  if (everyoneVoted(s)) closeVote(s, ctx);
  // changing a vote cuts nothing
  else if (first) {
    const before = s.deadline;
    cutClock(s, ctx, "voteSeconds", s.players.length);
    if (before !== null && s.deadline !== null)
      v.cuts[playerId] = before - s.deadline;
  }
}

/** Takes a vote back: the time it took off the clock comes back. */
function unvote(s: RoomState, playerId: PlayerId) {
  if (s.phase !== "voting") fail("wrong_phase");
  requireSeated(s, playerId);
  const v = s.vote ?? fail("wrong_phase");
  if (v.votes[playerId] === undefined) return;
  delete v.votes[playerId];
  const back = v.cuts[playerId] ?? 0;
  delete v.cuts[playerId];
  if (s.deadline !== null) s.deadline += back;
}

/** Phases where leaving gives up the seat: no match is being played. */
const BEFORE_MATCH = new Set(["lobby", "theming", "voting", "finished"]);
/** The Impostor's steps, from the first question to the last guess. */
const IMP_PHASES = new Set(["replying", "talking", "last_chance"]);
const LUP = new Set<string>(LU_PHASES);
// --- public API ------------------------------------------------------------------

/** A brand-new room in the lobby, with the host seated. */
export function createRoom(
  code: string,
  host: Identity,
  settings: RoomSettings,
  ctx: Ctx,
): RoomState {
  const valid = mergeSettings(settings, {}, 1);
  return {
    code,
    hostId: host.id,
    settings: valid,
    phase: "lobby",
    players: [
      {
        ...host,
        ready: true,
        joinedAt: ctx.now,
        strikes: 0,
        away: false,
        goneAt: null,
        colorSlot: pickColorSlot(
          [],
          host.avatar.color,
          GAME_SEATS[valid.game].max,
        ),
      },
    ],
    order: [],
    theme: null,
    vote: null,
    ideas: [],
    assignments: {},
    turnPlayerId: null,
    plays: [],
    outcomes: {},
    deadline: null,
    stepStartsAt: null,
    stepMs: null,
    reveal: null,
    round: 0,
    newcomer: false,
    turnRound: 0,
    turnNumber: 0,
    playStartedAt: null,
    imp: null,
    lu: null,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

/** True when the current step's clock has run out and a TIMEOUT event is due. */
export function isExpired(state: RoomState, now: number): boolean {
  return state.deadline !== null && now >= state.deadline;
}

/** A closed lobby page frees the seat; a match only ends once every page is closed. */
function sweep(s: RoomState, ctx: Ctx) {
  if (!presenceDue(s, ctx.now)) fail("wrong_phase");
  if (s.phase === "lobby") {
    for (const p of s.players.filter((x) => goneFor(x, ctx.now)))
      leave(s, p.id, ctx);
    return;
  }
  s.phase = "closed";
  s.turnPlayerId = null;
  s.reveal = null;
  stopClock(s);
}

/** Applies one event. Returns a new state; throws GameError when the event is not allowed. */
export function reduce(
  state: RoomState,
  event: GameEvent,
  ctx: Ctx,
): RoomState {
  const s = structuredClone(state);
  apply(s, event, ctx);
  s.updatedAt = ctx.now;
  return s;
}

function apply(s: RoomState, e: GameEvent, ctx: Ctx) {
  switch (e.type) {
    case "JOIN":
      return join(s, e.player, e.password, ctx);
    case "LEAVE":
      return leave(s, e.playerId, ctx);
    case "GONE": {
      const p = requireSeated(s, e.playerId);
      if (s.phase === "closed" || p.goneAt != null) fail("already_done");
      p.goneAt = ctx.now;
      return;
    }
    case "BACK": {
      const p = requireSeated(s, e.playerId);
      if (p.goneAt == null) fail("already_done");
      p.goneAt = null;
      return;
    }
    case "SEEN": {
      requireSeated(s, e.playerId);
      if (s.phase === "closed") fail("wrong_phase");
      return;
    }
    case "SWEEP":
      return sweep(s, ctx);
    case "SET_READY": {
      if (s.phase !== "lobby") fail("wrong_phase");
      const p = requireSeated(s, e.playerId);
      if (p.id === s.hostId) fail("invalid_input");
      p.ready = e.ready;
      return;
    }
    case "KICK":
      return kick(s, e.playerId, e.targetId, ctx);
    case "TRANSFER_HOST":
      return transferHost(s, e.playerId, e.targetId);
    case "UPDATE_SETTINGS": {
      requireSeated(s, e.playerId);
      if (e.playerId !== s.hostId) fail("not_host");
      if (s.phase !== "lobby") fail("wrong_phase");
      const game = s.settings.game;
      s.settings = mergeSettings(s.settings, e.settings, s.players.length);
      if (s.settings.game !== game) recolor(s);
      return;
    }
    case "UPDATE_IDENTITY": {
      const p = requireSeated(s, e.player.id);
      Object.assign(p, identityFields(e.player));
      return;
    }
    case "SWAP_PLAYER":
      return swapPlayer(s, e.from, e.player);
    case "START": {
      requireSeated(s, e.playerId);
      if (e.playerId !== s.hostId) fail("not_host");
      if (s.phase !== "lobby") fail("wrong_phase");
      if (s.players.length < GAME_SEATS[s.settings.game].min)
        fail(
          s.settings.game === "impostor"
            ? "need_three_players"
            : "need_two_players",
        );
      s.newcomer = e.newcomer === true;
      // What for? has no theme: the cards and missions come with the start
      if (s.settings.game === "lineup")
        return beginLineup(s, e.decks ?? fail("invalid_input"), ctx);
      return beginTheme(s, e.themes, e.examples, e.deals, ctx);
    }
    case "VOTE":
      return vote(s, e.playerId, e.option, ctx);
    case "UNVOTE":
      return unvote(s, e.playerId);
    case "SET_THEME":
      return setTheme(s, e.playerId, e.text, ctx);
    case "DRAFT":
      return draft(s, e.playerId, e.draft, ctx);
    case "PICK":
      return pick(s, e.playerId, e.character, e.suggested === true, ctx);
    case "ASK":
      return ask(s, e.playerId, e.text, ctx);
    case "ANSWER":
      return answer(s, e.playerId, e.value, e.note, ctx);
    case "GUESS":
      return guess(s, e.playerId, e.text, ctx);
    case "PASS":
      return passGuess(s, e.playerId, ctx);
    case "VALIDATE":
      return validate(s, e.playerId, e.correct, ctx);
    case "GIVE_UP":
      return giveUp(s, e.playerId, ctx);
    case "REPLY":
      return reply(s, e.playerId, e.answer, ctx);
    case "UNREPLY":
      return unreply(s, e.playerId, ctx);
    case "POINT":
      return point(s, e.playerId, e.targetId);
    case "ACCUSE":
      return accuse(s, e.playerId, e.targetId, ctx);
    case "UNACCUSE":
      return unaccuse(s, e.playerId, ctx);
    case "DONT_KNOW":
      return dontKnow(s, e.playerId, ctx);
    case "LAST_GUESS":
      return lastGuess(s, e.playerId, e.text, ctx);
    case "BID":
      return bid(s, e.playerId, e.amount, ctx);
    case "FOLD":
      return fold(s, e.playerId, ctx);
    case "DONE":
      return markDone(s, e.playerId, e.done, ctx);
    case "OFFER":
      return offer(s, e.playerId, { to: e.to, give: e.give, get: e.get }, ctx);
    case "CANCEL_OFFER":
      return cancelOffer(s, e.playerId, ctx);
    case "ANSWER_OFFER":
      return answerOffer(s, e.playerId, e.from, e.accept, ctx);
    case "BOARD":
      return saveBoard(s, e.playerId, e.board, ctx);
    case "PRESENTED":
      return presented(s, e.playerId, ctx);
    case "REACT":
      return react(s, e.playerId, e.board, e.counts, ctx);
    case "JUDGE":
      return judge(s, e.playerId, e.ownerId, ctx);
    case "RATE":
      return rate(s, e.playerId, e.up);
    case "CHAIR":
      return sitChair(s, e.playerId, e.seat);
    case "DRAW_CHAIR":
      return drawChair(s, e.playerId, ctx);
    case "MISSION":
      return chooseMission(s, e.playerId, e.pick, e.text, ctx);
    case "QUEUE":
      return setQueue(s, e.playerId, e.cards, ctx);
    case "CUE":
      return luCue(s, e.playerId, e.kind, ctx);
    case "HUNCH":
      return hunch(s, e.playerId, e.text);
    case "VERDICT":
      return giveVerdict(s, e.playerId, e.ownerId, e.why, e.final, ctx);
    case "BACK_TO_LOBBY": {
      requireSeated(s, e.playerId);
      if (e.playerId !== s.hostId) fail("not_host");
      if (s.phase !== "finished") fail("wrong_phase");
      return backToLobby(s);
    }
    case "TIMEOUT":
      return timeout(s, e, ctx);
  }
}

/** A game with fewer colours: whoever holds one beyond them gets a free one it has. */
function recolor(s: RoomState) {
  const slots = GAME_SEATS[s.settings.game].max;
  const held = s.players.filter((p) => p.colorSlot < slots);
  for (const p of s.players) {
    if (p.colorSlot < slots) continue;
    p.colorSlot = pickColorSlot(
      held.map((x) => x.colorSlot),
      p.avatar.color,
      slots,
    );
    held.push(p);
  }
}

function identityFields(p: Identity) {
  return {
    name: p.name,
    isGuest: p.isGuest,
    guestNumber: p.guestNumber,
    avatar: p.avatar,
    lang: p.lang,
  };
}

/** Every trace of `from` in the room becomes `player.id`: seat, host, turn order, picks, plays, outcome, vote. */
function swapPlayer(s: RoomState, from: PlayerId, player: Identity) {
  if (s.phase === "closed") fail("not_found");
  const seat = requireSeated(s, from);
  const to = player.id;
  if (to === from) return;
  if (findPlayer(s, to)) fail("already_done");
  Object.assign(seat, identityFields(player), { id: to });
  const swap = (id: PlayerId) => (id === from ? to : id);
  s.hostId = swap(s.hostId);
  s.order = s.order.map(swap);
  if (s.turnPlayerId) s.turnPlayerId = swap(s.turnPlayerId);
  const assignments: RoomState["assignments"] = {};
  for (const [owner, a] of Object.entries(s.assignments))
    assignments[swap(owner)] = { ...a, pickerId: swap(a.pickerId) };
  s.assignments = assignments;
  if (from in s.outcomes) {
    s.outcomes[to] = s.outcomes[from];
    delete s.outcomes[from];
  }
  for (const play of s.plays) {
    play.by = swap(play.by);
    if (play.kind === "question")
      for (const a of play.answers) a.by = swap(a.by);
  }
  if (s.vote && from in s.vote.votes) {
    s.vote.votes[to] = s.vote.votes[from];
    delete s.vote.votes[from];
  }
  for (const m of s.matches ?? [])
    for (const p of m.players) if (p.id === from) p.id = to;
  if (s.imp) swapImpostor(s.imp, swap);
  if (s.lu) swapLineup(s.lu, swap);
}

/** What for?'s traces of a player under their new id. */
function swapLineup(
  lu: NonNullable<RoomState["lu"]>,
  swap: (id: PlayerId) => PlayerId,
) {
  const keys = <T>(r: Record<PlayerId, T>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [swap(k), v]));
  const pairs = (r: Record<PlayerId, PlayerId>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [swap(k), swap(v)]));
  lu.dealt = lu.dealt.map(swap);
  lu.coins = keys(lu.coins);
  lu.bids = keys(lu.bids);
  lu.passed = lu.passed.map(swap);
  lu.done = lu.done.map(swap);
  lu.cuts = keys(lu.cuts);
  for (const o of lu.offers) {
    o.from = swap(o.from);
    o.to = swap(o.to);
  }
  for (const r of lu.rounds) {
    r.hands = keys(r.hands);
    for (const tag of Object.values(r.tags)) if (tag.by) tag.by = swap(tag.by);
    r.change = keys(r.change);
    for (const t of r.trades) {
      t.from = swap(t.from);
      t.to = swap(t.to);
    }
    r.boards = keys(r.boards);
    r.order = r.order.map(swap);
    r.reactions = Object.fromEntries(
      Object.entries(r.reactions).map(([k, v]) => [swap(k), keys(v)]),
    );
    r.votes = pairs(r.votes);
    if (r.tie) {
      r.tie.among = r.tie.among.map(swap);
      r.tie.voters = r.tie.voters.map(swap);
      r.tie.votes = pairs(r.tie.votes);
    }
    r.winners = r.winners.map(swap);
    if (r.crowd) r.crowd = swap(r.crowd);
    r.points = keys(r.points);
    r.rated = keys(r.rated);
  }
}

/** The Impostor's traces of a player under their new id. */
function swapImpostor(
  imp: NonNullable<RoomState["imp"]>,
  swap: (id: PlayerId) => PlayerId,
) {
  const keys = <T>(r: Record<PlayerId, T>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [swap(k), v]));
  imp.dealt = imp.dealt.map(swap);
  imp.impostors = imp.impostors.map(swap);
  for (const a of imp.asked) {
    a.answers = keys(a.answers);
    a.cuts = keys(a.cuts);
  }
  if (imp.vote) {
    imp.vote.points = Object.fromEntries(
      Object.entries(imp.vote.points).map(([k, v]) => [swap(k), swap(v)]),
    );
    imp.vote.votes = Object.fromEntries(
      Object.entries(imp.vote.votes).map(([k, v]) => [swap(k), swap(v)]),
    );
    imp.vote.cuts = keys(imp.vote.cuts);
  }
  for (const o of imp.outs) {
    o.id = swap(o.id);
    o.by = o.by.map(swap);
  }
  if (imp.guessing) imp.guessing = swap(imp.guessing);
}

function join(
  s: RoomState,
  player: Identity,
  password: string | undefined,
  ctx: Ctx,
) {
  if (s.phase === "closed") fail("not_found");
  const seated = findPlayer(s, player.id);
  if (seated) {
    Object.assign(seated, identityFields(player));
    return;
  }
  if ((s.kicked?.[player.id] ?? 0) > ctx.now) fail("kicked");
  if (s.phase !== "lobby") fail("already_started");
  if (s.players.length >= s.settings.seats) fail("room_full");
  // Only newcomers are asked: whoever already has a seat comes back freely.
  const lock = s.settings.visibility === "private" ? s.settings.password : "";
  if (lock) {
    if (!password?.trim()) fail("password_required");
    if (password?.trim() !== lock) fail("wrong_password");
  }
  s.players.push({
    ...player,
    ready: false,
    joinedAt: ctx.now,
    strikes: 0,
    away: false,
    goneAt: null,
    colorSlot: pickColorSlot(
      s.players.map((p) => p.colorSlot),
      player.avatar.color,
      GAME_SEATS[s.settings.game].max,
    ),
  });
}

/** The host takes someone out of the lobby; they can't come back for KICK_MS. */
function kick(s: RoomState, hostId: PlayerId, targetId: PlayerId, ctx: Ctx) {
  requireSeated(s, hostId);
  if (hostId !== s.hostId) fail("not_host");
  if (s.phase !== "lobby") fail("wrong_phase");
  if (targetId === hostId) fail("invalid_input");
  requireSeated(s, targetId);
  s.players = s.players.filter((p) => p.id !== targetId);
  const kicked = Object.entries(s.kicked ?? {}).filter(
    ([, until]) => until > ctx.now,
  );
  s.kicked = Object.fromEntries([...kicked, [targetId, ctx.now + KICK_MS]]);
  if (s.players.length < 2) stopClock(s);
}

/** The host hands the room to someone else here: they take over, ready like any host. */
function transferHost(s: RoomState, hostId: PlayerId, targetId: PlayerId) {
  const old = requireSeated(s, hostId);
  if (hostId !== s.hostId) fail("not_host");
  if (s.phase !== "lobby") fail("wrong_phase");
  if (targetId === hostId) fail("invalid_input");
  const target = requireSeated(s, targetId);
  if (!isPresent(target)) fail("invalid_input");
  s.hostId = targetId;
  target.ready = true;
  old.ready = false;
}

/**
 * What for?'s TV chair, in the lobby: anyone sits in it when it's empty and
 * gets up from it; the host seats anyone there or empties it. Being the host
 * and presenting are apart: handing the room over leaves the chair as it is.
 */
function sitChair(s: RoomState, playerId: PlayerId, seat: PlayerId | null) {
  requireSeated(s, playerId);
  if (s.phase !== "lobby") fail("wrong_phase");
  const host = playerId === s.hostId;
  const chair = s.chair ?? null;
  delete s.chairDrawn;
  if (seat === null) {
    if (!host && chair !== playerId) fail("not_host");
    s.chair = null;
    return;
  }
  requireSeated(s, seat);
  if (!host && (seat !== playerId || (chair !== null && chair !== playerId)))
    fail("not_host");
  s.chair = seat;
}

/** The host draws the TV chair among the people here (enough for a presenter). */
function drawChair(s: RoomState, playerId: PlayerId, ctx: Ctx) {
  requireSeated(s, playerId);
  if (s.phase !== "lobby") fail("wrong_phase");
  if (playerId !== s.hostId) fail("not_host");
  const here = s.players.filter(isPresent).map((p) => p.id);
  if (here.length < HOST_MIN_PEOPLE) fail("invalid_input");
  s.chair = here[Math.floor(ctx.random() * here.length)];
  s.chairDrawn = true;
}

function leave(s: RoomState, id: PlayerId, ctx: Ctx) {
  const p = requireSeated(s, id);
  if (s.phase === "closed") fail("wrong_phase");
  if (BEFORE_MATCH.has(s.phase)) {
    s.players = s.players.filter((x) => x.id !== id);
    if (s.chair === id) {
      s.chair = null;
      delete s.chairDrawn;
    }
    if (s.players.length === 0) {
      s.phase = "closed";
      stopClock(s);
      return;
    }
    // Leaving while typing the theme hands the typing over with the room.
    handOverHost(s);
    if (s.phase === "lobby" && s.players.length < 2) stopClock(s);
    if (s.phase !== "voting" && s.phase !== "theming") return;
    if (s.vote) delete s.vote.votes[id];
    // Nobody left to play with: back to the lobby to wait for others.
    if (s.players.length < 2) {
      s.phase = "lobby";
      s.vote = null;
      s.ideas = [];
      // the opening must not play again over the lobby
      s.reveal = null;
      stopClock(s);
      return;
    }
    if (s.phase === "voting" && everyoneVoted(s)) closeVote(s, ctx);
    return;
  }
  // mid-match: keep the seat so the history still makes sense
  p.away = true;
  handOverHost(s);
  if (IMP_PHASES.has(s.phase)) return impLeft(s, id, ctx);
  if (LUP.has(s.phase)) return luLeft(s, id, ctx);
  whoLeft(s, id, ctx);
}

/**
 * From the podium to a fresh lobby: whoever left the match loses their seat,
 * everyone but the host marks "ready" again, and the lobby clock restarts.
 * The vote stays, so the next one avoids its themes.
 */
function backToLobby(s: RoomState) {
  s.players = s.players.filter(isPresent);
  if (s.players.length === 0) {
    s.phase = "closed";
    return stopClock(s);
  }
  handOverHost(s);
  for (const p of s.players) {
    p.ready = p.id === s.hostId;
    p.strikes = 0;
  }
  s.phase = "lobby";
  s.theme = null;
  s.ideas = [];
  s.order = [];
  s.assignments = {};
  s.outcomes = {};
  s.plays = [];
  s.turnPlayerId = null;
  s.reveal = null;
  s.playStartedAt = null;
  s.imp = null;
  s.lu = null;
  stopClock(s);
}

function timeout(
  s: RoomState,
  e: Extract<GameEvent, { type: "TIMEOUT" }>,
  ctx: Ctx,
) {
  if (!isExpired(s, ctx.now)) fail("wrong_phase");
  switch (s.phase) {
    // only a room saved while lobbies still had a clock gets here
    case "lobby":
      return stopClock(s);
    case "theming":
      // the host's opening already played: just the vote coming in
      return beginVote(
        s,
        e.themes,
        e.examples,
        [["entrance", SHOW_TIMING.entrance.vote]],
        ctx,
      );
    case "voting":
      return closeVote(s, ctx);
    case "finished":
      return backToLobby(s);
    case "picking":
    case "asking":
    case "answering":
    case "guessing":
    case "validating":
      return whoTimeout(s, e, ctx);
    case "replying":
    case "talking":
    case "last_chance":
      return impTimeout(s, ctx);
    default:
      return LUP.has(s.phase) ? luTimeout(s, ctx) : fail("wrong_phase");
  }
}
