import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.wrangler/toy/package');
await mkdir(output, { recursive:true });
// Dedicated output: the website build and production services are untouched.
const files = ['index.html','style.css','social.css','about.css','game-ui.js','game.js','engine.js','clock.js','motion.js','seed.js','vendor/qrcode.js',
  'assets/atlas.js','assets/atlas.png','assets/roadster.png','assets/starship-booster.png','assets/dogecoin-medals.png',
  'assets/fonts/pixel.css','assets/SOURCE-LICENSE.md',
  ...['wing','point','hit','die','swooshing'].map(name => `assets/audio/${name}.mp3`),
  ...(await readdir(resolve(root,'assets/fonts/pixel'))).filter(name => name.endsWith('.woff2')).map(name => `assets/fonts/pixel/${name}`)];
for (const file of files) { await mkdir(dirname(resolve(output,file)),{recursive:true}); await cp(resolve(root,file),resolve(output,file)); }
await cp(resolve(root,'toy/social.js'),resolve(output,'social.js'));
await writeFile(resolve(output,'social.css'), (await readFile(resolve(root,'social.css'),'utf8')) + '\n' + (await readFile(resolve(root,'toy/social.css'),'utf8')));
await cp(resolve(root,'toy/about.html'),resolve(output,'about.html'));
await cp(resolve(root,'assets/audio/SOURCE-LICENSE'),resolve(output,'assets/audio/SOURCE-LICENSE.md'));
await cp(resolve(root,'assets/fonts/FUSION-OFL.txt'),resolve(output,'assets/fonts/FUSION-OFL.md'));
let html = await readFile(resolve(output,'index.html'),'utf8');
html = html.replace(/    <meta name="description"[\s\S]*?    <link rel="preload" href="assets\/atlas.png"/, '    <title>Flappy Car 像素飞车</title>\n    <link rel="icon" type="image/png" href="assets/roadster.png">\n    <link rel="preload" href="assets/atlas.png"');
html = html.replace(/    <link rel="preconnect"[^\n]+\n/, '');
html = html.replace('    <script defer src="social.js"></script>', '    <script defer src="https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js"></script>\n    <script defer src="vendor/qrcode.js"></script>\n    <script defer src="social.js"></script>');
html = html.replace('车手 / 好友','排行榜');
await writeFile(resolve(output,'index.html'),html);
const game = await readFile(resolve(output,'game.js'),'utf8');
if (!game.includes("const bestKey = 'flappy-bird-classic.best';")) throw new Error('Game best-score storage key changed; review Toy build.');
await writeFile(resolve(output,'game.js'),game.replace("const bestKey = 'flappy-bird-classic.best';","const bestKey = 'flappy-car.toy.best.v1';"));
const allowed = new Set(['.html','.css','.js','.json','.md','.png','.jpg','.jpeg','.woff2','.mp3']);
const manifest = { target:'bilibili-toy', revision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(), files:{} };
async function walk(folder) {
  for (const entry of await readdir(resolve(output,folder),{withFileTypes:true})) {
    const relative = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(relative);
    else {
      if (!allowed.has(extname(entry.name))) throw new Error(`Unsupported Toy file: ${relative}`);
      manifest.files[relative] = createHash('sha256').update(await readFile(resolve(output,relative))).digest('hex');
    }
  }
}
await walk('');
await writeFile(resolve(root,'.wrangler/toy/manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const zip = resolve(root,'.wrangler/toy/flappy-car-toy.zip');
await rm(zip,{force:true});
execFileSync('/usr/bin/zip',['-q','-r',zip,'.'],{cwd:output});
console.log(`Built ${Object.keys(manifest.files).length} files: ${zip}`);
