import { 
  BOARD_SIZE, 
  BLOCK_TYPES, 
  FIXED_MIRRORS,
  validatePlacement,
  validateMovement,
  traceLaserBeam 
} from './Ruleset';

// --- SHARED HELPER FUNCTIONS ---

function getBoardState(board) {
  const pointPieces = [];
  let lazerPos = null;
  let lazerDir = 0;
  const emptyCells = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (!cell) {
        emptyCells.push({ r, c });
      } else if (cell.type === BLOCK_TYPES.BLOCK_LAZER) {
        lazerPos = { r, c, block: cell };
        lazerDir = cell.rotation || 0;
      } else if ([BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
        pointPieces.push({ r, c, block: cell, type: cell.type });
      }
    }
  }
  return { pointPieces, lazerPos, lazerDir, emptyCells };
}

function getPossibleActions(board, role) {
  const actions = [];
  const { emptyCells, lazerPos, pointPieces } = getBoardState(board);

  if (role === 'attacker' && lazerPos) {
    actions.push({ type: 'laser-press' });
    actions.push({ type: 'rotate', dir: 'cw' });
    actions.push({ type: 'rotate', dir: 'ccw' });
    for (const cell of emptyCells) {
      if (validateMovement(board, lazerPos.r, lazerPos.c, cell.r, cell.c, 'attacker').valid) {
        actions.push({ type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR: cell.r, toC: cell.c });
      }
    }
  } else if (role === 'defender') {
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

function isPieceSafe(board, pieceR, pieceC, currentLazerPos, currentLazerDir) {
    if (!currentLazerPos) return true;
    const trace = traceLaserBeam(board, currentLazerPos, currentLazerDir);
    const hit = trace.hitPiece;
    return !hit || hit.r !== pieceR || hit.c !== pieceC;
}

// --- SETUP TACTICS ---

export function getBotSetupAction(board, phase, playerColor, difficulty = 'medium', challengedPiece = null) {
  if (phase === 'setup-defender' || phase === 'challenge-setup') {
    const counts = { [BLOCK_TYPES.BLOCK_20]: 0, [BLOCK_TYPES.BLOCK_30]: 0, [BLOCK_TYPES.BLOCK_50]: 0 };
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = board[r][c];
        if (cell && counts[cell.type] !== undefined) counts[cell.type]++;
      }
    }

    let nextPieceType = null;
    
    if (phase === 'challenge-setup' && challengedPiece) {
      if (counts[challengedPiece] === 0) nextPieceType = challengedPiece;
    } else {
      if (counts[BLOCK_TYPES.BLOCK_20] === 0) nextPieceType = BLOCK_TYPES.BLOCK_20;
      else if (counts[BLOCK_TYPES.BLOCK_30] === 0) nextPieceType = BLOCK_TYPES.BLOCK_30;
      else if (counts[BLOCK_TYPES.BLOCK_50] === 0) nextPieceType = BLOCK_TYPES.BLOCK_50;
    }

    if (!nextPieceType) return { type: 'confirm-setup' };

    const legalCells = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (validatePlacement(board, r, c, nextPieceType).valid) {
          legalCells.push({ r, c });
        }
      }
    }

    if (legalCells.length > 0) {
      if (difficulty === 'easy') {
        // Easy: Random placement
        let chosenCell = legalCells[Math.floor(Math.random() * legalCells.length)];
        return { type: 'place', pieceType: nextPieceType, r: chosenCell.r, c: chosenCell.c };
      }

      // Medium & Hard: Analyze the board for cover (mirrors and obstacles block lasers)
      const sortedCells = legalCells.sort((a, b) => {
        let coverA = 0; let coverB = 0;
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        
        dirs.forEach(([dr, dc]) => {
          const nrA = a.r + dr, ncA = a.c + dc;
          if (nrA < 0 || nrA >= BOARD_SIZE || ncA < 0 || ncA >= BOARD_SIZE) coverA += 0.5; // Edges offer some cover
          else if (board[nrA][ncA] !== null) coverA += 1; // Objects offer full cover
          
          const nrB = b.r + dr, ncB = b.c + dc;
          if (nrB < 0 || nrB >= BOARD_SIZE || ncB < 0 || ncB >= BOARD_SIZE) coverB += 0.5;
          else if (board[nrB][ncB] !== null) coverB += 1;
        });

        const distA = Math.abs(a.r - 3.5) + Math.abs(a.c - 3.5);
        const distB = Math.abs(b.r - 3.5) + Math.abs(b.c - 3.5);

        if (difficulty === 'medium') {
          // Medium mixes cover evaluation with center control
          return (coverB - coverA) * 2 + (distA - distB);
        } else {
          // Hard prioritizes pure cover and edge defense
          return (coverB - coverA) * 5 + (distB - distA);
        }
      });

      const chosenCell = sortedCells[0];
      return { type: 'place', pieceType: nextPieceType, r: chosenCell.r, c: chosenCell.c };
    }
  } 
  
  else if (phase === 'setup-attacker') {
    const corners = [{ r: 0, c: 0 }, { r: 0, c: 7 }, { r: 7, c: 0 }, { r: 7, c: 7 }];
    const legalCorners = corners.filter(c => validatePlacement(board, c.r, c.c, BLOCK_TYPES.BLOCK_LAZER).valid);

    if (legalCorners.length > 0) {
      if (difficulty === 'easy') {
        const corner = legalCorners[Math.floor(Math.random() * legalCorners.length)];
        let rotation = 0;
        if (corner.r === 0 && corner.c === 0) rotation = 90;
        else if (corner.r === 0 && corner.c === 7) rotation = 180;
        else if (corner.r === 7 && corner.c === 0) rotation = 0;
        else if (corner.r === 7 && corner.c === 7) rotation = 270;
        return { type: 'place', pieceType: BLOCK_TYPES.BLOCK_LAZER, r: corner.r, c: corner.c, rotation };
      }

      // Medium & Hard: Simulate raycasts from every possible corner rotation to find best hit
      let bestPlacement = null;
      let bestScore = -1;

      legalCorners.forEach(corner => {
        const possibleRotations = [];
        if (corner.r === 0 && corner.c === 0) possibleRotations.push(90, 180);
        if (corner.r === 0 && corner.c === 7) possibleRotations.push(180, 270);
        if (corner.r === 7 && corner.c === 0) possibleRotations.push(0, 90);
        if (corner.r === 7 && corner.c === 7) possibleRotations.push(270, 0);

        possibleRotations.forEach(rot => {
          const tempBoard = board.map(row => [...row]);
          tempBoard[corner.r][corner.c] = { type: BLOCK_TYPES.BLOCK_LAZER, rotation: rot };
          
          const trace = traceLaserBeam(tempBoard, corner, rot);
          
          let score = trace.path.length; // Base score on how far laser goes
          if (trace.hit === 'piece') score += 1000; // Instakill setup! Highest priority.
          else if (trace.hit === 'mirror') score += 50; // Using mirrors is good
          
          // Introduce slight fuzziness for medium bot so it doesn't ALWAYS pick the perfect spot
          if (difficulty === 'medium' && Math.random() < 0.2) score -= Math.random() * 50;

          if (score > bestScore) {
            bestScore = score;
            bestPlacement = { type: 'place', pieceType: BLOCK_TYPES.BLOCK_LAZER, r: corner.r, c: corner.c, rotation: rot };
          }
        });
      });

      return bestPlacement || { type: 'place', pieceType: BLOCK_TYPES.BLOCK_LAZER, r: legalCorners[0].r, c: legalCorners[0].c, rotation: 0 };
    }
  }
  return null;
}

