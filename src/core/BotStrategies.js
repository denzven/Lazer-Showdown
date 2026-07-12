import { 
  BOARD_SIZE, 
  BLOCK_TYPES, 
  validatePlacement,
  validateMovement,
  traceLaserBeam 
} from './Ruleset.js';

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

export function calculateMobility(board, role) {
  return getPossibleActions(board, role).length;
}

export function calculateCenterControl(board) {
  const { lazerPos, pointPieces } = getBoardState(board);
  let score = 0;
  if (lazerPos) {
    score -= (Math.abs(lazerPos.r - 3.5) + Math.abs(lazerPos.c - 3.5));
  }
  pointPieces.forEach(p => {
    score += (Math.abs(p.r - 3.5) + Math.abs(p.c - 3.5));
  });
  return score;
}

export function calculateMirrorUtilization(board) {
  let totalMirrors = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] && board[r][c].type === BLOCK_TYPES.BLOCK_MIRROR) {
        totalMirrors++;
      }
    }
  }
  if (totalMirrors === 0) return 0;

  const { lazerPos, lazerDir } = getBoardState(board);
  if (!lazerPos) return 0;

  const trace = traceLaserBeam(board, lazerPos, lazerDir);
  const usedMirrors = trace.path.filter(p => p.type === 'mirror-bounce').length;
  
  return usedMirrors / totalMirrors;
}

export function getPrimaryTarget(board) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  if (!lazerPos || pointPieces.length === 0) return null;

  const trace = traceLaserBeam(board, lazerPos, lazerDir);
  if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
    return { type: trace.hitPiece.cell.type, r: trace.hitPiece.r, c: trace.hitPiece.c, isHit: true, apToHit: 1 };
  }

  const rotations = [0, 90, 180, 270];
  let minAPToHit = 999;
  let highestValueTarget = null;

  for (const p of pointPieces) {
    let pieceAP = 999;
    for (const rot of rotations) {
      const t = traceLaserBeam(board, lazerPos, rot);
      if (t.hitPiece && t.hitPiece.r === p.r && t.hitPiece.c === p.c) {
        const ap = (rot === lazerDir) ? 1 : 2; 
        if (ap < pieceAP) pieceAP = ap;
      }
    }
    for (const rot of rotations) {
      const t = traceLaserBeam(board, p, rot);
      for (const step of t.path) {
        if (step.type === 'beam') {
          const r = step.r;
          const c = step.c;
          if (r === lazerPos.r && c === lazerPos.c) continue; 
          if (board[r][c] === null) { 
            const moveDist = Math.abs(lazerPos.r - r) + Math.abs(lazerPos.c - c);
            const ap = moveDist + 2; 
            if (ap < pieceAP) pieceAP = ap;
          }
        }
      }
    }
    
    if (pieceAP < 999) {
      if (!highestValueTarget || getPieceValue(p.type) > getPieceValue(highestValueTarget.type)) {
        highestValueTarget = p;
        minAPToHit = pieceAP;
      } else if (getPieceValue(p.type) === getPieceValue(highestValueTarget.type) && pieceAP < minAPToHit) {
        minAPToHit = pieceAP;
      }
    }
  }

  if (highestValueTarget) {
    return { type: highestValueTarget.type, r: highestValueTarget.r, c: highestValueTarget.c, isHit: false, apToHit: minAPToHit };
  }
  return null;
}

