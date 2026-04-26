import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DomMusicXmlParser,
  MonoLabelEmitter,
  SinsyLabelPipeline,
  VietnameseMoraPlanTranspiler,
  VietnameseSinsyLyricTranspiler,
  VocalLineNormalizer,
  expressionForNote,
} from "./index.ts";
import { parseMusicXmlToLabelArgs, runMusicXmlToLabel } from "./musicXMLtoLabel.ts";
import { CumulativeFloatTimingStrategy, VowelAnchoredTimingStrategy } from "./timing.ts";

const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><sound tempo="100"/></direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <lyric><syllabic>single</syllabic><text>kiên</text></lyric>
      </note>
      <note>
        <rest/>
        <duration>2</duration>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

const COMPLEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Vocal</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>1</voice></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><sound tempo="120"/></direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <tie type="start"/>
        <lyric><text>mây</text></lyric>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <tie type="stop"/>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <notations><slur type="start"/></notations>
        <lyric><text>trôi</text></lyric>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <notations><slur type="stop"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <lyric><text>dạ</text></lyric>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
      </note>
      <note>
        <grace/>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <lyric><text>bỏ</text></lyric>
      </note>
      <note print-object="no">
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <lyric><text>ẩn</text></lyric>
      </note>
    </measure>
  </part>
</score-partwise>`;

const ADJACENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction>
        <direction-type><dynamics><f/></dynamics></direction-type>
        <sound tempo="100"/>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <notations><articulations><accent/></articulations></notations>
        <lyric><syllabic>single</syllabic><text>kiên</text></lyric>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
        <lyric><syllabic>single</syllabic><text>dạ</text></lyric>
      </note>
    </measure>
  </part>
</score-partwise>`;

const NO_LYRIC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions></attributes>
      <direction><sound tempo="100"/></direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2</duration>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

test("MusicXML parser builds note data structure", () => {
  const score = new DomMusicXmlParser().parse(SIMPLE_XML, "simple.musicxml");
  expect(score.divisions).toBe(2);
  expect(score.notes).toHaveLength(2);
  expect(score.notes[0]?.lyric).toBe("kiên");
  expect(score.notes[0]?.pitch?.midi).toBe(60);
  expect(score.notes[0]?.beat).toEqual({ beats: 2, beatType: 4 });
  expect(score.notes[1]?.isRest).toBe(true);
});

test("vocal normalizer selects lyric voice, merges ties, carries slur vowel, drops chord/grace/hidden", () => {
  const raw = new DomMusicXmlParser().parse(COMPLEX_XML);
  const normalized = new VocalLineNormalizer().normalize(raw);

  expect(normalized.notes.map((note) => note.lyric ?? note.carriedPhones?.join(","))).toEqual([
    "mây",
    "trôi",
    "i",
    "dạ",
  ]);
  expect(normalized.notes[0]?.durationDiv).toBe(4);
  expect(normalized.notes.some((note) => note.isChord)).toBe(false);
  expect(normalized.notes.some((note) => note.isGrace)).toBe(false);
  expect(normalized.notes.some((note) => !note.isPrintable)).toBe(false);
});

test("Vietnamese transpiler emits Sinsy-safe phones", () => {
  const result = new VietnameseSinsyLyricTranspiler().transpile("phương");
  expect(result.phones).toEqual(["f", "u", "o", "N"]);
  expect(result.warnings).toEqual([]);
});

test("cumulative timing keeps whole-note phoneme windows", () => {
  const score = new DomMusicXmlParser().parse(SIMPLE_XML);
  const events = new CumulativeFloatTimingStrategy().toPhoneEvents(
    score,
    new VietnameseSinsyLyricTranspiler(),
  );
  const mono = new MonoLabelEmitter().emit(events);
  expect(mono).toBe(
    ["0 6000000 k", "0 6000000 i", "0 6000000 e", "0 6000000 N", "6000000 12000000 pau", ""].join(
      "\n",
    ),
  );
});

test("vowel-anchored timing compresses onset and pushes coda to tail", () => {
  const score = new DomMusicXmlParser().parse(SIMPLE_XML);
  const events = new VowelAnchoredTimingStrategy().toPhoneEvents(
    score,
    new VietnameseMoraPlanTranspiler(),
  );
  const mono = new MonoLabelEmitter().emit(events);
  expect(mono).toBe(
    [
      "0 400000 k",
      "400000 4800000 i",
      "4800000 5360000 e",
      "5360000 6000000 N",
      "6000000 12000000 pau",
      "",
    ].join("\n"),
  );
});

test("vowel-anchored timing prefires leading van against previous lingering tail", () => {
  const score = new DomMusicXmlParser().parse(ADJACENT_XML);
  const events = new VowelAnchoredTimingStrategy().toPhoneEvents(
    score,
    new VietnameseMoraPlanTranspiler(),
  );
  const secondOnset = events.find((event) => event.note.lyric === "dạ" && event.phoneme === "z");
  const previousTail = events.find((event) => event.note.lyric === "kiên" && event.phoneme === "N");

  expect(secondOnset?.start).toBe(5820000);
  expect(secondOnset?.end).toBe(6220000);
  expect(previousTail?.end).toBe(5820000);
});