// --- MAIN ENTRY ---

export function getBotPlayAction(board, role, actionPoints, difficulty) {
  if (actionPoints <= 0) return null;

  if (difficulty === 'easy') return getZlorooklpAction(board, role);
  if (difficulty === 'medium') return getLizbishmirAction(board, role, actionPoints);
  if (difficulty === 'hard') return getShahlzrmirAction(board, role, actionPoints);

  return null;
}

// --- PERSONALITY TACTICS ---

// 1. Zlorooklp (Easy) - Veteran Scout: Forgiving, experiments.
function getZlorooklpAction(board, role) {
  const actions = getPossibleActions(board, role);
  if (actions.length > 0) {
    if (Math.random() < 0.15) return null; // Sub-optimal skip
    return actions[Math.floor(Math.random() * actions.length)];
  }
  return null;
}

// 2. Lizbishmir (Medium) - Tactical Scholar: Methodical, balanced, controls center.
function getLizbishmirAction(board, role, actionPoints) {
    if (role === 'attacker') {
        return smartAttackerTactics(board, 'medium');
    } else {
        return smartDefenderTactics(board, 'medium');
    }
}

// 3. Shahlzrmir (Hard) - High-Command Marshal: Aggressive, uncompromising, leaves no vulnerability.
function getShahlzrmirAction(board, role, actionPoints) {
    if (role === 'attacker') {
        return smartAttackerTactics(board, 'hard');
    } else {
        return smartDefenderTactics(board, 'hard');
    }
}

