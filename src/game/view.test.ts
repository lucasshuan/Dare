import { describe, expect, it } from "vitest";
import { isCloseMatch, normalizeName } from "./match";
import { Game, THEMES } from "./test-utils";
import {
  type ActiveRoom,
  GameError,
  GONE_GRACE_MS,
  LOBBY_LISTED_MS,
} from "./types";
import { playersOnline, toPublicRoom, toView } from "./view";

/** Picks done and the cast over. */
function started(n: number, seed = 3) {
  const g = new Game(n, seed);
  g.start();
  g.pickAll();
  g.skipShow();
  return g;
}

const view = (g: Game, id: string) => toView(g.state, 1, id, g.now, "en");
const leaks = (g: Game, id: string) => {
  const json = JSON.stringify(view(g, id));
  return json.includes(`c-${id}`) || json.includes(`Name ${id}`);
};

describe("secrecy", () => {
  it("outsiders get nothing", () => {
    const g = started(2);
    expect(() => view(g, "stranger")).toThrow(GameError);
  });

  it("nobody sees their own card while playing (only who picked it)", () => {
    const g = started(3);
    for (const p of g.state.players) {
      expect(leaks(g, p.id)).toBe(false);
      const me = view(g, p.id).players.find((x) => x.isYou);
      expect(me).toMatchObject({
        card: null,
        cardHidden: true,
        pickedById: g.state.assignments[p.id].pickerId,
      });
      const others = view(g, p.id).players.filter((x) => !x.isYou);
      expect(
        others.every((o) => o.card !== null && o.pickedById !== null),
      ).toBe(true);
    }
  });

  it("cards stay closed while picking, except the one you picked", () => {
    const g = new Game(3, 3);
    g.start();
    const [target, a] = Object.entries(g.state.assignments)[0];
    g.do({
      type: "PICK",
      playerId: a.pickerId,
      character: {
        id: "secret",
        lang: "pt",
        name: "Secret",
        origin: null,
        imageUrl: null,
        aliases: [],
      },
    });
    const pickerView = view(g, a.pickerId);
    expect(pickerView.pick).toMatchObject({
      targetId: target,
      confirmed: true,
    });
    expect(pickerView.pick?.character?.name).toBe("Secret");
    expect(JSON.stringify(view(g, target))).not.toContain("Secret");
    expect(pickerView.players.every((p) => p.card === null)).toBe(true);
  });

  it("answers stay hidden until everyone answered", () => {
    const g = started(3);
    const asker = g.turn;
    g.do({ type: "ASK", playerId: asker, text: "Q?" });
    const [first, second] = g.state.order.filter((id) => id !== asker);
    g.do({ type: "ANSWER", playerId: first, value: "no", note: "first-note" });
    expect(JSON.stringify(view(g, second))).not.toContain("first-note");
    expect(view(g, first).turn?.yourAnswer).toEqual({
      value: "no",
      note: "first-note",
    });
    expect(view(g, asker).turn?.answeredIds).toEqual([first]);
    expect(view(g, asker).turn?.answers).toBeNull();
  });

  it("a miss never shows you your own card; a hit does", () => {
    const g = started(2);
    const guesser = g.askAndAnswer();
    g.do({ type: "GUESS", playerId: guesser, text: "wrong" });
    const validator = g.state.assignments[guesser].pickerId;
    g.do({ type: "VALIDATE", playerId: validator, correct: false });
    const mine = view(g, guesser).reveal;
    expect(mine).toMatchObject({ kind: "guess", result: "miss", card: null });
    expect(leaks(g, guesser)).toBe(false);
    expect(view(g, validator).reveal).toMatchObject({
      card: { name: `Name ${guesser}` },
    });

    const next = g.askAndAnswer();
    g.do({ type: "GUESS", playerId: next, text: `Name ${next}` });
    expect(view(g, next).reveal).toMatchObject({
      result: "hit",
      place: 1,
      card: { name: `Name ${next}` },
    });
    expect(view(g, next).players.find((p) => p.isYou)?.card?.name).toBe(
      `Name ${next}`,
    );
  });

  it("the reveal disappears when it ends", () => {
    const g = started(2);
    g.do({ type: "ASK", playerId: g.turn, text: "Q?" });
    g.do({
      type: "ANSWER",
      playerId: g.state.order[1],
      value: "yes",
      note: null,
    });
    expect(view(g, g.turn).reveal?.kind).toBe("answers");
    g.now = g.state.reveal?.until as number;
    expect(view(g, g.turn).reveal).toBeNull();
  });
});

