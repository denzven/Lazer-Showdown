import { 
  BOARD_SIZE, 
  BLOCK_TYPES, 
  FIXED_MIRRORS,
  validatePlacement,
  validateMovement,
  traceLaserBeam 
} from './Ruleset';

/**
 * Generates a setup action for the bot.
 * 
 * @param {Array} board - Current grid matrix
 * @param {string} phase - 'setup-defender' | 'setup-attacker' | 'challenge-setup'
 * @param {string} playerColor - Bot player color ('red' or 'blue')
 * @returns {Object|null}
 */
export function getBotSetupAction(board, phase, playerColor) {
  if (phase === 'setup-defender' || phase === 'challenge-setup') {
    // Defender places 3 point pieces: BLOCK_20, BLOCK_30, BLOCK_50
    // Identify which pieces are not placed yet
    const counts = {
      [BLOCK_TYPES.BLOCK_20]: 0,
      [BLOCK_TYPES.BLOCK_30]: 0,
      [BLOCK_TYPES.BLOCK_50]: 0
    };

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = board[r][c];
        if (cell && counts[cell.type] !== undefined) {
          counts[cell.type]++;
        }
      }
    }

    let nextPieceType = null;
    if (counts[BLOCK_TYPES.BLOCK_20] === 0) nextPieceType = BLOCK_TYPES.BLOCK_20;
    else if (counts[BLOCK_TYPES.BLOCK_30] === 0) nextPieceType = BLOCK_TYPES.BLOCK_30;
    else if (counts[BLOCK_TYPES.BLOCK_50] === 0) nextPieceType = BLOCK_TYPES.BLOCK_50;

    if (!nextPieceType) return null;

    // Find all legal cells (no corner, empty, no mirror)
    const legalCells = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (validatePlacement(board, r, c, nextPieceType).valid) {
          legalCells.push({ r, c });
        }
      }
    }

    if (legalCells.length > 0) {
      // Pick a random legal cell, preferably not in direct line of sight of corners
      const idx = Math.floor(Math.random() * legalCells.length);
      const cell = legalCells[idx];
      return { type: 'place', pieceType: nextPieceType, r: cell.r, c: cell.c };
    }
  } 
  
  else if (phase === 'setup-attacker') {
    // Attacker places LAZER piece on one of the corners
    const corners = [
      { r: 0, c: 0 },
      { r: 0, c: 7 },
      { r: 7, c: 0 },
      { r: 7, c: 7 }
    ];

    const legalCorners = corners.filter(c => validatePlacement(board, c.r, c.c, BLOCK_TYPES.BLOCK_LAZER).valid);

    if (legalCorners.length > 0) {
      const corner = legalCorners[Math.floor(Math.random() * legalCorners.length)];
      // Choose initial facing direction pointing inwards
      let rotation = 0;
      if (corner.r === 0 && corner.c === 0) rotation = 90; // RIGHT or DOWN
      else if (corner.r === 0 && corner.c === 7) rotation = 180; // DOWN or LEFT
      else if (corner.r === 7 && corner.c === 0) rotation = 0; // UP or RIGHT
      else if (corner.r === 7 && corner.c === 7) rotation = 270; // LEFT or UP

      return { type: 'place', pieceType: BLOCK_TYPES.BLOCK_LAZER, r: corner.r, c: corner.c, rotation };
    }
  }

  return null;
}

/**
 * Returns a single tactical play action for the bot.
 * 
 * @param {Array} board - Current grid matrix
 * @param {string} role - 'attacker' | 'defender'
 * @param {number} actionPoints - Action points left
 * @param {string} difficulty - 'easy' | 'medium' | 'hard'
 * @returns {Object|null} The chosen action or null to end turn
 */
