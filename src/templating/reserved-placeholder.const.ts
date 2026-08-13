/**
 * Placeholder key prefixes owned by a namespace that is NOT resolved by default.
 *
 * A token whose key starts with one of these is treated as absent unless the
 * caller explicitly opts the prefix in via
 * `applyPlaceholders(content, context, { resolveReservedPrefixes: [...] })`.
 * Deny is the default so an early render pass leaves the namespace untouched
 * for a later pass that owns it.
 *
 * Frozen at runtime, not just `readonly` at compile time: the deferral check
 * consults this policy, so a mutable export would let any consumer disable
 * deny-by-default globally with a single `pop()`.
 */
export const RESERVED_PLACEHOLDER_PREFIXES = Object.freeze([
  'subscription.',
] as const);
