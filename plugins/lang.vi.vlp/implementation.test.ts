import { expect, test } from "bun:test";
import {
  finalize,
  plan,
  type AuthoredTrack,
  type EngineScore,
  type PhonePlan,
} from "./implementation.ts";

const CONTEXT_SEPARATORS = {
  p: ["", "@", "^", "-", "+", "=", "_", "%", "^", "_", "~", "-", "!", "[", "$", "]"],
  a: ["/A:", "-", "-", "@", "~"],
  b: ["/B:", "_", "_", "@", "|"],
  c: ["/C:", "+", "+", "@", "&"],
  d: ["/D:", "!", "#", "$", "%", "|", "&", ";", "-"],
  e: [
    "/E:",
    "]",
    "^",
    "=",
    "~",
    "!",
    "@",
    "#",
    "+",
    "]",
    "$",
    "|",
    "[",
    "&",
    "]",
    "=",
    "^",
    "~",
    "#",
    "_",
    ";",
    "$",
    "&",
    "%",
    "[",
    "|",
    "]",
    "-",
    "^",
    "+",
    "~",
    "=",
    "@",
    "$",
    "!",
    "%",
    "#",
    "|",
    "|",
    "-",
    "&",
    "&",
    "+",
    "[",
    ";",
    "]",
    ";",
    "~",
    "~",
    "^",
    "^",
    "@",
    "[",
    "#",
    "=",
    "!",
    "~",
    "+",
    "!",
    "^",
  ],
  f: ["/F:", "#", "#", "-", "$", "$", "+", "%", ";"],
  g: ["/G:", "_"],
  h: ["/H:", "_"],
  i: ["/I:", "_"],
  j: ["/J:", "~", "@"],
} as const;

function serializeEngineScore(score: EngineScore): string[] {
  return score.rows.map((row) => {
    let context = "";
    for (const group of Object.keys(CONTEXT_SEPARATORS) as Array<keyof typeof CONTEXT_SEPARATORS>) {
      const values = row.contexts[group];
      context += CONTEXT_SEPARATORS[group]
        .map((separator, index) => `${separator}${values[index]}`)
        .join("");
    }
    return `${row.start100ns} ${row.end100ns} ${context}`;
  });
}

function track(): AuthoredTrack {
  return {
    schema: "amadeus.track/v2",
    trackId: "voice-1",
    ppq: 480,
    tempoMap: [
      { tick: 0, bpm: 120 },
      { tick: 960, bpm: 90 },
    ],
    meterMap: [{ tick: 0, beats: 4, beatType: 4 }],
    extent: { startTick: 0, endTick: 1920 },
    languageRoute: ["vi"],
    notes: [
      {
        id: "n1",
        startTick: 0,
        endTick: 960,
        pitch: 60,
        lyric: "phương",
        slurs: ["start"],
      },
      {
        id: "n2",
        startTick: 1200,
        endTick: 1920,
        pitch: 64,
        lyric: "ơi",
        slurs: ["stop"],
      },
    ],
    gaps: [{ id: "g1", startTick: 960, endTick: 1200, kind: "pau" }],
  };
}

function threeNoteSlur(): AuthoredTrack {
  return {
    schema: "amadeus.track/v2",
    trackId: "slur-voice",
    ppq: 480,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ tick: 0, beats: 4, beatType: 4 }],
    extent: { startTick: 0, endTick: 1440 },
    languageRoute: ["vi"],
    notes: [
      { id: "n1", startTick: 0, endTick: 480, pitch: 60, lyric: "mãi", slurs: ["start"] },
      { id: "n2", startTick: 480, endTick: 960, pitch: 64 },
      { id: "n3", startTick: 960, endTick: 1440, pitch: 67, slurs: ["stop"] },
    ],
    gaps: [],
  };
}

