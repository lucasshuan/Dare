"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { getSettings, type Settings, subscribeSettings } from "./settings";

/**
 * The background music: one tune in several takes that share a timeline (same
 * tempo, same bars, same loop), so one can take over from another at the
 * same point in the song. Played through WebAudio, so the loop has no gap and
 * every take starts sample-exact. The Suno prompts behind each take are in
 * `assets/music/suno-prompts.md`.
 */
const TRACKS = {
  /** The show's lounge vamp: the room, the lobby and every match. */
  stage: { src: "/music/stage-loop.mp3", intro: 0 },
  /** The same vamp on an old radio in the booth: Build the Team's presenter. Mixed 6 dB under the stage. */
  booth: { src: "/music/booth-loop.mp3", intro: 0 },
  /** The same vamp as hushed spy suspense: Impostor's rooms. As loud as the stage. */
  impostor: { src: "/music/impostor-loop.mp3", intro: 20.7542 },
  /** The same vamp as 1970s game-show bidding: Build the Team's lobby and auction. As loud as the stage. */
  bidding: { src: "/music/bidding-loop.mp3", intro: 0 },
  /** The same vamp as a retro sports groove: Build the Team from the wrap-up to the results. As loud as the stage. */
  matchday: { src: "/music/matchday-loop.mp3", intro: 9.7972 },
  /** The same vamp as a cheeky school bounce, kept for later: nothing plays it yet. As loud as the stage. */
  recess: { src: "/music/recess-loop.mp3", intro: 1.9381 },
} as const satisfies Record<string, { src: string; intro: number }>;
export type Track = keyof typeof TRACKS;

/**
 * Song positions (seconds) on the shared timeline. Every file loops over the
 * same 40 bars, bar 8 to bar 48: five 8-bar phrases, so the wrap goes from the
 * turnaround bar that ends a phrase to the downbeat that starts one, past the
 * song's own 8-bar intro (bars 0 to 7), which plays once. A take may open
 * with an intro of its own (`intro` seconds at the head of its file, before the shared song's
 * position 0): it plays when the music starts on that take, as negative
 * positions, and is skipped when another take hands over past it.
 */
const LOOP_START = 20.7277;
const LOOP_END = 121.6995;
const LOOP = LOOP_END - LOOP_START;

/** The tape clunk into the booth: the file starts 0.5 s before the clunk. */
const SWITCH_SFX = "/sounds/tv-switch.mp3";
const CLUNK = 0.5;
/** The booth comes in this long after the clunk, once the crackle dies down. */
const BOOTH_IN = 1.2;
const SFX_LEVEL = 0.8;

/** How loud the music plays with these settings: 0 when muted or its group is off. */
export function musicVolume(settings: Settings): number {
  const g = settings.sounds.music;
  if (settings.muted || !g.on) return 0;
  return g.volume * settings.volume;
}

/**
 * The tune's beat, for anything that moves with it: 95.08 BPM, the first beat
 * 0.5333 s into the shared song (a bar's downbeat). The loop starts on a
 * downbeat and holds 160 beats, so the beat keeps its place across every wrap; the takes' intros keep
 * the same beat before it.
 */
export const MUSIC_BEAT = 60 / 95.076;
export const MUSIC_FIRST_BEAT = 0.5333;
/** 32 beats: every beat-synced animation repeats within this (beat, bar, the marks' cycle). */
const PHRASE = 32 * MUSIC_BEAT;

/**
 * The CSS animation-delay (seconds) that lines a beat-long animation started
 * at `nowMs` up with the music whose position 0 played (or will play) at
 * `originMs` (both performance.now() milliseconds): negative once the song is
 * under way. During a take's intro position 0 is still ahead, and the delay
 * steps back by whole 32-beat phrases so the animations run with the intro.
 */
export function beatDelay(originMs: number, nowMs: number): number {
  const delay = (originMs - nowMs) / 1000 + MUSIC_FIRST_BEAT;
  if (delay <= MUSIC_FIRST_BEAT) return delay;
  return delay - Math.ceil((delay - MUSIC_FIRST_BEAT) / PHRASE) * PHRASE;
}

/** Where a timeline position lands once the loop has wrapped; negative positions are a take's intro. */
export function loopPosition(seconds: number): number {
  if (seconds < LOOP_END) return seconds;
  return LOOP_START + ((seconds - LOOP_START) % LOOP);
}

