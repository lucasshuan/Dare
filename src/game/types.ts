// The whole game in types. Everything else (engine, server, UI) is written against this file.
import { DEFAULT_GAME, type GameKey } from "./games";
import type {
  ImpAnswer,
  ImpDeal,
  ImpOut,
  ImpostorMatch,
  ImpQuestion,
  ImpWinner,
} from "./impostor/types";
import { DEFAULT_RULES } from "./lineup/rules";
import type {
  LineupMatch,
  LineupView,
  LuCard,
  LuCue,
  LuDeck,
  LuOffer,
} from "./lineup/types";
import type { Taste } from "./tastes";
import type { ThemeSet } from "./theme-sets";

export const LANGS = ["en", "es", "ja", "pt"] as const;
export type Lang = (typeof LANGS)[number];
export type Localized = Record<Lang, string>;

/** A theme in every language. `set` is its theme set; null when the host typed it in (the same text in every language). */
export interface Theme extends Localized {
  set: ThemeSet | null;
}

/** Always shown in this order. */
export const ANSWERS = [
  "yes",
  "probably_yes",
  "unknown",
  "probably_no",
  "no",
  "irrelevant",
] as const;
export type AnswerValue = (typeof ANSWERS)[number];

export type PlayerId = string;

/**
 * A creature drawn from its DNA (src/lib/avatar) or a picture; `color` is
 * always set: the pastel behind it.
 */
export type Avatar =
  | { kind: "creature"; dna: string; color: string }
  | { kind: "image"; url: string; color: string };

/** Who someone is. Guests have no name: the UI turns guestNumber into "WonderfulCat" / "GatoMaravilhoso" / "すてきなネコ" (see guest-names.ts). */
export interface Identity {
  id: PlayerId;
  isGuest: boolean;
  name: string | null;
  guestNumber: number;
  avatar: Avatar;
  lang: Lang;
}

export interface RoomSettings {
  /** The game the room plays; the host can switch it in the lobby. */
  game: GameKey;
  /** The room's name, up to ROOM_NAME_MAX characters; empty shows "<host>'s room". */
  name: string;
  /** Every room is listed; "private" asks for `password` before anyone new gets a seat. */
  visibility: "public" | "private";
  /**
   * The password of a private room, empty for a public one. Only the host's
   * view carries it; everyone else gets "".
   */
  password: string;
  /** Within the game's range (GAME_SEATS). */
  seats: number;
  /** Seconds to vote on the theme. Each vote, while others still owe theirs, cuts a share of it (see CLOCK_CUT_FLOOR_MS). */
  voteSeconds: number;
  /** Seconds to ask a question: STEP_SECONDS_MIN..MAX, default 80. */
  askSeconds: number;
  /** Seconds to guess (or pass) once the answers are in. */
  guessSeconds: number;
  /** Seconds to answer a question. Each answer, while others still owe theirs, cuts a share of it (see CLOCK_CUT_FLOOR_MS). */
  answerSeconds: number;
  /** Seconds for the picker to check a guess that was not an obvious match. */
  validateSeconds: number;
  /** Impostor: seconds to answer a question. Each answer, while others still owe theirs, cuts a share of it. */
  replySeconds: number;
  /** Impostor: seconds to talk and vote. Each confirmed vote cuts a share, never below TALK_FLOOR_MS. */
  talkSeconds: number;
  /** Impostor: seconds a caught impostor has to guess the crew's card. */
  lastSeconds: number;
  /** Impostor: how many get the other card; null lets the seats decide (see impostorsFor). */
  impostors: number | null;
  /** What for?: seconds each lot stays on the table (a late bid gives some back). */
  lotSeconds: number;
  /** What for?: seconds to trade cards before the envelope. */
  tradeSeconds: number;
  /** What for?: seconds to lay out the board. Each "done" cuts a share. */
  defendSeconds: number;
  /** What for?: seconds to vote for a board. Each vote cuts a share. */
  judgeSeconds: number;
  /** What for?: coins everyone gets each round (lineup/rules.ts COINS). */
  coins: number;
  /** What for?: lots per player in a round, plus three (LOTS_PER_SEAT). */
  lotsPerSeat: number;
  /** What for?: rounds in a match; null lets the seats decide (roundsFor). */
  rounds: number | null;
  /** What for?: the auction stops halfway to show every board and purse. */
  interval: boolean;
  /** What for?: a window to trade cards before the envelope. */
  trades: boolean;
  /** What for?: missions marked heavy (shipwrecks, funerals) can come up. */
  heavy: boolean;
  /** What for?: missions switched off, by id: a mission added later comes in switched on. */
  offMissions: string[];
  /**
   * "classic": everyone plays. "host": What for? with a presenter, who picks
   * the mission and the lots and gives the verdict (3 people or more).
   */
  mode: "classic" | "host";
  /** "vote": everyone votes on themes the tastes and the theme list leave on. "host": the host types the theme. */
  themeMode: "vote" | "host";
  /** Tastes switched off: their characters leave every theme (tastes.ts). At least one stays on. */
  offTastes: Taste[];
  /** Themes switched off, by id (theme-id.ts): a theme added later comes in switched on. */
  offThemes: string[];
}