describe("what the view says", () => {
  it("statuses follow the step", () => {
    const g = started(3);
    const asker = g.turn;
    const status = (viewer: string, id: string) =>
      view(g, viewer).players.find((p) => p.id === id)?.status;
    expect(status(asker, asker)).toBe("asking");
    const other = g.state.order.find((id) => id !== asker) as string;
    expect(status(asker, other)).toBe("will_answer");
    g.do({ type: "ASK", playerId: asker, text: "Q?" });
    expect(status(asker, asker)).toBe("waiting");
    expect(status(asker, other)).toBe("answering");
    g.do({ type: "ANSWER", playerId: other, value: "yes", note: null });
    expect(status(asker, other)).toBe("answered");
    expect(view(g, asker).players.find((p) => p.id === asker)?.isTurn).toBe(
      true,
    );
  });

  it("the turn view carries the question, then the answers, then the guess", () => {
    const g = started(2);
    const asker = g.askAndAnswer("Is it big?");
    const t = view(g, asker).turn;
    expect(t).toMatchObject({ n: 1, question: "Is it big?" });
    expect(t?.answers).toHaveLength(1);
    g.do({ type: "GUESS", playerId: asker, text: "maybe" });
    const v = view(g, asker).turn;
    expect(v).toMatchObject({ n: 1, guess: "maybe", question: "Is it big?" });
    expect(v?.validatorId).toBe(g.state.assignments[asker].pickerId);
  });

  it("history lists resolved plays only, oldest first", () => {
    const g = started(2);
    const asker = g.askAndAnswer();
    g.do({ type: "GUESS", playerId: asker, text: "maybe" });
    const h = view(g, asker).history;
    expect(h.map((e) => e.n)).toEqual([1]);
  });

  it("public rooms are listed as open, full or playing", () => {
    const g = new Game(2, 1, { seats: 3 });
    expect(toPublicRoom(g.state, g.now)).toMatchObject({
      status: "open",
      players: 2,
      seats: 3,
    });
    g.do({
      type: "UPDATE_SETTINGS",
      playerId: "p1",
      settings: { visibility: "private", password: "pw" },
    });
    expect(toPublicRoom(g.state, g.now)?.locked).toBe(true);
    const h = new Game(2, 1, { seats: 2 });
    expect(toPublicRoom(h.state, h.now)?.status).toBe("full");
    h.start();
    expect(toPublicRoom(h.state, h.now)?.status).toBe("playing");
    // a match left alone for long is not advertised
    expect(toPublicRoom(h.state, h.now + 21 * 60_000)).toBeNull();
    // a lobby nobody changes for long drops off the list (its pages may have died)
    const t = new Game(2, 1, { seats: 3 });
    expect(t.state.deadline).toBeNull();
    expect(toPublicRoom(t.state, t.now + 2 * 60_000)?.status).toBe("open");
    expect(toPublicRoom(t.state, t.now + LOBBY_LISTED_MS)).toBeNull();
    // an open page keeps touching it, so it stays listed
    t.now += 2 * 60_000;
    t.do({ type: "SEEN", playerId: "p1" });
    expect(toPublicRoom(t.state, t.now + 2 * 60_000)?.status).toBe("open");
    expect(toPublicRoom(t.state, t.now + LOBBY_LISTED_MS)).toBeNull();
  });

  it("players online count open pages in fresh rooms, per game", () => {
    const now = 1_000_000_000;
    const here = { away: false, goneAt: null };
    const room = (
      phase: ActiveRoom["phase"],
      idleMs: number,
      players: ActiveRoom["players"],
    ): ActiveRoom => ({
      game: "who-am-i",
      phase,
      updatedAt: now - idleMs,
      players,
    });
    expect(
      playersOnline(
        [
          room("lobby", 0, [here, here]),
          // left the match, or closed the page past the grace: not counted
          room("asking", 60_000, [
            here,
            { away: true, goneAt: null },
            { away: false, goneAt: now - GONE_GRACE_MS },
          ]),
          // a reload in progress still counts
          room("finished", 0, [{ away: false, goneAt: now - 1000 }]),
          // idle too long, or closed
          room("lobby", LOBBY_LISTED_MS, [here]),
          room("guessing", 20 * 60_000, [here]),
          room("closed", 0, [here]),
        ],
        now,
      ),
    ).toEqual({ "who-am-i": 4 });
    expect(playersOnline([], now)).toEqual({});
  });

  it("a lobby whose every page closed leaves the list at once, and a reload brings it back", () => {
    const g = new Game(2, 1, { seats: 3 });
    g.do({ type: "GONE", playerId: "p1" });
    // one page still open: still listed
    expect(toPublicRoom(g.state, g.now)?.status).toBe("open");
    g.do({ type: "GONE", playerId: "p2" });
    // no grace to wait out
    expect(toPublicRoom(g.state, g.now)).toBeNull();
    g.do({ type: "BACK", playerId: "p2" });
    expect(toPublicRoom(g.state, g.now)?.status).toBe("open");
  });

  it("private rooms are listed locked, and only the host sees the password", () => {
    const g = new Game(2);
    g.do({
      type: "UPDATE_SETTINGS",
      playerId: "p1",
      settings: { visibility: "private", password: "pizza" },
    });
    expect(toPublicRoom(g.state, g.now)).toMatchObject({
      locked: true,
      game: "who-am-i",
    });
    expect(toView(g.state, 1, "p1", g.now, "en").settings.password).toBe(
      "pizza",
    );
    expect(toView(g.state, 1, "p2", g.now, "en").settings.password).toBe("");
    // a private room without a password stays hidden
    g.state.settings.password = "";
    expect(toPublicRoom(g.state, g.now)).toBeNull();
  });
});

