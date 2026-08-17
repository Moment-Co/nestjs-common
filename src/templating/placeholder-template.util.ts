/**
 * Generic, domain-agnostic mustache-style placeholder engine.
 *
 * Token grammar (key charset = `[a-zA-Z0-9_.-]+`):
 * - value token:    `{{key}}`
 * - section open:   `{{#key}}` (positive) or `{{^key}}` (inverted)
 * - section close:  `{{/key}}`
 *
 * Resolution is a SINGLE recursive left-to-right pass; there is deliberately no
 * separate global value-substitution pass, so any region preserved literally
 * (unknown key, unbalanced open) is never value-substituted. A section tag alone
 * on its line takes that line with it (Mustache's standalone rule), as does an
 * inline block alone on its line that renders to nothing.
 *
 * Tokens match as substrings with no brace-boundary check, so extra braces are
 * consumed: `{{{x}}}` renders `{VALUE}`. Nesting is unbounded and close-matching
 * is quadratic in depth; deep input throws `RangeError`, the only throw here, so
 * callers must bound untrusted input.
 *
 * Keys under `RESERVED_PLACEHOLDER_PREFIXES` are DEFERRED: treated as ABSENT no
 * matter what the context holds (so a reserved section present as `false` cannot
 * delete its span), unless the caller opts that prefix in — handing the
 * namespace untouched to a later pass that owns it. Two boundaries: a deferred
 * section QUARANTINES its whole body, so non-reserved tokens nested inside go
 * unresolved to the later pass; and deferral protects only the reserved key's
 * own span, so reserved text inside a first-pass construct that discards its
 * body is still deleted.
 *
 * All of the above is pinned by the `LIMITATION:`-named tests in
 * `test/unit/placeholder-template.util.spec.ts`.
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

// Group 1 is the sigil (`#`/`^`/`/`, empty for a value token), group 2 the key.
// The key charset excludes `#`, `^`, `/`, `:`, so `{{block:UUID}}` is not a
// token. Tightening the brace handling would change live output, so it stays.
const TOKEN_REGEX = /\{\{([#^/]?)([a-zA-Z0-9_.-]+)\}\}/g;

// Module-private frozen snapshot: the check below reads THIS, never the exported
// binding, so a consumer cannot mutate deny-by-default away.
const DEFERRED_PREFIXES: readonly string[] = Object.freeze([
  ...RESERVED_PLACEHOLDER_PREFIXES,
]);

// Deny by default: omitting `options` defers every reserved key.
function isDeferredPlaceholderKey(
  key: string,
  options?: ApplyPlaceholdersOptions,
): boolean {
  const optedIn = options?.resolveReservedPrefixes;
  return DEFERRED_PREFIXES.some(
    (prefix) =>
      key.startsWith(prefix) && (optedIn == null || !optedIn.includes(prefix)),
  );
}

// A fresh `RegExp` is built per call so the stateful `lastIndex` is never shared
// across re-entrant renders.
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
      // Unknown or deferred keys stay literal regardless of the context.
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
      result += content.slice(cursor, tokenStart);
      result += match[0];
      cursor = tokenEnd;
      continue;
    }

    // Section open (`#` or `^`).
    const close = findMatchingSectionClose(content, key, tokenizer.lastIndex);

    if (close === null) {
      // Unbalanced open: append the malformed remainder VERBATIM, no rendering.
      result += content.slice(cursor);
      return result;
    }

    // Precedence: list > boolean. A deferred key takes the unknown branch even
    // when the context defines it.
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
      // Unknown or deferred section key: append the ENTIRE span (open + body +
      // close) verbatim with NO inner rendering. The deferral mechanism rests
      // on this — nested non-reserved tokens are preserved too, not resolved.
      result += content.slice(cursor, close.closeEnd);
      cursor = close.closeEnd;
      tokenizer.lastIndex = close.closeEnd;
      continue;
    }

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
        contribution = render(body, context, options);
      }
    } else {
      const keepBody =
        sigil === '#' ? context.sections[key] : !context.sections[key];
      if (keepBody) {
        contribution = render(body, context, options);
      }
    }

    // An inline block alone on ONE line that renders to nothing takes the whole
    // line with it; a block spanning lines keeps its newlines.
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

  result += content.slice(cursor);
  return result;
}

interface MatchingClose {
  closeStart: number;
  closeEnd: number;
}

// Tracks nesting depth of same-key tokens from `searchStart`; the close that
// returns depth to 0 is the match, so nested same-key sections bind the outer
// open to the LAST close. Returns null when unbalanced.
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

// Span to cut for a section tag: a standalone tag (only whitespace on its line)
// swallows the line's indentation and one trailing newline; inline, just itself.
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
 * Applies placeholder resolution to `content` in a single recursive pass. A
 * substituted value is never re-scanned within that pass, but this is a plain
 * string transform with no provenance tracking, so a caller chaining passes must
 * treat pass-1 output as untrusted template text and reject or escape `{{` in
 * author-supplied values at the pass-1 INPUT boundary.
 *
 * Pass `options.resolveReservedPrefixes` to resolve reserved keys this pass
 * owns; omitting `options` defers every reserved key. Opt-in entries are matched
 * by EXACT EQUALITY including the trailing separator — `['subscription']` opts
 * into nothing and, since this never throws, fails silently; pass elements of
 * the exported `RESERVED_PLACEHOLDER_PREFIXES` rather than string literals.
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

// Merges contexts left-to-right (last wins); inputs never mutated. The
// reserved-namespace guard is applied at lookup time, not here.
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
