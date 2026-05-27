async function minifyJs(code: string): Promise<string> {
  try {
    const transpiler = new Bun.Transpiler({ loader: "js" });
    return transpiler.transformSync(code);
  } catch {
    return code;
  }
}

async function minifyCss(code: string): Promise<string> {
  try {
    return code
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s+/g, " ")
      .replace(/\s*([{}|:;,])\s*/g, "$1")
      .trim();
  } catch {
    return code;
  }
}

function minifyHtml(html: string): string {
  return html
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function generateInteractivePlayerHtml(
  svgContent: string,
  sourceName: string,
  audioUrl?: string,
): Promise<string> {
  const basename = sourceName.split(/[/\\]/).pop()?.split(".")[0] || "output";
  const wavUrl = audioUrl || `../../output/${basename}.wav`; // Default relative path for NEUTRINO projects

  const css = `
		:root {
			--bg: #f8fafc;
			--panel: #ffffff;
			--primary: #3b82f6;
			--text: #1e293b;
			--accent: #db2777;
		}
		body {
			margin: 0;
			padding: 0;
			font-family: system-ui, -apple-system, sans-serif;
			background: var(--bg);
			color: var(--text);
			height: 100vh;
			display: grid;
			grid-template-rows: 1fr auto auto;
			overflow: hidden;
		}
		.controls {
			background: var(--panel);
			padding: 1rem 1.5rem;
			border-top: 1px solid #e2e8f0;
			display: flex;
			align-items: center;
			gap: 1.5rem;
			z-index: 50;
		}
		audio {
			flex-grow: 1;
			height: 36px;
		}
		.player-main {
			position: relative;
			overflow: hidden;
			background: #ffffff;
			display: grid;
			grid-template-columns: 1fr;
			grid-template-rows: 1fr;
		}
		.timeline-viewport {
			overflow: auto;
			height: 100%;
			width: 100%;
			scrollbar-width: thin;
		}
		.timeline-content {
			height: 100%;
			width: max-content;
			position: relative;
		}
		.timeline-content svg {
			height: 100%;
			width: auto;
			display: block;
		}
		.status-bar {
			padding: 0.4rem 1.5rem;
			background: #f1f5f9;
			border-top: 1px solid #e2e8f0;
			font-size: 0.7rem;
			color: #64748b;
			display: flex;
			justify-content: space-between;
		}
		.badge {
			padding: 0.15rem 0.4rem;
			border-radius: 4px;
			background: #e2e8f0;
			font-weight: 600;
			font-size: 0.75rem;
		}
		.opt-label {
			font-size: 0.65rem;
			font-weight: 800;
			color: #94a3b8;
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}
	`;

  const js = `
		const audio = document.getElementById('audio');
		const svg = document.getElementById('timeline-svg');
		const viewport = document.getElementById('viewport');
		const autoscroll = document.getElementById('autoscroll');
		const timeDisplay = document.getElementById('time-display');
		const cursor = document.getElementById('cursor');

		const totalDuration = svg ? parseFloat(svg.getAttribute('data-total-duration') || '0') : 0;
		const svgViewBox = svg ? svg.viewBox.baseVal : { width: 0 };
		const paddingLeft = 140;
		const chartWidth = Math.max(1, svgViewBox.width - paddingLeft - 60);

		// Pre-parse DOM metadata to eliminate frame-loop DOM attribute reading overhead
		const phoneEvents = Array.from(document.querySelectorAll('.phone-event')).map(el => ({
			el,
			start: parseFloat(el.getAttribute('data-start') || '0'),
			end: parseFloat(el.getAttribute('data-end') || '0'),
			active: false
		}));
		const noteBlocks = Array.from(document.querySelectorAll('.note-block')).map(el => ({
			el,
			start: parseFloat(el.getAttribute('data-start') || '0'),
			end: parseFloat(el.getAttribute('data-end') || '0'),
			active: false
		}));

		let lastTime = -1;

		function getScale() {
			if (!svg || !svgViewBox.width) return 1;
			const clientWidth = svg.clientWidth;
			return clientWidth > 0 ? (clientWidth / svgViewBox.width) : 1;
		}

		function updateCursor(time) {
			if (!svg) return;
			if (Math.abs(time - lastTime) < 0.001) return;
			lastTime = time;

			const ratio = totalDuration > 0 ? Math.min(1, time / totalDuration) : 0;
			const x = paddingLeft + (ratio * chartWidth);

			if (cursor) {
				cursor.setAttribute('x1', x.toString());
				cursor.setAttribute('x2', x.toString());
			}

			if (autoscroll && autoscroll.checked) {
				const scale = getScale();
				const scrollLeft = (x * scale) - (viewport.clientWidth / 2);
				viewport.scrollLeft = scrollLeft;
			}

			// Perform optimized highlight updates by mutating classes only when state changes
			for (let i = 0; i < phoneEvents.length; i++) {
				const item = phoneEvents[i];
				const isActive = time >= item.start && time < item.end;
				if (isActive !== item.active) {
					item.active = isActive;
					if (isActive) item.el.classList.add('active');
					else item.el.classList.remove('active');
				}
			}

			for (let i = 0; i < noteBlocks.length; i++) {
				const item = noteBlocks[i];
				const isActive = time >= item.start && time < item.end;
				if (isActive !== item.active) {
					item.active = isActive;
					if (isActive) item.el.classList.add('active');
					else item.el.classList.remove('active');
				}
			}

			timeDisplay.textContent = time.toFixed(3) + 's / ' + totalDuration.toFixed(3) + 's';
		}

		function frame() {
			if (!audio.paused) {
				updateCursor(audio.currentTime);
			}
			requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);

		audio.addEventListener('timeupdate', () => updateCursor(audio.currentTime));
		audio.addEventListener('seeking', () => updateCursor(audio.currentTime));
		audio.addEventListener('seeked', () => updateCursor(audio.currentTime));
		audio.addEventListener('play', () => updateCursor(audio.currentTime));

		if (svg) {
			svg.addEventListener('click', (e) => {
				const rect = svg.getBoundingClientRect();
				const clickX = e.clientX - rect.left;
				
				// Translate click to SVG local coordinates using viewBox
				const scale = getScale();
				const localX = clickX / scale;

				if (localX >= paddingLeft && localX <= paddingLeft + chartWidth) {
					const ratio = (localX - paddingLeft) / chartWidth;
					const time = ratio * totalDuration;
					audio.currentTime = time;
					updateCursor(time);
				}
			});
		}

		audio.addEventListener('loadedmetadata', () => {
			timeDisplay.textContent = '0.000s / ' + totalDuration.toFixed(3) + 's';
		});
	`;
  const [minCss, minJs] = await Promise.all([minifyCss(css), minifyJs(js)]);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Timeline Player - ${basename}</title>
	<style>${minCss}</style>
</head>
<body>
	<main class="player-main">
		<div class="timeline-viewport" id="viewport">
			<div class="timeline-content" id="content">
				${svgContent}
			</div>
		</div>
	</main>

	<div class="controls">
		<audio id="audio" controls src="${wavUrl}"></audio>
		<div style="display: flex; flex-direction: column; gap: 2px;">
			<span class="opt-label">Autoscroll</span>
			<input type="checkbox" id="autoscroll" checked style="width: 18px; height: 18px; cursor: pointer;">
		</div>
	</div>

	<footer class="status-bar">
		<div></div>
		<div id="time-display">0.000s / --.---s</div>
	</footer>

	<script>${minJs}</script>
</body>
</html>`;

  return minifyHtml(html);
}