describe("guess matching", () => {
  it("normalises accents, case, kana and articles", () => {
    expect(normalizeName("Pokémon")).toBe("pokemon");
    expect(normalizeName("  The   Joker ")).toBe("joker");
    expect(normalizeName("O Coringa")).toBe("coringa");
    expect(normalizeName("ピカチュウ")).toBe(normalizeName("ぴかちゅう"));
    expect(normalizeName("ガンダム")).toBe("がんだむ");
    expect(normalizeName("Ｓｕｐｅｒ　Ｍａｒｉｏ")).toBe("supermario");
    expect(normalizeName("A")).toBe("a");
  });

  it("accepts small typos on longer names only", () => {
    expect(isCloseMatch("darth vader", ["Darth Vader"])).toBe(true);
    expect(isCloseMatch("dart vader", ["Darth Vader"])).toBe(true);
    expect(isCloseMatch("drth vadr", ["Darth Vader"])).toBe(true);
    expect(isCloseMatch("dr vde", ["Darth Vader"])).toBe(false);
    expect(isCloseMatch("Thor", ["Thor"])).toBe(true);
    expect(isCloseMatch("Thos", ["Thor"])).toBe(false);
    expect(isCloseMatch("Mrio", ["Mario"])).toBe(true);
    expect(isCloseMatch("", ["Mario"])).toBe(false);
    expect(isCloseMatch("!!!", ["???"])).toBe(false);
    expect(isCloseMatch("Lord Vader", ["Darth Vader"])).toBe(false);
    expect(isCloseMatch("Coringa", ["Joker", "Coringa"])).toBe(true);
    expect(isCloseMatch("x".repeat(5000), ["Mario"])).toBe(false);
  });
});

