# Contributing

Corrections and additions are welcome. S3 changes every few weeks, so a dated, sourced fix is the most useful contribution.

## Fixing a fact

1. Find the claim in `docs/ja/` and `docs/en/` (and in `data/` if the web app shows it).
2. Change both languages in the same pull request. CI fails if the two versions drift apart in structure.
3. Add or update the source URL in the chapter's references section.
4. If you cannot confirm something, mark it _unverified_ (未確認) rather than guessing.

## Editing data

Every display string in `data/*.json` is an object with `en` and `ja` keys, and display lists are `{ "en": [...], "ja": [...] }` with the same length. IDs, numbers, dates, URLs and enums stay plain. The tests in `src/test/data.test.ts` enforce this.

Prices are us-east-1 list prices in USD. Update `verifiedDate` when you change one.

## Before you open a pull request

```bash
npm run check
node scripts/validate-data.mjs
```

`npm run check` runs type-checking, ESLint, Prettier, markdownlint, the tests and the build, which is what CI runs.

## Markdown style

The repo's `.markdownlint-cli2.jsonc` is the rule set. In short: blank lines around headings, lists and tables; a language on every code fence (`text` for plain output); ordered lists numbered `1. 2. 3.`; no inline HTML.

## Commits

Use conventional commit messages in English, such as `docs(security): correct SSE-C default date` or `fix(calculator): apply minimum billable size`. Keep one logical change per commit.