export function getBotPlayAction(board, role, actionPoints, difficulty) {
  if (actionPoints <= 0) return null;

  // Easy Bot: Pick a random valid action
  if (difficulty === 'easy') {
    const actions = getPossibleActions(board, role);
    if (actions.length > 0) {
      // 15% chance to end turn early to simulate poor choices
      if (Math.random() < 0.15) return null;
      return actions[Math.floor(Math.random() * actions.length)];
    }
    return null;
  }

  // Medium and Hard Bots: Tactical heuristic choices
  if (role === 'attacker') {
    return getAttackerAction(board, difficulty);
  } else {
    return getDefenderAction(board, difficulty);
  }
}

/**
 * Generates all possible valid single actions for a role.
 */
function getPossibleActions(board, role) {
  const actions = [];
  const emptyCells = [];
  let lazerPos = null;
  const pointPieces = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (!cell) {
        emptyCells.push({ r, c });
      } else if (cell.type === BLOCK_TYPES.BLOCK_LAZER) {
        lazerPos = { r, c, block: cell };
      } else if ([BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
        pointPieces.push({ r, c, block: cell });
      }
    }
  }

  if (role === 'attacker' && lazerPos) {
    // 1. LAZER PRESS
    actions.push({ type: 'laser-press' });

    // 2. ROTATE (CW and CCW)
    actions.push({ type: 'rotate', dir: 'cw' });
    actions.push({ type: 'rotate', dir: 'ccw' });

    // 3. MOVE
    for (const cell of emptyCells) {
      if (validateMovement(board, lazerPos.r, lazerPos.c, cell.r, cell.c, 'attacker').valid) {
        actions.push({ type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR: cell.r, toC: cell.c });
      }
    }
  } 
  
  else if (role === 'defender') {
    // MOVE point pieces
    for (const p of pointPieces) {
      for (const cell of emptyCells) {
        if (validateMovement(board, p.r, p.c, cell.r, cell.c, 'defender').valid) {
          actions.push({ type: 'move', fromR: p.r, fromC: p.c, toR: cell.r, toC: cell.c });
        }
      }
    }
  }

  return actions;
}

/**
 * Smart Attacker AI strategy.
 */
function getAttackerAction(board, difficulty) {
  let lazerPos = null;
  let lazerDir = 0;
  const pointPieces = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell) {
        if (cell.type === BLOCK_TYPES.BLOCK_LAZER) {
          lazerPos = { r, c };
          lazerDir = cell.rotation || 0;
        } else if ([BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
          pointPieces.push({ r, c, type: cell.type });
        }
      }
    }
  }

  if (!lazerPos) return null;

  // 1. Can we capture immediately?
  const initialTrace = traceLaserBeam(board, lazerPos, lazerDir);
  if (initialTrace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(initialTrace.hitPiece.cell.type)) {
    return { type: 'laser-press' };
  }

  // 2. Can we capture with 1 rotation?
  const rotations = [90, 270]; // CW, CCW
  for (const rotOffset of rotations) {
    const testDir = (lazerDir + rotOffset) % 360;
    const testTrace = traceLaserBeam(board, lazerPos, testDir);
    if (testTrace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(testTrace.hitPiece.cell.type)) {
      return { type: 'rotate', dir: rotOffset === 90 ? 'cw' : 'ccw' };
    }
  }

  // 3. Can we capture by moving 1 square?
  const emptyDirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  for (const dir of emptyDirs) {
    const toR = lazerPos.r + dir.dr;
    const toC = lazerPos.c + dir.dc;
    if (validateMovement(board, lazerPos.r, lazerPos.c, toR, toC, 'attacker').valid) {
      // Simulate move
      const tempBoard = JSON.parse(JSON.stringify(board));
      tempBoard[toR][toC] = tempBoard[lazerPos.r][lazerPos.c];
      tempBoard[lazerPos.r][lazerPos.c] = null;

      // Test fire from new position
      const testTrace = traceLaserBeam(tempBoard, { r: toR, c: toC }, lazerDir);
      if (testTrace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(testTrace.hitPiece.cell.type)) {
        return { type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR, toC };
      }

      // Test rotate + fire from new position
      for (const rotOffset of rotations) {
        const testDir = (lazerDir + rotOffset) % 360;
        const testTraceRot = traceLaserBeam(tempBoard, { r: toR, c: toC }, testDir);
        if (testTraceRot.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(testTraceRot.hitPiece.cell.type)) {
          return { type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR, toC };
        }
      }
    }
  }

  // 4. Default: Pathfinding towards the closest point piece
  if (pointPieces.length > 0) {
    // Find closest piece
    let closestPiece = null;
    let minDist = Infinity;
    for (const p of pointPieces) {
      const dist = Math.abs(lazerPos.r - p.r) + Math.abs(lazerPos.c - p.c);
      if (dist < minDist) {
        minDist = dist;
        closestPiece = p;
      }
    }

    if (closestPiece) {
      // Try to move closer to it
      const dr = Math.sign(closestPiece.r - lazerPos.r);
      const dc = Math.sign(closestPiece.c - lazerPos.c);

      // Try vertical move first
      if (dr !== 0 && validateMovement(board, lazerPos.r, lazerPos.c, lazerPos.r + dr, lazerPos.c, 'attacker').valid) {
        return { type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR: lazerPos.r + dr, toC: lazerPos.c };
      }
      // Try horizontal move
      if (dc !== 0 && validateMovement(board, lazerPos.r, lazerPos.c, lazerPos.r, lazerPos.c + dc, 'attacker').valid) {
        return { type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR: lazerPos.r, toC: lazerPos.c + dc };
      }

      // Fallback: Just rotate CW to search other areas
      return { type: 'rotate', dir: 'cw' };
    }
  }

  // End turn if no move found
  return null;
}