type Playing = {
  track: Track;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** The context time the song's position 0 would have played at. */
  origin: number;
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** The muffle: a high-pass and a low-pass and a dip, as if the music played in the next room. */
let muffleLow: BiquadFilterNode | null = null;
let muffleFilter: BiquadFilterNode | null = null;
let muffleGain: GainNode | null = null;
let muffled = false;
let playing: Playing | null = null;
let current: Track | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function context() {
  if (ctx) return ctx;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = musicVolume(getSettings());
  muffleLow = ctx.createBiquadFilter();
  muffleLow.type = "highpass";
  muffleLow.Q.value = 0.5;
  muffleFilter = ctx.createBiquadFilter();
  muffleFilter.type = "lowpass";
  muffleFilter.Q.value = 0.5;
  muffleGain = ctx.createGain();
  setMuffle(true);
  master
    .connect(muffleLow)
    .connect(muffleFilter)
    .connect(muffleGain)
    .connect(ctx.destination);
  // the browser keeps audio off until the first touch: wake it then
  const wake = () => {
    if (ctx?.state !== "running") ctx?.resume().catch(() => {});
  };
  for (const e of ["pointerdown", "keydown", "touchend"])
    document.addEventListener(e, wake, { capture: true, passive: true });
  // the beat only counts while the context really plays
  ctx.addEventListener("statechange", publishPulse);
  return ctx;
}

let listening = false;

/**
 * Follows the settings from the first ask on, before any audio exists: a
 * room joined muted has no context yet, and turning the sound on must still
 * start the music.
 */
function listen() {
  if (listening) return;
  listening = true;
  subscribeSettings(() => {
    if (ctx && master)
      master.gain.setTargetAtTime(
        musicVolume(getSettings()),
        ctx.currentTime,
        0.05,
      );
    apply();
  });
}

function load(src: string): Promise<AudioBuffer | null> {
  let p = buffers.get(src);
  if (!p) {
    const c = context();
    p = fetch(src)
      .then((r) => r.arrayBuffer())
      .then((data) => c.decodeAudioData(data))
      .catch(() => null);
    buffers.set(src, p);
  }
  return p;
}

/** Fetches and decodes a take ahead of time, so asking for it later swaps at once. */
export function preloadMusic(track: Track) {
  void load(TRACKS[track].src);
}

/** The song position (seconds on the shared timeline) at a context time. */
function position(at: number) {
  return playing ? loopPosition(at - playing.origin) : 0;
}

function start(
  track: Track,
  buffer: AudioBuffer,
  at: number,
  from: number,
  fadeIn: number,
) {
  const c = context();
  const { intro } = TRACKS[track];
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(1, at + fadeIn);
  gain.connect(master as GainNode);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = LOOP_START + intro;
  source.loopEnd = LOOP_END + intro;
  source.connect(gain);
  // deeper into an intro than this take's own goes: it starts from its top
  const pos = Math.max(-intro, loopPosition(from));
  source.start(at, pos + intro);
  return { track, source, gain, origin: at - pos } satisfies Playing;
}

/**
 * The performance.now() moment the playing song's position 0 played at, while
 * the music is audible; null when it is silent, stopped or not started yet.
 */
let pulse: number | null = null;
const pulseListeners = new Set<() => void>();

function publishPulse() {
  let next: number | null = null;
  if (ctx?.state === "running" && playing && musicVolume(getSettings()) > 0) {
    // what is scheduled now comes out of the speakers this much later
    const latency = (ctx.outputLatency || ctx.baseLatency || 0) * 1000;
    next = Math.round(
      performance.now() + (playing.origin - ctx.currentTime) * 1000 + latency,
    );
  }
  // a few ms of re-measuring is not a new beat
  if (
    next === pulse ||
    (next !== null && pulse !== null && Math.abs(next - pulse) < 20)
  )
    return;
  pulse = next;
  for (const l of pulseListeners) l();
}

/** When the song's position 0 played (performance.now() ms) while the music is audible, else null. */
export function useMusicPulse(): number | null {
  return useSyncExternalStore(
    (l) => {
      pulseListeners.add(l);
      return () => pulseListeners.delete(l);
    },
    () => pulse,
    () => null,
  );
}

function stop(p: Playing, at: number, fadeOut: number) {
  p.gain.gain.cancelScheduledValues(at);
  p.gain.gain.setValueAtTime(p.gain.gain.value, at);
  p.gain.gain.linearRampToValueAtTime(0, at + fadeOut);
  p.source.stop(at + fadeOut + 0.05);
}

let applying = 0;

/** Moves the music to `current`: a fade in, a crossfade, the TV switch into the booth or a fade out. */
async function apply() {
  const turn = ++applying;
  const want = musicVolume(getSettings()) > 0 ? current : null;
  if (playing?.track === want) return;
  if (!ctx && !want) return;
  const c = context();
  if (!want) {
    if (playing) stop(playing, c.currentTime, 0.6);
    playing = null;
    publishPulse();
    return;
  }
  const [buffer, sfx] = await Promise.all([
    load(TRACKS[want].src),
    want === "booth" && playing && playing.track !== "booth"
      ? load(SWITCH_SFX)
      : null,
  ]);
  // a later call took over while this one loaded
  if (turn !== applying || !buffer || playing?.track === want) return;
  const now = c.currentTime;
  const was = playing;
  if (!was) {
    // a fresh start plays the take from the top, its own intro first
    playing = start(want, buffer, now, Number.NEGATIVE_INFINITY, 0.05);
    publishPulse();
    return;
  }
  if (sfx) {
    // the tape clunks: the stage stops dead, crackle, then the booth on the old radio, at the same point in the song
    const fx = c.createBufferSource();
    const fxGain = c.createGain();
    fxGain.gain.value = SFX_LEVEL;
    fx.buffer = sfx;
    fx.connect(fxGain).connect(master as GainNode);
    fx.start(now);
    const g = was.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    // the warning flick drops the music for a blink
    g.setValueAtTime(1, now + 0.17);
    g.linearRampToValueAtTime(0.05, now + 0.175);
    g.setValueAtTime(0.05, now + 0.23);
    g.linearRampToValueAtTime(1, now + 0.235);
    g.setValueAtTime(1, now + CLUNK);
    g.linearRampToValueAtTime(0, now + CLUNK + 0.01);
    was.source.stop(now + CLUNK + 0.05);
    const at = now + CLUNK + BOOTH_IN;
    playing = start(want, buffer, at, position(at), 0.15);
    publishPulse();
    return;
  }
  // back out of the booth, or any other change: a crossfade at the same point in the song
  stop(was, now, 1.5);
  playing = start(want, buffer, now, position(now), 1.5);
  publishPulse();
}

/**
 * Outside the lobby the music plays at 0.75, 25% under its old level. In the
 * lobby it plays through the wall: a 160 Hz high-pass and a 350 Hz low-pass,
 * still at 0.7.
 */
const OPEN_GAIN = 0.75;
const MUFFLE_GAIN = 0.7;
const MUFFLE_HZ = 350;
const MUFFLE_LOW_HZ = 160;
const OPEN_HZ = 20000;
const OPEN_LOW_HZ = 20;

function setMuffle(now = false) {
  if (!ctx || !muffleLow || !muffleFilter || !muffleGain) return;
  const hz = muffled ? MUFFLE_HZ : OPEN_HZ;
  const low = muffled ? MUFFLE_LOW_HZ : OPEN_LOW_HZ;
  const gain = muffled ? MUFFLE_GAIN : OPEN_GAIN;
  if (now) {
    muffleLow.frequency.value = low;
    muffleFilter.frequency.value = hz;
    muffleGain.gain.value = gain;
    return;
  }
  // opening takes about 1.5 s, like walking into the room; closing about 1 s
  const tau = muffled ? 0.35 : 0.5;
  const t = ctx.currentTime;
  muffleLow.frequency.cancelScheduledValues(t);
  muffleLow.frequency.setTargetAtTime(low, t, tau);
  muffleFilter.frequency.cancelScheduledValues(t);
  muffleFilter.frequency.setTargetAtTime(hz, t, tau);
  muffleGain.gain.cancelScheduledValues(t);
  muffleGain.gain.setTargetAtTime(gain, t, tau);
}

/** Muffles the music while `on` (the lobby); it opens up when `on` goes false. */
export function useMusicMuffle(on: boolean) {
  useEffect(() => {
    muffled = on;
    setMuffle();
  }, [on]);
  useEffect(
    () => () => {
      muffled = false;
      setMuffle();
    },
    [],
  );
}

const claims = new Map<string, { track: Track | null; rank: number }>();

function resolve() {
  listen();
  let best: { track: Track | null; rank: number } | null = null;
  for (const c of claims.values()) if (!best || c.rank > best.rank) best = c;
  current = best?.track ?? null;
  apply();
}

/**
 * Asks for a track while mounted. The highest `rank` asking wins (null asks
 * for silence, undefined asks nothing); with nobody asking, the music fades out.
 */
export function useMusic(track: Track | null | undefined, rank = 0) {
  const id = useId();
  useEffect(() => {
    if (track === undefined) claims.delete(id);
    else claims.set(id, { track, rank });
    resolve();
  }, [id, track, rank]);
  useEffect(
    () => () => {
      claims.delete(id);
      resolve();
    },
    [id],
  );
}