// Evaluate board for Medium Attacker (Lizbishmir: True Blended Heuristic)
function evaluateMediumAttacker(board, cautiousness = 1.0) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  if (!lazerPos) return -99999;
  
  let score = 0;
  
  const remainingTypes = pointPieces.map(p => p.type);
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_50)) score += 50000;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_30)) score += 30000;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_20)) score += 20000;

  if (pointPieces.length === 0) return score + 100000;

  let targetPiece = pointPieces.sort((a, b) => getPieceValue(b.type) - getPieceValue(a.type))[0];

  // Easy Bot Logic: Penalize physical distance heavily so she marches
  const manhattanDist = Math.abs(lazerPos.r - targetPiece.r) + Math.abs(lazerPos.c - targetPiece.c);
  score -= manhattanDist * 100;

  // Hard Bot Logic: Capture reward
  const trace = traceLaserBeam(board, lazerPos, lazerDir);
  if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
     score += getPieceValue(trace.hitPiece.cell.type) * 2 * cautiousness; 
     
     // Easy Bot Logic: Straight-shot bonus
     const usesMirrors = trace.path.some(p => p.type === 'mirror-bounce');
     if (!usesMirrors) {
        score += 1000; 
     }
  }

  return score;
}

// Evaluate board for Attacker (higher is better for attacker)
export function evaluateBoardAttacker(board, cautiousness = 1.0) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  if (!lazerPos) return -99999;
  
  let score = 0;
  
  // 1. Base score for having point pieces off the board (captured)
  const remainingTypes = pointPieces.map(p => p.type);
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_50)) score += 50000;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_30)) score += 30000;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_20)) score += 20000;

  if (pointPieces.length === 0) return score + 100000; // Win state

  // 2. Maximize threat against pieces on the board using the unified threat map
  const threats = getPieceThreatLevels(board);
  for (const t of threats) {
     // A 100% threat level translates to a high bonus, encouraging positioning that ensures a hit
     score += getPieceValue(t.type) * 2 * t.threatLevel; 
  }

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

  score += calculateMobility(board, 'attacker') * 5;
  score += calculateCenterControl(board) * 10;

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

// Evaluate board for Medium Defender (Lizbishmir: True Blended Heuristic)
function evaluateMediumDefender(board, cautiousness = 1.0) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  let score = 0;

  for (const p of pointPieces) {
    score += getPieceValue(p.type) * 10;
  }

  const threats = getPieceThreatLevels(board);
  for (const t of threats) {
    // Apply threat penalty (Medium considers this directly via the threat map)
    score -= getPieceValue(t.type) * 20 * t.threatLevel * cautiousness;
  }

  for (const p of pointPieces) {
    if (lazerPos) {
      // Easy Bot Logic: Maximize physical distance to Lazer
      const physicalDistToLazer = Math.abs(lazerPos.r - p.r) + Math.abs(lazerPos.c - p.c);
      score += physicalDistToLazer * 10;
    }
    
    // Avoid bunching of defence system
    for (const otherP of pointPieces) {
      if (otherP !== p) {
        const dist = Math.abs(p.r - otherP.r) + Math.abs(p.c - otherP.c);
        if (dist <= 2) {
          score -= 25; // Penalty for bunching
        }
      }
    }
  }

  return score;
}