function adjacentNotes(): AuthoredTrack {
  return {
    schema: "amadeus.track/v2",
    trackId: "adjacent-voice",
    ppq: 480,
    tempoMap: [{ tick: 0, bpm: 120 }],
    meterMap: [{ tick: 0, beats: 4, beatType: 4 }],
    extent: { startTick: 0, endTick: 960 },
    languageRoute: ["vi"],
    notes: [
      { id: "n1", startTick: 0, endTick: 480, pitch: 60, lyric: "a" },
      { id: "n2", startTick: 480, endTick: 960, pitch: 62, lyric: "dạ" },
    ],
    gaps: [],
  };
}

test("plugin language hook plans stable phone and gap IDs deterministically", () => {
  const first = plan(track()) as PhonePlan;
  const second = plan(track()) as PhonePlan;
  expect(first).toEqual(second);
  expect(first).toMatchObject({
    protocol: "amadeus.language/v2",
    trackSchema: "amadeus.track/v2",
    trackId: "voice-1",
    provenance: {
      protocol: "amadeus.language/v2",
      moduleId: "lang.vi.vlp",
      moduleVersion: "2.0.2",
      bundleHash: "",
      selectedLanguage: "vi",
      route: ["vi"],
    },
  });
  expect(first.phones[0]?.id).toBe("note:n1:phone:0");
  expect(first.phones.some((phone) => phone.id === "gap:g1:phone:0")).toBe(true);
  expect(first.phones.map((phone) => phone.ownerId)).toContain("n2");
});

test("singing lyric normalization drops punctuation before phone planning", () => {
  const plain = plan(track()) as PhonePlan;
  const punctuated = plan({
    ...track(),
    notes: track().notes.map((note, index) =>
      index === 0 ? { ...note, lyric: "phương,." } : note,
    ),
  }) as PhonePlan;
  expect(punctuated.phones.slice(0, 5).map((phone) => phone.phone)).toEqual(
    plain.phones.slice(0, 5).map((phone) => phone.phone),
  );
});

test("Amadeus facade compensates the onset so the vowel anchors at the note boundary", () => {
  const phonePlan = plan(adjacentNotes()) as PhonePlan;
  const previous = phonePlan.phones.findLast((phone) => phone.ownerId === "n1")!;
  const onset = phonePlan.phones.find((phone) => phone.ownerId === "n2" && phone.role === "pre")!;
  const anchor = phonePlan.phones.find(
    (phone) => phone.ownerId === "n2" && phone.role === "anchor",
  )!;

  expect(anchor.start100ns).toBe(5_000_000);
  expect(onset.end100ns).toBe(anchor.start100ns);
  expect(onset.end100ns - onset.start100ns).toBe(400_000);
  expect(previous.end100ns).toBe(onset.start100ns);
});

test("track-absolute preroll compensates the first note without negative timing", () => {
  const value = adjacentNotes();
  value.extent = { startTick: 480, endTick: 960 };
  value.notes = [{ id: "n1", startTick: 480, endTick: 960, pitch: 62, lyric: "dạ" }];

  const phonePlan = plan(value) as PhonePlan;
  const onset = phonePlan.phones.find((phone) => phone.role === "pre")!;
  const anchor = phonePlan.phones.find((phone) => phone.role === "anchor")!;

  expect(onset.start100ns).toBe(4_600_000);
  expect(anchor.start100ns).toBe(5_000_000);
  expect(onset.start100ns).toBeGreaterThanOrEqual(0);
});

test("three-note slur plans one syllable across the complete authored chain", () => {
  const phonePlan = plan(threeNoteSlur()) as PhonePlan;
  expect(new Set(phonePlan.phones.map((phone) => phone.ownerId))).toEqual(new Set(["n1"]));
  expect(phonePlan.phones.some((phone) => phone.ownerId === "n2")).toBe(false);
  expect(phonePlan.phones.some((phone) => phone.ownerId === "n3")).toBe(false);
  const rimeCoverage = new Set(
    phonePlan.phones
      .filter((phone) => phone.role === "anchor" || phone.role === "tail")
      .flatMap((phone) => phone.sourceNoteIds ?? []),
  );
  expect(rimeCoverage).toEqual(new Set(["n1", "n2", "n3"]));

  const result = finalize(phonePlan);
  if ("kind" in result && result.kind !== "neutrino_sinsy_v1") throw new Error(result.message);
  expect(result.rows).toHaveLength(phonePlan.phones.length);
  expect(result.rows.every((row) => row.segmentIndex === 0)).toBe(true);
  expect(result.rows.every((row) => row.contexts.e[58] === "0")).toBe(true);
});

