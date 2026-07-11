import { 
  BOARD_SIZE, 
  BLOCK_TYPES, 
  validatePlacement,
  validateMovement,
  traceLaserBeam 
} from './Ruleset';

// --- SHARED HELPER FUNCTIONS ---

export function getBoardState(board) {
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
  const { emptyCells, lazerPos, lazerDir, pointPieces } = getBoardState(board);

  if (role === 'attacker' && lazerPos) {
    const trace = traceLaserBeam(board, lazerPos, lazerDir);
    if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
      actions.push({ type: 'laser-press' });
    }
    actions.push({ type: 'rotate', dir: 'cw', r: lazerPos.r, c: lazerPos.c });
    actions.push({ type: 'rotate', dir: 'ccw', r: lazerPos.r, c: lazerPos.c });
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

function applyLightweightAction(board, action) {
  const newBoard = board.map(row => [...row]);
  if (action.type === 'move') {
    newBoard[action.toR][action.toC] = newBoard[action.fromR][action.fromC];
    newBoard[action.fromR][action.fromC] = null;
  } else if (action.type === 'rotate') {
    const { r, c, dir } = action;
    const block = newBoard[r][c];
    if (block) {
      let rot = block.rotation || 0;
      newBoard[r][c] = { ...block, rotation: dir === 'cw' ? (rot + 90) % 360 : (rot + 270) % 360 };
    }
  } else if (action.type === 'laser-press') {
    const { lazerPos, lazerDir } = getBoardState(newBoard);
    if (lazerPos) {
      const trace = traceLaserBeam(newBoard, lazerPos, lazerDir);
      if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
         newBoard[trace.hitPiece.r][trace.hitPiece.c] = null; // Captured
      }
    }
  }
  return newBoard;
}

function getPieceValue(type) {
  if (type === BLOCK_TYPES.BLOCK_50) return 5000;
  if (type === BLOCK_TYPES.BLOCK_30) return 3000;
  if (type === BLOCK_TYPES.BLOCK_20) return 2000;
  return 0;
}

// Evaluate board for Attacker (higher is better for attacker)
function evaluateBoardAttacker(board, cautiousness = 1.0) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  if (!lazerPos) return -99999;
  
  let score = 0;
  
  // 1. Base score for having point pieces off the board (captured)
  const remainingTypes = pointPieces.map(p => p.type);
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_50)) score += 50000;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_30)) score += 30000;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_20)) score += 20000;

  if (pointPieces.length === 0) return score + 100000; // Win state

  // 2. Chasing logic: Find path to hit the highest value piece
  let targetPiece = pointPieces.sort((a, b) => getPieceValue(b.type) - getPieceValue(a.type))[0];

  // Penalize distance to target piece
  const manhattanDist = Math.abs(lazerPos.r - targetPiece.r) + Math.abs(lazerPos.c - targetPiece.c);
  score -= manhattanDist * 100;

  // 3. Are we hitting a piece currently?
  const trace = traceLaserBeam(board, lazerPos, lazerDir);
  if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
     // If highly cautious (desperate), heavily favor immediate captures over complex trick shots
     score += getPieceValue(trace.hitPiece.cell.type) * 2 * cautiousness; 
  }

  // Bonus for hitting mirrors (complex shots are good)
  const mirrorBounces = trace.path.filter(p => p.type === 'mirror-bounce').length;
  // If cautious/desperate, complex trick shots are valued slightly less compared to guaranteed captures
  score += mirrorBounces * 10 * (1 / cautiousness);

  return score;
}

function get2d6CumulativeProbability(targetAP) {
  if (targetAP <= 2) return 1.0;
  if (targetAP === 3) return 35/36;
  if (targetAP === 4) return 33/36;
  if (targetAP === 5) return 30/36;
  if (targetAP === 6) return 26/36;
  if (targetAP === 7) return 21/36;
  if (targetAP === 8) return 15/36;
  if (targetAP === 9) return 10/36;
  if (targetAP === 10) return 6/36;
  if (targetAP === 11) return 3/36;
  if (targetAP === 12) return 1/36;
  return 0; // >12
}

