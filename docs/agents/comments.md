# Comments

## The cap

A comment is at most 2 lines. The only exception is the header of a generated
file (`src/transfer/measureFont.ts`).

## What earns a comment

Only one of these five cases. Outside the list, no comment.

1. A constraint from outside the file — browser, library, or spec behaviour the
   code cannot show.
2. A choice whose obvious alternative is wrong. Name the alternative.
3. A cross-reference: `ADR 00XX`, `CONTEXT.md: Term`.
4. A warning that bites: generated file, invariant held elsewhere.
5. A fixture annotation decoding a number in a test — coordinates, spans,
   geometry.

## The register

Telegraphic. Give the reason and stop; the reader walks the rest. No
demonstration, no aside, no closing flourish.

```ts
// A Popover rather than a Menu: the ARIA menu pattern puts a roving tabindex
// on its items, which would take the theme row's buttons out of the
// keyboard's reach. This dropdown mixes actions with a setting, so it is not
// a menu.
```

becomes

```ts
// Popover, not Menu: a menu's roving tabindex would strand the theme buttons.
```

## JSDoc

`/** */` is reserved for what a caller hovers in their editor: an exported type
or function crossing a module boundary. Same cap, same five cases — the syntax
grants nothing extra.