export const DEFAULT_SETTINGS: RoomSettings = {
  game: DEFAULT_GAME,
  name: "",
  visibility: "public",
  password: "",
  seats: 4,
  voteSeconds: 40,
  askSeconds: 80,
  guessSeconds: 60,
  answerSeconds: 80,
  validateSeconds: 40,
  replySeconds: 45,
  talkSeconds: 120,
  lastSeconds: 45,
  impostors: null,
  lotSeconds: 60,
  tradeSeconds: 60,
  defendSeconds: 90,
  judgeSeconds: 60,
  ...DEFAULT_RULES,
  mode: "host",
  themeMode: "vote",
  offTastes: [],
  offThemes: [],
};
/** The most themes a room can switch off: about every theme there is. */
export const OFF_THEMES_MAX = 1000;
export const ROOM_NAME_MAX = 25;
export const ROOM_PASSWORD_MAX = 20;
export const STEP_SECONDS_MIN = 30;
export const STEP_SECONDS_MAX = 300;
/** The timed steps a room sets, each with its own seconds, in the order a match plays them. */
export const STEP_TIMES = [
  "voteSeconds",
  "askSeconds",
  "answerSeconds",
  "guessSeconds",
  "validateSeconds",
  "replySeconds",
  "talkSeconds",
  "lastSeconds",
  "lotSeconds",
  "tradeSeconds",
  "defendSeconds",
  "judgeSeconds",
] as const;
export type StepTime = (typeof STEP_TIMES)[number];
/** Each game's clocks, in the order its match plays them. */
export const GAME_STEP_TIMES: Record<GameKey, readonly StepTime[]> = {
  "who-am-i": [
    "voteSeconds",
    "askSeconds",
    "answerSeconds",
    "guessSeconds",
    "validateSeconds",
  ],
  impostor: ["voteSeconds", "replySeconds", "talkSeconds", "lastSeconds"],
  lineup: ["lotSeconds", "tradeSeconds", "defendSeconds", "judgeSeconds"],
};
/** Picking a character always gets this long. */
export const PICK_SECONDS = 120;
/** The longest character name, typed or saved. */
export const MAX_CHARACTER_NAME = 60;
/**
 * Clock cuts: in a step several people act on (the theme vote, the answers),
 * each one who acts while others still owe theirs cuts the step's time divided
 * by how many act (a third with three, a quarter with four), so the time is
 * shared out evenly and nobody waits long on the last one... but whoever is
 * left keeps at least this long (ms).
 */
export const CLOCK_CUT_FLOOR_MS = 10_000;
/** The Impostor's talk keeps at least this long however fast the votes come (ms). */
export const TALK_FLOOR_MS = 20_000;
/**
 * A lobby has no clock: the match starts when the host starts it. One nobody
 * touched in this long leaves the room list: its pages may have died without
 * saying so (a killed browser sends no goodbye). Open pages keep a room
 * touched, see HEARTBEAT_MS.
 */
export const LOBBY_LISTED_MS = 3 * 60_000;
/**
 * An open page asks for its room every poll; when the room has not been
 * written for this long, that read writes a quiet SEEN, so a room with a page
 * open is never older than this plus a poll.
 */
export const HEARTBEAT_MS = 60_000;
/**
 * How long a closed page counts as a reload. After that a lobby lets the
 * player go, and a match whose players have all closed their pages ends.
 */
export const GONE_GRACE_MS = 5000;

/** How long a player the host removed from the lobby stays out (ms). */
export const KICK_MS = 2 * 60_000;
/** The podium stays this long; then the room goes back to the lobby on its own (the host can go sooner). */
export const RESULT_SECONDS = 15;
/** Themes offered in the vote before each match. */
export const THEME_OPTIONS = 4;
/** How long the host has to type the theme; then everyone votes instead, on themes from every set. */
export const HOST_THEME_SECONDS = 30;
/** Ideas shown to the host while they type the theme. */
export const THEME_IDEAS = 12;
export const MAX_THEME = 50;
export const MAX_QUESTION = 140;
export const MAX_NOTE = 200;
export const MAX_GUESS = 80;
export const MAX_NAME = 16;

/**
 * How long everyone looks at a reveal (ms). Turn steps start under it.
 * Answers: a base for the entrance and the question, plus time to read each answer and its note,
 * kept between 6 and 10 seconds. Guesses: a quick "not yet", a longer moment for a hit (card flip, confetti).
 * The shows that present a match (opening, theme, cast) are timed by SHOW_TIMING.
 */
export const REVEAL_TIMING = {
  answersBase: 4000,
  perAnswer: 1000,
  perNoteChar: 60,
  answersMin: 6000,
  answersMax: 10000,
  guessMiss: 4000,
  guessHit: 5000,
  /** The turn player passed instead of guessing. */
  pass: 2600,
} as const;

// One file per scene in show-timing/; tests read the constants, never literals.
export { SHOW_MARKS, SHOW_TIMING } from "./show-timing";

