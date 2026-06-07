import { expressionForNote } from "../lab/expression.ts";
import type { PhoneEvent, ScoreNote } from "../lab/types.ts";
import type { F0Data } from "../../vneuvis/types.ts";
import { hzToMidi } from "../../vneuvis/f0.ts";

function midiToNoteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  const name = names[midi % 12]!;
  return `${name}${octave}`;
}

function distinctNote(events: PhoneEvent[], index: number, direction: -1 | 1): ScoreNote | null {
  const currentId = events[index]!.note.id;
  for (let cursor = index + direction; cursor >= 0 && cursor < events.length; cursor += direction) {
    const note = events[cursor]!.note;
    if (note.id !== currentId && !note.isRest) return note;
  }
  return null;
}

export function generateTimelineSvg(events: PhoneEvent[], actualF0?: F0Data): string {
  if (events.length === 0) {
    return `<svg id="timeline-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 200" width="800" height="200" data-total-duration="0">
	<rect width="100%" height="100%" fill="#ffffff" stroke="#e2e8f0" stroke-width="1" />
	<text x="400" y="100" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="16" text-anchor="middle">No events to display</text>
	<g id="piano-head" style="display:none"></g>
	<line id="cursor" style="display:none"></line>
</svg>`;
  }

  const startTime = events[0]!.start;
  const endTime = events[events.length - 1]!.end;
  const totalTime = Math.max(1, endTime - startTime);

  // Find MIDI range from active notes
  let minMidi = 127;
  let maxMidi = 0;
  let hasNotes = false;

  for (const event of events) {
    if (event.note && !event.note.isRest && event.note.pitch) {
      const midi = event.note.pitch.midi;
      if (midi < minMidi) minMidi = midi;
      if (midi > maxMidi) maxMidi = midi;
      hasNotes = true;
    }
  }

  if (!hasNotes) {
    minMidi = 60;
    maxMidi = 72;
  } else {
    // Pad with 3 semitones top and bottom for a professional piano roll look
    minMidi = Math.max(0, minMidi - 3);
    maxMidi = Math.min(127, maxMidi + 3);
    // Ensure minimum range of 10 semitones for proper visualization
    if (maxMidi - minMidi < 10) {
      const diff = 10 - (maxMidi - minMidi);
      minMidi = Math.max(0, minMidi - Math.floor(diff / 2));
      maxMidi = Math.min(127, maxMidi + Math.ceil(diff / 2));
    }
  }

  // Dynamic Width Scaling based on audio duration (proportional linear timeline)
  const durationSeconds = totalTime / 10_000_000;
  const pixelsPerSecond = 320;
  const paddingLeft = 140; // Flush left alignment
  const paddingRight = 60;
  const paddingTop = 60;
  const paddingBottom = 90;

  const chartWidth = Math.max(1400, Math.floor(durationSeconds * pixelsPerSecond));
  const width = paddingLeft + chartWidth + paddingRight;
  const height = 700;

  const chartHeight = height - paddingTop - paddingBottom;
  const midiRange = maxMidi - minMidi;
  const laneHeight = chartHeight / (midiRange + 1);

  const getX = (t: number) => paddingLeft + ((t - startTime) / totalTime) * chartWidth;
  const getY = (pitch: number) =>
    paddingTop + (midiRange - (pitch - minMidi)) * laneHeight + laneHeight / 2;

  const gridLanes: string[] = [];
  const pianoKeys: string[] = [];
  const noteBoxes: string[] = [];
  const noteTexts: string[] = [];
  const phoneVerticalLines: string[] = [];
  const phoneLabels: string[] = [];
  const musicalConnections: string[] = []; // Ties and Slurs layer

  // 1. Draw horizontal lanes & piano keys (Light theme CeVIO style, flush to the left boundary)
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = getY(midi);
    const noteInOctave = midi % 12;
    const isBlackKey = [1, 3, 6, 8, 10].includes(noteInOctave);
    const label = midiToNoteName(midi);
    const keyTop = y - laneHeight / 2;

    gridLanes.push(`
		<rect x="${paddingLeft}" y="${keyTop}" width="${chartWidth}" height="${laneHeight}" fill="${isBlackKey ? "#f8fafc" : "#ffffff"}" stroke="#e2e8f0" stroke-width="0.5" />
		`);

    if (isBlackKey) {
      pianoKeys.push(`
			<!-- Black Key: ${label} -->
			<rect x="0" y="${keyTop}" width="95" height="${laneHeight}" fill="#334155" stroke="#1e293b" stroke-width="1" rx="1" />
			<rect x="0" y="${keyTop + 1}" width="90" height="${laneHeight - 2}" fill="#475569" opacity="0.2" />
			`);
    } else {
      const isC = noteInOctave === 0;
      pianoKeys.push(`
			<!-- White Key: ${label} -->
			<rect x="0" y="${keyTop}" width="140" height="${laneHeight}" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" rx="1" />
			${isC ? `<text x="130" y="${keyTop + laneHeight / 2 + 4}" fill="#64748b" font-family="system-ui, sans-serif" font-weight="bold" font-size="11" text-anchor="end">${label}</text>` : ""}
			`);
    }
  }

  // 2. Mathematically correct vertical measure (bar) lines & beat subdivisions
  const measureStartTimes = new Map<string, number>();
  const measureNotes = new Map<string, (typeof events)[0]["note"][]>();

  events.forEach((event) => {
    if (event.note && event.note.measureNumber) {
      const mNum = event.note.measureNumber;
      if (!measureStartTimes.has(mNum) || event.start < measureStartTimes.get(mNum)!) {
        measureStartTimes.set(mNum, event.start);
      }
      if (!measureNotes.has(mNum)) {
        measureNotes.set(mNum, []);
      }
      measureNotes.get(mNum)!.push(event.note);
    }
  });

  const barLines: string[] = [];
  const sortedMeasures = Array.from(measureStartTimes.entries()).sort((a, b) => a[1] - b[1]);

  sortedMeasures.forEach(([mNum, mStart]) => {
    const x = getX(mStart);
    // Bold Measure line
    barLines.push(`
		<!-- Measure ${mNum} Barline -->
		<line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${height - paddingBottom}" stroke="#94a3b8" stroke-width="2" />
		<rect x="${x - 14}" y="${paddingTop - 25}" width="28" height="18" rx="3" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1" />
		<text x="${x}" y="${paddingTop - 12}" fill="#334155" font-family="system-ui, sans-serif" font-weight="bold" font-size="11" text-anchor="middle">${mNum}</text>
		`);

    const mNotes = measureNotes.get(mNum) || [];
    const firstNote = mNotes[0];
    if (firstNote) {
      const beats = firstNote.beat?.beats || 4;
      const tempo = firstNote.tempo || 120;
      const beatDuration = (60 / tempo) * 10_000_000;

      for (let beat = 1; beat < beats; beat++) {
        const beatTime = mStart + beat * beatDuration;
        if (beatTime < endTime) {
          const bx = getX(beatTime);
          barLines.push(`
					<line x1="${bx}" y1="${paddingTop}" x2="${bx}" y2="${height - paddingBottom}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3" />
					<text x="${bx}" y="${paddingTop - 10}" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="9" text-anchor="middle">${mNum}.${beat + 1}</text>
					`);
        }
      }
    }
  });

  // End boundary line
  barLines.push(`
	<line x1="${getX(endTime)}" y1="${paddingTop}" x2="${getX(endTime)}" y2="${height - paddingBottom}" stroke="#94a3b8" stroke-width="2" />
	`);

  // Collect unique notes to map their visual coordinates
  const uniqueNotes: (typeof events)[0]["note"][] = [];
  const seenNoteIds = new Set<string>();
  events.forEach((event) => {
    if (event.note && !event.note.isRest && event.note.pitch && !seenNoteIds.has(event.note.id)) {
      seenNoteIds.add(event.note.id);
      uniqueNotes.push(event.note);
    }
  });

  const noteCoords = new Map<string, { x1: number; x2: number; y: number }>();
  const barHeight = Math.max(12, laneHeight * 0.7);

  // 3. Draw active MIDI notes (CeVIO AI pink blocks)
  uniqueNotes.forEach((note) => {
    const noteEvents = events.filter((e) => e.note.id === note.id);
    if (noteEvents.length > 0) {
      const nStart = noteEvents[0]!.start;
      const nEnd = noteEvents[noteEvents.length - 1]!.end;
      const x1 = getX(nStart);
      const x2 = getX(nEnd);
      const y = getY(note.pitch!.midi);

      noteCoords.set(note.id, { x1, x2, y });

      // Note box
      noteBoxes.push(`
			<g class="note-block" data-note-id="${note.id}" data-start="${(nStart / 10_000_000).toFixed(4)}" data-end="${(nEnd / 10_000_000).toFixed(4)}">
				<rect x="${x1}" y="${y - barHeight / 2}" width="${x2 - x1}" height="${barHeight}" rx="4" fill="#f472b6" fill-opacity="0.85" stroke="#db2777" stroke-width="1.5" />
				<rect x="${x1 + 1}" y="${y - barHeight / 2 + 1}" width="${x2 - x1 - 4}" height="3" fill="#ffffff" fill-opacity="0.4" rx="1" />
			</g>
			`);

      // Note lyric text layer
      if (note.lyric) {
        noteTexts.push(`
				<text x="${x1 + 6}" y="${y + 4}" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold" font-size="11" pointer-events="none">${note.lyric}</text>
				`);
      }
    }
  });

  // 4. Generate Ties and Slurs Connections (Musical Curves in the style of CeVIO - UNDER notes always)
  let activeSlurStart: (typeof uniqueNotes)[0] | null = null;
  uniqueNotes.forEach((note, index) => {
    const curr = noteCoords.get(note.id);
    if (!curr) return;

    // A. TIES: Connect contiguous notes of the SAME pitch (drawn UNDER notes always)
    if (note.tie === "start" || note.tie === "continue") {
      const nextNote = uniqueNotes[index + 1];
      if (nextNote && (nextNote.tie === "continue" || nextNote.tie === "stop")) {
        const next = noteCoords.get(nextNote.id);
        if (next && note.pitch?.midi === nextNote.pitch?.midi) {
          // Draw a beautiful dashed/dotted purple bridge at the BOTTOM edge of adjacent notes
          musicalConnections.push(`
					<!-- Tie from ${note.lyric || "unnamed"} to ${nextNote.lyric || "unnamed"} -->
					<path d="M ${curr.x2} ${curr.y + barHeight / 2} Q ${(curr.x2 + next.x1) / 2} ${curr.y + barHeight / 2 + 12} ${next.x1} ${next.y + barHeight / 2}"
						fill="none" stroke="#d946ef" stroke-width="2" stroke-dasharray="3 2" opacity="0.8" />
					`);
        }
      }
    }

    // B. SLURS: Smooth pitch portamento glide across notes of DIFFERENT pitches (drawn UNDER notes always)
    if (note.slur === "start") {
      activeSlurStart = note;
    }
    if (note.slur === "stop" && activeSlurStart) {
      const startCoords = noteCoords.get(activeSlurStart.id);
      if (startCoords) {
        const x1 = startCoords.x1;
        const x2 = curr.x2;
        const y1 = startCoords.y + barHeight / 2 + 4;
        const y2 = curr.y + barHeight / 2 + 4;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Perfect circle radius for a 180-270 degree circular arc (lower half of the circle)
        const r = dist / 1.8;
        const depth = r + Math.sqrt(r * r - (dist / 2) * (dist / 2));

        // large-arc-flag = 1, sweep-flag = 0 to always draw the deep lower half of the circle (underswing)
        musicalConnections.push(`
				<!-- CeVIO Style Slur Arc UNDER the notes -->
				<path d="M ${x1} ${y1} A ${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${x2} ${y2}"
					fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" opacity="0.8" />
				<!-- Tiny musical slur curve accent (drawn under the arc peak) -->
				<path d="M ${(x1 + x2) / 2 - 8} ${Math.max(y1, y2) + depth - 8} Q ${(x1 + x2) / 2} ${Math.max(y1, y2) + depth - 12} ${(x1 + x2) / 2 + 8} ${Math.max(y1, y2) + depth - 8}"
					fill="none" stroke="#818cf8" stroke-width="1" opacity="0.5" />
				`);
      }
      activeSlurStart = null;
    }
  });

  // 5. Draw phone bands & lines
  events.forEach((event) => {
    const x1 = getX(event.start);
    const x2 = getX(event.end);
    const isSilence = event.phoneme === "pau" || event.phoneme === "br";

    let bandColor = "#64748b";
    if (event.role === "pre") bandColor = "#db2777";
    else if (event.role === "anchor") bandColor = "#059669";
    else if (event.role === "tail") bandColor = "#2563eb";
    else if (event.role === "breath") bandColor = "#475569";

    phoneVerticalLines.push(`
		<line x1="${x1}" y1="${paddingTop}" x2="${x1}" y2="${height - paddingBottom}" stroke="#cbd5e1" stroke-width="0.8" />
		`);

    phoneLabels.push(`
		<g class="phone-event" data-start="${(event.start / 10_000_000).toFixed(4)}" data-end="${(event.end / 10_000_000).toFixed(4)}">
			<rect x="${x1 + 1}" y="${height - paddingBottom + 10}" width="${x2 - x1 - 2}" height="28" rx="3" fill="${bandColor}" fill-opacity="0.1" stroke="${bandColor}" stroke-width="1" stroke-opacity="0.3" />
			<text x="${(x1 + x2) / 2}" y="${height - paddingBottom + 27}" fill="${isSilence ? "#64748b" : "#1e293b"}" font-family="system-ui, sans-serif" font-weight="bold" font-size="11" text-anchor="middle">${event.phoneme}</text>
		</g>
		`);
  });

  // 6. Continuous F0 line (flat-stepped per segment, with decimation transition guide)
  const f0Points: Array<{
    x: number;
    y: number;
    isSilence: boolean;
    isDecimation: boolean;
  }> = [];
  // Pre-compute next pitched MIDI per note for decimation interpolation
  const noteOrderSvg: (typeof events)[0]["note"][] = [];
  const seenSvg = new Set<string>();
  events.forEach((ev) => {
    if (!seenSvg.has(ev.note.id)) {
      seenSvg.add(ev.note.id);
      noteOrderSvg.push(ev.note);
    }
  });
  const nextMidiSvg = new Map<string, number | null>();
  for (let i = 0; i < noteOrderSvg.length; i++) {
    const note = noteOrderSvg[i]!;
    let next: number | null = null;
    for (let j = i + 1; j < noteOrderSvg.length; j++) {
      const n = noteOrderSvg[j]!;
      if (!n.isRest && n.pitch) {
        next = n.pitch.midi;
        break;
      }
    }
    nextMidiSvg.set(note.id, next);
  }

  events.forEach((event, index) => {
    const x1 = getX(event.start);
    const x2 = getX(event.end);
    const isSilence = event.phoneme === "pau" || event.phoneme === "br";

    if (!isSilence && event.note && event.note.pitch) {
      const baseMidi = event.note.pitch.midi;
      const isDecimation = event.decimationEase !== undefined;

      let pitchMidi = baseMidi;
      if (isDecimation) {
        // Interpolate toward next note's pitch using the ease ratio
        const nextMidi = nextMidiSvg.get(event.note.id) ?? baseMidi;
        pitchMidi = baseMidi + (nextMidi - baseMidi) * event.decimationEase!;
      }

      const gauge = expressionForNote(
        event.note,
        distinctNote(events, index, -1),
        distinctNote(events, index, 1),
        event.tone,
        event.phoneIndexInNote,
        event.phoneCountInNote,
        event.velocity,
      );
      const actualPitch = pitchMidi + gauge.tonalPitchOffset;
      const yVal = getY(actualPitch);

      f0Points.push({ x: x1, y: yVal, isSilence: false, isDecimation });
      f0Points.push({
        x: (x1 + x2) / 2,
        y: yVal,
        isSilence: false,
        isDecimation,
      });
      f0Points.push({ x: x2, y: yVal, isSilence: false, isDecimation });
    } else {
      f0Points.push({
        x: (x1 + x2) / 2,
        y: 0,
        isSilence: true,
        isDecimation: false,
      });
    }
  });

  let f0PathSvg = "";
  if (f0Points.length > 0) {
    let currentSegment: Array<{ x: number; y: number }> = [];
    const paths: string[] = [];

    for (const pt of f0Points) {
      if (pt.isSilence) {
        if (currentSegment.length > 0) {
          paths.push(buildBezierPath(currentSegment));
          currentSegment = [];
        }
      } else {
        currentSegment.push({ x: pt.x, y: pt.y });
      }
    }
    if (currentSegment.length > 0) {
      paths.push(buildBezierPath(currentSegment));
    }

    f0PathSvg = paths
      .map(
        (d) => `
		<path d="${d}" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
		`,
      )
      .join("\n");
  }

  let f0ActualSvg = "";
  if (actualF0) {
    const FRAME_DURATION = 0.01;
    const f0ActualPoints: Array<{ x: number; y: number; isSilence: boolean }> = [];

    for (let i = 0; i < actualF0.frames; i++) {
      const hz = actualF0.values[i]!;
      const time = i * FRAME_DURATION;
      const time100ns = time * 10_000_000;
      const xVal = getX(time100ns);

      if (hz > 0) {
        const midi = hzToMidi(hz);
        const yVal = getY(midi);
        f0ActualPoints.push({ x: xVal, y: yVal, isSilence: false });
      } else {
        f0ActualPoints.push({ x: xVal, y: 0, isSilence: true });
      }
    }

    let currentSegment: Array<{ x: number; y: number }> = [];
    const paths: string[] = [];

    for (const pt of f0ActualPoints) {
      if (pt.isSilence) {
        if (currentSegment.length > 0) {
          paths.push(buildBezierPath(currentSegment));
          currentSegment = [];
        }
      } else {
        currentSegment.push({ x: pt.x, y: pt.y });
      }
    }
    if (currentSegment.length > 0) {
      paths.push(buildBezierPath(currentSegment));
    }

    const f0Paths = paths
      .map(
        (d) => `
		<path d="${d}" />
		`,
      )
      .join("\n");

    f0ActualSvg = `
	<g id="f0-actual-layer">
		${f0Paths}
	</g>
	`;
  }

  // 7. Time ticks on the X axis
  const timeLabels: string[] = [];
  const step = totalTime / 20;
  for (let i = 0; i <= 20; i++) {
    const t = startTime + step * i;
    const x = getX(t);
    const seconds = (t - startTime) / 10_000_000;
    timeLabels.push(`
		<line x1="${x}" y1="${height - paddingBottom}" x2="${x}" y2="${height - paddingBottom + 6}" stroke="#94a3b8" stroke-width="1.5" />
		<text x="${x}" y="${height - paddingBottom + 52}" fill="#64748b" font-family="system-ui, sans-serif" font-size="11" text-anchor="middle">${seconds.toFixed(2)}s</text>
		`);
  }

  const svgContent = `<svg id="timeline-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-total-duration="${(totalTime / 10_000_000).toFixed(4)}" data-min-midi="${minMidi}" data-max-midi="${maxMidi}" data-padding-top="${paddingTop}" data-padding-bottom="${paddingBottom}" data-padding-left="${paddingLeft}" data-padding-right="${paddingRight}" data-height="${height}" data-width="${width}">
	<style>
		text { user-select: none; }
		.phone-event { transition: transform 0.1s ease; cursor: pointer; will-change: transform; }
		.phone-event:hover rect { fill-opacity: 0.3; }
		.phone-event.active rect { fill-opacity: 0.5; stroke-opacity: 1; stroke-width: 2; }
		.note-block { transition: filter 0.2s ease; will-change: filter; }
		.note-block.active { filter: drop-shadow(0 0 4px #db2777); }
		#cursor { transition: x1 0.05s linear, x2 0.05s linear; pointer-events: none; will-change: x1, x2; }
		#piano-head { will-change: transform; }
		#f0-actual-layer path { stroke: #22c55e; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; fill: none; opacity: 0.85; }
	</style>
	<!-- Pure White background (W3C Compliant & Light Mode) -->
	<rect width="100%" height="100%" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" />

	<!-- Grid Lanes -->
	${gridLanes.join("")}

	<!-- Measure Grid lines (Barlines) -->
	${barLines.join("")}

	<!-- Ties & Slurs Layer (Drawn UNDER note blocks) -->
	${musicalConnections.join("")}

	<!-- Active MIDI Note Blocks -->
	${noteBoxes.join("")}

	<!-- Phoneme Guidelines -->
	${phoneVerticalLines.join("")}

	<!-- Continuous Semi-transparent F0 Line -->
	${f0PathSvg}

	<!-- Pre-rendered Actual F0 Layer -->
	${f0ActualSvg}
	<!-- Active MIDI Note Lyric Texts -->
	${noteTexts.join("")}

	<!-- Left Piano Keys Overlay (CeVIO AI grey base) -->
	<g id="piano-head">
		<rect x="0" y="${paddingTop}" width="140" height="${chartHeight}" fill="#f1f5f9" stroke="#cbd5e1" opacity="0.95" />
		${pianoKeys.join("")}
	</g>

	<!-- Phoneme Labels Block at the bottom -->
	${phoneLabels.join("")}

	<!-- X Axis and Tick marks -->
	<line x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" stroke="#94a3b8" stroke-width="1.5" />
	${timeLabels.join("")}
	<text x="${paddingLeft + chartWidth / 2}" y="${height - 20}" fill="#64748b" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">Timeline (Seconds)</text>

	<!-- Interactive Cursor -->
	<line id="cursor" x1="${paddingLeft}" y1="${paddingTop}" x2="${paddingLeft}" y2="${height - paddingBottom}" stroke="#ef4444" stroke-width="2" opacity="0.8" />
</svg>`;

  return minifySvg(svgContent);
}

function minifySvg(svg: string): string {
  let minified = svg
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Custom high-performance SVGO precision optimizer mimicking step
  // Rounds floating numbers in attributes/paths to 3 decimal places to preserve high fidelity curves
  minified = minified.replace(/(\d+\.\d{4,})/g, (val) => {
    const num = parseFloat(val);
    return isNaN(num) ? val : num.toFixed(3).replace(/\.0{1,3}$/, "");
  });

  return minified;
}

/**
 * Builds a beautiful, smoothed cubic bezier curve command (d) from a set of points.
 */
function buildBezierPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  if (points.length === 2)
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`;

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const cp1x = p0.x + (p1.x - p0.x) / 3;
    const cp2x = p1.x - (p1.x - p0.x) / 3;
    d += ` C ${cp1x.toFixed(1)} ${p0.y.toFixed(1)} ${cp2x.toFixed(1)} ${p1.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}