describe("the theme vote in the view", () => {
  it("shows the options, open votes and statuses, then the result while the theme show plays", () => {
    const g = new Game(3);
    g.do({ type: "START", playerId: "p1", themes: THEMES });
    g.skipShow();
    g.do({ type: "VOTE", playerId: "p2", option: 2 });
    const v = toView(g.state, 1, "p1", g.now, "en");
    expect(v.vote).toMatchObject({
      options: THEMES,
      votes: [{ byId: "p2", option: 2 }],
      yourVote: null,
      chosen: null,
      total: 3,
    });
    expect(v.players.map((p) => p.status)).toEqual([
      "voting",
      "voted",
      "voting",
    ]);
    expect(toPublicRoom(g.state, g.now)?.status).toBe("playing");

    g.do({ type: "VOTE", playerId: "p1", option: 2 });
    g.do({ type: "VOTE", playerId: "p3", option: 0 });
    const shown = toView(g.state, 2, "p3", g.now, "en");
    expect(shown.phase).toBe("picking");
    expect(shown.reveal?.kind).toBe("theme");
    expect(shown.vote).toMatchObject({ chosen: 2, yourVote: 0 });
    const later = toView(
      g.state,
      2,
      "p3",
      (g.state.reveal?.until ?? 0) + 1,
      "en",
    );
    expect(later.vote).toBeNull();
    expect(later.reveal).toBeNull();
  });

  it("stays while the theme show plays, even with the cast queued behind it", () => {
    const g = new Game(3);
    g.do({ type: "START", playerId: "p1", themes: THEMES });
    g.skipShow();
    g.voteAll(2);
    const theme = g.state.reveal;
    const until = theme?.until ?? 0;
    expect(theme?.kind).toBe("theme");
    // every card confirmed before the theme show ends: the cast waits behind it
    g.pickAll();
    expect(g.state.phase).toBe("asking");
    expect(g.state.reveal).toMatchObject({
      kind: "cast",
      startsAt: until,
      prev: { kind: "theme", until },
    });
    for (const p of g.state.players) {
      expect(toView(g.state, 1, p.id, g.now, "en").vote).toMatchObject({
        chosen: 2,
        yourVote: 2,
      });
      expect(toView(g.state, 1, p.id, until - 1, "en").vote).not.toBeNull();
      expect(toView(g.state, 1, p.id, until, "en").vote).toBeNull();
    }
  });
});

describe("shows in the view", () => {
  it("everyone gets the show's beats, and the one still playing before it", () => {
    const g = new Game(2);
    g.do({ type: "START", playerId: "p1", themes: THEMES });
    const opening = g.state.reveal;
    const v = toView(g.state, 1, "p2", g.now, "en");
    expect(v.reveal).toEqual({
      kind: "opening",
      n: 1,
      startsAt: opening?.startsAt,
      until: opening?.until,
      beats: opening?.beats,
      first: true,
      rule: null,
      prev: null,
    });
    // everyone votes during the opening: the theme show waits behind it
    g.voteAll(0);
    const during = toView(g.state, 2, "p2", g.now, "en").reveal;
    expect(during).toMatchObject({
      kind: "theme",
      startsAt: opening?.until,
      prev: { kind: "opening", until: opening?.until, prev: null },
    });
    // once the opening is over it is gone from the view
    const after = toView(g.state, 2, "p2", opening?.until ?? 0, "en").reveal;
    expect(after).toMatchObject({ kind: "theme", prev: null });
    expect(
      toView(g.state, 2, "p2", opening?.until ?? 0, "en").vote,
    ).not.toBeNull();
  });

  it("the cast keeps the pick table in the view while it plays", () => {
    const g = new Game(3);
    g.start();
    g.pickAll();
    const until = g.state.reveal?.until ?? 0;
    for (const p of g.state.players) {
      const v = toView(g.state, 1, p.id, g.now, "en");
      expect(v.phase).toBe("asking");
      expect(v.reveal?.kind).toBe("cast");
      expect(v.pick).toMatchObject({ confirmed: true, total: 3, draft: null });
      expect(v.pick?.confirmedIds).toHaveLength(3);
      expect(toView(g.state, 1, p.id, until, "en").pick).toBeNull();
    }
  });
});

