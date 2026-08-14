import { doReadNumber, ReadingConfig } from "read-vietnamese-number";

const NUMBER_PATTERN = /[+-]?\d+(?:[.,]\d+)*/g;
const NUMBER_RANGE_PATTERN = /([+-]?\d+(?:[.,]\d+)*)\s*[-–]\s*(\d+(?:[.,]\d+)*)/g;
const SQUARE_KILOMETRE_PATTERN = /([+-]?\d+(?:[.,]\d+)*)\s*km(?:²|2)/giu;
const MILLIMETRE_PATTERN = /([+-]?\d+(?:[.,]\d+)*)\s*mm\b/giu;
const DEGREE_CELSIUS_PATTERN = /([+-]?\d+(?:[.,]\d+)*)\s*(?:°|\*)\s*c\b/giu;
const CURRENCY_PATTERN = /([+-]?\d+(?:[.,]\d+)*)\s*(?:đồng|đ|₫)(?=\s|[.,;:!?)]|$)/giu;
const CASUAL_K_PATTERN = /([+-]?\d+(?:[.,]\d+)*)\s*k\b/giu;
const VIRTUAL_RELEASE = " ; ";
const DIGIT_WORDS = [
  "không",
  "một",
  "hai",
  "ba",
  "bốn",
  "năm",
  "sáu",
  "bảy",
  "tám",
  "chín",
] as const;

const readingConfig = new ReadingConfig();
readingConfig.unit = [];

export function normalizeTalkNumbers(text: string): string {
  return text
    .replace(
      CURRENCY_PATTERN,
      (_, number: string) => ` ${readReleaseNumber(number)} đồng${VIRTUAL_RELEASE}`,
    )
    .replace(
      SQUARE_KILOMETRE_PATTERN,
      (_, number: string) => ` ${readReleaseNumber(number)} ki lô mét vuông${VIRTUAL_RELEASE}`,
    )
    .replace(
      MILLIMETRE_PATTERN,
      (_, number: string) => ` ${readReleaseNumber(number)} mi li mét${VIRTUAL_RELEASE}`,
    )
    .replace(
      DEGREE_CELSIUS_PATTERN,
      (_, number: string) => ` ${readReleaseNumber(number)} độ xê${VIRTUAL_RELEASE}`,
    )
    .replace(
      CASUAL_K_PATTERN,
      (_, number: string) => ` ${readReleaseNumber(number)} ka${VIRTUAL_RELEASE}`,
    )
    .replace(
      NUMBER_RANGE_PATTERN,
      (_, start: string, end: string) =>
        ` ${readReleaseNumber(start)} đến ${readReleaseNumber(end)}${VIRTUAL_RELEASE}`,
    )
    .replace(NUMBER_PATTERN, (token) => {
      const release = token.replace(/\D/g, "").length >= 3 ? VIRTUAL_RELEASE : " ";
      return ` ${readReleaseNumber(token)}${release}`;
    });
}

function readReleaseNumber(token: string): string {
  return readVietnameseNumber(token).replaceAll("nghìn", "ngàn");
}

export function readVietnameseNumber(token: string): string {
  try {
    return doReadNumber(canonicalNumber(token), readingConfig);
  } catch {
    return token
      .split("")
      .flatMap((character) => {
        if (/\d/.test(character)) return [DIGIT_WORDS[Number(character)]!];
        if (character === "." || character === ",") return ["chấm"];
        if (character === "-") return ["âm"];
        return [];
      })
      .join(" ");
  }
}

function canonicalNumber(token: string): string {
  const negative = token.startsWith("-");
  const unsigned = token.replace(/^[+-]/, "");
  const decimalIndex = findDecimalSeparator(unsigned);
  const integralSource = decimalIndex < 0 ? unsigned : unsigned.slice(0, decimalIndex);
  const fractionalSource = decimalIndex < 0 ? "" : unsigned.slice(decimalIndex + 1);
  const integral = integralSource.replace(/[.,]/g, "") || "0";
  const fractional = fractionalSource.replace(/[.,]/g, "");
  return `${negative ? "-" : ""}${integral}${fractional ? `.${fractional}` : ""}`;
}

function findDecimalSeparator(number: string): number {
  const dot = number.lastIndexOf(".");
  const comma = number.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) return Math.max(dot, comma);

  const separator = dot >= 0 ? "." : comma >= 0 ? "," : undefined;
  if (!separator) return -1;
  const groups = number.split(separator);
  const isThousands =
    groups.length > 1 &&
    groups[0]!.length <= 3 &&
    groups.slice(1).every((group) => group.length === 3) &&
    (separator === "." || groups.length > 2);
  return isThousands ? -1 : number.lastIndexOf(separator);
}
