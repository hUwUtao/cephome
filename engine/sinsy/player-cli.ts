import { readFileSync, writeFileSync } from "node:fs";
import { generateInteractivePlayerHtml } from "./player-template.ts";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.includes("-h") || args.includes("--help")) {
    console.error(
      "usage: cephome-player <input.timeline.svg> [output.html] [--audio path/to/audio.wav]",
    );
    process.exit(1);
  }

  let svgPath = "";
  let htmlPath = "";
  let audioUrl = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--audio" || args[i] === "-a") {
      audioUrl = args[++i] || "";
    } else if (!svgPath) {
      svgPath = args[i]!;
    } else if (!htmlPath) {
      htmlPath = args[i]!;
    }
  }

  if (!htmlPath) {
    htmlPath = svgPath.replace(".svg", ".player.html");
  }

  try {
    const svgContent = readFileSync(svgPath, "utf8");
    const html = await generateInteractivePlayerHtml(svgContent, svgPath, audioUrl);
    writeFileSync(htmlPath, html, "utf8");
    console.error(`Generated player -> ${htmlPath}`);
  } catch (e) {
    console.error(`Failed to generate player: ${e}`);
    process.exit(1);
  }
}

void main();
