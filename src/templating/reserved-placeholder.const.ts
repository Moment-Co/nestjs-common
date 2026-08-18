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

/**
 * The delivery contract for the deferred `subscription.` namespace: the authoring
 * service validates content against these lists, the delivering service resolves
 * them. A key absent from these lists survives rendering as literal `{{…}}`
 * markup and reaches subscribers that way, so both sides must agree — which is
 * why the lists live here and not in either service.
 *
 * The two lists are INDEPENDENT: `subscription.brand.name` is a value with no
 * `subscription.brand` section, so values cannot be derived from section keys.
 *
 * Frozen at runtime, like the prefixes above — a consumer must not be able to
 * widen or narrow the contract for every other consumer in-process.
 */
export const SUPPORTED_RESERVED_SECTION_KEYS = Object.freeze([
  'subscription.playlist',
] as const);

export const SUPPORTED_RESERVED_VALUE_KEYS = Object.freeze([
  'subscription.playlist.name',
  'subscription.playlist.liveLink',
  'subscription.brand.name',
] as const);