// Evaluate board for Defender (higher is better for defender)
export function evaluateBoardDefender(board, cautiousness = 1.0) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  let score = 0;

  // 1. Base score for surviving pieces
  for (const p of pointPieces) {
    score += getPieceValue(p.type) * 10;
  }

  // Check the threat of all pieces on the board directly using the unified threat map
  const threats = getPieceThreatLevels(board);
  for (const t of threats) {
    score -= getPieceValue(t.type) * 20 * t.threatLevel * cautiousness;
  }

  // Calculate Clustering Penalty and Collinear Penalty
  for (let i = 0; i < pointPieces.length; i++) {
    for (let j = i + 1; j < pointPieces.length; j++) {
      const p1 = pointPieces[i];
      const p2 = pointPieces[j];
      const dist = Math.abs(p1.r - p2.r) + Math.abs(p1.c - p2.c);
      if (dist <= 2) {
        score -= 50; // Severe penalty for clustering
      }
      if (p1.r === p2.r) {
         const minC = Math.min(p1.c, p2.c);
         const maxC = Math.max(p1.c, p2.c);
         let blocked = false;
         for (let c = minC + 1; c < maxC; c++) {
            if (board[p1.r][c] !== null && board[p1.r][c].type === BLOCK_TYPES.BLOCK_MIRROR) blocked = true;
         }
         if (!blocked) score -= 30;
      }
      if (p1.c === p2.c) {
         const minR = Math.min(p1.r, p2.r);
         const maxR = Math.max(p1.r, p2.r);
         let blocked = false;
         for (let r = minR + 1; r < maxR; r++) {
            if (board[r][p1.c] !== null && board[r][p1.c].type === BLOCK_TYPES.BLOCK_MIRROR) blocked = true;
         }
         if (!blocked) score -= 30;
      }
    }
  }

  score += calculateMobility(board, 'defender') * 5;
  score -= calculateCenterControl(board) * 10;

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

    if (currentScore > bestScore || (currentScore === bestScore && Math.random() < 0.5)) {
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

    const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
    if (!lazerPos || pointPieces.length === 0) {
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

      if (role === 'attacker') {
        if (action.type === 'laser-press') {
          const currentTrace = traceLaserBeam(board, lazerPos, lazerDir);
          if (currentTrace.hitPiece && !currentTrace.path.some(p => p.type === 'mirror-bounce')) {
            return action; 
          }
        }

        if (dist < bestScore || (dist === bestScore && Math.random() < 0.5)) {
           bestScore = dist;
           bestAction = action;
        }
      } else {
        if (dist > bestScore || (dist === bestScore && Math.random() < 0.5)) {
           bestScore = dist;
           bestAction = action;
        }
      }
    }

    return bestAction || actions[Math.floor(Math.random() * actions.length)];
  }
};

export const MediumStrategy = {
  getSetupAction: (board, phase, playerColor, challengedPiece) => {
    return genericSetupAction(board, phase, 'medium', challengedPiece);
  },
  getPlayAction: (board, role, actionPoints, gameState, botPlayer) => {
    const cautiousness = getCautiousness(gameState, botPlayer);
    const evalFn = role === 'attacker' ? evaluateMediumAttacker : evaluateMediumDefender;
    const currentScore = evalFn(board, cautiousness);
    
    // Lizbishmir is methodical and rarely makes mistakes. Depth 1, strictly optimal.
    const { bestAction, bestScore } = findBestActionSequence(board, role, 1, evalFn, cautiousness);
    
    if (bestAction && bestScore >= currentScore) {
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
    
    // Only perform the action if it improves our situation
    if (bestAction && bestScore > currentScore) {
      return bestAction;
    }
    return null; // Will trigger 'end-turn' in useGame.js
  }
};

// --- ANALYSIS TOOLS ---
export function generatePossibilityWeb(board) {
  const { lazerPos } = getBoardState(board);
  const webPaths = [];
  const rotations = [0, 90, 180, 270];

  if (!lazerPos) {
    const corners = [
      { r: 0, c: 0, dirs: [90, 180], id: 'TL' },
      { r: 0, c: 7, dirs: [180, 270], id: 'TR' },
      { r: 7, c: 0, dirs: [0, 90], id: 'BL' },
      { r: 7, c: 7, dirs: [270, 0], id: 'BR' }
    ];
    for (const corner of corners) {
      if (board[corner.r][corner.c] !== null) continue;
      for (const rot of corner.dirs) {
        const tempBoard = board.map(row => [...row]);
        tempBoard[corner.r][corner.c] = { type: BLOCK_TYPES.BLOCK_LAZER, rotation: rot };
        const trace = traceLaserBeam(tempBoard, corner, rot);
        webPaths.push({ source: corner.id, path: [corner, ...trace.path] });
      }
    }
    return webPaths;
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] !== null && !(r === lazerPos.r && c === lazerPos.c)) continue; 
      
      for (const rot of rotations) {
        const trace = traceLaserBeam(board, { r, c }, rot);
        webPaths.push({ source: rot.toString(), path: [{ r, c }, ...trace.path] });
      }
    }
  }
  
  return webPaths;
}