test("long slur coda coverage may exclude the primary lyric note", () => {
  const value = threeNoteSlur();
  value.extent.endTick = 3840;
  value.notes = Array.from({ length: 8 }, (_, index) => ({
    id: `n${index + 1}`,
    startTick: index * 480,
    endTick: (index + 1) * 480,
    pitch: 60 + index,
    lyric: index === 0 ? "phương" : undefined,
    slurs: index === 0 ? ["start"] : index === 7 ? ["stop"] : undefined,
  }));

  const phonePlan = plan(value) as PhonePlan;
  const coda = phonePlan.phones.filter((phone) => phone.role === "tail");
  expect(coda.length).toBeGreaterThan(0);
  expect(coda.every((phone) => phone.ownerId === "n1")).toBe(true);
  expect(coda.every((phone) => phone.sourceNoteIds?.join(",") === "n8")).toBe(true);
});

test("malformed slurs diagnose boundaries without dropping voiced lyrics", () => {
  const value = threeNoteSlur();
  value.extent.endTick = 1920;
  value.notes = [
    { id: "n1", startTick: 0, endTick: 480, pitch: 60, lyric: "em", slurs: ["start"] },
    { id: "n2", startTick: 480, endTick: 960, pitch: 62 },
    { id: "n3", startTick: 960, endTick: 1440, pitch: 64, lyric: "là" },
    { id: "n4", startTick: 1440, endTick: 1920, pitch: 65, lyric: "đây", slurs: ["stop"] },
  ];
  const phonePlan = plan(value) as PhonePlan;
  expect(phonePlan.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    "lyric_closes_open_slur",
    "unmatched_slur_start",
    "orphan_slur_stop",
  ]);
  expect(new Set(phonePlan.phones.map((phone) => phone.ownerId))).toEqual(
    new Set(["n1", "n3", "n4"]),
  );
  expect(
    phonePlan.phones
      .filter((phone) => phone.ownerId === "n1")
      .flatMap((phone) => phone.sourceNoteIds ?? []),
  ).toContain("n2");
});

test("structured finalization is deterministic without private pitch rows", () => {
  const phonePlan = plan(track()) as PhonePlan;
  const first = finalize(phonePlan);
  const second = finalize(phonePlan);
  if ("kind" in first && first.kind !== "neutrino_sinsy_v1") throw new Error(first.message);
  if ("kind" in second && second.kind !== "neutrino_sinsy_v1") throw new Error(second.message);
  expect(serializeEngineScore(first)).toEqual(serializeEngineScore(second));
  expect(first.protocol).toBe("amadeus.language/v2");
  expect(first.rows).toHaveLength(phonePlan.phones.length);
});

test("finalize applies phone-ID edits and reports obsolete IDs", () => {
  const phonePlan = plan(track()) as PhonePlan;
  const edited = phonePlan.phones[1]!;
  const result = finalize(phonePlan, [
    { phoneId: edited.id, boundaryOffset100ns: 10_000 },
    { phoneId: "note:gone:phone:0", boundaryOffset100ns: 1 },
  ]);
  if ("kind" in result && result.kind !== "neutrino_sinsy_v1") throw new Error(result.message);
  expect(result.rows.find((row) => row.sourcePhoneId === edited.id)?.start100ns).toBe(
    edited.start100ns + 10_000,
  );
  expect(result.diagnostics.some((diagnostic) => diagnostic.code === "obsolete_timing_edit")).toBe(
    true,
  );
});

