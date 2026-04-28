#!/usr/bin/env bun
/**
 * Streaming Vietnamese → CeVIO transcription CLI
 * Reads Vietnamese text from stdin (line by line) and writes phonetics to stdout
 * Works like: cat lyrics.txt | bun cli.ts > phonetics.txt
 */

import { transcribeText } from "./index.ts";

async function main() {
  const stdin = process.stdin;
  const stdout = process.stdout;

  // Read from stdin line by line and transcribe
  for await (const line of stdin) {
    const text = line.toString().trim();
    if (!text) {
      stdout.write("\n");
      continue;
    }

    // Transcribe the line
    const phonetics = transcribeText(text);
    stdout.write(phonetics + "\n");
  }
}

void main().catch(console.error);
