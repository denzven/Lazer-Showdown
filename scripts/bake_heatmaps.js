import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { generateExpectiminimaxThreatMap } from '../src/core/BotHelpers.js';

const BOARDS_DIR = path.join(__dirname, '../src/boards');
const HEATMAPS_DIR = path.join(__dirname, '../src/heatmaps');

if (!fs.existsSync(HEATMAPS_DIR)) {
  fs.mkdirSync(HEATMAPS_DIR, { recursive: true });
}

const files = fs.readdirSync(BOARDS_DIR).filter(f => f.endsWith('.json'));

console.log(`Found ${files.length} boards. Baking deep heatmaps...`);

for (const file of files) {
  const boardPath = path.join(BOARDS_DIR, file);
  const data = JSON.parse(fs.readFileSync(boardPath, 'utf8'));
  
  // Reconstruct board matrix
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  for (const item of data) {
    if (item.type === 'mirror' && item.grid_pos) {
       const [r, c] = item.grid_pos;
       board[r][c] = {
         type: 'mirror',
         owner: item.owner || 'defender',
         orientation: item.angle === 90 ? '\\\\' : '/'
       };
    }
  }

  console.log(`Processing ${file}...`);
  const heatmap = generateExpectiminimaxThreatMap(board, 1);
  
  const heatmapPath = path.join(HEATMAPS_DIR, file);
  fs.writeFileSync(heatmapPath, JSON.stringify(heatmap, null, 2));
  console.log(`Saved ${heatmapPath}`);
}

console.log('All heatmaps baked successfully!');