/** The scenes a show is made of, back to back. */
export const BEAT_KINDS = [
  "curtain",
  "intro",
  "round",
  "entrance",
  "tie_spin",
  "settle",
  "theme",
  "rule",
  "draw",
  "target",
  "picked",
  "received",
  "order",
  "card",
  // What for?
  "rules",
  "secret",
  "sold",
  "wrap",
  "envelope",
  "votes",
  "stamp",
  "chair",
  "verdict",
] as const;
export type BeatKind = (typeof BEAT_KINDS)[number];
/** One scene of a show, in server ms. */
export interface Beat {
  kind: BeatKind;
  startsAt: number;
  until: number;
}
/**
 * The shows that present a match, timed by the server so every screen plays them together:
 * opening (lobby out, cold open or "Round N", the vote or the host's form coming in),
 * theme (the result, the theme, the rule, the draw, "for whom"), cast (everyone picked,
 * "Rafa picked yours", the turn order). Each step's clock starts when its show ends.
 */
export type ShowKind =
  | "opening"
  | "theme"
  | "cast"
  | "deal"
  /** What for?: a lot under the hammer, the end of the auction, the envelope, the votes. */
  | "sold"
  | "wrap"
  | "envelope"
  | "tally";

/** Every show kind, for the places that tell a show from a reveal. */
export const SHOW_KINDS: readonly ShowKind[] = [
  "opening",
  "theme",
  "cast",
  "deal",
  "sold",
  "wrap",
  "envelope",
  "tally",
];

/** A card of the rule scene: a library id (the same in every language), one picture, its names. */
export interface ExampleCard {
  id: string;
  imageUrl: string;
  names: Partial<Record<Lang, string>>;
}
/** ✓✓ and ✗ for the rule scene; decided by the server at START, the same for everyone. */
export interface RuleExamples {
  fits: [ExampleCard, ExampleCard];
  misfit: ExampleCard | null;
}

/** One row of a language's character library. */
export interface Character {
  id: string;
  lang: Lang;
  name: string;
  origin: string | null;
  imageUrl: string | null;
  /** Other spellings and other-language names; only used to match guesses. */
  aliases: string[];
}

export type Phase =
  | "lobby"
  /** The host types the theme (theme mode "host"). */
  | "theming"
  /** Everyone votes for one of four themes. */
  | "voting"
  | "picking"
  | "asking"
  | "answering"
  | "guessing"
  | "validating"
  /** Impostor: everyone still in answers the question about their card. */
  | "replying"
  /** Impostor: everyone talks and votes someone out. */
  | "talking"
  /** Impostor: a caught impostor guesses the crew's card. */
  | "last_chance"
  /** What for?: a lot on the table. */
  | "bidding"
  /** What for?: the auction stops to show every board and purse. */
  | "halftime"
  /** What for?: trades before the envelope. */
  | "trading"
  /** What for?: everyone lays out their board for the mission. */
  | "defending"
  /** What for?, with a presenter: they pick the round's mission; the others guess what for. */
  | "choosing"
  /** What for?, with a presenter: the queue ran dry; the next lot waits for them. */
  | "queueing"
  /** What for?: the boards on stage, one by one. */
  | "presenting"
  /** What for?, with a presenter: they pick the winning board and say why. */
  | "verdict"
  /** What for?: the secret vote for the best board. */
  | "judging"
  /** What for?: those who voted outside a tie choose among the tied. */
  | "tiebreak"
  /** What for?: the round's score. */
  | "scoring"
  | "finished"
  /** Lobby expired with a single player, or everyone left. */
  | "closed";

export interface RoomPlayer extends Identity {
  ready: boolean;
  joinedAt: number;
  /** Consecutive turns lost to the clock; at 2 the player is treated as having given up. */
  strikes: number;
  /** Left the match (or struck out). Never asked to act again; answers default to "unknown". */
  away: boolean;
  /** When their page closed (tab or window), until they show up again. */
  goneAt: number | null;
  /** Their colour (0-based, --seat-1..10), given on joining and theirs until they leave the room. */
  colorSlot: number;
}

/**
 * What is on the picker's card while they edit it; if the clock runs out, it becomes the pick.
 * Only the picker ever sees it.
 */
export interface PickDraft {
  /** The character the card shows: picked, or the highlighted row's preview. */
  characterId: string | null;
  /** The name field as typed (0..MAX_CHARACTER_NAME). */
  name: string;
  /**
   * The picture on the card when it is not the character's cover: one sent
   * for a new name, or another picture of the library character (checked by
   * the server against the character's pictures).
   */
  imageUrl: string | null;
  /** Set by the server: the id ("u-<uuid>") the clock gives a new character. */
  newId: string | null;
  /** The hand or the dice offered the character: its pick counts less for the theme. */
  suggested?: true;
}

/** Keyed by the player who must discover the character. */
export interface Assignment {
  pickerId: PlayerId;
  character: Character | null;
  /** The clock drew it: the card was empty when the time ran out. */
  auto?: true;
  /** The hand or the dice offered it to the picker (see PickDraft). */
  suggested?: true;
  /** The card as the picker left it; gone once the pick is set. */
  draft: PickDraft | null;
}

export interface AnswerEntry {
  by: PlayerId;
  value: AnswerValue;
  note: string | null;
}

/**
 * A question or a guess. Both carry the number of the turn they were played in
 * (a "rodada": one player's question, answers, guess and its check).
 */