export function generateThreatMap(board) {
  const { lazerPos, lazerDir } = getBoardState(board);
  const map = Array(8).fill(null).map(() => Array(8).fill(null).map(() => ({ total: 0, sources: {} })));
  const rotations = [0, 90, 180, 270];

  if (!lazerPos) {
    // Generate initial nodal heatmap from the 4 corners
    const corners = [
      { r: 0, c: 0, dirs: [90, 180], id: 'TL' },
      { r: 0, c: 7, dirs: [180, 270], id: 'TR' },
      { r: 7, c: 0, dirs: [0, 90], id: 'BL' },
      { r: 7, c: 7, dirs: [270, 0], id: 'BR' }
    ];

    const minAPMap = Array(8).fill(null).map(() => 
      Array(8).fill(null).map(() => ({ 'TL': 999, 'TR': 999, 'BL': 999, 'BR': 999 }))
    );

    for (const corner of corners) {
      if (board[corner.r][corner.c] !== null) continue;

      for (let lr = 0; lr < 8; lr++) {
        for (let lc = 0; lc < 8; lc++) {
          if (board[lr][lc] !== null && !(lr === corner.r && lc === corner.c)) continue;
          
          const moveDist = Math.abs(corner.r - lr) + Math.abs(corner.c - lc);
          
          for (const rot of rotations) {
            const minRotationCost = Math.min(...corner.dirs.map(d => {
              let rotDiff = Math.abs(d - rot);
              if (rotDiff > 180) rotDiff = 360 - rotDiff;
              return rotDiff / 90;
            }));
            const apCost = moveDist + minRotationCost + 1; // 1 AP to shoot
            
            const trace = traceLaserBeam(board, { r: lr, c: lc }, rot);
            for (const step of trace.path) {
              if (step.r >= 0 && step.r < 8 && step.c >= 0 && step.c < 8) {
                if (apCost < minAPMap[step.r][step.c][corner.id]) {
                  minAPMap[step.r][step.c][corner.id] = apCost;
                }
              }
            }
          }
        }
      }
    }

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c] === null || board[r][c].type !== 'mirror') {
          let maxProb = 0;
          for (const corner of corners) {
            if (minAPMap[r][c][corner.id] < 999) {
              const prob = get2d6CumulativeProbability(minAPMap[r][c][corner.id]);
              map[r][c].sources[corner.id] = prob;
              if (prob > maxProb) maxProb = prob;
            }
          }
          if (maxProb > 0) {
            map[r][c].total = maxProb;
          }
        }
      }
    }
    return map;
  }

  const minAPMap = Array(8).fill(null).map(() => 
    Array(8).fill(null).map(() => ({ 0: 999, 90: 999, 180: 999, 270: 999 }))
  );

  for (let lr = 0; lr < 8; lr++) {
    for (let lc = 0; lc < 8; lc++) {
      if (board[lr][lc] !== null && !(lr === lazerPos.r && lc === lazerPos.c)) continue;
      
      const moveDist = Math.abs(lazerPos.r - lr) + Math.abs(lazerPos.c - lc);
      
      for (const rot of rotations) {
        let rotDiff = Math.abs(lazerDir - rot);
        if (rotDiff > 180) rotDiff = 360 - rotDiff;
        const rotationCost = rotDiff / 90;
        
        const apCost = moveDist + rotationCost + 1; // 1 AP to shoot
        
        const trace = traceLaserBeam(board, { r: lr, c: lc }, rot);
        for (const step of trace.path) {
          if (step.r >= 0 && step.r < 8 && step.c >= 0 && step.c < 8) {
            if (apCost < minAPMap[step.r][step.c][rot]) {
              minAPMap[step.r][step.c][rot] = apCost;
            }
          }
        }
      }
    }
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === null || board[r][c].type !== 'mirror') {
        let maxProb = 0;
        let cumulativeP = 1;
        for (const rot of rotations) {
          if (minAPMap[r][c][rot] < 999) {
            const prob = get2d6CumulativeProbability(minAPMap[r][c][rot]);
            map[r][c].sources[rot.toString()] = prob;
            if (prob > maxProb) maxProb = prob;
            cumulativeP *= (1 - prob);
          }
        }
        if (maxProb > 0) {
          map[r][c].total = maxProb;
        }
      }
    }
  }

  return map;
}

