/**
 * Placeholder key prefixes NOT resolved by default: a token under one of these
 * is treated as ABSENT unless the caller opts the prefix in via
 * `applyPlaceholders(content, context, { resolveReservedPrefixes: [...] })`.
 *
 * Opt-in is an EXACT string match including the trailing separator, so pass
 * elements of this constant rather than literals — `['subscription']` opts into
 * nothing and, since the engine never throws, fails silently.
 *
 * Frozen at runtime so a consumer cannot disable deny-by-default with a `pop()`.
 */
export const RESERVED_PLACEHOLDER_PREFIXES = Object.freeze([
  'subscription.',
] as const);
