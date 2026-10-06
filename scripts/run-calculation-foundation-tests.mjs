import { build } from 'esbuild';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [entryRelative = 'src/test/calculationFoundation.characterization.test.ts', exportName] = process.argv.slice(2);
const entryPoint = resolve(root, entryRelative);

if (relative(root, entryPoint).startsWith('..')) {
  throw new Error('The test entry point must remain inside the repository.');
}

const result = await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
  logLevel: 'silent',
});

const source = result.outputFiles[0].text;
const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
if (exportName) {
  const run = module[exportName];
  if (typeof run !== 'function') throw new Error(`Export ${exportName} is not a function.`);
  const outcome = await run();
  if (outcome && typeof outcome === 'object' && 'success' in outcome && outcome.success === false) {
    throw new Error(`${exportName} reported an unsuccessful result.`);
  }
}