export function classifyMove(beforeScore, afterScore, turnPlayer) {
  // beforeScore and afterScore are calculated from the actor's perspective, 
  // so a positive diff means the move improved their position!
  let diff = afterScore - beforeScore;

  if (diff >= 0) return { label: 'Best Move', color: '#39ff14' };
  if (diff >= -500) return { label: 'Excellent', color: '#00f0ff' };
  if (diff >= -2000) return { label: 'Good', color: '#ffff00' };
  if (diff >= -5000) return { label: 'Inaccuracy', color: '#ffcc00' };
  if (diff >= -10000) return { label: 'Mistake', color: '#ff5500' };
  return { label: 'Blunder', color: '#ff003c' };
}

export function getChallengeRecommendation(capturedPieces, round, actionPoints, attackerScore, defenderScore, setNum) {
  const availableValues = [];
  if (capturedPieces.includes(BLOCK_TYPES.BLOCK_50)) availableValues.push(50);
  if (capturedPieces.includes(BLOCK_TYPES.BLOCK_30)) availableValues.push(30);
  if (capturedPieces.includes(BLOCK_TYPES.BLOCK_20)) availableValues.push(20);
  
  if (availableValues.length === 0) {
     return {
        recommend: false,
        probability: 0,
        reason: 'No pieces captured to challenge for.',
        suggestedPiece: null
     };
  }
  
  availableValues.sort((a, b) => a - b); // Ascending order
  
  const roundsRemaining = 3 - round;
  const totalApproxAP = roundsRemaining * 7; 

  let probCaptureIfWin = 0;
  if (totalApproxAP >= 10) probCaptureIfWin = 0.9;
  else if (totalApproxAP >= 7) probCaptureIfWin = 0.6;
  else if (totalApproxAP >= 4) probCaptureIfWin = 0.3;
  else probCaptureIfWin = 0.05;

  let probability = Math.round(probCaptureIfWin * 100);

  // SET 1 LOGIC: Defender hasn't scored yet. Maximize points safely.
  if (setNum === 1) {
    if (probCaptureIfWin < 0.6) {
      return {
        recommend: false,
        probability,
        reason: `Too risky! Only ~${totalApproxAP} expected AP left. You don't have enough time to safely recapture a piece.`,
        suggestedPiece: `block-${availableValues[availableValues.length - 1]}`
      };
    }
    
    // Find a piece that won't ruin our score if we lose the toss.
    // Rule of thumb: Don't wager more than half your current score if possible.
    let targetV = availableValues[0];
    for (let i = availableValues.length - 1; i >= 0; i--) {
      if (availableValues[i] <= attackerScore / 2) {
        targetV = availableValues[i];
        break;
      }
    }
    
    return {
      recommend: true,
      probability,
      reason: `You have plenty of AP (~${totalApproxAP}). Challenging the ${targetV}pt piece safely pads your Set 1 score without risking a devastating penalty.`,
      suggestedPiece: `block-${targetV}`
    };
  }
  
  // SET 2 LOGIC: We know exactly what we need to win.
  const scoreDeficit = defenderScore - attackerScore;
  
  if (scoreDeficit <= 0) {
     return {
       recommend: false,
       probability,
       reason: `You are already winning by ${-scoreDeficit} pts (or tied). Do not risk your lead!`,
       suggestedPiece: `block-${availableValues[0]}`
     };
  }
  
  // We are losing. Find the SMALLEST piece that wins or ties the game.
  let targetV = null;
  for (const v of availableValues) {
    if (v >= scoreDeficit) {
      targetV = v;
      break;
    }
  }
  
  if (targetV !== null) {
     return {
       recommend: true,
       probability,
       reason: `You are behind by ${scoreDeficit} pts! Challenging the ${targetV}pt piece is the safest exact wager to tie/win the game.`,
       suggestedPiece: `block-${targetV}`
     };
  } else {
     // No single piece can save us. Pick the largest as a desperation play.
     const maxV = availableValues[availableValues.length - 1];
     return {
       recommend: probCaptureIfWin >= 0.3,
       probability,
       reason: `You are behind by ${scoreDeficit} pts. Even the ${maxV}pt piece won't secure a win, but it's your best desperation play.`,
       suggestedPiece: `block-${maxV}`
     };
  }
}

