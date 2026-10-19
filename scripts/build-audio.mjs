import { execFileSync } from 'node:child_process';
for (const name of ['wing', 'point', 'hit', 'die', 'swooshing']) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `assets/audio/${name}.wav`, '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-q:a', '6', '-map_metadata', '-1', `assets/audio/${name}.mp3`], { stdio:'inherit' });
}
