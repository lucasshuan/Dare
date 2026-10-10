import { describe, expect, it } from "vitest";
import {
  beatDelay,
  loopPosition,
  MUSIC_BEAT,
  MUSIC_FIRST_BEAT,
  musicVolume,
} from "./music";
import { DEFAULT_SETTINGS, parseSettings } from "./settings";

describe("loopPosition", () => {
  // loops cut 90 ms before the downbeat of their bars
  const bar = (n: number) => MUSIC_FIRST_BEAT + n * 4 * MUSIC_BEAT - 0.09;
  it("plays the intro once, then wraps from the end of the take's turnaround to bar 8", () => {
    expect(loopPosition(0, "stage")).toBe(0);
    expect(loopPosition(100, "stage")).toBe(100);
    // the stage's turnaround runs through bar 48, the booth's ends with bar 47
    expect(loopPosition(bar(48) + 1, "matchday")).toBeCloseTo(bar(48) + 1);
    expect(loopPosition(bar(49), "matchday")).toBeCloseTo(bar(8));
    expect(loopPosition(bar(48), "booth")).toBeCloseTo(bar(8));
    expect(
      loopPosition(bar(49) + 2 * (bar(49) - bar(8)) + 1, "matchday"),
    ).toBeCloseTo(bar(8) + 1);
  });
  it("hands a longer take's last bar to a shorter one as bar 8", () => {
    expect(loopPosition(bar(48) + 1.5, "booth")).toBeCloseTo(bar(8) + 1.5);
  });
  it("keeps a take's intro as negative positions", () => {
    expect(loopPosition(-12.5, "impostor")).toBe(-12.5);
  });
  it("loops the lobby takes (stage, impostor, bidding) back into the song's intro, to bar 0", () => {
    expect(loopPosition(bar(49), "impostor")).toBeCloseTo(bar(0));
    expect(loopPosition(bar(49) + 3, "impostor")).toBeCloseTo(bar(0) + 3);
    expect(loopPosition(bar(49), "bidding")).toBeCloseTo(bar(0));
    expect(loopPosition(bar(49), "stage")).toBeCloseTo(bar(0));
  });
});

describe("musicVolume", () => {
  it("starts at half, like the overall volume", () => {
    expect(DEFAULT_SETTINGS.sounds.music).toEqual({ on: true, volume: 0.5 });
    expect(musicVolume(DEFAULT_SETTINGS)).toBeCloseTo(0.5 * 0.5);
  });

  it("is silent when muted or when the music is off", () => {
    expect(musicVolume(parseSettings({ muted: true }))).toBe(0);
    expect(
      musicVolume(parseSettings({ sounds: { music: { on: false } } })),
    ).toBe(0);
  });
});

describe("beatDelay", () => {
  it("lines a beat animation up with the music's first beat", () => {
    // the song started 10 s before the animation does
    expect(beatDelay(1000, 11000)).toBeCloseTo(-10 + MUSIC_FIRST_BEAT);
    // started at the same moment: the first beat is 0.5333 s away
    expect(beatDelay(5000, 5000)).toBeCloseTo(MUSIC_FIRST_BEAT);
  });
  it("runs the animations with an intro, while the song's first beat is still ahead", () => {
    const phrase = 32 * MUSIC_BEAT;
    // position 0 plays in 20 s: the delay steps back a whole phrase, to the same point in the beat
    const delay = beatDelay(21000, 1000);
    expect(delay).toBeCloseTo(20 + MUSIC_FIRST_BEAT - phrase);
    expect(delay).toBeLessThanOrEqual(MUSIC_FIRST_BEAT);
    // further ahead than a phrase
    expect(beatDelay(41000, 1000)).toBeCloseTo(
      40 + MUSIC_FIRST_BEAT - 2 * phrase,
    );
  });
  it("loops from a downbeat over whole bars, so the beat and the bar survive each wrap", () => {
    const start = MUSIC_FIRST_BEAT + 32 * MUSIC_BEAT - 0.09;
    // a quarter of a second short of the matchday take's end: still bar 48, 164 beats after bar 8
    const late = MUSIC_FIRST_BEAT + 196 * MUSIC_BEAT - 0.09 - 0.25;
    expect(loopPosition(late, "matchday")).toBeCloseTo(late);
    expect(loopPosition(late + 0.5, "matchday")).toBeCloseTo(start + 0.25);
    expect((late + 0.25 - start) / MUSIC_BEAT).toBeCloseTo(164, 6);
  });
});
