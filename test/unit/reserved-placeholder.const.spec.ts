import {
  RESERVED_PLACEHOLDER_PREFIXES,
  SUPPORTED_RESERVED_SECTION_KEYS,
  SUPPORTED_RESERVED_VALUE_KEYS,
} from '../../src/templating/reserved-placeholder.const';

// Mutation is a TypeError under strict mode and a silent no-op otherwise; the
// assertion that matters either way is that the list did not change.
function expectFrozenList(list: readonly string[]): void {
  const before = [...list];
  const mutable = list as string[];

  expect(Object.isFrozen(list)).toBe(true);

  try {
    mutable.push('subscription.injected');
  } catch {
    // strict-mode TypeError
  }
  try {
    mutable.pop();
  } catch {
    // strict-mode TypeError
  }
  try {
    mutable[0] = 'subscription.overwritten';
  } catch {
    // strict-mode TypeError
  }

  expect([...list]).toEqual(before);
}

describe('subscription delivery contract', () => {
  describe('SUPPORTED_RESERVED_SECTION_KEYS', () => {
    it('contains exactly the supported section keys', () => {
      expect([...SUPPORTED_RESERVED_SECTION_KEYS]).toEqual([
        'subscription.playlist',
      ]);
    });

    it('is frozen at runtime', () => {
      expectFrozenList(SUPPORTED_RESERVED_SECTION_KEYS);
    });
  });

  describe('SUPPORTED_RESERVED_VALUE_KEYS', () => {
    it('contains exactly the supported value keys', () => {
      expect([...SUPPORTED_RESERVED_VALUE_KEYS]).toEqual([
        'subscription.playlist.name',
        'subscription.playlist.liveLink',
        'subscription.brand.name',
      ]);
    });

    it('is frozen at runtime', () => {
      expectFrozenList(SUPPORTED_RESERVED_VALUE_KEYS);
    });
  });

  describe('consistency with RESERVED_PLACEHOLDER_PREFIXES', () => {
    // Guard: a key added outside the deferred namespace would be resolved by
    // default, so the authoring service would never defer it.
    it.each([...SUPPORTED_RESERVED_SECTION_KEYS])(
      'section key %s sits under a reserved prefix',
      (key) => {
        expect(
          RESERVED_PLACEHOLDER_PREFIXES.some((prefix) =>
            key.startsWith(prefix),
          ),
        ).toBe(true);
      },
    );

    it.each([...SUPPORTED_RESERVED_VALUE_KEYS])(
      'value key %s sits under a reserved prefix',
      (key) => {
        expect(
          RESERVED_PLACEHOLDER_PREFIXES.some((prefix) =>
            key.startsWith(prefix),
          ),
        ).toBe(true);
      },
    );

    // `subscription.brand.name` is a value with no matching section, so the
    // lists are deliberately not derivable from one another.
    it('does not require a section for every value key', () => {
      const orphanValues = SUPPORTED_RESERVED_VALUE_KEYS.filter(
        (value) =>
          !SUPPORTED_RESERVED_SECTION_KEYS.some((section) =>
            value.startsWith(`${section}.`),
          ),
      );

      expect(orphanValues).toEqual(['subscription.brand.name']);
    });
  });
});