// --- CORE TACTICS LOGIC ---

function smartAttackerTactics(board, difficulty) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  if (!lazerPos) return null;

  // 1. Can we capture immediately?
  const initialTrace = traceLaserBeam(board, lazerPos, lazerDir);
  if (initialTrace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(initialTrace.hitPiece.cell.type)) {
    return { type: 'laser-press' };
  }

  // 2. Can we capture with 1 rotation?
  const rotations = [90, 270];
  for (const rotOffset of rotations) {
    const testDir = (lazerDir + rotOffset) % 360;
    const testTrace = traceLaserBeam(board, lazerPos, testDir);
    if (testTrace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(testTrace.hitPiece.cell.type)) {
      return { type: 'rotate', dir: rotOffset === 90 ? 'cw' : 'ccw' };
    }
  }

  // 3. Can we capture by moving 1 square?
  const emptyDirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
  for (const dir of emptyDirs) {
    const toR = lazerPos.r + dir.dr;
    const toC = lazerPos.c + dir.dc;
    if (validateMovement(board, lazerPos.r, lazerPos.c, toR, toC, 'attacker').valid) {
      const tempBoard = JSON.parse(JSON.stringify(board));
      tempBoard[toR][toC] = tempBoard[lazerPos.r][lazerPos.c];
      tempBoard[lazerPos.r][lazerPos.c] = null;

      const testTrace = traceLaserBeam(tempBoard, { r: toR, c: toC }, lazerDir);
      if (testTrace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(testTrace.hitPiece.cell.type)) {
        return { type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR, toC };
      }

      for (const rotOffset of rotations) {
        const testDir = (lazerDir + rotOffset) % 360;
        const testTraceRot = traceLaserBeam(tempBoard, { r: toR, c: toC }, testDir);
        if (testTraceRot.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(testTraceRot.hitPiece.cell.type)) {
          return { type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR, toC };
        }
      }
    }
  }

  // 4. Pathfinding
  if (pointPieces.length > 0) {
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
      const dr = Math.sign(closestPiece.r - lazerPos.r);
      const dc = Math.sign(closestPiece.c - lazerPos.c);
      if (dr !== 0 && validateMovement(board, lazerPos.r, lazerPos.c, lazerPos.r + dr, lazerPos.c, 'attacker').valid) {
        return { type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR: lazerPos.r + dr, toC: lazerPos.c };
      }
      if (dc !== 0 && validateMovement(board, lazerPos.r, lazerPos.c, lazerPos.r, lazerPos.c + dc, 'attacker').valid) {
        return { type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR: lazerPos.r, toC: lazerPos.c + dc };
      }
      return { type: 'rotate', dir: 'cw' };
    }
  }

  return null;
}