export function getPieceThreatLevels(board) {
  const map = generateThreatMap(board);
  const threats = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
        threats.push({
          r, c,
          type: cell.type,
          threatLevel: map[r][c].total || 0
        });
      }
    }
  }
  return threats.sort((a, b) => b.threatLevel - a.threatLevel);
}

export function classifyPlay(sequence, engineType) {
  const hasFire = sequence.some(a => a.type === 'laser-press');
  const hasMove = sequence.some(a => a.type === 'move');
  const hasRotate = sequence.some(a => a.type === 'rotate');
  
  if (engineType === 'neural') {
    if (hasFire && hasMove) return "Neural Strike Matrix";
    if (hasFire && hasRotate) return "Vector Re-alignment";
    if (hasFire) return "High-Probability Endstate";
    if (hasMove && hasRotate) return "State Minimization Delta";
    if (hasMove) return "Deep Value Extraction";
    if (hasRotate) return "Pattern Match Pivot";
    return "Neural Heuristic";
  } else {
    if (hasFire && hasMove) return "Flank & Fire";
    if (hasFire && hasRotate) return "Aim & Fire";
    if (hasFire) return "Direct Strike";
    if (hasMove && hasRotate) return "Tactical Repositioning";
    if (hasMove) return "Positional Setup";
    if (hasRotate) return "Lazer Re-orientation";
    return "Strategic Maneuver";
  }
}

export function formatActionText(action) {
  if (action.type === 'place') return `Place ${action.pieceType.replace('block-', '')}pt at (${action.r}, ${action.c})`;
  if (action.type === 'laser-press') return 'Fire Lazer!';
  if (action.type === 'move') return `Move to (${action.toR}, ${action.toC})`;
  if (action.type === 'rotate') return `Rotate ${action.dir === 'cw' ? 'CW' : 'CCW'}`;
  return 'Unknown Move';
}

export function getEngineLines(board, role, difficulty, gameState) {
  const cautiousness = getCautiousness(gameState, gameState.turnPlayer);
  let evalFn = difficulty === 'medium' 
    ? (role === 'attacker' ? evaluateMediumAttacker : evaluateMediumDefender)
    : (role === 'attacker' ? evaluateBoardAttacker : evaluateBoardDefender);

  const maxDepth = Math.min(gameState?.actionPoints || 2, 2); // Cap at depth 2 for sync math engine
  const evaluatedPlays = [];

  function generatePlays(currentBoard, currentDepth, currentSequence) {
    if (currentDepth === 0) {
      evaluatedPlays.push({ sequence: currentSequence, board: currentBoard });
      return;
    }
    
    const possibleActions = getPossibleActions(currentBoard, role);
    if (possibleActions.length === 0) {
      evaluatedPlays.push({ sequence: currentSequence, board: currentBoard });
      return;
    }

    for (const act of possibleActions) {
      let nextBoard = act.type === 'laser-press' ? currentBoard : applyLightweightAction(currentBoard, act);
      const nextSeq = [...currentSequence, act];
      if (act.type === 'laser-press') {
        evaluatedPlays.push({ sequence: nextSeq, board: nextBoard });
      } else {
        generatePlays(nextBoard, currentDepth - 1, nextSeq);
      }
    }
  }

  generatePlays(board, maxDepth, []);

  // Evaluate the final board state of each play sequence
  for (const play of evaluatedPlays) {
    let score = evalFn(play.board, cautiousness);

    // Opponent worst-case response (depth 1 lookahead for opponent)
    const oppRole = role === 'attacker' ? 'defender' : 'attacker';
    const oppActions = getPossibleActions(play.board, oppRole);
    let worstCaseOppScore = Infinity;
    
    if (oppActions.length > 0) {
      // Pick top 5 opponent actions to save sync time
      const oppEvals = oppActions.slice(0, 5).map(act => {
        const b2 = applyLightweightAction(play.board, act);
        return evalFn(b2, cautiousness);
      });
      worstCaseOppScore = Math.min(...oppEvals);
      score = worstCaseOppScore;
    }

    play.score = score;
    play.name = classifyPlay(play.sequence, role, 'math');
  }

  evaluatedPlays.sort((a, b) => b.score - a.score);

  // Return formatted unique top 3 plays
  const uniquePlays = [];
  const seenNames = new Set();
  for (const p of evaluatedPlays) {
    const sig = p.sequence.map(formatActionText).join('->');
    if (!seenNames.has(sig)) {
      seenNames.add(sig);
      uniquePlays.push(p);
      if (uniquePlays.length >= 3) break;
    }
  }

  return uniquePlays.map(p => ({
    name: p.name,
    sequence: p.sequence,
    formattedSteps: p.sequence.map(formatActionText),
    score: Math.round(p.score)
  }));
}

