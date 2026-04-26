import type { PhoneClass } from "./types.ts";

export const SINSY_PHONE_SET = new Set([
  "a",
  "i",
  "u",
  "e",
  "o",
  "k",
  "g",
  "s",
  "z",
  "sh",
  "j",
  "t",
  "d",
  "ch",
  "ts",
  "n",
  "h",
  "f",
  "b",
  "p",
  "m",
  "y",
  "r",
  "w",
  "ky",
  "gy",
  "ny",
  "hy",
  "my",
  "ry",
  "by",
  "py",
  "v",
  "dy",
  "ty",
  "N",
  "cl",
  "br",
  "pau",
  "sil",
]);

export function classifyPhone(phone: string): PhoneClass {
  if (["a", "i", "u", "e", "o"].includes(phone)) return "v";
  if (["pau", "sil", "br"].includes(phone)) return "p";
  return "c";
}

export function validateSinsyPhones(phones: string[]): string[] {
  return phones.filter((phone) => !SINSY_PHONE_SET.has(phone));
}