export type Play =
  | {
      n: number;
      kind: "question";
      by: PlayerId;
      text: string;
      answers: AnswerEntry[];
      /** Still being answered; not part of the visible history yet. */
      open: boolean;
    }
  | {
      n: number;
      kind: "guess";
      by: PlayerId;
      text: string;
      result: "hit" | "miss" | "pending";
    };

export interface Outcome {
  /** Number of the turn that discovered the character. */
  discoveredAt: number | null;
  /**
   * 1 = first to discover. Players who discover in the same turn round tie and
   * share the place (1, 1, 3): the later ones in the order had no earlier turn.
   */
  place: number | null;
  /** The turn round of the discovery. */
  round: number | null;
  gaveUp: boolean;
  /** Epoch ms when the player discovered, gave up, left or timed out. */
  endedAt: number | null;
}

/** The vote that picks the theme of a match. */
export interface ThemeVote {
  options: Theme[];
  /** Option index by voter. Players may change or take back their vote until everyone has voted. */
  votes: Record<PlayerId, number>;
  /** What each voter's vote took off the clock (ms): it comes back if they take the vote back. */
  cuts: Record<PlayerId, number>;
  /** The winner, once the vote is over. */
  chosen: number | null;
  /** Options that tied for the most votes; the draw picked `chosen` among them. */
  tied: number[];
  /** The rule scene's cards for each option (first match only), aligned with `options`. */
  examples?: (RuleExamples | null)[];
  /** Impostor: each option's cards and questions, aligned with `options`. Never shown. */
  deals?: ImpDeal[];
}

/**
 * The moment everyone sees between two steps: an answers or guess reveal (the play itself
 * lives in `plays`), or a show that presents the match.
 */
export interface Reveal {
  kind: "answers" | "guess" | "pass" | "replies" | "out" | "swap" | ShowKind;
  /** The turn revealed; for a show, the match it presents (`round`; `round + 1` for the opening). */
  n: number;
  startsAt: number;
  until: number;
  /** Shows only: the beats, back to back from `startsAt` to `until`. */
  beats?: Beat[];
  /** Shows only: the room's first match (the long versions). */
  first?: boolean;
  /** Theme show with a rule beat: its cards; null = the sentence alone. */
  rule?: RuleExamples | null;
  /** Shows only: the show still running when this one was staged; it plays out until its own `until`. */
  prev?: Reveal | null;
}

/** A finished match, as the lobby lists it. */
export interface PastMatch {
  /** Which of the room's matches it was (1 = the first). */
  round: number;
  theme: Theme | null;
  finishedAt: number;
  /** Everyone who played it, as they were then: best place first, those who never discovered last. */
  players: PastPlayer[];
}

export type PastPlayer = Pick<
  Identity,
  "id" | "isGuest" | "name" | "guestNumber" | "avatar"
> & { colorSlot: number; place: number | null };

