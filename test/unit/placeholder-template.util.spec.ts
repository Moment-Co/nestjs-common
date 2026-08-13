import {
  applyPlaceholders,
  mergePlaceholderContexts,
  PlaceholderContext,
} from '../../src/templating/placeholder-template.util';
import { RESERVED_PLACEHOLDER_PREFIXES } from '../../src/templating/reserved-placeholder.const';

// Helper to build a context with sensible empty defaults.
function buildContext(
  partial: Partial<PlaceholderContext> = {},
): PlaceholderContext {
  return {
    values: partial.values ?? {},
    sections: partial.sections ?? {},
  };
}

describe('applyPlaceholders', () => {
  describe('value tokens', () => {
    it('replaces a single value token', () => {
      expect(
        applyPlaceholders(
          'Hello {{name}}',
          buildContext({ values: { name: 'World' } }),
        ),
      ).toBe('Hello World');
    });

    it('replaces sequential value tokens', () => {
      expect(
        applyPlaceholders(
          '{{a}} and {{b}}',
          buildContext({ values: { a: 'one', b: 'two' } }),
        ),
      ).toBe('one and two');
    });

    it('replaces a value token with an empty string', () => {
      expect(
        applyPlaceholders('[{{x}}]', buildContext({ values: { x: '' } })),
      ).toBe('[]');
    });

    it('leaves an unknown value token literal', () => {
      expect(applyPlaceholders('{{score.bogus}}', buildContext())).toBe(
        '{{score.bogus}}',
      );
    });

    it('preserves an en-dash inside a substituted value', () => {
      expect(
        applyPlaceholders(
          '{{score}}',
          buildContext({ values: { score: '3–1' } }),
        ),
      ).toBe('3–1');
    });
  });

  describe('positive sections', () => {
    it('renders body when the section is true', () => {
      expect(
        applyPlaceholders(
          '{{#k}}body{{/k}}',
          buildContext({ sections: { k: true } }),
        ),
      ).toBe('body');
    });

    it('blanks body when the section is false', () => {
      expect(
        applyPlaceholders(
          '{{#k}}body{{/k}}',
          buildContext({ sections: { k: false } }),
        ),
      ).toBe('');
    });
  });

  describe('inverted sections', () => {
    it('renders body when the section is false', () => {
      expect(
        applyPlaceholders(
          '{{^k}}body{{/k}}',
          buildContext({ sections: { k: false } }),
        ),
      ).toBe('body');
    });

    it('blanks body when the section is true', () => {
      expect(
        applyPlaceholders(
          '{{^k}}body{{/k}}',
          buildContext({ sections: { k: true } }),
        ),
      ).toBe('');
    });
  });

  describe('unknown and malformed sections', () => {
    it('leaves an unknown section key entirely literal', () => {
      expect(applyPlaceholders('{{#k}}body{{/k}}', buildContext())).toBe(
        '{{#k}}body{{/k}}',
      );
    });

    it('leaves an unbalanced open with no close literal, without throwing', () => {
      expect(() =>
        applyPlaceholders(
          'before {{#k}}body',
          buildContext({ sections: { k: true } }),
        ),
      ).not.toThrow();
      expect(
        applyPlaceholders(
          'before {{#k}}body',
          buildContext({ sections: { k: true } }),
        ),
      ).toBe('before {{#k}}body');
    });

    it('leaves a mismatched close literal', () => {
      expect(
        applyPlaceholders(
          '{{#k}}body{{/other}}',
          buildContext({ sections: { k: true } }),
        ),
      ).toBe('{{#k}}body{{/other}}');
    });

    it('does not substitute value tokens inside an unknown (typo) section', () => {
      // Regression: a balanced but unknown section key must stay entirely
      // literal — the inner `{{score}}` value MUST NOT be substituted.
      const input = '{{#scroe}}Final {{score}}{{/scroe}}';
      expect(
        applyPlaceholders(input, buildContext({ values: { score: '3–1' } })),
      ).toBe(input);
    });

    it('does not substitute value tokens after an unbalanced open', () => {
      // Regression: an unbalanced open makes the whole tail malformed/literal,
      // so the inner `{{score}}` value MUST NOT be substituted.
      const input = '{{#score}}Final {{score}}';
      expect(
        applyPlaceholders(
          input,
          buildContext({ values: { score: '3–1' }, sections: { score: true } }),
        ),
      ).toBe(input);
    });
  });

  describe('sibling and nested same-key sections', () => {
    it('resolves sibling same-key sections independently', () => {
      expect(
        applyPlaceholders(
          '{{#k}}A{{/k}}-{{^k}}B{{/k}}',
          buildContext({ sections: { k: true } }),
        ),
      ).toBe('A-');
    });

    it('resolves nested same-key sections via depth-counted matcher', () => {
      // Regression guard: an outer #score must bind to the LAST matching close,
      // not the first, so trailing "B" is not dropped.
      expect(
        applyPlaceholders('{{#score}}A{{^score}}n{{/score}}B{{/score}}', {
          values: {},
          sections: { score: true },
        }),
      ).toBe('AB');
    });
  });

  describe('dotted section keys', () => {
    const template =
      '{{#score.live}}LIVE{{/score.live}}{{#score.final}}FINAL{{/score.final}}';

    it('renders only the live branch when score.live is true', () => {
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { 'score.live': true, 'score.final': false },
          }),
        ),
      ).toBe('LIVE');
    });

    it('renders only the final branch when score.final is true', () => {
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { 'score.live': false, 'score.final': true },
          }),
        ),
      ).toBe('FINAL');
    });

    it('renders neither branch when both are false', () => {
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { 'score.live': false, 'score.final': false },
          }),
        ),
      ).toBe('');
    });
  });

  describe('values inside sections', () => {
    it('does not leak a value token inside a hidden section', () => {
      expect(
        applyPlaceholders(
          '{{#k}}{{secret}}{{/k}}',
          buildContext({ sections: { k: false }, values: { secret: 'leak' } }),
        ),
      ).toBe('');
    });

    it('resolves a value token inside a visible section', () => {
      expect(
        applyPlaceholders(
          '{{#k}}{{shown}}{{/k}}',
          buildContext({ sections: { k: true }, values: { shown: 'ok' } }),
        ),
      ).toBe('ok');
    });
  });

  describe('pass-through tokens', () => {
    it('leaves a {{block:UUID}} token untouched', () => {
      const input = '{{block:11111111-1111-4111-8111-111111111111}}';
      expect(applyPlaceholders(input, buildContext())).toBe(input);
    });

    it('leaves a {{link}} token untouched when not in values', () => {
      expect(applyPlaceholders('go {{link}}', buildContext())).toBe(
        'go {{link}}',
      );
    });
  });

  describe('edge cases', () => {
    it('returns empty content unchanged', () => {
      expect(applyPlaceholders('', buildContext())).toBe('');
    });

    it('returns content with no tokens unchanged', () => {
      expect(applyPlaceholders('plain text', buildContext())).toBe(
        'plain text',
      );
    });

    it('is idempotent on already-resolved output', () => {
      const context = buildContext({
        values: { name: 'World' },
        sections: { k: true },
      });
      const once = applyPlaceholders('{{#k}}Hello {{name}}{{/k}}', context);
      expect(once).toBe('Hello World');
      expect(applyPlaceholders(once, context)).toBe('Hello World');
    });
  });

  describe('list iteration', () => {
    it('repeats the body once per item for a multi-item list', () => {
      expect(
        applyPlaceholders(
          '{{#broadcasters}}- {{name}}: {{url}}\n{{/broadcasters}}',
          {
            values: {},
            sections: {},
            lists: {
              broadcasters: [
                { values: { name: 'ESPN', url: 'e' }, sections: {} },
                { values: { name: 'ABC', url: 'a' }, sections: {} },
                { values: { name: 'TNT', url: 't' }, sections: {} },
              ],
            },
          },
        ),
      ).toBe('- ESPN: e\n- ABC: a\n- TNT: t\n');
    });

    it('renders nothing for a positive section over an empty list', () => {
      expect(
        applyPlaceholders('{{#broadcasters}}x{{/broadcasters}}', {
          values: {},
          sections: {},
          lists: { broadcasters: [] },
        }),
      ).toBe('');
    });

    it('renders the inverted body when the list is empty', () => {
      expect(
        applyPlaceholders('{{^broadcasters}}none{{/broadcasters}}', {
          values: {},
          sections: {},
          lists: { broadcasters: [] },
        }),
      ).toBe('none');
    });

    it('renders nothing for an inverted section over a non-empty list', () => {
      expect(
        applyPlaceholders('{{^broadcasters}}none{{/broadcasters}}', {
          values: {},
          sections: {},
          lists: {
            broadcasters: [{ values: { name: 'ESPN' }, sections: {} }],
          },
        }),
      ).toBe('');
    });

    it('lets an item value shadow a same-named parent value', () => {
      expect(
        applyPlaceholders('{{#row}}{{name}}{{/row}}', {
          values: { name: 'PARENT' },
          sections: {},
          lists: { row: [{ values: { name: 'CHILD' }, sections: {} }] },
        }),
      ).toBe('CHILD');
    });

    it('keeps parent values resolvable inside the loop body', () => {
      expect(
        applyPlaceholders('{{#row}}{{title}}:{{label}}{{/row}}', {
          values: { title: 'T' },
          sections: {},
          lists: { row: [{ values: { label: 'L' }, sections: {} }] },
        }),
      ).toBe('T:L');
    });

    it('resolves a boolean section carried by each list item', () => {
      expect(
        applyPlaceholders(
          '{{#row}}{{#flag}}Y{{/flag}}{{^flag}}N{{/flag}}{{/row}}',
          {
            values: {},
            sections: {},
            lists: {
              row: [
                { values: {}, sections: { flag: true } },
                { values: {}, sections: { flag: false } },
              ],
            },
          },
        ),
      ).toBe('YN');
    });

    it('leaves an unknown bare token inside the loop body literal', () => {
      expect(
        applyPlaceholders('{{#row}}{{bogus}}{{/row}}', {
          values: {},
          sections: {},
          lists: { row: [{ values: { other: 'x' }, sections: {} }] },
        }),
      ).toBe('{{bogus}}');
    });

    it('leaves bare list-item tokens literal when used outside any list', () => {
      expect(applyPlaceholders('{{name}}', { values: {}, sections: {} })).toBe(
        '{{name}}',
      );
    });

    it('never throws on an unbalanced list open and returns it verbatim', () => {
      const input = '{{#broadcasters}}no close';
      const context: PlaceholderContext = {
        values: {},
        sections: {},
        lists: {
          broadcasters: [{ values: { name: 'ESPN' }, sections: {} }],
        },
      };
      expect(() => applyPlaceholders(input, context)).not.toThrow();
      expect(applyPlaceholders(input, context)).toBe(input);
    });
  });

  describe('standalone section tag whitespace trimming', () => {
    it('removes the tag lines for a positive section on its own lines', () => {
      expect(
        applyPlaceholders(
          'A\n{{#s}}\nB\n{{/s}}\nC',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('A\nB\nC');
    });

    it('removes the tag lines and the body when the section is false', () => {
      expect(
        applyPlaceholders(
          'A\n{{#s}}\nB\n{{/s}}\nC',
          buildContext({ sections: { s: false } }),
        ),
      ).toBe('A\nC');
    });

    it('removes the tag lines for an inverted section rendered when false', () => {
      expect(
        applyPlaceholders(
          'A\n{{^s}}\nB\n{{/s}}\nC',
          buildContext({ sections: { s: false } }),
        ),
      ).toBe('A\nB\nC');
    });

    it('removes the tag lines and the body for an inverted section when true', () => {
      expect(
        applyPlaceholders(
          'A\n{{^s}}\nB\n{{/s}}\nC',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('A\nC');
    });

    it('leaves an inline positive section byte-for-byte when kept', () => {
      expect(
        applyPlaceholders(
          'A {{#s}}B{{/s}} C',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('A B C');
    });

    it('leaves surrounding spaces of an inline section when dropped', () => {
      expect(
        applyPlaceholders(
          'A {{#s}}B{{/s}} C',
          buildContext({ sections: { s: false } }),
        ),
      ).toBe('A  C');
    });

    it('never treats a value token as standalone even alone on a line', () => {
      expect(
        applyPlaceholders('A\n{{v}}\nB', buildContext({ values: { v: '' } })),
      ).toBe('A\n\nB');
    });

    it('trims a standalone section at the start of content', () => {
      expect(
        applyPlaceholders(
          '{{#s}}\nB\n{{/s}}\n',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('B\n');
      expect(
        applyPlaceholders(
          '{{#s}}\nB\n{{/s}}\n',
          buildContext({ sections: { s: false } }),
        ),
      ).toBe('');
    });

    it('trims a standalone section at the end of content with no trailing newline', () => {
      expect(
        applyPlaceholders(
          'A\n{{#s}}\nB\n{{/s}}',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('A\nB\n');
      expect(
        applyPlaceholders(
          'A\n{{#s}}\nB\n{{/s}}',
          buildContext({ sections: { s: false } }),
        ),
      ).toBe('A\n');
    });

    it('strips leading indentation before a standalone tag', () => {
      expect(
        applyPlaceholders(
          'A\n   {{#s}}\nB\n   {{/s}}\nC',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('A\nB\nC');
    });

    it('handles CRLF line endings around standalone tags', () => {
      expect(
        applyPlaceholders(
          'A\r\n{{#s}}\r\nB\r\n{{/s}}\r\nC',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('A\r\nB\r\nC');
    });

    it('collapses nested standalone sections with no blank lines left behind', () => {
      expect(
        applyPlaceholders('{{#a}}\n{{#b}}\nX\n{{/b}}\n{{/a}}', {
          values: {},
          sections: { a: true, b: true },
        }),
      ).toBe('X\n');
    });

    it('does not leave blank lines around a standalone list section', () => {
      expect(
        applyPlaceholders('{{#items}}\n{{x}}\n{{/items}}\n', {
          values: {},
          sections: {},
          lists: {
            items: [
              { values: { x: '1' }, sections: {} },
              { values: { x: '2' }, sections: {} },
            ],
          },
        }),
      ).toBe('1\n2\n');
    });

    it('leaves an unknown-key section span literal even when standalone', () => {
      // Regression: standalone trimming only applies to sections the engine
      // actually consumes — an unknown key must stay byte-for-byte, whitespace
      // included, even when its tags sit alone on their own lines.
      const input = 'A\n{{#unknown}}\nB\n{{/unknown}}\nC';
      expect(applyPlaceholders(input, buildContext())).toBe(input);
    });

    it('renders the real ticket-section template without stray blank lines', () => {
      const template =
        'Intro.\n{{#ticket}}\nSeats are still available: {{ticket.url}}\n{{/ticket}}\nOutro.';
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { ticket: true },
            values: { 'ticket.url': 'https://x' },
          }),
        ),
      ).toBe('Intro.\nSeats are still available: https://x\nOutro.');
      expect(
        applyPlaceholders(
          template,
          buildContext({ sections: { ticket: false } }),
        ),
      ).toBe('Intro.\nOutro.');
    });
  });

  describe('inline section block on its own line', () => {
    it('collapses the line when an inline block renders empty (false)', () => {
      expect(
        applyPlaceholders(
          'A\n{{#s}}B{{/s}}\nC',
          buildContext({ sections: { s: false } }),
        ),
      ).toBe('A\nC');
    });

    it('keeps the line and content when an inline block renders (true)', () => {
      expect(
        applyPlaceholders(
          'A\n{{#s}}B{{/s}}\nC',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('A\nB\nC');
    });

    it('collapses an empty-wrapper block whether kept or dropped', () => {
      expect(
        applyPlaceholders(
          'A\n{{#s}}{{/s}}\nB',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('A\nB');
      expect(
        applyPlaceholders(
          'A\n{{#s}}{{/s}}\nB',
          buildContext({ sections: { s: false } }),
        ),
      ).toBe('A\nB');
    });

    it('collapses an inverted inline block that renders empty', () => {
      expect(
        applyPlaceholders(
          'A\n{{^s}}B{{/s}}\nC',
          buildContext({ sections: { s: true } }),
        ),
      ).toBe('A\nC');
    });

    it('collapses an empty inline list block', () => {
      expect(
        applyPlaceholders('A\n{{#items}}x{{/items}}\nB', {
          values: {},
          sections: {},
          lists: { items: [] },
        }),
      ).toBe('A\nB');
    });

    it('does NOT collapse an inline block sharing its line with other text', () => {
      expect(
        applyPlaceholders(
          'A {{#s}}B{{/s}} C',
          buildContext({ sections: { s: false } }),
        ),
      ).toBe('A  C');
    });

    it('drops only its own line, keeping author blank lines around it', () => {
      expect(
        applyPlaceholders(
          'A\n\n{{#s}}B{{/s}}\n\nC',
          buildContext({ sections: { s: false } }),
        ),
      ).toBe('A\n\n\nC');
    });

    it('leaves the blank line for an inline block spanning two lines', () => {
      const template =
        'Intro.\n{{#ticket}}Seats: {{ticket.url}}\nGrab them now.{{/ticket}}\nOutro.';
      expect(
        applyPlaceholders(
          template,
          buildContext({ sections: { ticket: false } }),
        ),
      ).toBe('Intro.\n\nOutro.');
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { ticket: true },
            values: { 'ticket.url': 'u' },
          }),
        ),
      ).toBe('Intro.\nSeats: u\nGrab them now.\nOutro.');
    });

    it('renders the real inline ticket block without a stray blank line', () => {
      const template =
        'Text.\n{{#ticket}}Seats: {{ticket.url}}{{/ticket}}\nMore.';
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { ticket: true },
            values: { 'ticket.url': 'https://x' },
          }),
        ),
      ).toBe('Text.\nSeats: https://x\nMore.');
      expect(
        applyPlaceholders(
          template,
          buildContext({ sections: { ticket: false } }),
        ),
      ).toBe('Text.\nMore.');
    });
  });
});

describe('mergePlaceholderContexts', () => {
  it('combines values and sections from disjoint contexts', () => {
    const first = buildContext({
      values: { a: 'one' },
      sections: { x: true },
    });
    const second = buildContext({
      values: { b: 'two' },
      sections: { y: false },
    });
    expect(mergePlaceholderContexts(first, second)).toEqual({
      values: { a: 'one', b: 'two' },
      sections: { x: true, y: false },
    });
  });

  it('returns empty values and sections when given no contexts', () => {
    expect(mergePlaceholderContexts()).toEqual({ values: {}, sections: {} });
  });

  it('lets the last context win on key collisions for values and sections', () => {
    const first = buildContext({
      values: { shared: 'first' },
      sections: { flag: true },
    });
    const second = buildContext({
      values: { shared: 'second' },
      sections: { flag: false },
    });
    expect(mergePlaceholderContexts(first, second)).toEqual({
      values: { shared: 'second' },
      sections: { flag: false },
    });
  });

  it('merges lists last-wins on collision and union on disjoint keys', () => {
    const first: PlaceholderContext = {
      values: {},
      sections: {},
      lists: {
        shared: [{ values: { v: 'first' }, sections: {} }],
        onlyFirst: [{ values: { v: 'a' }, sections: {} }],
      },
    };
    const second: PlaceholderContext = {
      values: {},
      sections: {},
      lists: {
        shared: [{ values: { v: 'second' }, sections: {} }],
        onlySecond: [{ values: { v: 'b' }, sections: {} }],
      },
    };
    const merged = mergePlaceholderContexts(first, second);
    expect(merged.lists).toEqual({
      shared: [{ values: { v: 'second' }, sections: {} }],
      onlyFirst: [{ values: { v: 'a' }, sections: {} }],
      onlySecond: [{ values: { v: 'b' }, sections: {} }],
    });
  });

  it('omits the lists key when no input context defines lists', () => {
    const first = buildContext({ values: { a: 'one' }, sections: { x: true } });
    const second = buildContext({
      values: { b: 'two' },
      sections: { y: false },
    });
    const merged = mergePlaceholderContexts(first, second);
    expect(merged).toEqual({
      values: { a: 'one', b: 'two' },
      sections: { x: true, y: false },
    });
    expect(merged.lists).toBeUndefined();
    expect(merged).not.toHaveProperty('lists');
  });
});

describe('reserved placeholder namespace', () => {
  const optIn = { resolveReservedPrefixes: ['subscription.'] };

  it('declares the subscription namespace as reserved', () => {
    expect(RESERVED_PLACEHOLDER_PREFIXES).toContain('subscription.');
  });

  describe('value tokens without opt-in', () => {
    it('preserves a reserved value token absent from the context', () => {
      expect(
        applyPlaceholders(
          'Playlist: {{subscription.playlist.name}}',
          buildContext(),
        ),
      ).toBe('Playlist: {{subscription.playlist.name}}');
    });

    it('preserves a reserved value token even when present in values', () => {
      expect(
        applyPlaceholders(
          'Playlist: {{subscription.playlist.name}}',
          buildContext({
            values: { 'subscription.playlist.name': 'Summer Mix' },
          }),
        ),
      ).toBe('Playlist: {{subscription.playlist.name}}');
    });

    it('resolves a reserved value token when the prefix is opted in', () => {
      expect(
        applyPlaceholders(
          'Playlist: {{subscription.playlist.name}}',
          buildContext({
            values: { 'subscription.playlist.name': 'Summer Mix' },
          }),
          optIn,
        ),
      ).toBe('Playlist: Summer Mix');
    });
  });

  describe('sections without opt-in', () => {
    const template =
      'A {{#subscription.active}}on {{subscription.plan}}{{/subscription.active}} B';

    it('preserves the whole span when the key is absent', () => {
      expect(applyPlaceholders(template, buildContext())).toBe(template);
    });

    it('preserves the whole span when the key is present as true', () => {
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { 'subscription.active': true },
            values: { 'subscription.plan': 'pro' },
          }),
        ),
      ).toBe(template);
    });

    it('preserves the whole span when the key is present as false', () => {
      // The critical property: a reserved section that happens to be false in
      // the context must NOT delete its span — deferral means "absent", and an
      // absent section key is left literal for the pass that owns it.
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { 'subscription.active': false },
            values: { 'subscription.plan': 'pro' },
          }),
        ),
      ).toBe(template);
    });

    it('preserves an inverted reserved section span regardless of value', () => {
      const inverted = 'A {{^subscription.active}}none{{/subscription.active}} B';
      expect(
        applyPlaceholders(
          inverted,
          buildContext({ sections: { 'subscription.active': true } }),
        ),
      ).toBe(inverted);
      expect(
        applyPlaceholders(
          inverted,
          buildContext({ sections: { 'subscription.active': false } }),
        ),
      ).toBe(inverted);
    });

    it('preserves a reserved list section span', () => {
      const listTemplate =
        '{{#subscription.items}}{{name}},{{/subscription.items}}';
      expect(
        applyPlaceholders(listTemplate, {
          values: {},
          sections: {},
          lists: {
            'subscription.items': [{ values: { name: 'x' }, sections: {} }],
          },
        }),
      ).toBe(listTemplate);
    });
  });

  describe('sections with opt-in', () => {
    const template =
      'A {{#subscription.active}}on {{subscription.plan}}{{/subscription.active}} B';

    it('renders the body and inner reserved values when true', () => {
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { 'subscription.active': true },
            values: { 'subscription.plan': 'pro' },
          }),
          optIn,
        ),
      ).toBe('A on pro B');
    });

    it('removes the span entirely when false', () => {
      expect(
        applyPlaceholders(
          template,
          buildContext({
            sections: { 'subscription.active': false },
            values: { 'subscription.plan': 'pro' },
          }),
          optIn,
        ),
      ).toBe('A  B');
    });
  });

  describe('non-reserved tokens are unaffected', () => {
    const template = 'A {{#ticket}}{{ticket.url}}{{/ticket}} B {{name}}';
    const context = buildContext({
      sections: { ticket: true },
      values: { 'ticket.url': 'https://x', name: 'Kim' },
    });

    it('behaves identically without options', () => {
      expect(applyPlaceholders(template, context)).toBe(
        'A https://x B Kim',
      );
    });

    it('behaves identically with the opt-in passed', () => {
      expect(applyPlaceholders(template, context, optIn)).toBe(
        'A https://x B Kim',
      );
    });

    it('still deletes a non-reserved false section when opt-in is passed', () => {
      expect(
        applyPlaceholders(
          'A {{#ticket}}x{{/ticket}} B',
          buildContext({ sections: { ticket: false } }),
          optIn,
        ),
      ).toBe('A  B');
    });
  });

  describe('threading through list-item bodies', () => {
    const template =
      '{{#row}}[{{name}}{{#subscription.perk}}+{{subscription.label}}{{/subscription.perk}}]{{/row}}';

    function contextWithPerk(perk: boolean): PlaceholderContext {
      return {
        values: {},
        sections: {},
        lists: {
          row: [
            {
              values: { name: 'A', 'subscription.label': 'VIP' },
              sections: { 'subscription.perk': perk },
            },
          ],
        },
      };
    }

    it('preserves a nested reserved span inside a list item when false', () => {
      expect(applyPlaceholders(template, contextWithPerk(false))).toBe(
        '[A{{#subscription.perk}}+{{subscription.label}}{{/subscription.perk}}]',
      );
    });

    it('preserves a nested reserved span inside a list item when true', () => {
      expect(applyPlaceholders(template, contextWithPerk(true))).toBe(
        '[A{{#subscription.perk}}+{{subscription.label}}{{/subscription.perk}}]',
      );
    });

    it('resolves the nested reserved span inside a list item when opted in', () => {
      expect(applyPlaceholders(template, contextWithPerk(true), optIn)).toBe(
        '[A+VIP]',
      );
      expect(applyPlaceholders(template, contextWithPerk(false), optIn)).toBe(
        '[A]',
      );
    });
  });

  // GUARANTEE, not a limitation: the reserved-prefix policy is frozen at
  // runtime and the engine holds a private copy of it, so deny-by-default
  // cannot be switched off by mutating the exported array. Without this, any
  // consumer could call RESERVED_PLACEHOLDER_PREFIXES.pop() and globally
  // re-enable resolution of the namespace this PR exists to defer.
  describe('GUARANTEE: the reserved prefix policy cannot be mutated by consumers', () => {
    const valueTemplate = 'Playlist: {{subscription.playlist.name}}';
    const sectionTemplate =
      'A {{#subscription.active}}on {{subscription.plan}}{{/subscription.active}} B';

    // Drops the compile-time `readonly` so the test can do what a JS consumer
    // (or a consumer with a stray cast) would do at runtime.
    function mutable(): string[] {
      return RESERVED_PLACEHOLDER_PREFIXES as unknown as string[];
    }

    // Each mutation attempt either throws (frozen array in strict mode) or is a
    // silent no-op; both are acceptable, a successful mutation is not.
    function attempt(mutate: () => void): void {
      try {
        mutate();
      } catch {
        // Frozen-array TypeError in strict mode — the intended outcome.
      }
    }

    it('the exported array is frozen', () => {
      expect(Object.isFrozen(RESERVED_PLACEHOLDER_PREFIXES)).toBe(true);
    });

    it.each([
      ['pop', () => mutable().pop()],
      ['splice', () => mutable().splice(0, 1)],
      ['push', () => mutable().push('other.')],
      [
        'index assignment',
        () => {
          mutable()[0] = 'other.';
        },
      ],
      [
        'length assignment',
        () => {
          mutable().length = 0;
        },
      ],
    ])(
      'leaves the policy intact after an attempted %s, and still defers',
      (_label, mutate) => {
        attempt(mutate as () => void);

        // The policy itself survived.
        expect(Array.from(RESERVED_PLACEHOLDER_PREFIXES)).toEqual([
          'subscription.',
        ]);

        // A reserved VALUE token present in the context stays raw.
        expect(
          applyPlaceholders(
            valueTemplate,
            buildContext({
              values: { 'subscription.playlist.name': 'Summer Mix' },
            }),
          ),
        ).toBe(valueTemplate);

        // A reserved SECTION present as `false` keeps its whole span rather
        // than being deleted — the case a disabled policy would break.
        expect(
          applyPlaceholders(
            sectionTemplate,
            buildContext({
              sections: { 'subscription.active': false },
              values: { 'subscription.plan': 'pro' },
            }),
          ),
        ).toBe(sectionTemplate);

        // Opt-in still works, so freezing did not break the intended usage.
        expect(
          applyPlaceholders(
            valueTemplate,
            buildContext({
              values: { 'subscription.playlist.name': 'Summer Mix' },
            }),
            { resolveReservedPrefixes: RESERVED_PLACEHOLDER_PREFIXES },
          ),
        ).toBe('Playlist: Summer Mix');
      },
    );

    it('mutating a copy of the exported array does not affect deferral', () => {
      const copy = [...RESERVED_PLACEHOLDER_PREFIXES];
      copy.pop();
      expect(copy).toEqual([]);

      expect(
        applyPlaceholders(
          valueTemplate,
          buildContext({
            values: { 'subscription.playlist.name': 'Summer Mix' },
          }),
        ),
      ).toBe(valueTemplate);
    });
  });

  // KNOWN LIMITATION, pinned here so it cannot change silently. A deferred
  // section is preserved as a WHOLE span with no inner rendering, so a
  // non-reserved token nested inside it — one pass 1 owns and could have
  // resolved — is quarantined too and is later rendered against pass 2's
  // context. Template authors must keep first-pass-owned tokens out of
  // deferred sections; this is a constraint on the cross-service contract, not
  // a bug to fix in the engine.
  describe('KNOWN LIMITATION: a deferred section quarantines non-reserved tokens in its body', () => {
    const template =
      '{{#subscription.active}}Hi {{firstName}}{{/subscription.active}}';

    it('LIMITATION: pass 1 preserves a non-reserved token nested in a deferred span, then pass 2 leaks it raw', () => {
      // Pass 1 (publisher) owns `firstName` and has it in context, but the
      // deferred span is copied verbatim, so it is never substituted.
      const firstPass = applyPlaceholders(
        template,
        buildContext({
          values: { firstName: 'Ada' },
          sections: { 'subscription.active': true },
        }),
      );
      expect(firstPass).toBe(template);

      // Pass 2 (consumer) opts in and renders the body against ITS context,
      // which has no `firstName` — so the token reaches end users raw.
      expect(
        applyPlaceholders(
          firstPass,
          buildContext({ sections: { 'subscription.active': true } }),
          optIn,
        ),
      ).toBe('Hi {{firstName}}');
    });
  });

  // KNOWN LIMITATION, pinned here so it cannot change silently. Deferral
  // protects spans KEYED UNDER a reserved prefix; it does not protect reserved
  // text that merely sits inside a first-pass-owned construct. When that
  // construct discards its body, the body is dropped before the reserved token
  // is ever tokenized, so the token is deleted with no opt-in.
  describe('KNOWN LIMITATION: reserved tokens inside a discarded first-pass construct are deleted', () => {
    it('LIMITATION: a reserved token inside a false publisher section is removed by pass 1 without opt-in', () => {
      expect(
        applyPlaceholders(
          'A {{#ticket}}Plan: {{subscription.plan}}{{/ticket}} B',
          buildContext({ sections: { ticket: false } }),
        ),
      ).toBe('A  B');
    });

    it('LIMITATION: a reserved token inside an empty publisher list is removed by pass 1 without opt-in', () => {
      expect(
        applyPlaceholders('A {{#items}}{{subscription.plan}}{{/items}} B', {
          values: {},
          sections: {},
          lists: { items: [] },
        }),
      ).toBe('A  B');
    });
  });

  // KNOWN LIMITATION, pinned here so it cannot change silently. Opt-in entries
  // are matched for exact equality against RESERVED_PLACEHOLDER_PREFIXES, and
  // the engine's never-throws contract means a mistyped prefix cannot be
  // reported — it just silently opts into nothing.
  describe('KNOWN LIMITATION: an opt-in prefix that is not an exact match is a silent no-op', () => {
    it('LIMITATION: opting in with "subscription" (no trailing dot) resolves nothing and keeps tokens raw', () => {
      const context = buildContext({
        values: { 'subscription.plan': 'Gold' },
        sections: { 'subscription.active': true },
      });

      expect(
        applyPlaceholders('Plan: {{subscription.plan}}', context, {
          resolveReservedPrefixes: ['subscription'],
        }),
      ).toBe('Plan: {{subscription.plan}}');

      const sectionTemplate =
        'A {{#subscription.active}}on{{/subscription.active}} B';
      expect(
        applyPlaceholders(sectionTemplate, context, {
          resolveReservedPrefixes: ['subscription'],
        }),
      ).toBe(sectionTemplate);

      // Passing the exported constant is what callers should do instead.
      expect(
        applyPlaceholders('Plan: {{subscription.plan}}', context, {
          resolveReservedPrefixes: RESERVED_PLACEHOLDER_PREFIXES,
        }),
      ).toBe('Plan: Gold');
    });
  });

  // KNOWN LIMITATION, pinned here so it cannot change silently. Substituted
  // values are not re-scanned within a pass, but this engine is a plain string
  // transform with no provenance tracking, so placeholder-shaped text a pass-1
  // VALUE introduces becomes a real token to a pass-2 render of that output.
  // These tests document what the engine does, not what we want it to do —
  // sanitizing untrusted field values belongs at the pass-1 caller's boundary.
  describe('KNOWN LIMITATION: pass-1 values can smuggle tokens into pass 2', () => {
    it('LIMITATION: a reserved VALUE token injected by a pass-1 value resolves in an opted-in pass 2', () => {
      const firstPass = applyPlaceholders(
        'Plan: {{name}}',
        buildContext({ values: { name: '{{subscription.plan}}' } }),
      );
      // Pass 1 defers the reserved namespace, so the injected token survives.
      expect(firstPass).toBe('Plan: {{subscription.plan}}');

      const secondPass = applyPlaceholders(
        firstPass,
        buildContext({ values: { 'subscription.plan': 'Gold' } }),
        optIn,
      );
      expect(secondPass).toBe('Plan: Gold');
    });

    it('LIMITATION: a reserved SECTION injected by a pass-1 value is evaluated in an opted-in pass 2', () => {
      const firstPass = applyPlaceholders(
        'A{{name}}B',
        buildContext({
          values: {
            name: '{{#subscription.perk}}PERK{{/subscription.perk}}',
          },
        }),
      );
      expect(firstPass).toBe(
        'A{{#subscription.perk}}PERK{{/subscription.perk}}B',
      );

      expect(
        applyPlaceholders(
          firstPass,
          buildContext({ sections: { 'subscription.perk': true } }),
          optIn,
        ),
      ).toBe('APERKB');

      expect(
        applyPlaceholders(
          firstPass,
          buildContext({ sections: { 'subscription.perk': false } }),
          optIn,
        ),
      ).toBe('AB');
    });
  });

  // KNOWN LIMITATION, pinned here so it cannot change silently. The tokenizer
  // matches `{{key}}` as a plain substring with no brace-boundary check, so
  // Mustache's triple-brace (unescaped) syntax is consumed rather than passed
  // through literally. These tests document what the engine does, not what we
  // want it to do — tightening the regex would change live rendering output.
  describe('KNOWN LIMITATION: extra braces around a token are consumed', () => {
    it('LIMITATION: {{{x}}} substitutes and leaves one brace on each side literal', () => {
      expect(
        applyPlaceholders('{{{x}}}', buildContext({ values: { x: 'V' } })),
      ).toBe('{V}');
    });

    it('LIMITATION: {{{{x}}}} substitutes and leaves two braces on each side literal', () => {
      expect(
        applyPlaceholders('{{{{x}}}}', buildContext({ values: { x: 'V' } })),
      ).toBe('{{V}}');
    });

    it('LIMITATION: extra braces around section tags are consumed and stranded', () => {
      // The stray brace before each open and after each close both survive, so
      // the retained body ends up wrapped in `{}` pairs rather than `{...}`.
      expect(
        applyPlaceholders(
          '{{{#k}}}IN{{{/k}}}',
          buildContext({ sections: { k: true } }),
        ),
      ).toBe('{}IN{}');
    });

    it('braces that never close are left literal', () => {
      expect(
        applyPlaceholders('{{x} and {x}}', buildContext({ values: { x: 'V' } })),
      ).toBe('{{x} and {x}}');
    });
  });

  // KNOWN LIMITATION, pinned here so it cannot change silently. Rendering
  // recurses once per retained nested section level and each level rescans
  // forward for its own close tag, so stack depth grows with nesting depth and
  // matching is quadratic in it. Deeply nested input throws `RangeError:
  // Maximum call stack size exceeded` — measured at ~5,000 levels (~60KB) on
  // default Node. That threshold is NOT asserted here: it is a property of the
  // host's stack size, not of this code (depth 5,000 survives under
  // `node --stack-size=4000`), and a depth large enough to overflow every
  // runtime costs seconds per run. So this pins correct rendering at a modest
  // depth instead, and callers taking untrusted input must bound size/nesting.
  describe('KNOWN LIMITATION: nesting depth is unbounded', () => {
    it('LIMITATION: renders deeply nested sections correctly at depth 50, with no internal depth cap to stop unbounded input', () => {
      const depth = 50;
      const template = `${'{{#k}}'.repeat(depth)}X${'{{/k}}'.repeat(depth)}`;

      expect(
        applyPlaceholders(template, buildContext({ sections: { k: true } })),
      ).toBe('X');
      expect(
        applyPlaceholders(template, buildContext({ sections: { k: false } })),
      ).toBe('');
    });
  });
});
