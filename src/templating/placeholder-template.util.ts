/**
 * Generic, domain-agnostic mustache-style placeholder engine.
 *
 * Token grammar (key charset = `[a-zA-Z0-9_.-]+`):
 * - value token:     `{{key}}`
 * - section open:     `{{#key}}` (positive) or `{{^key}}` (inverted)
 * - section close:    `{{/key}}`
 *
 * Resolution is a SINGLE recursive left-to-right pass: literal text between
 * tokens is appended verbatim, values are substituted in place, and sections
 * recurse into their body only when kept. There is deliberately NO separate
 * global value-substitution pass — so any region we choose to preserve literally
 * (unknown/typo'd section keys, unbalanced opens) is never value-substituted.
 *
 * A section tag alone on its line (only whitespace around it) has that whole
 * line removed — Mustache's standalone rule — so a section on its own line
 * leaves no blank line behind. An inline section block alone on its line that
 * renders to nothing collapses its line too, so an absent optional block never
 * leaves a blank line whether its tags are inline or on their own lines. Value
 * tokens are never standalone; a blank value still renders as a blank line.
 *
 * Unknown keys are left literal so typos stay visible and unrelated tokens
 * (e.g. `{{block:UUID}}`, `{{link}}`) pass through untouched — the tokenizer
 * regex's key charset excludes `:` so `{{block:UUID}}` simply isn't a token.
 * The util imports zero domain types and never throws on malformed input.
 *
 * Keys under a `RESERVED_PLACEHOLDER_PREFIXES` namespace are DEFERRED — treated
 * as absent no matter what the context holds — unless the caller opts that
 * prefix in. This lets an earlier render pass hand the namespace through
 * untouched to a later pass that owns it.
 */

import { RESERVED_PLACEHOLDER_PREFIXES } from './reserved-placeholder.const';

export interface PlaceholderContext {
  values: Record<string, string>;
  sections: Record<string, boolean>;
  lists?: Record<string, PlaceholderContext[]>; // each item is its own sub-context
}

export interface ApplyPlaceholdersOptions {
  // Reserved prefixes this render pass owns and should resolve normally.
  resolveReservedPrefixes?: readonly string[];
}