export interface RoomState {
  code: string;
  hostId: PlayerId;
  settings: RoomSettings;
  phase: Phase;
  /** Seat order (join order). */
  players: RoomPlayer[];
  /** Turn order, set when the match starts. */
  order: PlayerId[];
  theme: Theme | null;
  /** The theme vote of the current round; kept after it closes, for the reveal. Null when the host typed the theme. */
  vote: ThemeVote | null;
  /** Ideas for the host while they type the theme. */
  ideas: Theme[];
  assignments: Record<PlayerId, Assignment>;
  turnPlayerId: PlayerId | null;
  plays: Play[];
  outcomes: Record<PlayerId, Outcome>;
  /** Epoch ms when the current step ends. */
  deadline: number | null;
  /** Epoch ms when the current step's clock starts: later than "now" while a reveal is showing. */
  stepStartsAt: number | null;
  /** The step's full length (ms); the deadline can come sooner (answers cut it). */
  stepMs: number | null;
  /** The latest reveal or show; only shown while it lasts. */
  reveal: Reveal | null;
  /** Counts matches played in this room. */
  round: number;
  /**
   * Someone seated when the match started had never finished one: the match
   * plays the long shows, as on the room's first.
   */
  newcomer: boolean;
  /**
   * Turn rounds of the current match: 1 while everyone takes their first turn,
   * 2 for the second, and so on.
   */
  turnRound: number;
  /**
   * Turns of the current match, one per player's turn: the number of the one
   * under way (1 = the first). Its question and guess carry it.
   */
  turnNumber: number;
  /** Epoch ms when the first question of this match can be asked (the end of the cast show); null before. */
  playStartedAt: number | null;
  /** Players the host removed: until when (epoch ms) they can't come back. Missing in older rooms. */
  kicked?: Record<PlayerId, number>;
  /** The room's latest finished matches, newest first. Missing in rooms made before it was kept. */
  matches?: PastMatch[];
  /** The Impostor match under way (or just over); null otherwise. Missing in older rooms. */
  imp?: ImpostorMatch | null;
  /** Impostor questions the room asked lately, newest first: its next matches skip them. */
  recentQuestions?: string[];
  /** The What for? match under way (or just over); null otherwise. Missing in older rooms. */
  lu?: LineupMatch | null;
  /** What for? missions the room played lately, newest first: its next matches skip them. */
  recentMissions?: string[];
  /** What for?'s TV chair: who presents the next match with a presenter (empty: everyone plays). */
  chair?: PlayerId | null;
  /** The host drew who sits in the chair; the next opening says so. */
  chairDrawn?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type GameEvent =
  | { type: "JOIN"; player: Identity; password?: string }
  | { type: "LEAVE"; playerId: PlayerId }
  /** The player's page closed; they may just be reloading. */
  | { type: "GONE"; playerId: PlayerId }
  /** The player's page is open again. */
  | { type: "BACK"; playerId: PlayerId }
  /** Someone has a page open on the room: touches it, so a room nobody left open ages out of the list. */
  | { type: "SEEN"; playerId: PlayerId }
  /** Settles players whose page has been closed for longer than GONE_GRACE_MS. */
  | { type: "SWEEP" }
  | { type: "SET_READY"; playerId: PlayerId; ready: boolean }
  /** The host removes someone from the lobby; they stay out for KICK_MS. */
  | { type: "KICK"; playerId: PlayerId; targetId: PlayerId }
  /** The host hands the room to someone present, in the lobby; they become the host. */
  | { type: "TRANSFER_HOST"; playerId: PlayerId; targetId: PlayerId }
  | {
      type: "UPDATE_SETTINGS";
      playerId: PlayerId;
      settings: Partial<RoomSettings>;
    }
  /** Name or avatar changed while sitting in the room. */
  | { type: "UPDATE_IDENTITY"; player: Identity }
  /** A guest signed in: the account takes the guest's seat, history and all. */
  | { type: "SWAP_PLAYER"; from: PlayerId; player: Identity }
  /**
   * `themes`: the THEME_OPTIONS themes put to the vote, or ideas for a host who types the theme.
   * `examples`: the rule scene's cards for each theme (a room's first match), aligned with `themes`.
   */
  | {
      type: "START";
      playerId: PlayerId;
      /** Who am I? and the Impostor: the themes put to the vote. */
      themes?: Theme[];
      examples?: (RuleExamples | null)[];
      /** Someone seated has never finished a match (the server checks). */
      newcomer?: boolean;
      /** Impostor: each theme's cards and questions, aligned with `themes`. */
      deals?: ImpDeal[];
      /** What for?: each round's cards and mission. */
      decks?: LuDeck[];
    }
  | { type: "VOTE"; playerId: PlayerId; option: number }
  | { type: "UNVOTE"; playerId: PlayerId }
  /** The host typed the theme. */
  | { type: "SET_THEME"; playerId: PlayerId; text: string }
  /** The picker's card as it is now (null: empty); written quietly, it becomes the pick if time runs out. */
  | { type: "DRAFT"; playerId: PlayerId; draft: PickDraft | null }
  | {
      type: "PICK";
      playerId: PlayerId;
      character: Character;
      /** The hand or the dice offered it. */
      suggested?: boolean;
    }
  | { type: "ASK"; playerId: PlayerId; text: string }
  | {
      type: "ANSWER";
      playerId: PlayerId;
      value: AnswerValue;
      note: string | null;
    }
  | { type: "GUESS"; playerId: PlayerId; text: string }
  | { type: "PASS"; playerId: PlayerId }
  | { type: "VALIDATE"; playerId: PlayerId; correct: boolean }
  | { type: "GIVE_UP"; playerId: PlayerId }
  /** Impostor: an answer to the open question (again to change it). */
  | { type: "REPLY"; playerId: PlayerId; answer: ImpAnswer }
  /** Impostor: takes the answer back; the time it cut comes back. */
  | { type: "UNREPLY"; playerId: PlayerId }
  /** Impostor: points at someone (null: nobody). Free, shown to all, counts for nothing. */
  | { type: "POINT"; playerId: PlayerId; targetId: PlayerId | null }
  /** Impostor: confirms a vote to send someone out; it cuts the clock. */
  | { type: "ACCUSE"; playerId: PlayerId; targetId: PlayerId }
  /** Impostor: takes the confirmed vote back; the time it cut comes back. */
  | { type: "UNACCUSE"; playerId: PlayerId }
  /** Impostor: the player doesn't know their card; everyone gets new ones, nobody is told who asked. */
  | { type: "DONT_KNOW"; playerId: PlayerId }
  /** Impostor: a caught impostor's guess at the crew's card. */
  | { type: "LAST_GUESS"; playerId: PlayerId; text: string }
  /** What for?: an offer on the lot on the table: the amount, never "+1". */
  | { type: "BID"; playerId: PlayerId; amount: number }
  /** What for?: out of this lot ("Pass"). */
  | { type: "FOLD"; playerId: PlayerId }
  /** What for?: done with the break, the trades, the board or the score (false: not after all). */
  | { type: "DONE"; playerId: PlayerId; done: boolean }
  /** What for?: an open trade offer; it replaces the player's last one. */
  | ({ type: "OFFER"; playerId: PlayerId } & Omit<LuOffer, "from">)
  | { type: "CANCEL_OFFER"; playerId: PlayerId }
  | {
      type: "ANSWER_OFFER";
      playerId: PlayerId;
      from: PlayerId;
      accept: boolean;
    }
  /** What for?: the board as its owner has it now (written quietly). */
  | { type: "BOARD"; playerId: PlayerId; board: unknown }
  /** What for?: the owner on stage is done talking. */
  | { type: "PRESENTED"; playerId: PlayerId }
  /** What for?: reactions to a board on stage (`board`, its owner), counted per emoji. */
  | { type: "REACT"; playerId: PlayerId; board: PlayerId; counts: number[] }
  /** What for?: a secret vote for a board (in a tiebreak, among the tied). */
  | { type: "JUDGE"; playerId: PlayerId; ownerId: PlayerId }
  /** The TV chair (What for?'s presenter): `seat` sits there (oneself, or anyone for the host); null empties it. */
  | { type: "CHAIR"; playerId: PlayerId; seat: PlayerId | null }
  /** The host draws who sits in the TV chair, among the people here. */
  | { type: "DRAW_CHAIR"; playerId: PlayerId }
  /** What for?, the presenter: one of the round's three missions (`pick`), or their own `text`. */
  | {
      type: "MISSION";
      playerId: PlayerId;
      pick: number | null;
      text: string | null;
    }
  /** What for?, the presenter: the lots to come, in order (the server makes the cards). */
  | { type: "QUEUE"; playerId: PlayerId; cards: LuCard[] }
  /** What for?, the presenter's remote: a sound for everyone (one every few seconds). */
  | { type: "CUE"; playerId: PlayerId; kind: LuCue }
  /** What for?, a player waiting on the presenter: "What for ____" (empty takes it back). */
  | { type: "HUNCH"; playerId: PlayerId; text: string }
  /** What for?, the presenter: the winning board and why; not `final` keeps it as a draft. */
  | {
      type: "VERDICT";
      playerId: PlayerId;
      ownerId: PlayerId;
      why: string;
      final: boolean;
    }
  /** What for?: "Good mission?" (null takes it back). */
  | { type: "RATE"; playerId: PlayerId; up: boolean | null }
  /** Host only, from the podium: everyone goes back to the lobby for another match. */
  | { type: "BACK_TO_LOBBY"; playerId: PlayerId }
  /**
   * The step's clock ran out. The caller supplies what the engine cannot make up:
   * themes to vote on (a host who never typed the theme) with their rule cards,
   * and for picking, the characters the drafts became and popular characters for empty cards.
   */
  | {
      type: "TIMEOUT";
      themes?: Theme[];
      examples?: (RuleExamples | null)[];
      fallbackCharacters?: Character[];
      /** Picker id → the character their draft became (found or created by the server first). */
      drafted?: Record<PlayerId, Character>;
    };

export interface Ctx {
  now: number;
  /** 0..1, injectable so tests are deterministic. */
  random: () => number;
  /** e2e only: scales every show beat (never the step clocks). */
  showScale?: number;
}

export const ERROR_CODES = [
  "not_found",
  "room_full",
  "already_started",
  "not_member",
  "not_host",
  "not_your_turn",
  "wrong_phase",
  "invalid_input",
  "need_two_players",
  /** The Impostor needs three. */
  "need_three_players",
  /** An Impostor word answer gave the card away (its name, a nickname or its work). */
  "gives_away",
  /** What for?: someone else's bid got there first; the lot costs more now. */
  "outbid",
  /** What for?: the room's tastes leave too few known characters to deal from. */
  "few_cards",
  "already_done",
  "conflict",
  "unauthorized",
  "upload_failed",
  /** The picture detector refused it: sexual content, real nudity or gore. */
  "image_rejected",
  "rate_limited",
  /** The step has not started yet: a reveal is still on screen. */
  "too_early",
  /** Too few characters were picked for this theme in past matches to draw one. */
  "not_enough_picks",
  /** The room is private: a newcomer has to give its password. */
  "password_required",
  "wrong_password",
  /** The player is in a match that is still going: they finish or leave it first. */
  "in_match",
  /** The host removed the player from this room a moment ago (KICK_MS). */
  "kicked",
  /** Another account has that @handle. */
  "handle_taken",
  /** The @handle changed less than HANDLE_CHANGE_DAYS ago. */
  "handle_wait",
  /** Only an account can do this (vote, suggest, give a nickname). */
  "sign_in_needed",
  "unknown",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class GameError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
    this.name = "GameError";
  }
}

