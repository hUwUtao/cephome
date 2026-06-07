import { serve } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import index from "./index.html";
import { transcribe, transcribeText } from "../engine/index.ts";
import { SinsyLabelPipeline } from "../engine/vsinsy/index.ts";
import { DomMusicXmlParser } from "../engine/vsinsy/mxl/musicxml.ts";
import { VocalLineNormalizer } from "../engine/vsinsy/mxl/voice-select.ts";
import { VietnameseMoraPlanTranspiler } from "../engine/vsinsy/lab/mora-plan.ts";
import { VowelAnchoredTimingStrategy } from "../engine/vsinsy/lab/timing.ts";

const server = serve({
  routes: {
    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(_req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(_req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },

    "/api/render": {
      async POST(req) {
        try {
          const body = (await req.json()) as {
            musicxml?: string;
            voice?: string;
            model?: string;
            options?: Record<string, unknown>;
          };

          if (!body.musicxml) {
            return new Response(JSON.stringify({ error: "Missing 'musicxml'" }), { status: 400 });
          }

          let xmlContent: string;
          if (body.musicxml.startsWith("/") || body.musicxml.startsWith("~") || body.musicxml.startsWith("C:")) {
            const resolved = body.musicxml.replace(/^~/, process.env.HOME || "");
            if (!existsSync(resolved)) {
              return new Response(JSON.stringify({ error: `File not found: ${resolved}` }), { status: 400 });
            }
            xmlContent = readFileSync(resolved, "utf8");
          } else {
            xmlContent = body.musicxml;
          }

          const outputDir = join(dirname(new URL(import.meta.url).pathname), "..", "render_output");
          mkdirSync(outputDir, { recursive: true });

          const sourceName = join(outputDir, "render");
          const pipeline = new SinsyLabelPipeline({
            phraseOverrideOptions: { omitGhost: true },
            quiet: true,
            noSvg: true,
          });

          const result = pipeline.serializeTrace(xmlContent, sourceName);

          const notes = result.score.notes.map((n) => ({
            id: n.id,
            tick: n.startDiv,
            midi: n.pitch?.midi ?? null,
            pitchName: n.pitch?.name ?? null,
            durationDiv: n.durationDiv,
            lyric: n.lyric,
            verse: null,
            dynamic: n.dynamic,
            isRest: n.isRest,
            tie: n.tie,
            slur: n.slur,
          }));

          const phones = result.events.map((e) => ({
            startNs: e.start,
            endNs: e.end,
            phoneme: e.phoneme,
            class: e.cls,
            role: e.role,
            midi: e.note.pitch?.midi ?? null,
            lyric: e.note.lyric ?? null,
            tone: e.tone,
            vowelSign: e.vowelSign,
            ghost: e.ghost ?? false,
            vacuum: e.vacuum ?? false,
            velocity: e.velocity ?? null,
            phoneIndexInNote: e.phoneIndexInNote,
            phoneCountInNote: e.phoneCountInNote,
            expression: {
              energy: 70,
              vibratoRateHz: 0,
              vibratoDepthCents: 0,
              vibratoStartRatio: 0,
              pitchDeltaFromPrev: 0,
              pitchDeltaToNext: 0,
              tonalPitchOffset: 0,
              toneMelodyRelation: "level",
            },
          }));

          const renderOutput = {
            format: "cephome-render-v1",
            generated: new Date().toISOString(),
            model: body.model ?? "default",
            source: body.musicxml,
            notes,
            phones,
            audio: null as Record<string, unknown> | null,
          };

          const jsonPath = join(outputDir, "render.json");
          writeFileSync(jsonPath, JSON.stringify(renderOutput, null, 2), "utf8");

          writeFileSync(join(outputDir, "render.mono.lab"), result.mono, "utf8");
          writeFileSync(join(outputDir, "render.full.lab"), result.full, "utf8");

          return new Response(
            JSON.stringify({
              success: true,
              jsonPath,
              monoSync: jsonPath.replace("render.json", "render.mono.lab"),
              fullSync: jsonPath.replace("render.json", "render.full.lab"),
              notes: notes.length,
              phones: phones.length,
              output: renderOutput,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },

    "/api/render/status": {
      async GET() {
        const outputDir = join(dirname(new URL(import.meta.url).pathname), "..", "render_output");
        const jsonPath = join(outputDir, "render.json");
        if (!existsSync(jsonPath)) {
          return Response.json({ exists: false });
        }
        const data = JSON.parse(readFileSync(jsonPath, "utf8"));
        return Response.json({
          exists: true,
          generated: data.generated,
          format: data.format,
          notes: data.notes?.length ?? 0,
          phones: data.phones?.length ?? 0,
          hasAudio: data.audio !== null,
        });
      },
    },

    "/api/transcribe": {
      async POST(req) {
        try {
          const { text, format } = (await req.json()) as {
            text?: string;
            format?: "text" | "structured";
          };

          if (!text) {
            return Response.json({ error: "Missing 'text' in request body" }, { status: 400 });
          }

          const result = format === "text" ? transcribeText(text) : transcribe(text);

          return Response.json({ success: true, result });
        } catch (error) {
          return Response.json(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 400 },
          );
        }
      },
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
