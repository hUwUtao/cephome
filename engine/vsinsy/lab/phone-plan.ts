import { classifyPhone } from "./phoneme.ts";
import { validateSinsyPhones } from "./phoneme.ts";
import type { PhoneRole, TimedPhonePlan, VietnameseSyllableMetadata } from "./types.ts";

export interface ParsedPhonePlan {
  plan: TimedPhonePlan[];
  warnings: string[];
}

export interface PhonePlanParseOptions {
  omitGhost?: boolean;
}

interface ParsedPhoneToken {
  phone: string;
  role: PhoneRole | null;
  weight: number | null;
  velocity: number | null;
  ghost: boolean;
  vacuum: boolean;
  omittable: boolean;
}

const TOKEN_PATTERN =
  /^([^@*!\s,|]+)(?:@(pre|anchor|tail|breath))?(?:\*([0-9]+(?:\.[0-9]+)?))?(?:!([0-9]+))?$/;

export function parsePhoneUnit(
  unit: string,
  metadata: VietnameseSyllableMetadata,
  source: string,
  options: PhonePlanParseOptions = {},
): ParsedPhonePlan {
  const parsedTokens: ParsedPhoneToken[] = [];
  const warnings: string[] = [];
  for (const rawToken of unit.split(/[,\s]+/)) {
    const token = rawToken.trim();
    if (!token) continue;
    const parsed = parsePhoneToken(token);
    if (!parsed) {
      warnings.push(`${source}: invalid phone token "${token}"`);
      continue;
    }
    if (parsed.omittable && options.omitGhost) continue;
    parsedTokens.push(parsed);
  }

  return buildPhonePlan(parsedTokens, metadata, source, warnings);
}

export function parsePhoneGroups(
  groups: string[],
  metadata: VietnameseSyllableMetadata,
  source: string,
  options: PhonePlanParseOptions = {},
): ParsedPhonePlan {
  const parsedTokens: ParsedPhoneToken[] = [];
  const warnings: string[] = [];

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const groupTokens: ParsedPhoneToken[] = [];
    for (const rawToken of groups[groupIndex]!.split(/[,\s]+/)) {
      const token = rawToken.trim();
      if (!token) continue;
      const parsed = parsePhoneToken(token);
      if (!parsed) {
        warnings.push(`${source}: invalid phone token "${token}"`);
        continue;
      }
      if (parsed.omittable && options.omitGhost) continue;
      groupTokens.push(parsed);
    }

    const groupAnchorIndex = groupTokens.findIndex((token) => classifyPhone(token.phone) === "v");
    groupTokens.forEach((token, tokenIndex) => {
      if (!token.role) token.role = roleForGroup(groupIndex, tokenIndex, groupAnchorIndex);
      parsedTokens.push(token);
    });
  }

  return buildPhonePlan(parsedTokens, metadata, source, warnings);
}

export function formatSimplePhoneGroups(plan: TimedPhonePlan[]): string {
  const pre: string[] = [];
  const nucleus: string[] = [];
  const tail: string[] = [];

  for (const item of plan) {
    const text = formatSimplePhoneToken(item);
    if (item.role === "pre") {
      pre.push(text);
    } else if (classifyPhone(item.phone) === "v") {
      nucleus.push(text);
    } else {
      tail.push(text);
    }
  }

  return `${pre.join(" ")} | ${nucleus.join(" ")} | ${tail.join(" ")}`.trimEnd();
}

function buildPhonePlan(
  parsedTokens: ParsedPhoneToken[],
  metadata: VietnameseSyllableMetadata,
  source: string,
  warnings: string[],
): ParsedPhonePlan {
  const invalid = validateSinsyPhones(parsedTokens.map((token) => token.phone));
  for (const phone of invalid) warnings.push(`${source}: unsupported Sinsy phone "${phone}"`);

  const validTokens = parsedTokens.filter((token) => !invalid.includes(token.phone));
  const anchorIndex = inferAnchorIndex(validTokens);
  return {
    plan: validTokens.map((token, index) => {
      const role = token.role ?? inferRole(token.phone, index, anchorIndex);
      return {
        phone: token.phone,
        role,
        weight: token.weight ?? defaultWeight(token.phone, role, token.ghost),
        ghost: token.ghost || undefined,
        vacuum: token.vacuum || undefined,
        velocity: token.velocity ?? undefined,
        vowelSign: metadata.vowelSign,
        metadata,
      };
    }),
    warnings,
  };
}