test("timing does not turn missing lyric pitched notes into pau", () => {
  const score = new DomMusicXmlParser().parse(NO_LYRIC_XML);
  const events = new VowelAnchoredTimingStrategy().toPhoneEvents(
    score,
    new VietnameseMoraPlanTranspiler(),
  );

  expect(events.map((event) => event.phoneme)).toEqual(["pau"]);
});

test("MusicXML dynamics and articulation feed expression gauges", () => {
  const note = new DomMusicXmlParser().parse(ADJACENT_XML).notes[0]!;
  const expression = expressionForNote(note, null, null);

  expect(note.dynamic).toBe("f");
  expect(note.hasAccent).toBe(true);
  expect(expression.energy).toBe(95);
  expect(expression.vibratoRateHz).toBe(0);
});

test("pipeline emits mono and full labels", () => {
  const result = new SinsyLabelPipeline().serialize(SIMPLE_XML);
  expect(result.mono).toContain("0 400000 k");
  expect(result.full).toContain("/E:C4]60^0=2/4~100");
  expect(result.full).toContain("/F:xx#xx#xx-xx$xx$xx+xx%xx;");
});

test("musicXMLtoLabel CLI parses NEUTRINO positional args", () => {
  expect(parseMusicXmlToLabelArgs(["score.musicxml", "full.lab", "mono.lab"])).toEqual({
    inputPath: "score.musicxml",
    fullLabelPath: "full.lab",
    monoLabelPath: "mono.lab",
  });
});

test("musicXMLtoLabel runner writes full and mono files", () => {
  const dir = mkdtempSync(join(tmpdir(), "cephome-musicxmltolabel-"));
  try {
    const input = join(dir, "score.musicxml");
    const full = join(dir, "score", "label", "full", "score.lab");
    const mono = join(dir, "score", "label", "mono", "score.lab");
    writeFileSync(input, SIMPLE_XML, "utf8");

    runMusicXmlToLabel({ inputPath: input, fullLabelPath: full, monoLabelPath: mono });

    expect(readFileSync(mono, "utf8")).toContain("0 400000 k");
    expect(readFileSync(full, "utf8")).toContain("/E:C4]60^0=2/4~100");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("musicXMLtoLabel overwrites existing output files", () => {
  const dir = mkdtempSync(join(tmpdir(), "cephome-musicxmltolabel-overwrite-"));
  try {
    const input = join(dir, "score.musicxml");
    const full = join(dir, "score", "label", "full", "score.lab");
    const mono = join(dir, "score", "label", "mono", "score.lab");
    mkdirSync(join(dir, "score", "label", "full"), { recursive: true });
    mkdirSync(join(dir, "score", "label", "mono"), { recursive: true });
    writeFileSync(input, SIMPLE_XML, "utf8");
    writeFileSync(full, "old full", "utf8");
    writeFileSync(mono, "old mono", "utf8");

    runMusicXmlToLabel({ inputPath: input, fullLabelPath: full, monoLabelPath: mono });

    expect(readFileSync(full, "utf8")).not.toBe("old full");
    expect(readFileSync(mono, "utf8")).not.toBe("old mono");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("musicXMLtoLabel errors when output path is an existing directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "cephome-musicxmltolabel-dir-output-"));
  try {
    const input = join(dir, "score.musicxml");
    const full = join(dir, "full-as-dir.lab");
    const mono = join(dir, "mono.lab");
    writeFileSync(input, SIMPLE_XML, "utf8");
    mkdirSync(full);

    expect(() =>
      runMusicXmlToLabel({ inputPath: input, fullLabelPath: full, monoLabelPath: mono }),
    ).toThrow("Output path is a directory");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("musicXMLtoLabel errors when output parent exists as a file", () => {
  const dir = mkdtempSync(join(tmpdir(), "cephome-musicxmltolabel-file-parent-"));
  try {
    const input = join(dir, "score.musicxml");
    const parentFile = join(dir, "score", "label", "full");
    const full = join(parentFile, "score.lab");
    const mono = join(dir, "mono.lab");
    mkdirSync(join(dir, "score", "label"), { recursive: true });
    writeFileSync(input, SIMPLE_XML, "utf8");
    writeFileSync(parentFile, "not a dir", "utf8");

    expect(() =>
      runMusicXmlToLabel({ inputPath: input, fullLabelPath: full, monoLabelPath: mono }),
    ).toThrow("Output parent exists but is not a directory");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("musicXMLtoLabel accepts Windows-style separators on POSIX", () => {
  const dir = mkdtempSync(join(tmpdir(), "cephome-musicxmltolabel-winpath-"));
  try {
    const input = join(dir, "score.musicxml");
    const full = join(dir, "score", "label", "full", "score.lab");
    const mono = join(dir, "score", "label", "mono", "score.lab");
    writeFileSync(input, SIMPLE_XML, "utf8");

    runMusicXmlToLabel({
      inputPath: input.replaceAll("/", "\\"),
      fullLabelPath: full.replaceAll("/", "\\"),
      monoLabelPath: mono.replaceAll("/", "\\"),
    });

    expect(readFileSync(full, "utf8")).toContain("/E:C4]60^0=2/4~100");
    expect(readFileSync(mono, "utf8")).toContain("0 400000 k");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
