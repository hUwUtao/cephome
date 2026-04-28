import { serve } from "bun";
import index from "./index.html";
import { transcribe, transcribeText } from "../engine/index.ts";

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