/**
 * Smart Defender AI strategy (evade laser path).
 */
function getDefenderAction(board, difficulty) {
  let lazerPos = null;
  let lazerDir = 0;
  const pointPieces = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell) {
        if (cell.type === BLOCK_TYPES.BLOCK_LAZER) {
          lazerPos = { r, c };
          lazerDir = cell.rotation || 0;
        } else if ([BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
          pointPieces.push({ r, c, type: cell.type });
        }
      }
    }
  }

  if (!lazerPos) return null;

  // Trace the attacker's line of fire
  const trace = traceLaserBeam(board, lazerPos, lazerDir);
  const pathCoords = trace.path.map(p => `${p.r}-${p.c}`);
  const hit = trace.hitPiece;

  // 1. Is one of our pieces currently targeted by the laser?
  if (hit && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(hit.cell.type)) {
    const targetPiece = hit;

    // Find valid moves for this targeted piece that get it out of the line of fire
    const emptyDirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];

    const safeMoves = [];

    for (const dir of emptyDirs) {
      const toR = targetPiece.r + dir.dr;
      const toC = targetPiece.c + dir.dc;

      if (validateMovement(board, targetPiece.r, targetPiece.c, toR, toC, 'defender').valid) {
        // Simulate movement
        const tempBoard = JSON.parse(JSON.stringify(board));
        tempBoard[toR][toC] = tempBoard[targetPiece.r][targetPiece.c];
        tempBoard[targetPiece.r][targetPiece.c] = null;

        // Check if it is safe in the new position
        const testTrace = traceLaserBeam(tempBoard, lazerPos, lazerDir);
        const testHit = testTrace.hitPiece;
        const isSafe = !testHit || testHit.r !== toR || testHit.c !== toC;

        if (isSafe) {
          safeMoves.push({ type: 'move', fromR: targetPiece.r, fromC: targetPiece.c, toR, toC });
        }
      }
    }

    if (safeMoves.length > 0) {
      // Pick a safe move (Hard bot picks best, medium picks random safe)
      return safeMoves[Math.floor(Math.random() * safeMoves.length)];
    }
  }

  // 2. If all pieces are safe and it's Medium/Hard difficulty:
  // Forfeit remaining APs to avoid moving safe pieces into danger!
  if (difficulty === 'hard' || difficulty === 'medium') {
    return null;
  }

  // Fallback: move a random piece to adjacent square
  const allMoves = getPossibleActions(board, 'defender');
  if (allMoves.length > 0) {
    return allMoves[Math.floor(Math.random() * allMoves.length)];
  }

  return null;
}
