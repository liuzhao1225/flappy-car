import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const files = [
  'index.html', 'style.css', 'engine.js', 'game.js', 'seed.js',
  'share.html', 'social.js', 'social.css', 'vendor/qrcode.js',
  'assets/fonts/fusion-pixel-12px.woff2', 'assets/fonts/FUSION-OFL.txt',
  'assets/atlas.js', 'assets/atlas.png',
  'assets/roadster.png', 'assets/starship-booster.png', 'assets/dogecoin-medals.png',
  ...['wing', 'point', 'hit', 'die', 'swooshing'].map(name => `assets/audio/${name}.wav`),
  'assets/SOURCE-LICENSE.md', 'assets/audio/SOURCE-LICENSE',
];
const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
await rm(output, { recursive: true, force: true });
const hashes = {};
for (const file of files) {
  const destination = resolve(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(root, file), destination);
  hashes[file] = createHash('sha256').update(await readFile(destination)).digest('hex');
}
await writeFile(resolve(output, '.nojekyll'), '');
await writeFile(resolve(output, 'version.json'), `${JSON.stringify({ revision, files: hashes }, null, 2)}\n`);
console.log(`Built ${files.length} site files into dist (revision ${revision}).`);
