// Meridian Skies — entry program for the make.fun best-flight-game bounty.
//
// Hands the game in: copies game/ and screenshots/ from this repository into the output
// directory (/output in the grader, MAKEFUN_OUTPUT_DIR outside it) and writes dossier.json
// there with buildDossier from the kit's vendor library. Node 22 standard library only,
// no network. The output directory itself is never deleted or recreated; only the two
// subdirectories are written into it.

import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

// The bounty's gate caps: 160 KiB of dossier text, at most 4 screenshots of 256 KiB,
// at most 993 game entries and 48 MiB of game files.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

console.log(`Meridian Skies handed in: game/ and screenshots/ copied to ${outputDir}, dossier.json written (${dossier.length} bytes).`);