// ---------------------------------------------------------------------------
// What one player is allowed to see. The server builds this; the browser never
// receives RoomState.
// ---------------------------------------------------------------------------

export type PlayerStatus =
  // lobby
  | "host"
  | "ready"
  | "not_ready"
  // the host typing the theme (the others wait)
  | "theming"
  // voting
  | "voting"
  | "voted"
  // picking
  | "picking"
  | "picked"
  // turn
  | "asking"
  | "will_answer"
  | "answering"
  | "answered"
  | "guessing"
  | "validating"
  | "waiting"
  // impostor
  | "replying"
  | "replied"
  | "talking"
  | "accused"
  | "out"
  // what for?
  | "bidding"
  | "passed"
  | "working"
  | "done"
  | "presenting"
  | "judging"
  | "judged"
  // what for?, the presenter in their booth
  | "hosting"
  // end states
  | "discovered"
  | "gave_up";

export interface CardView {
  characterId: string;
  name: string;
  origin: string | null;
  imageUrl: string | null;
}

export interface PlayerView {
  id: PlayerId;
  isYou: boolean;
  isHost: boolean;
  isGuest: boolean;
  /** As the viewer reads it: an account's name, or the guest name in the viewer's language. */
  name: string;
  avatar: Avatar;
  ready: boolean;
  status: PlayerStatus;
  /** Place in the room (join order), 0-based. */
  seat: number;
  /** Their colour (0-based, --seat-1..10): theirs from joining until they leave the room. */
  colorSlot: number;
  /** Place in this match's turn order, 0-based (the first to play is 0); null outside a match. */
  turnOrder: number | null;
  /** It is this player's turn (the ring in the player strip). */
  isTurn: boolean;
  /** Null while it must stay secret from the viewer, or before it is picked. */
  card: CardView | null;
  /** True when it is the viewer's own card and they have not discovered it yet. */
  cardHidden: boolean;
  /** Who picked this player's character, from picking on; your own too ("Rafa picked yours"). */
  pickedById: PlayerId | null;
  discoveredAt: number | null;
  place: number | null;
  gaveUp: boolean;
  /** Left the room mid-match. */
  away: boolean;
}

