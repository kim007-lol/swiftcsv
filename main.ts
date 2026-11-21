// SwiftCSV driver: the harness runs `node /bot/main.ts` (node22). It reads
// every case from /input/cases.json (a JSON array of {id, input}), answers
// each one alone with run() from solve.js, and writes /output/answers.json:
// a JSON array of the answers, one per case and in the cases' order.
// Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in
// for /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of
// its work runs under it (the rules allow an entry to tune V8's flags the
// same way the house baseline does).
setFlagsFromString('--no-incremental-marking');

type Case = { id: string; input: unknown };
type Runner = (input: unknown) => unknown;

/** solve.js, imported by its URL (a .js module carries no types). */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: Runner;
};

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inDir, 'cases.json'), 'utf8')) as Case[];
const answers = cases.map((c) => run(c.input));
writeFileSync(join(outDir, 'answers.json'), JSON.stringify(answers));
