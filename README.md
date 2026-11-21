# SwiftCSV

A fast, exact drop-in replacement for csv-reader 1.0.0. Reads broken CSV files and returns exactly what csv-reader returns, in about half the CPU time.

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/kim007-lol/swiftcsv/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/kim007-lol/swiftcsv/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

Built for the [make.fun csv-reader-speed-01-run-20261121 bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

## How it works

`solve.js` exports `run(input)`, which parses `{text, header}` into `{columns, rows, errors}` with csv-reader 1.0.0's exact semantics, including every error quirk (stray CR, quote junk, unterminated quotes, short/long rows). The parser cuts unquoted fields with `indexOf` + `slice` instead of walking character by character, which makes it about 2.5x faster than the baseline on the parse step.

`main.ts` reads cases from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

## License

MIT