export type HistoryEntryView =
  | {
      n: number;
      kind: "question";
      byId: PlayerId;
      text: string;
      answers: { byId: PlayerId; value: AnswerValue; note: string | null }[];
    }
  | {
      n: number;
      kind: "guess";
      byId: PlayerId;
      text: string;
      result: "hit" | "miss";
    };

export interface TurnView {
  /** Number of the turn being played. */
  n: number;
  playerId: PlayerId;
  /** Set from "answering" on. */
  question: string | null;
  /** Who has answered so far (answering). */
  answeredIds: PlayerId[];
  yourAnswer: { value: AnswerValue; note: string | null } | null;
  /** Everyone's answers, visible once the question is resolved (guessing, validating). */
  answers: { byId: PlayerId; value: AnswerValue; note: string | null }[] | null;
  /** The guess under validation. */
  guess: string | null;
  /** The only player who is asked whether the guess is right: whoever picked that character. */
  validatorId: PlayerId | null;
}

/** A show as everyone sees it: the screens find the beat on now with the server clock. */
export interface ShowView {
  kind: ShowKind;
  /** The match it presents ("Round N"). */
  n: number;
  startsAt: number;
  until: number;
  beats: Beat[];
  /** The room's first match: the long versions. */
  first: boolean;
  /** The rule scene's cards; null = the sentence alone (or no rule beat). */
  rule: RuleExamples | null;
  /** The show still playing when this one was staged, while it lasts; this one starts at its end. */
  prev: ShowView | null;
}

export type RevealView =
  /** The opening, the theme (the vote screen plays its result out, see VoteView) or the cast. */
  | ShowView
  | {
      kind: "answers";
      n: number;
      byId: PlayerId;
      question: string;
      answers: { byId: PlayerId; value: AnswerValue; note: string | null }[];
      startsAt: number;
      until: number;
    }
  | {
      kind: "guess";
      n: number;
      byId: PlayerId;
      guess: string;
      result: "hit" | "miss";
      /** The guesser's character, when the viewer may see it (always on a hit). */
      card: CardView | null;
      /** Place reached with this hit (1 = first). */
      place: number | null;
      /** Someone else discovered in the same turn round and shares the place. */
      tied: boolean;
      startsAt: number;
      until: number;
    }
  /** The turn player let the guess go (or its clock ran out). */
  | {
      kind: "pass";
      n: number;
      byId: PlayerId;
      startsAt: number;
      until: number;
    }
  /** Impostor: the answers to question `n` (its index in ImpostorView.asked) land together. */
  | { kind: "replies"; n: number; startsAt: number; until: number }
  /** Impostor: the vote of round `n` sent `id` out (null: a tie, nobody goes) and whether they were one. */
  | {
      kind: "out";
      n: number;
      id: PlayerId | null;
      impostor: boolean | null;
      startsAt: number;
      until: number;
    }
  /** Impostor: someone didn't know their card, so everyone got new ones. */
  | { kind: "swap"; n: number; startsAt: number; until: number };

export interface VoteView {
  options: Theme[];
  /** Votes are open: everyone sees who voted for what. */
  votes: { byId: PlayerId; option: number }[];
  yourVote: number | null;
  chosen: number | null;
  tied: number[];
  /** How many players vote. */
  total: number;
}

export interface PickView {
  /** The player you are picking for. */
  targetId: PlayerId;
  confirmed: boolean;
  character: CardView | null;
  confirmedIds: PlayerId[];
  total: number;
  /** Your card as you left it, to restore it after a reload; null once confirmed. Only yours. */
  draft: Omit<PickDraft, "newId"> | null;
}