export function getBoardAnalysis(board, role, difficulty, gameState, botPlayer) {
  const cautiousness = getCautiousness(gameState, botPlayer);
  let evalFn;
  if (difficulty === 'medium') {
    evalFn = role === 'attacker' ? evaluateMediumAttacker : evaluateMediumDefender;
  } else {
    evalFn = role === 'attacker' ? evaluateBoardAttacker : evaluateBoardDefender;
  }
  
  // Note: For a true vector breakdown, we would rewrite the eval functions to return objects.
  // For now, we will return the total score and the raw calculated variables if possible.
  const totalScore = evalFn(board, cautiousness);

  const { pointPieces } = getBoardState(board);
  const behaviorWarnings = [];

  if (role === 'defender' && pointPieces.length >= 2) {
    for (let i = 0; i < pointPieces.length; i++) {
      for (let j = i + 1; j < pointPieces.length; j++) {
        const p1 = pointPieces[i];
        const p2 = pointPieces[j];
        
        // Clustered Defense
        const dist = Math.abs(p1.r - p2.r) + Math.abs(p1.c - p2.c);
        if (dist <= 2) {
          if (!behaviorWarnings.some(w => w.type === 'clustered')) {
            behaviorWarnings.push({ type: 'clustered', message: 'Clustered Defense: Pieces are dangerously close, vulnerable to splash damage or easy consecutive hits.' });
          }
        }

        // Collinear Vulnerability
        if (p1.r === p2.r) {
           const minC = Math.min(p1.c, p2.c);
           const maxC = Math.max(p1.c, p2.c);
           let blocked = false;
           for (let c = minC + 1; c < maxC; c++) {
              if (board[p1.r][c] !== null && board[p1.r][c].type === BLOCK_TYPES.BLOCK_MIRROR) blocked = true;
           }
           if (!blocked && !behaviorWarnings.some(w => w.type === 'collinear')) {
              behaviorWarnings.push({ type: 'collinear', message: 'Collinear Vulnerability: Pieces are in the same row without mirror protection.' });
           }
        }
        if (p1.c === p2.c) {
           const minR = Math.min(p1.r, p2.r);
           const maxR = Math.max(p1.r, p2.r);
           let blocked = false;
           for (let r = minR + 1; r < maxR; r++) {
              if (board[r][p1.c] !== null && board[r][p1.c].type === BLOCK_TYPES.BLOCK_MIRROR) blocked = true;
           }
           if (!blocked && !behaviorWarnings.some(w => w.type === 'collinear')) {
              behaviorWarnings.push({ type: 'collinear', message: 'Collinear Vulnerability: Pieces are in the same column without mirror protection.' });
           }
        }
      }
    }
  }

  const advancedMetrics = {
    attackerMobility: calculateMobility(board, 'attacker'),
    defenderMobility: calculateMobility(board, 'defender'),
    centerControl: calculateCenterControl(board),
    mirrorUtilization: calculateMirrorUtilization(board),
    primaryTarget: getPrimaryTarget(board),
    turnStats: gameState && gameState.turnStats ? gameState.turnStats : null
  };

  return { totalScore, cautiousness, difficulty, role, behaviorWarnings, advancedMetrics };
}



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
        let scoreA = 0; let scoreB = 0;
        
        // Find existing point pieces
        const existingPieces = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== null && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(board[r][c].type)) {
              existingPieces.push({ r, c });
            }
          }
        }

        const threatMap = difficulty === 'hard' ? generateThreatMap(board) : null;

        const evaluateCell = (cell) => {
          let score = 0;
          
          // Cover logic (being near edges is good, near pieces is mixed)
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          let cover = 0;
          dirs.forEach(([dr, dc]) => {
            const nr = cell.r + dr, nc = cell.c + dc;
            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) cover += 0.5; // Edges are good
          });
          score += cover * 2;

          // Distance from center (Corners are generally safer)
          const distFromCenter = Math.abs(cell.r - 3.5) + Math.abs(cell.c - 3.5);
          score += distFromCenter;

          if (difficulty === 'hard') {
            // Actively avoid high-threat baseline locations
            if (threatMap) {
               score -= (threatMap[cell.r][cell.c].total * 50);
            }

            // Dispersion Bonus / Anti-Clustering Penalty
            existingPieces.forEach(p => {
              const dist = Math.abs(cell.r - p.r) + Math.abs(cell.c - p.c);
              if (dist <= 2) {
                score -= 50; // Severe penalty for clustering
              } else {
                score += dist * 2; // Bonus for dispersion
              }

              // Collinear Penalty
              if (cell.r === p.r || cell.c === p.c) {
                score -= 30; // High penalty for straight lines
              }
            });
          } else {
            // Except positions that are lower than 6 ap from all corners
            const dists = [
              Math.abs(cell.r - 0) + Math.abs(cell.c - 0),
              Math.abs(cell.r - 0) + Math.abs(cell.c - 7),
              Math.abs(cell.r - 7) + Math.abs(cell.c - 0),
              Math.abs(cell.r - 7) + Math.abs(cell.c - 7)
            ];
            if (dists.some(d => d < 6)) {
              score -= 500;
            }
          }
          
          // Introduce randomness to starting positions for all difficulties to ensure variety
          score += Math.random() * 100;
          
          return score;
        };

        return evaluateCell(b) - evaluateCell(a);
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
            if (trace.hitPiece.cell.type === BLOCK_TYPES.BLOCK_50) score += 500;
            if (trace.hitPiece.cell.type === BLOCK_TYPES.BLOCK_30) score += 200;
          } else {
            // If no direct hit, evaluate distance to the highest value piece on board
            let bestDistScore = 0;
            for (let r = 0; r < 8; r++) {
              for (let c = 0; c < 8; c++) {
                const cell = board[r][c];
                if (cell && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
                  let weight = 1;
                  if (cell.type === BLOCK_TYPES.BLOCK_50) weight = 5;
                  if (cell.type === BLOCK_TYPES.BLOCK_30) weight = 3;
                  // Calculate Manhattan distance from the corner
                  const dist = Math.abs(corner.r - r) + Math.abs(corner.c - c);
                  const distScore = (16 - dist) * weight;
                  if (distScore > bestDistScore) bestDistScore = distScore;
                }
              }
            }
            score += bestDistScore;
          }
          
          const mirrorBounces = trace.path.filter(p => p.type === 'mirror-bounce').length;
          score += mirrorBounces * 50;
          
          // Add some randomness to encourage different lazer rotations/positions instead of strictly deterministic
          score += Math.random() * 600;

          if (score > bestScore || (score === bestScore && Math.random() < 0.5)) {
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