function smartDefenderTactics(board, difficulty) {
  const { lazerPos, lazerDir, pointPieces, emptyCells } = getBoardState(board);
  if (!lazerPos) return null;

  const trace = traceLaserBeam(board, lazerPos, lazerDir);
  const hit = trace.hitPiece;

  // 1. Evade if targeted
  if (hit && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(hit.cell.type)) {
    const targetPiece = hit;
    const emptyDirs = [{ dr: -1, dc: 0 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: 0, dc: 1 }];
    const safeMoves = [];

    for (const dir of emptyDirs) {
      const toR = targetPiece.r + dir.dr;
      const toC = targetPiece.c + dir.dc;

      if (validateMovement(board, targetPiece.r, targetPiece.c, toR, toC, 'defender').valid) {
        const tempBoard = JSON.parse(JSON.stringify(board));
        tempBoard[toR][toC] = tempBoard[targetPiece.r][targetPiece.c];
        tempBoard[targetPiece.r][targetPiece.c] = null;

        if (isPieceSafe(tempBoard, toR, toC, lazerPos, lazerDir)) {
          safeMoves.push({ type: 'move', fromR: targetPiece.r, fromC: targetPiece.c, toR, toC });
        }
      }
    }

    if (safeMoves.length > 0) {
      if (difficulty === 'hard') {
        // Shahlzrmir seeks edges when evading
        safeMoves.sort((a, b) => {
           const distA = Math.abs(a.toR - 3.5) + Math.abs(a.toC - 3.5);
           const distB = Math.abs(b.toR - 3.5) + Math.abs(b.toC - 3.5);
           return distB - distA;
        });
      }
      return safeMoves[0];
    }
  }

  // 2. If safe, Lizbishmir controls center, Shahlzrmir controls edges
  const allMoves = getPossibleActions(board, 'defender');
  const safeProactiveMoves = [];
  
  for (const move of allMoves) {
      const tempBoard = JSON.parse(JSON.stringify(board));
      tempBoard[move.toR][move.toC] = tempBoard[move.fromR][move.fromC];
      tempBoard[move.fromR][move.fromC] = null;
      if (isPieceSafe(tempBoard, move.toR, move.toC, lazerPos, lazerDir)) {
          safeProactiveMoves.push(move);
      }
  }

  if (safeProactiveMoves.length > 0) {
      if (difficulty === 'medium') { // Lizbishmir moves toward center
          safeProactiveMoves.sort((a, b) => {
              const distA = Math.abs(a.toR - 3.5) + Math.abs(a.toC - 3.5);
              const distB = Math.abs(b.toR - 3.5) + Math.abs(b.toC - 3.5);
              return distA - distB;
          });
          // Only move if it actually gets closer to center than current pos
          const bestMove = safeProactiveMoves[0];
          const currDist = Math.abs(bestMove.fromR - 3.5) + Math.abs(bestMove.fromC - 3.5);
          const newDist = Math.abs(bestMove.toR - 3.5) + Math.abs(bestMove.toC - 3.5);
          if (newDist < currDist) return bestMove;
      } else if (difficulty === 'hard') { // Shahlzrmir moves toward edges
          safeProactiveMoves.sort((a, b) => {
              const distA = Math.abs(a.toR - 3.5) + Math.abs(a.toC - 3.5);
              const distB = Math.abs(b.toR - 3.5) + Math.abs(b.toC - 3.5);
              return distB - distA;
          });
          const bestMove = safeProactiveMoves[0];
          const currDist = Math.abs(bestMove.fromR - 3.5) + Math.abs(bestMove.fromC - 3.5);
          const newDist = Math.abs(bestMove.toR - 3.5) + Math.abs(bestMove.toC - 3.5);
          if (newDist > currDist) return bestMove;
      }
  }

  return null; // Forfeit remaining APs to avoid moving safe pieces into danger unnecessarily
}