// Single tokenizer for every placeholder kind: group 1 is the sigil
// (`#`/`^`/`/` or empty for a value token), group 2 is the key. The key charset
// excludes `#`, `^`, `/`, `:` so section sigils and `{{block:UUID}}` are not
// captured as value keys, and partial braces pass through as literal text.
const TOKEN_REGEX = /\{\{([#^/]?)([a-zA-Z0-9_.-]+)\}\}/g;

// A key is deferred when it sits under a reserved prefix the caller has not
// opted into. Deny is the default: omitting `options` defers every reserved key.
function isDeferredPlaceholderKey(
  key: string,
  options?: ApplyPlaceholdersOptions,
): boolean {
  const optedIn = options?.resolveReservedPrefixes;
  return RESERVED_PLACEHOLDER_PREFIXES.some(
    (prefix) =>
      key.startsWith(prefix) && (optedIn == null || !optedIn.includes(prefix)),
  );
}

/**
 * Renders `content` against `context` in one recursive left-to-right pass.
 *
 * A fresh `RegExp` is built from `TOKEN_REGEX.source` on every call so the
 * stateful `lastIndex` is never shared across (re-entrant) renders.
 */
function render(
  content: string,
  context: PlaceholderContext,
  options?: ApplyPlaceholdersOptions,
): string {
  const tokenizer = new RegExp(TOKEN_REGEX.source, 'g');
  let result = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenizer.exec(content)) !== null) {
    const sigil = match[1];
    const key = match[2];
    const tokenStart = match.index;
    const tokenEnd = tokenStart + match[0].length;
    const deferred = isDeferredPlaceholderKey(key, options);

    if (sigil === '') {
      // Value token: substitute known keys, leave unknown keys literal so typos
      // stay visible. A deferred key is literal regardless of the context.
      result += content.slice(cursor, tokenStart);
      result +=
        !deferred &&
        Object.prototype.hasOwnProperty.call(context.values, key)
          ? context.values[key]
          : match[0];
      cursor = tokenEnd;
      continue;
    }

    if (sigil === '/') {
      // Stray close with no matching open in this scope: append literally.
      result += content.slice(cursor, tokenStart);
      result += match[0];
      cursor = tokenEnd;
      continue;
    }

    // Section open (`#` or `^`). Locate the depth-matched close for this key.
    const close = findMatchingSectionClose(content, key, tokenizer.lastIndex);

    if (close === null) {
      // Unbalanced open: the remainder from this open to the end is malformed,
      // so append it VERBATIM and stop rendering this scope (no substitution).
      result += content.slice(cursor);
      return result;
    }

    // Precedence: list section > boolean section; unknown key stays literal.
    // A deferred key takes the unknown branch even when the context defines it,
    // so a reserved section present as `false` preserves its span rather than
    // deleting it.
    const lists = context.lists;
    const listItems =
      !deferred &&
      lists != null &&
      Object.prototype.hasOwnProperty.call(lists, key)
        ? lists[key]
        : undefined;
    const isList = listItems !== undefined;
    const isBool =
      !deferred && Object.prototype.hasOwnProperty.call(context.sections, key);

    if (!isList && !isBool) {
      // Unknown section key: append the ENTIRE span (open + body + close)
      // verbatim with no inner rendering, so a typo'd key stays visible.
      result += content.slice(cursor, close.closeEnd);
      cursor = close.closeEnd;
      tokenizer.lastIndex = close.closeEnd;
      continue;
    }

    // Known section: trim standalone open/close tag lines, then render the body
    // (per item for a list; once for a boolean/inverted) into `contribution`.
    const openSpan = resolveStandaloneTagSpan(content, tokenStart, tokenEnd);
    const closeSpan = resolveStandaloneTagSpan(
      content,
      close.closeStart,
      close.closeEnd,
    );
    const body = content.slice(openSpan.trimmedEnd, closeSpan.trimmedStart);

    let contribution = '';
    if (listItems !== undefined) {
      const items = listItems;
      if (sigil === '#') {
        for (const item of items) {
          contribution += render(
            body,
            mergePlaceholderContexts(context, item),
            options,
          );
        }
      } else if (items.length === 0) {
        // Inverted list renders its body only when the list is empty.
        contribution = render(body, context, options);
      }
    } else {
      // `#` renders its body iff the section is true; `^` iff false.
      const keepBody =
        sigil === '#' ? context.sections[key] : !context.sections[key];
      if (keepBody) {
        contribution = render(body, context, options);
      }
    }

    // An inline block alone on ONE line that renders to nothing takes the whole
    // line with it, so an absent optional block leaves no blank line. Requires
    // both tags on the same line; a block spanning lines keeps its newlines.
    const openInline =
      openSpan.trimmedStart === tokenStart && openSpan.trimmedEnd === tokenEnd;
    const closeInline =
      closeSpan.trimmedStart === close.closeStart &&
      closeSpan.trimmedEnd === close.closeEnd;
    const onOneLine = !content.slice(tokenStart, close.closeEnd).includes('\n');
    if (openInline && closeInline && onOneLine && contribution.trim() === '') {
      const lineStart = content.lastIndexOf('\n', tokenStart - 1) + 1;
      const nextNewline = content.indexOf('\n', close.closeEnd);
      const lineEnd = nextNewline === -1 ? content.length : nextNewline;
      const blockAloneOnLine =
        content.slice(lineStart, tokenStart).trim() === '' &&
        content.slice(close.closeEnd, lineEnd).trim() === '';
      if (blockAloneOnLine) {
        result += content.slice(cursor, lineStart);
        cursor = nextNewline === -1 ? lineEnd : nextNewline + 1;
        tokenizer.lastIndex = cursor;
        continue;
      }
    }

    result += content.slice(cursor, openSpan.trimmedStart);
    result += contribution;
    cursor = closeSpan.trimmedEnd;
    tokenizer.lastIndex = closeSpan.trimmedEnd;
  }

  // Append any trailing literal text after the last token.
  result += content.slice(cursor);
  return result;
}

interface MatchingClose {
  // Index in `content` where the matching `{{/key}}` token begins.
  closeStart: number;
  // Index in `content` just after the matching `{{/key}}` token.
  closeEnd: number;
}

// Walks forward from `searchStart` tracking nesting depth of same-key section
// tokens. Same-key opens (`#`/`^`) increment depth; same-key closes decrement.
// The close that returns depth to 0 is the match — so nested same-key sections
// bind the outer open to the LAST close, not the first. Returns null if no such
// close exists (unbalanced). Tokens of other keys do not affect the depth.
function findMatchingSectionClose(
  content: string,
  key: string,
  searchStart: number,
): MatchingClose | null {
  const tokenizer = new RegExp(TOKEN_REGEX.source, 'g');
  tokenizer.lastIndex = searchStart;

  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = tokenizer.exec(content)) !== null) {
    const sigil = match[1];
    const matchKey = match[2];
    if (matchKey !== key) {
      continue;
    }

    if (sigil === '#' || sigil === '^') {
      depth += 1;
      continue;
    }

    if (sigil === '/') {
      depth -= 1;
      if (depth === 0) {
        return {
          closeStart: match.index,
          closeEnd: match.index + match[0].length,
        };
      }
    }
  }

  return null;
}