// Evaluate board for Defender (higher is better for defender)
function evaluateBoardDefender(board, cautiousness = 1.0) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  let score = 0;

  // 1. Base score for surviving pieces
  for (const p of pointPieces) {
    score += getPieceValue(p.type) * 10;
  }

  if (!lazerPos) return score;

  const rotations = [0, 90, 180, 270];

  for (const p of pointPieces) {
    let minAPToHit = 999;

    // A. Check immediate threats from LAZER's current position (rotations only)
    for (const rot of rotations) {
      const trace = traceLaserBeam(board, lazerPos, rot);
      if (trace.hitPiece && trace.hitPiece.r === p.r && trace.hitPiece.c === p.c) {
        const ap = (rot === lazerDir) ? 1 : 2; // 1 to fire, or 1 to rotate + 1 to fire
        if (ap < minAPToHit) minAPToHit = ap;
      }
    }

    // B. Check movement threats by tracing backward from the point piece
    for (const rot of rotations) {
      const trace = traceLaserBeam(board, p, rot);
      for (const step of trace.path) {
        if (step.type === 'beam') {
          const r = step.r;
          const c = step.c;
          if (r === lazerPos.r && c === lazerPos.c) continue; // Already handled
          if (board[r][c] === null) { // Empty firing position
            const moveDist = Math.abs(lazerPos.r - r) + Math.abs(lazerPos.c - c);
            const ap = moveDist + 2; // moveDist to move, 1 to rotate, 1 to fire
            if (ap < minAPToHit) minAPToHit = ap;
          }
        }
      }
    }

    // Apply penalty scaled by the probability of the attacker getting enough AP and cautiousness
    if (minAPToHit < 999) {
      const prob = get2d6CumulativeProbability(minAPToHit);
      score -= getPieceValue(p.type) * 20 * prob * cautiousness;
    }

    // Bonus for being near edges/corners (harder to surround/hit)
    const edgeDist = Math.min(p.r, 7 - p.r) + Math.min(p.c, 7 - p.c);
    score -= edgeDist * 10; 
  }

  return score;
}

// Best-First Search for a single turn action sequence
function findBestActionSequence(board, role, maxDepth, evaluateFn, cautiousness) {
  let bestAction = null;
  let bestScore = -Infinity;

  // Level 1
  const actions = getPossibleActions(board, role);
  
  for (const action of actions) {
    const board1 = applyLightweightAction(board, action);
    let currentScore = evaluateFn(board1, cautiousness);
    
    // Level 2
    if (maxDepth > 1) {
      const actions2 = getPossibleActions(board1, role);
      let bestLevel2Score = -Infinity;
      for (const a2 of actions2) {
        const board2 = applyLightweightAction(board1, a2);
        let score2 = evaluateFn(board2, cautiousness);
        
        // Level 3
        if (maxDepth > 2) {
           const actions3 = getPossibleActions(board2, role);
           let bestLevel3Score = -Infinity;
           for (const a3 of actions3) {
             const board3 = applyLightweightAction(board2, a3);
             let score3 = evaluateFn(board3, cautiousness);
             if (score3 > bestLevel3Score) bestLevel3Score = score3;
           }
           if (bestLevel3Score !== -Infinity) score2 = bestLevel3Score;
        }

        if (score2 > bestLevel2Score) bestLevel2Score = score2;
      }
      if (bestLevel2Score !== -Infinity) {
         currentScore = bestLevel2Score;
      }
    }

    // Add slight randomness to break ties
    currentScore += Math.random() * 0.1;

    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestAction = action;
    }
  }

  return { bestAction, bestScore };
}

function getCautiousness(gameState, botPlayer) {
  if (!gameState || !botPlayer || !gameState.scores) return 1.0;
  const oppPlayer = botPlayer === 'blue' ? 'red' : 'blue';
  const botScore = gameState.scores[botPlayer];
  const oppScore = gameState.scores[oppPlayer];
  
  if (oppScore >= 100 || oppScore - botScore >= 50) {
    return 2.0; 
  } else if (oppScore - botScore >= 20) {
    return 1.5;
  }
  return 1.0;
}

// --- STRATEGIES ---

export const EasyStrategy = {
  getSetupAction: (board, phase, playerColor, challengedPiece) => {
    return genericSetupAction(board, phase, 'easy', challengedPiece);
  },
  getPlayAction: (board, role, actionPoints, gameState, botPlayer) => {
    const actions = getPossibleActions(board, role);
    if (actions.length === 0) return null;

    const { lazerPos, pointPieces } = getBoardState(board);
    if (!lazerPos || pointPieces.length === 0) {
      if (Math.random() < 0.15) return null; 
      return actions[Math.floor(Math.random() * actions.length)];
    }

    let bestAction = null;
    let bestScore = role === 'attacker' ? Infinity : -Infinity;

    for (const action of actions) {
      const b1 = applyLightweightAction(board, action);
      const state1 = getBoardState(b1);
      
      if (!state1.lazerPos || state1.pointPieces.length === 0) {
        if (role === 'attacker') return action; 
        continue; 
      }

      let targetP = state1.pointPieces.sort((a,b) => getPieceValue(b.type) - getPieceValue(a.type))[0];
      let dist = Math.abs(state1.lazerPos.r - targetP.r) + Math.abs(state1.lazerPos.c - targetP.c);
      
      dist += (Math.random() - 0.5) * 2; // Random noise

      if (role === 'attacker') {
        let hasStraightShot = false;
        const trace = traceLaserBeam(b1, state1.lazerPos, state1.lazerDir);
        if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
           const usesMirrors = trace.path.some(p => p.type === 'mirror-bounce');
           if (!usesMirrors) hasStraightShot = true;
        }

        // Massively reward a direct, mirror-less shot to make the bot turn and fire
        if (hasStraightShot) {
           dist -= 1000;
        }

        if (dist < bestScore) {
           bestScore = dist;
           bestAction = action;
        }
      } else {
        if (dist > bestScore) {
           bestScore = dist;
           bestAction = action;
        }
      }
    }

    if (bestAction && Math.random() < 0.8) return bestAction;
    return actions[Math.floor(Math.random() * actions.length)];
  }
};