describe("picking in the view", () => {
  it("who picks for whom is open from picking on, your own picker included", () => {
    const g = new Game(3);
    g.start();
    for (const p of g.state.players) {
      for (const x of toView(g.state, 1, p.id, g.now, "en").players)
        expect(x.pickedById).toBe(g.state.assignments[x.id].pickerId);
    }
    // not before: nobody picks for anyone during the vote
    const h = new Game(3);
    h.do({ type: "START", playerId: "p1", themes: THEMES });
    for (const x of toView(h.state, 1, "p1", h.now, "en").players)
      expect(x.pickedById).toBeNull();
  });

  it("a draft only ever reaches its picker", () => {
    const g = new Game(3);
    g.start();
    const [target, a] = Object.entries(g.state.assignments)[0];
    g.do({
      type: "DRAFT",
      playerId: a.pickerId,
      draft: {
        characterId: null,
        name: "Zq draft",
        imageUrl: "/api/files/characters/zq.webp",
        newId: "u-zq-new",
      },
    });
    expect(view(g, a.pickerId).pick?.draft).toEqual({
      characterId: null,
      name: "Zq draft",
      imageUrl: "/api/files/characters/zq.webp",
    });
    for (const p of g.state.players) {
      const json = JSON.stringify(view(g, p.id));
      if (p.id !== a.pickerId) {
        expect(json).not.toContain("Zq draft");
        expect(json).not.toContain("zq.webp");
      }
      // the id the clock would give it never leaves the server
      expect(json).not.toContain("u-zq-new");
    }
    expect(view(g, target).pick?.draft).toBeNull();
  });
});

describe("sweep time", () => {
  it("tells viewers when a closed page's lobby seat comes free", () => {
    const g = new Game(3);
    expect(view(g, "p1").sweepAt).toBeNull();
    g.do({ type: "GONE", playerId: "p2" });
    const goneAt = g.now;
    g.now += 1000;
    g.do({ type: "GONE", playerId: "p3" });
    expect(view(g, "p1").sweepAt).toBe(goneAt + GONE_GRACE_MS);
  });

  it("has nothing to settle while someone is still in the match", () => {
    const g = started(3);
    g.do({ type: "GONE", playerId: "p2" });
    expect(view(g, "p1").sweepAt).toBeNull();
  });
});

describe("past matches", () => {
  it("the lobby lists finished matches, newest first, the winner ahead", () => {
    const g = started(2);
    expect(view(g, "p1").matches).toEqual([]);
    const winner = g.askAndAnswer();
    g.do({ type: "GUESS", playerId: winner, text: `Name ${winner}` });
    g.skipReveal();
    const loser = winner === "p1" ? "p2" : "p1";
    g.do({ type: "GIVE_UP", playerId: loser });
    expect(g.state.phase).toBe("finished");
    // only the lobby shows them
    expect(view(g, "p1").matches).toEqual([]);
    const theme = g.state.theme;
    g.do({ type: "BACK_TO_LOBBY", playerId: "p1" });

    const [match] = view(g, loser).matches;
    expect(match.round).toBe(1);
    expect(match.theme).toEqual(theme);
    expect(match.players.map((p) => [p.id, p.place, p.isYou])).toEqual([
      [winner, 1, false],
      [loser, null, true],
    ]);

    g.do({ type: "START", playerId: "p1", themes: THEMES });
    g.skipShow();
    g.voteAll(1);
    g.skipShow();
    g.pickAll();
    g.skipShow();
    g.do({ type: "GIVE_UP", playerId: g.turn });
    g.do({ type: "GIVE_UP", playerId: g.turn });
    g.do({ type: "BACK_TO_LOBBY", playerId: "p1" });
    expect(view(g, "p1").matches.map((m) => m.round)).toEqual([2, 1]);
  });

  it("follows a guest who signs in", () => {
    const g = started(2);
    g.do({ type: "GIVE_UP", playerId: g.turn });
    g.do({ type: "GIVE_UP", playerId: g.turn });
    g.do({ type: "BACK_TO_LOBBY", playerId: "p1" });
    g.do({
      type: "SWAP_PLAYER",
      from: "p2",
      player: {
        ...g.state.players[1],
        id: "acct",
        isGuest: false,
        name: "Ana",
      },
    });
    const [match] = view(g, "acct").matches;
    expect(match.players.find((p) => p.isYou)?.name).toBe("Ana");
  });
});