test("finalize preserves one continuous pause stream and typed context widths", () => {
  const phonePlan = plan(track()) as PhonePlan;
  const result = finalize(phonePlan);
  if ("kind" in result && result.kind !== "neutrino_sinsy_v1") throw new Error(result.message);
  const pause = result.rows.findIndex((row) => row.phoneme === "pau");
  expect(pause).toBeGreaterThan(0);
  expect(pause).toBeLessThan(result.rows.length - 1);
  expect(result.rows[pause - 1]!.end100ns).toBe(result.rows[pause]!.start100ns);
  expect(result.rows[pause]!.end100ns).toBe(result.rows[pause + 1]!.start100ns);
  expect(result.rows[0]!.contexts.p).toHaveLength(16);
  expect(result.rows[0]!.contexts.e).toHaveLength(60);
});

test("long sentences preserve pau, sil, and br context and timing identity", () => {
  const value = track();
  value.extent.endTick = 2280;
  value.notes = [
    { id: "n1", startTick: 0, endTick: 480, pitch: 60, lyric: "em" },
    { id: "n2", startTick: 600, endTick: 1080, pitch: 62, lyric: "là" },
    { id: "n3", startTick: 1200, endTick: 1680, pitch: 64, lyric: "mầm" },
    { id: "n4", startTick: 1800, endTick: 2280, pitch: 65, lyric: "non" },
  ];
  value.gaps = [
    { id: "gp", startTick: 480, endTick: 600, kind: "pau" },
    { id: "gs", startTick: 1080, endTick: 1200, kind: "sil" },
    { id: "gb", startTick: 1680, endTick: 1800, kind: "br" },
  ];
  const phonePlan = plan(value) as PhonePlan;
  const edited = phonePlan.phones.find((phone) => phone.ownerId === "n3")!;
  const result = finalize(phonePlan, [{ phoneId: edited.id, boundaryOffset100ns: 10_000 }]);
  if ("kind" in result && result.kind !== "neutrino_sinsy_v1") throw new Error(result.message);

  const orderedSourcePhones = result.rows
    .map((row) => row.sourcePhoneId)
    .filter((id, index, all) => index === 0 || id !== all[index - 1]);
  expect(orderedSourcePhones).toEqual(phonePlan.phones.map((phone) => phone.id));
  expect(result.rows.find((row) => row.sourcePhoneId === edited.id)?.start100ns).toBe(
    edited.start100ns + 10_000,
  );
  for (const kind of ["pau", "sil", "br"]) {
    const index = result.rows.findIndex((row) => row.phoneme === kind);
    expect(index).toBeGreaterThan(0);
    expect(index).toBeLessThan(result.rows.length - 1);
    expect(result.rows[index]!.contexts.p[2]).toBe(result.rows[index - 1]!.phoneme);
    expect(result.rows[index]!.contexts.p[3]).toBe(kind);
    expect(result.rows[index]!.contexts.p[4]).toBe(result.rows[index + 1]!.phoneme);
  }
  for (let index = 1; index < result.rows.length; index += 1) {
    expect(result.rows[index - 1]!.end100ns).toBe(result.rows[index]!.start100ns);
  }
});

test("phone overrides retain unsplit source mapping", () => {
  const value = track();
  value.notes[0]!.phoneOverride = ["f", "u", "o", "N"];
  const phonePlan = plan(value) as PhonePlan;
  expect(phonePlan.phones.map((phone) => phone.phone).slice(0, 4)).toEqual(["f", "u", "o", "N"]);
  const result = finalize(phonePlan);
  if ("kind" in result && result.kind !== "neutrino_sinsy_v1") throw new Error(result.message);
  expect(result.rows).toHaveLength(phonePlan.phones.length);
  for (const row of result.rows) {
    expect(phonePlan.phones.some((phone) => phone.id === row.sourcePhoneId)).toBe(true);
  }
});

test("plugin language hook keeps unsupported and malformed tracks explicit", () => {
  const unsupported = track();
  unsupported.languageRoute = ["ja", "vi"];
  expect(plan(unsupported)).toEqual({
    kind: "unsupported",
    message: "Cephome does not support ja",
  });
  const malformed = track();
  malformed.notes[0]!.endTick = malformed.notes[0]!.startTick;
  expect(plan(malformed)).toMatchObject({ kind: "malformed" });
  const phonePlan = plan(track()) as PhonePlan;
  expect(finalize(phonePlan)).toMatchObject({ kind: "neutrino_sinsy_v1" });
});