export const MediumStrategy = {
  getSetupAction: (board, phase, playerColor, challengedPiece) => {
    return genericSetupAction(board, phase, 'medium', challengedPiece);
  },
  getPlayAction: (board, role, actionPoints, gameState, botPlayer) => {
    // True Mix: 50% chance to use the physical-only Easy logic for this move
    if (Math.random() < 0.5) {
      return EasyStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
    }

    // Otherwise, use the advanced Threat Map (like Hard), but only looking 1 step ahead
    const cautiousness = getCautiousness(gameState, botPlayer);
    const evalFn = role === 'attacker' ? evaluateBoardAttacker : evaluateBoardDefender;
    const currentScore = evalFn(board, cautiousness);
    const { bestAction, bestScore } = findBestActionSequence(board, role, 1, evalFn, cautiousness);
    
    // 20% chance to take a suboptimal move if it doesn't immediately improve the score
    if (bestAction && (bestScore >= currentScore || Math.random() < 0.2)) {
      return bestAction;
    }
    return null;
  }
};

export const HardStrategy = {
  getSetupAction: (board, phase, playerColor, challengedPiece) => {
    return genericSetupAction(board, phase, 'hard', challengedPiece);
  },
  getPlayAction: (board, role, actionPoints, gameState, botPlayer) => {
    const cautiousness = getCautiousness(gameState, botPlayer);
    const depth = Math.min(actionPoints, 2); 
    const evalFn = role === 'attacker' ? evaluateBoardAttacker : evaluateBoardDefender;
    
    const currentScore = evalFn(board, cautiousness);
    const { bestAction, bestScore } = findBestActionSequence(board, role, depth, evalFn, cautiousness);
    
    if (bestAction && bestScore > -Infinity) {
      return bestAction;
    }
    return null;
  }
};

// Generic Setup logic extracted from original
function genericSetupAction(board, phase, difficulty, challengedPiece) {
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
        let chosenCell = legalCells[Math.floor(Math.random() * legalCells.length)];
        return { type: 'place', pieceType: nextPieceType, r: chosenCell.r, c: chosenCell.c };
      }

      const sortedCells = legalCells.sort((a, b) => {
        let coverA = 0; let coverB = 0;
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        dirs.forEach(([dr, dc]) => {
          const nrA = a.r + dr, ncA = a.c + dc;
          if (nrA < 0 || nrA >= BOARD_SIZE || ncA < 0 || ncA >= BOARD_SIZE) coverA += 0.5;
          else if (board[nrA][ncA] !== null) coverA += 1;
          
          const nrB = b.r + dr, ncB = b.c + dc;
          if (nrB < 0 || nrB >= BOARD_SIZE || ncB < 0 || ncB >= BOARD_SIZE) coverB += 0.5;
          else if (board[nrB][ncB] !== null) coverB += 1;
        });

        const distA = Math.abs(a.r - 3.5) + Math.abs(a.c - 3.5);
        const distB = Math.abs(b.r - 3.5) + Math.abs(b.c - 3.5);

        if (difficulty === 'medium') return (coverB - coverA) * 2 + (distA - distB);
        else return (coverB - coverA) * 5 + (distB - distA);
      });

      const chosenCell = sortedCells[0];
      return { type: 'place', pieceType: nextPieceType, r: chosenCell.r, c: chosenCell.c };
    }
  } 
  
  else if (phase === 'setup-attacker') {
    let lazerPlaced = false;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] && board[r][c].type === BLOCK_TYPES.BLOCK_LAZER) {
          lazerPlaced = true;
          break;
        }
      }
      if (lazerPlaced) break;
    }
    
    if (lazerPlaced) return { type: 'confirm-setup' };

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
          
          let score = trace.path.length;
          if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
            score += 1000;
          }
          
          const mirrorBounces = trace.path.filter(p => p.type === 'mirror-bounce').length;
          score += mirrorBounces * 50;
          
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
