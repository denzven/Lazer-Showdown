export const BOARD_SIZE = 8;

export const BLOCK_TYPES = {
  BLOCK_20: 'block-20',
  BLOCK_30: 'block-30',
  BLOCK_50: 'block-50',
  BLOCK_LAZER: 'block-lazer'
};

export const PLAYERS = {
  RED: 'red',
  BLUE: 'blue'
};

// Fixed mirrors mount pattern on the board
export const FIXED_MIRRORS = [
  { r: 1, c: 2, orientation: '/' },
  { r: 1, c: 5, orientation: '\\' },
  { r: 3, c: 3, orientation: '\\' },
  { r: 3, c: 4, orientation: '/' },
  { r: 4, c: 3, orientation: '/' },
  { r: 4, c: 4, orientation: '\\' },
  { r: 6, c: 2, orientation: '\\' },
  { r: 6, c: 5, orientation: '/' }
];

/**
 * Returns a board pre-populated with mirrors.
 */
export function getInitialBoard() {
  const board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
  for (const m of FIXED_MIRRORS) {
    board[m.r][m.c] = { type: 'mirror', orientation: m.orientation };
  }
  return board;
}

/**
 * Traces the path of a laser beam.
 * Reflects 90 degrees on hitting mirrors, stops on point pieces or board edges.
 */
export function traceLaserBeam(board, lazerPos, lazerDir) {
  const path = [];
  let r = lazerPos.r;
  let c = lazerPos.c;
  
  let dr = 0;
  let dc = 0;
  if (lazerDir === 0) { dr = -1; dc = 0; } // UP
  else if (lazerDir === 90) { dr = 0; dc = 1; } // RIGHT
  else if (lazerDir === 180) { dr = 1; dc = 0; } // DOWN
  else if (lazerDir === 270) { dr = 0; dc = -1; } // LEFT

  r += dr;
  c += dc;
  let hitPiece = null;
  const visited = new Set(); // Prevent infinite mirror loops

  while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
    const key = `${r}-${c}-${dr}-${dc}`;
    if (visited.has(key)) {
      break;
    }
    visited.add(key);

    const cell = board[r][c];
    if (cell && cell.type === 'mirror') {
      path.push({ r, c, type: 'mirror-bounce', orientation: cell.orientation });
      // Apply diagonal reflection
      if (cell.orientation === '/') {
        const temp = dr;
        dr = -dc;
        dc = -temp;
      } else if (cell.orientation === '\\') {
        const temp = dr;
        dr = dc;
        dc = temp;
      }
    } else {
      path.push({ r, c, type: 'beam' });
      if (cell) {
        // Absorbed by point piece or laser block
        hitPiece = { r, c, cell };
        break;
      }
    }

    r += dr;
    c += dc;
  }

  return { path, hitPiece };
}

/**
 * Validates square placement during initial setup.
 */
export function validatePlacement(board, r, c, pieceType) {
  if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
    return { valid: false, error: 'Position out of bounds.' };
  }
  const cell = board[r][c];
  if (cell) {
    return { valid: false, error: 'Grid position is already occupied.' };
  }

  const isCorner = (r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1);
  if (pieceType === BLOCK_TYPES.BLOCK_LAZER) {
    if (!isCorner) {
      return { valid: false, error: 'The LAZER piece must be placed on one of the four corner squares.' };
    }
  } else {
    // Point pieces
    if (isCorner) {
      return { valid: false, error: 'Point pieces cannot be placed on corner squares.' };
    }
  }

  return { valid: true };
}

/**
 * Validates movement from one square to another.
 * Restricts to single-step horizontal/vertical moves and turn ownership.
 */