// Returns the [trimmedStart, trimmedEnd) span to cut for a section tag. When the
// tag is standalone (only whitespace on its line), the span swallows the line's
// indentation and one trailing newline; when inline, it's just the tag itself.
function resolveStandaloneTagSpan(
  content: string,
  tagStart: number,
  tagEnd: number,
): { trimmedStart: number; trimmedEnd: number } {
  const priorNewline = content.lastIndexOf('\n', tagStart - 1);
  const lineStart = priorNewline === -1 ? 0 : priorNewline + 1;
  const nextNewline = content.indexOf('\n', tagEnd);
  const lineEnd = nextNewline === -1 ? content.length : nextNewline;

  const isStandalone =
    content.slice(lineStart, tagStart).trim() === '' &&
    content.slice(tagEnd, lineEnd).trim() === '';

  if (!isStandalone) {
    return { trimmedStart: tagStart, trimmedEnd: tagEnd };
  }

  return {
    trimmedStart: lineStart,
    trimmedEnd: nextNewline === -1 ? lineEnd : nextNewline + 1,
  };
}

/**
 * Applies placeholder resolution to `content` in a single recursive pass.
 * Idempotent for known tokens — resolved output no longer contains the consumed
 * tokens, and substituted values containing `{{...}}` are not re-resolved by a
 * second pass. Never throws on malformed input.
 *
 * Pass `options.resolveReservedPrefixes` to resolve reserved-namespace keys this
 * pass owns; omitting `options` defers every reserved key.
 */
export function applyPlaceholders(
  content: string,
  context: PlaceholderContext,
  options?: ApplyPlaceholdersOptions,
): string {
  if (content.length === 0) {
    return content;
  }
  return render(content, context, options);
}

// Merges contexts left-to-right (last wins); inputs never mutated. Pure data —
// the reserved-namespace guard is applied at lookup time, not here.
export function mergePlaceholderContexts(
  ...contexts: PlaceholderContext[]
): PlaceholderContext {
  const values: Record<string, string> = {};
  const sections: Record<string, boolean> = {};
  const mergedLists: Record<string, PlaceholderContext[]> = {};
  let hasLists = false;
  for (const context of contexts) {
    Object.assign(values, context.values);
    Object.assign(sections, context.sections);
    if (context.lists != null) {
      hasLists = true;
      Object.assign(mergedLists, context.lists);
    }
  }
  return hasLists
    ? { values, sections, lists: mergedLists }
    : { values, sections };
}
