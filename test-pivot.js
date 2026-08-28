import { getInitialBoard, traceLaserBeam } from './src/core/Ruleset.js';

// Setup board
let board = getInitialBoard(null, 'pivot-point');

// Add laser
board[0][2] = { type: 'block-lazer', rotation: 180, player: 'red' }; // Laser at (0,2) pointing DOWN

// There's a fixed mirror at (1,2) with orientation '/' (Bottom-Left to Top-Right)
// The laser going DOWN (180) should hit it and go LEFT.
let trace1 = traceLaserBeam(board, {r: 0, c: 2}, 180);
console.log('Trace 1 (Before Pivot):', trace1.path);

// Pivot the mirror
let block = board[1][2];
board[1][2] = {
  ...block,
  orientation: block.orientation === '/' ? '\\' : '/',
  isPivoted: true
};

// Now orientation is '\' (Top-Left to Bottom-Right)
// The laser going DOWN (180) should hit it and go RIGHT.
let trace2 = traceLaserBeam(board, {r: 0, c: 2}, 180);
console.log('Trace 2 (After Pivot):', trace2.path);