export function validateMovement(board, fromR, fromC, toR, toC, turnPlayer) {
  if (fromR < 0 || fromR >= BOARD_SIZE || fromC < 0 || fromC >= BOARD_SIZE ||
      toR < 0 || toR >= BOARD_SIZE || toC < 0 || toC >= BOARD_SIZE) {
    return { valid: false, error: 'Coordinates out of bounds.' };
  }
  const piece = board[fromR][fromC];
  if (!piece) {
    return { valid: false, error: 'No piece at starting coordinate.' };
  }
  if (piece.type === 'mirror') {
    return { valid: false, error: 'Mirrors cannot be moved.' };
  }
  if (board[toR][toC] !== null) {
    return { valid: false, error: 'Destination coordinate is occupied.' };
  }

  // Enforce role assignment rules
  if (turnPlayer === 'attacker') {
    if (piece.type !== BLOCK_TYPES.BLOCK_LAZER) {
      return { valid: false, error: 'The Attacker can only move the LAZER piece.' };
    }
  } else if (turnPlayer === 'defender') {
    const isPointPiece = [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(piece.type);
    if (!isPointPiece) {
      return { valid: false, error: 'The Defender can only move POINT pieces.' };
    }
  }

  // Horizontal or vertical single-square moves only
  const dist = Math.abs(fromR - toR) + Math.abs(fromC - toC);
  if (dist !== 1) {
    return { valid: false, error: 'Pieces can only move exactly 1 square horizontally or vertically.' };
  }

  return { valid: true };
}

/**
 * Evaluates game board side-effects, generating real-time laser paths.
 */
export function evaluateBoardState(board, lastAction, player, context = {}) {
  // Find laser piece
  let lazerPos = null;
  let lazerDir = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell && cell.type === BLOCK_TYPES.BLOCK_LAZER) {
        lazerPos = { r, c };
        lazerDir = cell.rotation || 0;
        break;
      }
    }
  }

  let laserPath = [];
  let hitPiece = null;

  if (lazerPos) {
    const trace = traceLaserBeam(board, lazerPos, lazerDir);
    laserPath = trace.path;
    hitPiece = trace.hitPiece;
  }

  const result = {
    winner: null,
    logs: [],
    customData: {
      laserPath,
      hitPiece,
      lazerPos,
      laserFired: lastAction && lastAction.type === 'laser-press'
    }
  };

  if (lastAction) {
    const actor = player ? player.toUpperCase() : 'SYSTEM';
    if (lastAction.type === 'place') {
      result.logs.push(`${actor} placed a ${lastAction.pieceType} at (${lastAction.r}, ${lastAction.c}).`);
    } else if (lastAction.type === 'move') {
      result.logs.push(`${actor} moved piece from (${lastAction.fromR}, ${lastAction.fromC}) to (${lastAction.toR}, ${lastAction.toC}).`);
    } else if (lastAction.type === 'rotate') {
      result.logs.push(`${actor} rotated LAZER block.`);
    } else if (lastAction.type === 'remove') {
      result.logs.push(`${actor} removed block from (${lastAction.r}, ${lastAction.c}).`);
    } else if (lastAction.type === 'clear') {
      result.logs.push(`${actor} cleared the workspace.`);
    }
  }

  return result;
}

/**
 * Calculates all cells reachable from a start position given the remaining Action Points.
 * Correctly accounts for obstacles (mirrors and other blocks) and returns step paths.
 */
export function getReachableCells(board, startR, startC, maxAP, turnPlayer) {
  if (maxAP <= 0) return [];
  
  const piece = board[startR][startC];
  if (!piece || piece.type === 'mirror') return [];

  if (turnPlayer === 'attacker') {
    if (piece.type !== BLOCK_TYPES.BLOCK_LAZER) return [];
  } else {
    const isPointPiece = [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(piece.type);
    if (!isPointPiece) return [];
  }

  const reachable = [];
  const visited = new Set();
  const queue = [{ r: startR, c: startC, dist: 0, path: [] }];
  visited.add(`${startR}-${startC}`);

  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 }
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    const { r, c, dist, path } = current;

    if (dist > 0) {
      reachable.push({ r, c, dist, path });
    }

    if (dist >= maxAP) continue;

    for (const dir of dirs) {
      const nr = r + dir.dr;
      const nc = c + dir.dc;
      const key = `${nr}-${nc}`;

      if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && !visited.has(key)) {
        if (board[nr][nc] === null) {
          visited.add(key);
          const nextPath = [...path, { r: nr, c: nc }];
          queue.push({ r: nr, c: nc, dist: dist + 1, path: nextPath });
        }
      }
    }
  }

  return reachable;
}