export interface RoomView {
  code: string;
  phase: Phase;
  settings: RoomSettings;
  /** What for?'s TV chair: who presents the next match with a presenter. */
  chairId: PlayerId | null;
  round: number;
  version: number;
  youId: PlayerId;
  hostId: PlayerId;
  players: PlayerView[];
  theme: Theme | null;
  deadline: number | null;
  /** When the current step's clock starts. Before that a reveal is on screen and the timer refills. */
  stepStartsAt: number | null;
  /** The step's full length (ms). The deadline lands sooner once answers cut the clock. */
  stepMs: number | null;
  /** When a closed page's grace runs out and the room has a seat to free (or closes): refetch then. */
  sweepAt?: number | null;
  /** Shown to everyone until `reveal.until`; null when nothing is being revealed. */
  reveal: RevealView | null;
  /** Server clock when this view was built; use it to correct the countdown. */
  serverNow: number;
  /** Present while voting and while the chosen theme is revealed. */
  vote: VoteView | null;
  /** The host only, while they type the theme. */
  ideas: Theme[] | null;
  /** Present while picking, and while the cast show that follows it plays. */
  pick: PickView | null;
  /** Present from "asking" to "validating". */
  turn: TurnView | null;
  /** Resolved questions and guesses, oldest first. */
  history: HistoryEntryView[];
  /** Turns of this match so far, the one under way included. */
  turns: number;
  /** The lobby only: the room's latest finished matches, newest first. */
  matches: PastMatchView[];
  /** Present for an Impostor match, from the cards on. */
  imp: ImpostorView | null;
  /** Present for a What for? match. */
  lu: LineupView | null;
  /** Host only: the match can start (enough players for the game). */
  canStart: boolean;
}

/** An Impostor match as one player sees it: their own card only, and never which side it is. */
export interface ImpostorView {
  /** The viewer's card; null for someone who sat down after the deal. */
  card: CardView | null;
  /** How many hold the other card. */
  impostors: number;
  round: number;
  /** Still in: they answer and vote. */
  playingIds: PlayerId[];
  asked: ImpAskedView[];
  vote: {
    round: number;
    points: { byId: PlayerId; targetId: PlayerId }[];
    votes: { byId: PlayerId; targetId: PlayerId }[];
    yourPoint: PlayerId | null;
    yourVote: PlayerId | null;
  } | null;
  /** Who went out, and whether they were an impostor; a last chance's guess waits for the end. */
  outs: Omit<ImpOut, "guess" | "hit" | "by">[];
  /** The caught impostor guessing now. */
  guessing: PlayerId | null;
  swaps: number;
  /** Once it's over: everything. */
  end: {
    winner: ImpWinner;
    reason: NonNullable<ImpostorMatch["reason"]>;
    crew: CardView;
    impostor: CardView;
    impostorIds: PlayerId[];
    outs: ImpOut[];
    /** The room's points for this match, by player. */
    points: Record<PlayerId, number>;
  } | null;
}

export interface ImpAskedView {
  round: number;
  question: ImpQuestion;
  /** Who answered so far (the open question). */
  answeredIds: PlayerId[];
  yours: ImpAnswer | null;
  /** Everyone's, once revealed. */
  answers: { byId: PlayerId; answer: ImpAnswer }[] | null;
}

export interface PastMatchView {
  round: number;
  theme: Theme | null;
  /** Best place first. Someone still seated shows as they are now. */
  players: {
    id: PlayerId;
    isYou: boolean;
    name: string;
    avatar: Avatar;
    colorSlot: number;
    place: number | null;
  }[];
}

/** A waiting public room, as listed on the home screen. */
export interface PublicRoom {
  code: string;
  game: GameKey;
  /** Empty when the host left it unnamed. */
  name: string;
  /** Private: joining asks for the password. */
  locked: boolean;
  /** open: has a free seat; full: lobby with no seat left; playing: match under way. */
  status: "open" | "full" | "playing";
  /** The host's name in the reader's language (see PlayerView.name). */
  host: Pick<Identity, "id" | "isGuest" | "avatar" | "lang"> & { name: string };
  players: number;
  seats: number;
  /** The tastes the room switched off: the list shows them and filters by them. */
  offTastes: Taste[];
  /** When the room was made (server ms): the game page lists the oldest first. */
  createdAt: number;
  voteSeconds: number;
  askSeconds: number;
  guessSeconds: number;
  answerSeconds: number;
  validateSeconds: number;
  replySeconds: number;
  talkSeconds: number;
  lastSeconds: number;
  lotSeconds: number;
  tradeSeconds: number;
  defendSeconds: number;
  judgeSeconds: number;
}

/** A listed room as the server keeps it, before its host's name is put in the reader's language. */
export type ListedRoom = Omit<PublicRoom, "host"> & {
  host: Pick<
    Identity,
    "id" | "isGuest" | "name" | "guestNumber" | "avatar" | "lang"
  >;
};

/** Where a player is now, as their profile tells someone else. */
export interface PlayingNow {
  game: GameKey;
  /** The room, only when it is public: a private one keeps its name and code to itself. */
  room: {
    code: string;
    /** Empty when the host left it unnamed. */
    name: string;
    /** Players seated. */
    taken: number;
    seats: number;
    /** The reader can take a seat: a lobby with one free that they don't hold already. */
    open: boolean;
  } | null;
}

/** Just what counting the players online needs from a room. */
export interface ActiveRoom {
  game: GameKey;
  phase: Phase;
  updatedAt: number;
  players: Pick<RoomPlayer, "away" | "goneAt">[];
}
