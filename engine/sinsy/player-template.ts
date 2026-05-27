export function generateInteractivePlayerHtml(
  svgContent: string,
  sourceName: string,
  audioUrl?: string,
): string {
  const basename = sourceName.split(/[/\\]/).pop()?.split(".")[0] || "output";
  const wavUrl = audioUrl || `../../output/${basename}.wav`; // Default relative path for NEUTRINO projects

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Cephome Timeline Player - ${basename}</title>
	<style>
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
			grid-template-rows: auto 1fr auto auto;
			overflow: hidden;
		}
		header {
			padding: 0.75rem 1.5rem;
			background: var(--panel);
			border-bottom: 1px solid #e2e8f0;
			display: flex;
			align-items: center;
			justify-content: space-between;
			box-shadow: 0 1px 2px rgba(0,0,0,0.03);
			z-index: 50;
		}
		h1 {
			margin: 0;
			font-size: 1.1rem;
			font-weight: 700;
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
		/* Practical component layout */
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
			position: relative;
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
	</style>
</head>
<body>
	<header>
		<div>
			<h1>Cephome Player</h1>
			<div style="font-size: 0.75rem; color: #94a3b8;">${sourceName}</div>
		</div>
		<div class="badge">VIETNAMESE SVS</div>
	</header>

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
		<div>Cephome Phonemetizer Engine</div>
		<div id="time-display">0.000s / --.---s</div>
	</footer>

	<script>
		const audio = document.getElementById('audio');
		const svg = document.getElementById('timeline-svg');
		const viewport = document.getElementById('viewport');
		const autoscroll = document.getElementById('autoscroll');
		const timeDisplay = document.getElementById('time-display');

		const cursor = document.getElementById('cursor');
		const pianoHead = document.getElementById('piano-head');

		if (!svg) {
			console.error("[cephome] timeline-svg not found");
		}

		const totalDuration = svg ? parseFloat(svg.getAttribute('data-total-duration') || '0') : 0;
		const svgViewBox = svg ? svg.viewBox.baseVal : { width: 0 };
		const paddingLeft = 140; 
		const chartWidth = Math.max(1, svgViewBox.width - paddingLeft - 60);

		const phoneEvents = Array.from(document.querySelectorAll('.phone-event'));
		const noteBlocks = Array.from(document.querySelectorAll('.note-block'));

		let lastTime = -1;

		function updateCursor(time) {
			if (!svg) return;
			if (Math.abs(time - lastTime) < 0.001) return;
			lastTime = time;

			const ratio = totalDuration > 0 ? Math.min(1, time / totalDuration) : 0;
			const x = paddingLeft + (ratio * chartWidth);
			
			if (cursor) {
				cursor.setAttribute('x1', x);
				cursor.setAttribute('x2', x);
			}

			if (autoscroll.checked && !audio.paused) {
				const scrollLeft = x - (viewport.clientWidth / 2);
				viewport.scrollLeft = scrollLeft;
			}

			phoneEvents.forEach(el => {
				const start = parseFloat(el.getAttribute('data-start'));
				const end = parseFloat(el.getAttribute('data-end'));
				if (time >= start && time < end) el.classList.add('active');
				else el.classList.remove('active');
			});

			noteBlocks.forEach(el => {
				const start = parseFloat(el.getAttribute('data-start'));
				const end = parseFloat(el.getAttribute('data-end'));
				if (time >= start && time < end) el.classList.add('active');
				else el.classList.remove('active');
			});

			timeDisplay.textContent = time.toFixed(3) + 's / ' + totalDuration.toFixed(3) + 's';
		}

		function frame() {
			if (!audio.paused || audio.seeking) {
				updateCursor(audio.currentTime);
			}
			requestAnimationFrame(frame);
		}
		requestAnimationFrame(frame);

		viewport.addEventListener('scroll', () => {
			if (svg) {
				svg.style.setProperty('--scroll-x', viewport.scrollLeft + 'px');
			}
		});

		if (svg) {
			svg.addEventListener('click', (e) => {
				const pt = svg.createSVGPoint();
				pt.x = e.clientX;
				pt.y = e.clientY;
				const ctm = svg.getScreenCTM();
				if (!ctm) return;
				const localPt = pt.matrixTransform(ctm.inverse());
				
				if (localPt.x >= paddingLeft && localPt.x <= paddingLeft + chartWidth) {
					const ratio = (localPt.x - paddingLeft) / chartWidth;
					const time = ratio * totalDuration;
					audio.currentTime = time;
					updateCursor(time);
				}
			});
		}

		audio.addEventListener('loadedmetadata', () => {
			timeDisplay.textContent = '0.000s / ' + totalDuration.toFixed(3) + 's';
		});
	</script>
</body>
</html>`;
}
