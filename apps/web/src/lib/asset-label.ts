/**
 * Header labels in the compact daily table have very little width. Instead of
 * dropping the end of a name (which often carries the share class, e.g. `TR`
 * or `(H)`), split it so the head can shrink with an ellipsis while the tail
 * stays visible.
 */
export interface AssetLabelParts {
  head: string;
  tail: string;
  /** The split removed a space; render it after the head when it still fits. */
  separator: boolean;
  truncated: boolean;
}

/** Roughly the width of an 80px header at 11px with the compact table font. */
const MAX_LABEL_UNITS = 12;
const TAIL_TARGET_UNITS = 9;
const TAIL_MIN_UNITS = 6;
/** Extra room allowed when snapping the tail to a word boundary. */
const WORD_BOUNDARY_SLACK_UNITS = 2;
/** A trailing `(H)`/`[TR]` group is kept whole up to this width. */
const MAX_BRACKET_UNITS = 12;

export function splitAssetLabel(name: string): AssetLabelParts {
  const trimmed = name.trim();
  if (!trimmed) return { head: "", tail: "", separator: false, truncated: false };

  const chars = [...trimmed];
  const totalUnits = chars.reduce((sum, char) => sum + charWidth(char), 0);
  if (totalUnits <= MAX_LABEL_UNITS) {
    return { head: trimmed, tail: "", separator: false, truncated: false };
  }

  const target = Math.min(
    TAIL_TARGET_UNITS,
    Math.max(TAIL_MIN_UNITS, Math.round(totalUnits * 0.4)),
  );

  let start = chars.length;
  let tailUnits = 0;
  while (start > 0 && tailUnits < target) {
    const char = chars[start - 1];
    if (char === undefined) break;
    const width = charWidth(char);
    if (tailUnits + width > target && start < chars.length) break;
    start -= 1;
    tailUnits += width;
  }

  const bracket = trailingBracketGroup(chars);
  if (bracket && bracket.openIndex < start && bracket.width <= MAX_BRACKET_UNITS) {
    start = bracket.openIndex;
    tailUnits = bracket.width;
  }

  // Prefer a natural start (word or script boundary) for the tail when the
  // extra glyphs fit, instead of cutting in the middle of a token.
  let extendedStart = start;
  let extendedUnits = tailUnits;
  while (!isGoodTailStart(chars, extendedStart) && extendedStart > 0) {
    const char = chars[extendedStart - 1];
    if (char === undefined) break;
    const width = charWidth(char);
    if (extendedUnits + width > target + WORD_BOUNDARY_SLACK_UNITS) break;
    extendedStart -= 1;
    extendedUnits += width;
  }
  if (isGoodTailStart(chars, extendedStart)) start = extendedStart;

  // Never start the visible tail with a space; it would look like a gap after
  // the ellipsis.
  while (start < chars.length) {
    const char = chars[start];
    if (char === undefined || !isWhitespace(char)) break;
    start += 1;
  }

  if (start === 0) return { head: trimmed, tail: "", separator: false, truncated: false };

  const separatorChar = start > 0 ? chars[start - 1] : undefined;
  const separator = separatorChar !== undefined && isWhitespace(separatorChar);

  return {
    head: chars.slice(0, start).join("").trimEnd(),
    tail: chars.slice(start).join(""),
    separator,
    truncated: true,
  };
}

/**
 * Width in half-width units: Hangul and full-width glyphs count as two, Latin
 * letters/digits/punctuation as one. This is a heuristic for the compact
 * header, not a font measurement.
 */
function charWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x1100 && code <= 0x115f) return 2; // Hangul Jamo
  if (code >= 0x2e80 && code <= 0xa4cf) return 2; // CJK radicals ... Yi
  if (code >= 0xac00 && code <= 0xd7a3) return 2; // Hangul syllables
  if (code >= 0xf900 && code <= 0xfaff) return 2; // CJK compatibility
  if (code >= 0xfe30 && code <= 0xfe6f) return 2; // CJK compatibility forms
  if (code >= 0xff00 && code <= 0xff60) return 2; // Full-width forms
  if (code >= 0xffe0 && code <= 0xffe6) return 2; // Full-width signs
  if (code >= 0x1f300 && code <= 0x1faff) return 2; // Emoji
  return 1;
}

function isWhitespace(char: string): boolean {
  return /\s/u.test(char);
}

/**
 * A tail should not begin in the middle of a token. Whitespace and transitions
 * between Hangul/Latin/digits are natural starts; punctuation boundaries are
 * skipped so "P500" grows back to "S&P500".
 */
function isGoodTailStart(chars: readonly string[], index: number): boolean {
  if (index <= 0 || index >= chars.length) return true;
  const previous = chars[index - 1];
  const current = chars[index];
  if (previous === undefined || current === undefined) return true;
  if (isWhitespace(previous)) return true;
  const previousKind = charKind(previous);
  const currentKind = charKind(current);
  return (
    previousKind !== "other" &&
    currentKind !== "other" &&
    previousKind !== currentKind
  );
}

function charKind(char: string): "hangul" | "latin" | "digit" | "other" {
  const code = char.codePointAt(0) ?? 0;
  if ((code >= 0x1100 && code <= 0x11ff) || (code >= 0xac00 && code <= 0xd7a3)) {
    return "hangul";
  }
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
    return "latin";
  }
  if (code >= 0x30 && code <= 0x39) return "digit";
  return "other";
}

/** Locate a trailing bracketed suffix such as `(H)` or `[TR]`. */
function trailingBracketGroup(
  chars: readonly string[],
): { openIndex: number; width: number } | null {
  const last = chars[chars.length - 1];
  const close = last === ")" ? ")" : last === "]" ? "]" : null;
  if (!close) return null;
  const open = close === ")" ? "(" : "[";

  let depth = 0;
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    if (chars[index] === close) {
      depth += 1;
    } else if (chars[index] === open) {
      depth -= 1;
      if (depth === 0) {
        const width = chars
          .slice(index)
          .reduce((sum, char) => sum + charWidth(char), 0);
        return { openIndex: index, width };
      }
    }
  }
  return null;
}