export function formatPhoneUnit(plan: TimedPhonePlan[]): string {
  return plan.map(formatPhoneToken).join(",");
}

function parsePhoneToken(token: string): ParsedPhoneToken | null {
  if (token === "-") {
    return {
      phone: "sil",
      role: null,
      weight: 0.01,
      velocity: 0,
      ghost: true,
      vacuum: true,
      omittable: false,
    };
  }
  const bracketed = /^\[([^\]\s,|]+)](.*)$/.exec(token);
  const ghost = Boolean(bracketed);
  const normalizedToken = bracketed ? `${bracketed[1]}${bracketed[2]}` : token;
  const match = TOKEN_PATTERN.exec(normalizedToken);
  if (!match) return null;
  const phone = stripToneMarker(match[1]!);
  if (!phone) return null;
  const role = (match[2] as PhoneRole | undefined) ?? null;
  const weightText = match[3];
  const velocityText = match[4];
  const weight = weightText ? Number(weightText) : ghost ? 0.05 : null;
  const velocity = velocityText ? Number(velocityText) : ghost ? 0 : null;
  if (weight !== null && !Number.isFinite(weight)) return null;
  if (velocity !== null && (!Number.isInteger(velocity) || velocity < 0 || velocity > 127))
    return null;
  return { phone, role, weight, velocity, ghost, vacuum: false, omittable: ghost };
}

function inferAnchorIndex(tokens: ParsedPhoneToken[]): number {
  const explicit = tokens.findIndex((token) => token.role === "anchor");
  if (explicit !== -1) return explicit;
  const vowel = tokens.findIndex((token) => classifyPhone(token.phone) === "v");
  return vowel === -1 ? 0 : vowel;
}

function inferRole(phone: string, index: number, anchorIndex: number): PhoneRole {
  if (phone === "pau") return "breath";
  if (index < anchorIndex) return "pre";
  if (index === anchorIndex) return "anchor";
  return "tail";
}

function roleForGroup(groupIndex: number, tokenIndex: number, anchorIndex: number): PhoneRole {
  if (groupIndex === 0) return "pre";
  if (groupIndex >= 2) return "tail";
  // Nucleus group: anchor and all subsequent phones stay in the vowel
  // phase — diphthong companions get anchor, not tail.
  if (anchorIndex === -1) return tokenIndex === 0 ? "anchor" : "tail";
  if (tokenIndex < anchorIndex) return "pre";
  return "anchor";
}

function defaultWeight(phone: string, role: PhoneRole, ghost: boolean): number {
  if (ghost) return 0.05;
  if (role === "breath") return 1;
  if (role === "anchor") return 1;
  if (phone === "w") return 0.22;
  if (phone === "cl") return 0.45;
  if (["g", "p", "t", "k"].includes(phone)) return 0.55;
  if (role === "tail") return 0.8;
  return 1;
}

function formatPhoneToken(item: TimedPhonePlan): string {
  if (item.vacuum) return "-";
  const phone = item.ghost ? `[${item.phone}]` : item.phone;
  const weight = trimWeight(item.weight);
  const velocity = item.velocity === undefined ? "" : `!${item.velocity}`;
  return `${phone}@${item.role}*${weight}${velocity}`;
}

function formatSimplePhoneToken(item: TimedPhonePlan): string {
  if (item.vacuum) return "-";
  const token = item.weight <= 0.05 || item.velocity === 0 ? `[${item.phone}]` : item.phone;
  const velocity = item.velocity === undefined || item.velocity === 0 ? "" : `!${item.velocity}`;
  return `${token}${velocity}`;
}

function stripToneMarker(phone: string): string {
  return phone.replace(/[/\\?~.]+$/u, "");
}

function trimWeight(weight: number): string {
  return Number.isInteger(weight)
    ? String(weight)
    : weight.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
