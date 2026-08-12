/**
 * Placeholder key prefixes owned by a namespace that is NOT resolved by default.
 *
 * A token whose key starts with one of these is treated as absent unless the
 * caller explicitly opts the prefix in via
 * `applyPlaceholders(content, context, { resolveReservedPrefixes: [...] })`.
 * Deny is the default so an early render pass leaves the namespace untouched
 * for a later pass that owns it.
 */
export const RESERVED_PLACEHOLDER_PREFIXES = ['subscription.'] as const;
