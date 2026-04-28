import { codaToPhonemes, nucleusToPhonemes } from "../van.ts";
import { onsetToPhonemes } from "../onset.ts";
import { segmentSyllable } from "../segment.ts";
import type { RoleAwareLyricTranspiler, SyllablePhonePlan, TimedPhonePlan } from "./types.ts";
import { validateSinsyPhones } from "./phoneme.ts";
import { DEFAULT_VIETNAMESE_METADATA, metadataForLyric } from "./vietnamese-metadata.ts";

type SinsyVietnameseMode = "transparent" | "voicevox" | "singing";

export class VietnameseMoraPlanTranspiler implements RoleAwareLyricTranspiler {
  constructor(private readonly mode: SinsyVietnameseMode = "singing") {}

  transpile(lyric: string): SyllablePhonePlan {
    return this.plan(lyric);
  }

  plan(lyric: string): SyllablePhonePlan {
    try {
      const parsed = segmentSyllable(lyric);
      const metadata = metadataForLyric(lyric);
      const plan: TimedPhonePlan[] = [];

      plan.push(...onsetPlan(parsed.onset));
      if (parsed.medial === "w") {
        plan.push({ phone: "w", role: "pre", weight: 0.22 });
      }

      const nucleus = nucleusPhones(parsed.onset, parsed.nucleus, this.mode);
      // ă and â are inherently short vowels
      const isShortVowel = ["ă", "â"].includes(parsed.nucleus);
      const vowelWeight = isShortVowel ? 0.5 : 1.0;
      nucleus.forEach((phone, index) => {
        plan.push({
          phone,
          role: index === 0 ? "anchor" : "tail",
          weight: (index === 0 ? 1 : 0.7) * vowelWeight,
        });
      });

      for (const phone of codaPhones(parsed.coda, parsed.tone, this.mode)) {
        plan.push({ phone, role: "tail", weight: tailWeight(phone) });
      }

      return filterPlan(lyric, parsed.tone, metadata.vowelSign, metadata, plan);
    } catch (error) {
      const reason = error instanceof Error ? error.message.toLowerCase() : "unknown error";
      return {
        source: lyric,
        phones: [],
        tone: 0,
        vowelSign: 0,
        metadata: DEFAULT_VIETNAMESE_METADATA,
        plan: [],
        warnings: [`${lyric}: ${reason}`],
      };
    }
  }
}

function onsetPlan(onset: string): TimedPhonePlan[] {
  if (onset === "th") {
    return [
      { phone: "t", role: "pre", weight: 0.7 },
      { phone: "h", role: "pre", weight: 0.45 },
    ];
  }
  return onsetToPhonemes(onset).map((phone) => ({ phone, role: "pre", weight: 1 }));
}

function codaPhones(coda: string, tone: number, mode: SinsyVietnameseMode): string[] {
  if (mode !== "singing") return codaToPhonemes(coda, tone, mode);
  if (coda === "p") return ["p"];
  if (coda === "t") return ["t"];
  if (["c", "ch"].includes(coda)) return ["k"];
  if (coda === "ng") return tone === 4 || tone === 5 ? ["N", "g", "cl"] : ["N", "g"];
  return codaToPhonemes(coda, tone, "voicevox");
}

function nucleusPhones(onset: string, nucleus: string, mode: SinsyVietnameseMode): string[] {
  if (mode === "singing" && onset === "th" && nucleus === "oa") return ["o", "a"];
  return nucleusToPhonemes(nucleus);
}

function tailWeight(phone: string): number {
  if (phone === "cl") return 0.45;
  if (phone === "g") return 0.55;
  if (["p", "t", "k"].includes(phone)) return 0.55;
  return 0.8;
}

function filterPlan(
  source: string,
  tone: number,
  vowelSign: number,
  metadata: SyllablePhonePlan["metadata"],
  plan: TimedPhonePlan[],
): SyllablePhonePlan {
  const invalid = validateSinsyPhones(plan.map((item) => item.phone));
  const filtered = plan.filter((item) => !invalid.includes(item.phone));
  return {
    source,
    phones: filtered.map((item) => item.phone),
    tone,
    vowelSign,
    metadata,
    plan: filtered.map((f) => ({ ...f, vowelSign, metadata })),
    warnings: invalid.map((phone) => `${source}: unsupported Sinsy phone "${phone}"`),
  };
}
