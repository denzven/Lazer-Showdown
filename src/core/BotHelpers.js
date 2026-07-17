import { 
  BOARD_SIZE, 
  BLOCK_TYPES, 
  validatePlacement,
  validateMovement,
  traceLaserBeam 
} from './Ruleset.js';

export {
  BOARD_SIZE, 
  BLOCK_TYPES, 
  validatePlacement,
  validateMovement,
  traceLaserBeam 
};

// Threat map memoization cache
let _threatMapCache = { key: null, map: null };

// Default evaluation weights for bots
export const DEFAULT_WEIGHTS = {
  // Attacker Weights
  attCapture50Bonus: 50000,
  attCapture30Bonus: 30000,
  attCapture20Bonus: 20000,
  attWinBonus: 100000,
  attThreatMultiplier: 2,
  attApproachPenaltyMultiplier: 3,
  attApproachThreshold: 0.7,
  attImmediateCaptureMultiplier: 2,
  attMirrorBounceBonus: 10,
  attMobilityBonus: 5,
  attCenterControlBonus: 10,
  attTrapBonusMultiplier: 1.0,
  attEscapePenaltyMultiplier: 0.5,

  // Defender Weights
  defSurvivalMultiplier: 10,
  defThreatPenaltyMultiplier: 20,
  defClusterPenalty: 50,
  defCollinearPenalty: 30,
  defMobilityBonus: 5,
  defCenterControlPenalty: 10,
  defSafetyStepPenaltyMultiplier: 0.12,
};

// Core Helper: Extract board information
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

// Core Helper: List legal action choices
export function getPossibleActions(board, role) {
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

// Core Helper: Clone board & apply action (non-mutating lookahead)
export function applyLightweightAction(board, action) {
  const newBoard = board.map(row => row.slice());
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

export function getPieceValue(type) {
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

export function computeSafetySteps(board, startR, startC, threatMap, threshold = 0.25) {
  if (threatMap[startR][startC].total <= threshold) return 0;

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const visited = new Set();
  visited.add(`${startR},${startC}`);
  const queue = [{ r: startR, c: startC, dist: 0 }];

  while (queue.length > 0) {
    const { r, c, dist } = queue.shift();
    if (dist >= 10) continue; 

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
      if (visited.has(key)) continue;
      visited.add(key);
      if (board[nr][nc] !== null) continue; 
      if (threatMap[nr][nc].total <= threshold) return dist + 1; 
      queue.push({ r: nr, c: nc, dist: dist + 1 });
    }
  }

  return 10; 
}

export function getReverseFiringCells(board, targetR, targetC) {
  const cells = new Set();
  for (const rot of [0, 90, 180, 270]) {
    const trace = traceLaserBeam(board, { r: targetR, c: targetC }, rot);
    for (const step of trace.path) {
      if (step.type === 'beam' && board[step.r][step.c] === null) {
        cells.add(`${step.r},${step.c}`);
      }
    }
  }
  return cells;
}

export function bfsToNearestFiringCell(board, lazerPos, firingCells) {
  const startKey = `${lazerPos.r},${lazerPos.c}`;
  if (firingCells.has(startKey)) return { steps: 0, firstStep: null, firingPos: lazerPos };

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const visited = new Set([startKey]);
  const queue = [{ r: lazerPos.r, c: lazerPos.c, steps: 0, firstStep: null }];

  while (queue.length > 0) {
    const { r, c, steps, firstStep } = queue.shift();
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) continue;
      if (visited.has(key)) continue;
      if (board[nr][nc] !== null) continue; 
      visited.add(key);
      const nextFirstStep = firstStep ?? { r: nr, c: nc };
      if (firingCells.has(key)) {
        return { steps: steps + 1, firstStep: nextFirstStep, firingPos: { r: nr, c: nc } };
      }
      queue.push({ r: nr, c: nc, steps: steps + 1, firstStep: nextFirstStep });
    }
  }
  return null; 
}

export function evaluateMediumAttacker(board, cautiousness = 1.0) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  if (!lazerPos) return -99999;
  
  let score = 0;
  
  const remainingTypes = pointPieces.map(p => p.type);
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_50)) score += 50000;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_30)) score += 30000;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_20)) score += 20000;

  if (pointPieces.length === 0) return score + 100000;

  let targetPiece = pointPieces.sort((a, b) => getPieceValue(b.type) - getPieceValue(a.type))[0];
  const fireTarget = getPrimaryTarget(board);
  if (fireTarget) {
    if (fireTarget.isHit) {
      score += getPieceValue(fireTarget.type) * 3;
    } else {
      score -= Math.max(0, fireTarget.apToHit - 1) * 350;
    }
  } else {
    const manhattanDist = Math.abs(lazerPos.r - targetPiece.r) + Math.abs(lazerPos.c - targetPiece.c);
    score -= manhattanDist * 100;
  }

  const trace = traceLaserBeam(board, lazerPos, lazerDir);
  if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
     score += getPieceValue(trace.hitPiece.cell.type) * 2 * cautiousness; 
     const usesMirrors = trace.path.some(p => p.type === 'mirror-bounce');
     if (!usesMirrors) {
        score += 1000; 
     }
  }

  return score;
}

export function evaluateBoardAttacker(board, cautiousness = 1.0, weights = DEFAULT_WEIGHTS) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  if (!lazerPos) return -99999;
  
  let score = 0;
  
  const remainingTypes = pointPieces.map(p => p.type);
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_50)) score += weights.attCapture50Bonus;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_30)) score += weights.attCapture30Bonus;
  if (!remainingTypes.includes(BLOCK_TYPES.BLOCK_20)) score += weights.attCapture20Bonus;

  if (pointPieces.length === 0) return score + weights.attWinBonus; 

  const threats = getPieceThreatLevels(board);
  for (const t of threats) {
     score += getPieceValue(t.type) * weights.attThreatMultiplier * t.threatLevel; 
  }

  if (threats.length > 0 && threats[0].threatLevel < weights.attApproachThreshold) {
    score -= (weights.attApproachThreshold - threats[0].threatLevel) * getPieceValue(threats[0].type) * weights.attApproachPenaltyMultiplier;
  }

  const trace = traceLaserBeam(board, lazerPos, lazerDir);
  if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
     score += getPieceValue(trace.hitPiece.cell.type) * weights.attImmediateCaptureMultiplier * cautiousness; 
  }

  const mirrorBounces = trace.path.filter(p => p.type === 'mirror-bounce').length;
  score += mirrorBounces * weights.attMirrorBounceBonus * (1 / cautiousness);

  score += calculateMobility(board, 'attacker') * weights.attMobilityBonus;
  score += calculateCenterControl(board) * weights.attCenterControlBonus;

  if (pointPieces.length > 0) {
    const advTrace = traceLaserBeam(board, lazerPos, lazerDir);
    if (advTrace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(advTrace.hitPiece.cell.type)) {
      const hp = advTrace.hitPiece;
      const escDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      let canEscape = false;
      for (const [dr, dc] of escDirs) {
        const nr = hp.r + dr;
        const nc = hp.c + dc;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === null) {
          const escBoard = board.map(row => row.slice());
          escBoard[nr][nc] = escBoard[hp.r][hp.c];
          escBoard[hp.r][hp.c] = null;
          const escTrace = traceLaserBeam(escBoard, lazerPos, lazerDir);
          const stillHit = escTrace.hitPiece && escTrace.hitPiece.r === nr && escTrace.hitPiece.c === nc;
          if (!stillHit) { canEscape = true; break; }
        }
      }
      score += canEscape
        ? -getPieceValue(hp.cell.type) * weights.attEscapePenaltyMultiplier
        :  getPieceValue(hp.cell.type) * weights.attTrapBonusMultiplier;
    }
  }

  return score;
}

export function get2d6CumulativeProbability(targetAP) {
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
  return 0; 
}

export function get2d6ExactProbability(ap) {
  if (ap === 2 || ap === 12) return 1/36;
  if (ap === 3 || ap === 11) return 2/36;
  if (ap === 4 || ap === 10) return 3/36;
  if (ap === 5 || ap === 9) return 4/36;
  if (ap === 6 || ap === 8) return 5/36;
  if (ap === 7) return 6/36;
  return 0;
}

export function findOpponentMinScore(board, oppRole, originalRole, depth, cautiousness, weights) {
  const evalFn = originalRole === 'attacker' ? evaluateBoardAttacker : evaluateBoardDefender;
  let minScore = Infinity;

  function search(currentBoard, currentDepth) {
    if (currentDepth === 0) {
      const score = evalFn(currentBoard, cautiousness, weights);
      if (score < minScore) minScore = score;
      return;
    }
    const actions = getPossibleActions(currentBoard, oppRole);
    if (actions.length === 0) {
      const score = evalFn(currentBoard, cautiousness, weights);
      if (score < minScore) minScore = score;
      return;
    }
    for (const a of actions) {
      const nextBoard = applyLightweightAction(currentBoard, a);
      search(nextBoard, currentDepth - 1);
    }
  }

  search(board, depth);
  return minScore;
}

export function findBestActionSequenceExpectiminimax(board, role, actionPoints, cautiousness = 1.0, weights = DEFAULT_WEIGHTS, oppDepthCap = 1) {
  const ourDepth = Math.min(actionPoints, 2); 
  const oppRole = role === 'attacker' ? 'defender' : 'attacker';
  
  let bestAction = null;
  let bestScore = -Infinity;
  let bestMobility = -1;

  const actions1 = getPossibleActions(board, role);
  
  for (const a1 of actions1) {
    const b1 = applyLightweightAction(board, a1);
    let ev1 = 0;
    if (oppDepthCap <= 2) {
      ev1 = findOpponentMinScore(b1, oppRole, role, oppDepthCap, cautiousness, weights);
    } else {
      const memo = {};
      for (let ap = 2; ap <= 12; ap++) {
        const p = get2d6ExactProbability(ap);
        const oppDepth = Math.min(ap, oppDepthCap);
        if (memo[oppDepth] === undefined) {
          memo[oppDepth] = findOpponentMinScore(b1, oppRole, role, oppDepth, cautiousness, weights);
        }
        ev1 += p * memo[oppDepth];
      }
    }
    
    if (ourDepth > 1) {
      const actions2 = getPossibleActions(b1, role);
      let bestLevel2Score = -Infinity;
      for (const a2 of actions2) {
        const b2 = applyLightweightAction(b1, a2);
        let ev2 = 0;
        if (oppDepthCap <= 2) {
          ev2 = findOpponentMinScore(b2, oppRole, role, oppDepthCap, cautiousness, weights);
        } else {
          const memo = {};
          for (let ap = 2; ap <= 12; ap++) {
            const p = get2d6ExactProbability(ap);
            const oppDepth = Math.min(ap, oppDepthCap);
            if (memo[oppDepth] === undefined) {
              memo[oppDepth] = findOpponentMinScore(b2, oppRole, role, oppDepth, cautiousness, weights);
            }
            ev2 += p * memo[oppDepth];
          }
        }
        if (ev2 > bestLevel2Score) {
          bestLevel2Score = ev2;
        }
      }
      if (bestLevel2Score !== -Infinity) {
        ev1 = bestLevel2Score; 
      }
    }

    const mobilityAfter = calculateMobility(b1, role);
    if (ev1 > bestScore || (ev1 === bestScore && mobilityAfter > bestMobility)) {
      bestScore = ev1;
      bestMobility = mobilityAfter;
      bestAction = a1;
    }
  }
  return { action: bestAction, score: bestScore };
}

export function evaluateMediumDefender(board, cautiousness = 1.0) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  let score = 0;

  for (const p of pointPieces) {
    score += getPieceValue(p.type) * 10;
  }

  const threats = getPieceThreatLevels(board);
  for (const t of threats) {
    score -= getPieceValue(t.type) * 20 * t.threatLevel * cautiousness;
  }

  for (const p of pointPieces) {
    if (lazerPos) {
      const physicalDistToLazer = Math.abs(lazerPos.r - p.r) + Math.abs(lazerPos.c - p.c);
      score += physicalDistToLazer * 10;
    }
    
    for (const otherP of pointPieces) {
      if (otherP !== p) {
        const dist = Math.abs(p.r - otherP.r) + Math.abs(p.c - otherP.c);
        if (dist <= 2) {
          score -= 25; 
        }
      }
    }
  }

  if (lazerPos) {
    const safetyThreatMap = generateThreatMap(board); 
    for (const p of pointPieces) {
      const safetySteps = computeSafetySteps(board, p.r, p.c, safetyThreatMap);
      score -= safetySteps * getPieceValue(p.type) * 0.06;
    }
  }

  return score;
}

export function evaluateBoardDefender(board, cautiousness = 1.0, weights = DEFAULT_WEIGHTS) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  let score = 0;

  for (const p of pointPieces) {
    score += getPieceValue(p.type) * weights.defSurvivalMultiplier;
  }

  const threats = getPieceThreatLevels(board);
  for (const t of threats) {
    score -= getPieceValue(t.type) * weights.defThreatPenaltyMultiplier * t.threatLevel * cautiousness;
  }

  for (let i = 0; i < pointPieces.length; i++) {
    for (let j = i + 1; j < pointPieces.length; j++) {
      const p1 = pointPieces[i];
      const p2 = pointPieces[j];
      const dist = Math.abs(p1.r - p2.r) + Math.abs(p1.c - p2.c);
      if (dist <= 2) {
        score -= weights.defClusterPenalty; 
      }
      if (p1.r === p2.r) {
         const minC = Math.min(p1.c, p2.c);
         const maxC = Math.max(p1.c, p2.c);
         let blocked = false;
         for (let c = minC + 1; c < maxC; c++) {
            if (board[p1.r][c] !== null) { blocked = true; break; }
         }
         if (!blocked) score -= weights.defCollinearPenalty;
      }
      if (p1.c === p2.c) {
         const minR = Math.min(p1.r, p2.r);
         const maxR = Math.max(p1.r, p2.r);
         let blocked = false;
         for (let r = minR + 1; r < maxR; r++) {
            if (board[r][p1.c] !== null) { blocked = true; break; }
         }
         if (!blocked) score -= weights.defCollinearPenalty;
      }
    }
  }

  score += calculateMobility(board, 'defender') * weights.defMobilityBonus;
  score -= calculateCenterControl(board) * weights.defCenterControlPenalty;

  if (lazerPos) {
    const safetyThreatMap = generateThreatMap(board); 
    for (const p of pointPieces) {
      const safetySteps = computeSafetySteps(board, p.r, p.c, safetyThreatMap);
      score -= safetySteps * getPieceValue(p.type) * weights.defSafetyStepPenaltyMultiplier;
    }
  }

  return score;
}

export function findBestActionSequence(board, role, maxDepth, evaluateFn, cautiousness) {
  let bestAction = null;
  let bestScore = -Infinity;
  let bestMobility = -1;

  const actions = getPossibleActions(board, role);
  
  for (const action of actions) {
    const board1 = applyLightweightAction(board, action);
    let currentScore = evaluateFn(board1, cautiousness);
    
    if (maxDepth > 1) {
      const actions2 = getPossibleActions(board1, role);
      let bestLevel2Score = -Infinity;
      for (const a2 of actions2) {
        const board2 = applyLightweightAction(board1, a2);
        let score2 = evaluateFn(board2, cautiousness);
        
        if (maxDepth > 2) {
           const actions3 = getPossibleActions(board2, role);
           let bestLevel3Score = -Infinity;
           for (const a3 of actions3) {
             const board3 = applyLightweightAction(board2, a3);
             const score3 = evaluateFn(board3, cautiousness);
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

    const mobilityAfter = calculateMobility(board1, role);
    if (currentScore > bestScore || (currentScore === bestScore && mobilityAfter > bestMobility)) {
      bestScore = currentScore;
      bestMobility = mobilityAfter;
      bestAction = action;
    }
  }

  return { bestAction, bestScore };
}

export function getCautiousness(gameState, botPlayer) {
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

export function getDefenderCautiousness(board) {
  const { pointPieces } = getBoardState(board);
  return Math.max(1.0, 4 - pointPieces.length);
}

export function planReverseAttack(board, actionPoints, cautiousness) {
  const { lazerPos, lazerDir, pointPieces } = getBoardState(board);
  if (!lazerPos || pointPieces.length === 0 || actionPoints <= 0) return null;

  const nowTrace = traceLaserBeam(board, lazerPos, lazerDir);
  if (nowTrace.hitPiece &&
      [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(nowTrace.hitPiece.cell.type)) {
    return { type: 'laser-press' };
  }

  {
    let bestRotAction = null;
    let bestRotValue  = 0;

    for (const testRot of [0, 90, 180, 270]) {
      if (testRot === lazerDir) continue;
      const cwSteps  = ((testRot - lazerDir + 360) % 360) / 90;
      const ccwSteps = ((lazerDir - testRot + 360) % 360) / 90;
      const minSteps = Math.min(cwSteps, ccwSteps);
      if (minSteps + 1 > actionPoints) continue; 

      const rotTrace = traceLaserBeam(board, lazerPos, testRot);
      if (rotTrace.hitPiece &&
          [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(rotTrace.hitPiece.cell.type)) {
        const val = getPieceValue(rotTrace.hitPiece.cell.type);
        if (val > bestRotValue) {
          bestRotValue = val;
          const dir = cwSteps <= ccwSteps ? 'cw' : 'ccw';
          bestRotAction = { type: 'rotate', dir, r: lazerPos.r, c: lazerPos.c };
        }
      }
    }

    if (bestRotAction) return bestRotAction;
  }

  const sortedTargets = [...pointPieces].sort((a, b) => getPieceValue(b.type) - getPieceValue(a.type));
  let bestPlanScore   = 0;
  let bestFirstAction = null;

  for (const primaryTarget of sortedTargets) {
    const firingCells = getReverseFiringCells(board, primaryTarget.r, primaryTarget.c);
    if (firingCells.size === 0) continue;

    const pathToPrimary = bfsToNearestFiringCell(board, lazerPos, firingCells);
    if (!pathToPrimary) continue;

    const apForPrimary = pathToPrimary.steps + 1 + 1;
    if (apForPrimary > actionPoints) continue;

    let planScore = getPieceValue(primaryTarget.type);

    const remainingAP = actionPoints - apForPrimary;
    if (remainingAP >= 2) {
      const boardAfterFirst = board.map(row => row.slice());
      boardAfterFirst[primaryTarget.r][primaryTarget.c] = null;

      for (const secondTarget of sortedTargets) {
        if (secondTarget.r === primaryTarget.r && secondTarget.c === primaryTarget.c) continue;

        const firingCells2 = getReverseFiringCells(boardAfterFirst, secondTarget.r, secondTarget.c);
        if (firingCells2.size === 0) continue;
        const pathToSecondary = bfsToNearestFiringCell(boardAfterFirst, pathToPrimary.firingPos, firingCells2);
        if (!pathToSecondary) continue;

        const apForSecondary = pathToSecondary.steps + 1 + 1;
        if (apForSecondary <= remainingAP) {
          planScore += getPieceValue(secondTarget.type);
          break; 
        }
      }
    }

    if (planScore > bestPlanScore) {
      bestPlanScore = planScore;
      if (pathToPrimary.firstStep) {
        bestFirstAction = {
          type: 'move',
          fromR: lazerPos.r, fromC: lazerPos.c,
          toR:   pathToPrimary.firstStep.r, toC: pathToPrimary.firstStep.c
        };
      }
    }
  }

  return bestFirstAction; 
}

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

export function computeMovementCosts(board, startR, startC) {
  const costs = Array(8).fill(null).map(() => Array(8).fill(999));
  if (board[startR][startC] !== null && board[startR][startC].type !== 'block-lazer') return costs;

  costs[startR][startC] = 0;
  const queue = [{ r: startR, c: startC }];
  
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  while(queue.length > 0) {
    const {r, c} = queue.shift();
    const currentCost = costs[r][c];

    for(const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        // Can move into empty cells
        if (board[nr][nc] === null) {
          if (currentCost + 1 < costs[nr][nc]) {
            costs[nr][nc] = currentCost + 1;
            queue.push({r: nr, c: nc});
          }
        }
      }
    }
  }
  return costs;
}

export function generateThreatMap(board, useCache = true) {
  const { lazerPos, lazerDir } = getBoardState(board);
  const map = Array(8).fill(null).map(() => Array(8).fill(null).map(() => ({ total: 0, sources: {} })));
  const rotations = [0, 90, 180, 270];

  if (!lazerPos) {
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
      
      const moveCosts = computeMovementCosts(board, corner.r, corner.c);

      for (let lr = 0; lr < 8; lr++) {
        for (let lc = 0; lc < 8; lc++) {
          if (board[lr][lc] !== null && !(lr === corner.r && lc === corner.c)) continue;
          
          const moveDist = moveCosts[lr][lc];
          if (moveDist >= 999) continue;
          
          for (const rot of rotations) {
            const minRotationCost = Math.min(...corner.dirs.map(d => {
              let rotDiff = Math.abs(d - rot);
              if (rotDiff > 180) rotDiff = 360 - rotDiff;
              return rotDiff / 90;
            }));
            const apCost = moveDist + minRotationCost + 1; 
            
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
          let sumProb = 0;
          let validCorners = 0;
          for (const corner of corners) {
            if (minAPMap[r][c][corner.id] < 999) {
              const prob = get2d6CumulativeProbability(minAPMap[r][c][corner.id]);
              map[r][c].sources[corner.id] = prob;
              sumProb += prob;
            }
            validCorners++;
          }
          if (validCorners > 0) {
            map[r][c].total = sumProb / validCorners;
          }
        }
      }
    }
    return map;
  }

  const _cacheKey = `${lazerPos.r}-${lazerPos.c}-${lazerDir}`;
  if (_threatMapCache.key === _cacheKey && _threatMapCache.map !== null) {
    return _threatMapCache.map;
  }

  const minAPMap = Array(8).fill(null).map(() => 
    Array(8).fill(null).map(() => ({ 0: 999, 90: 999, 180: 999, 270: 999 }))
  );

  const moveCosts = computeMovementCosts(board, lazerPos.r, lazerPos.c);

  for (let lr = 0; lr < 8; lr++) {
    for (let lc = 0; lc < 8; lc++) {
      if (board[lr][lc] !== null && !(lr === lazerPos.r && lc === lazerPos.c)) continue;
      
      const moveDist = moveCosts[lr][lc];
      if (moveDist >= 999) continue;
      
      for (const rot of rotations) {
        let rotDiff = Math.abs(lazerDir - rot);
        if (rotDiff > 180) rotDiff = 360 - rotDiff;
        const rotationCost = rotDiff / 90;
        
        const apCost = moveDist + rotationCost + 1; 
        
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

  _threatMapCache = { key: _cacheKey, map };
  return map;
}

export function generateExpectiminimaxThreatMap(board, oppDepthCap = 1) {
  const baselineMap = generateThreatMap(board, false);
  const deepMap = Array(8).fill(null).map(() => Array(8).fill(null).map(() => ({ total: 0, sources: {} })));
  
  const { lazerPos } = getBoardState(board);

  const corners = lazerPos ? [] : [
    { r: 0, c: 0, dirs: [90, 180], id: 'TL' },
    { r: 0, c: 7, dirs: [180, 270], id: 'TR' },
    { r: 7, c: 0, dirs: [0, 90], id: 'BL' },
    { r: 7, c: 7, dirs: [270, 0], id: 'BR' }
  ];

  const customWeights = {
    attCapture50Bonus: 5000,
    attCapture30Bonus: 0,
    attCapture20Bonus: 0,
    attWinBonus: 0,
    attThreatMultiplier: 0,
    attApproachPenaltyMultiplier: 0,
    attApproachThreshold: 0,
    attImmediateCaptureMultiplier: 0,
    attMirrorBounceBonus: 0,
    attMobilityBonus: 0,
    attCenterControlBonus: 0,
    attTrapBonusMultiplier: 0,
    attEscapePenaltyMultiplier: 0,
    defSurvivalMultiplier: 0,
    defThreatPenaltyMultiplier: 0,
    defClusterPenalty: 0,
    defCollinearPenalty: 0,
    defMobilityBonus: 0,
    defCenterControlPenalty: 0,
    defSafetyStepPenaltyMultiplier: 0
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const isCorner = (r === 0 || r === 7) && (c === 0 || c === 7);
      if (board[r][c] === null && !isCorner) {
        
        // Prune! If the heuristic threat map says 0, there is no way the attacker can hit this tile,
        // because the heuristic threat map assumes the attacker has free reign to use AP without defender interference.
        if (baselineMap[r][c].total === 0) {
           continue; 
        }

        if (lazerPos) {
           // Not needed for BoardEditor, but fallback if called with real board
           let maxProb = 0;
           for (const rot of [0, 90, 180, 270]) {
              const simBoard = board.map(row => row.map(cell => cell ? { ...cell } : null));
              simBoard[r][c] = { type: 'block-50', owner: 'defender' };
              simBoard[lazerPos.r][lazerPos.c] = { type: 'block-lazer', owner: 'attacker', rotation: rot };
              const { score } = findBestActionSequenceExpectiminimax(simBoard, 'attacker', 2, 1.0, customWeights, oppDepthCap);
              const prob = Math.max(0, Math.min(1, score / 5000));
              if (prob > maxProb) maxProb = prob;
           }
           deepMap[r][c].total = maxProb;
           deepMap[r][c].sources['deep'] = maxProb;
        } else {
           let sumProb = 0;
           let validCorners = 0;
           for (const corner of corners) {
             if (board[corner.r][corner.c] !== null) continue;
             let maxProb = 0;
             for (const rot of corner.dirs) {
                const simBoard = board.map(row => row.map(cell => cell ? { ...cell } : null));
                simBoard[r][c] = { type: 'block-50', owner: 'defender' };
                simBoard[corner.r][corner.c] = { type: 'block-lazer', owner: 'attacker', rotation: rot };

                const { score } = findBestActionSequenceExpectiminimax(simBoard, 'attacker', 2, 1.0, customWeights, oppDepthCap);
                const prob = Math.max(0, Math.min(1, score / 5000));
                if (prob > maxProb) maxProb = prob;
             }
             sumProb += maxProb;
             deepMap[r][c].sources[corner.id] = maxProb;
             validCorners++;
           }
           if (validCorners > 0) {
             deepMap[r][c].total = sumProb / validCorners;
             deepMap[r][c].sources['deep'] = sumProb / validCorners;
           }
        }
      }
    }
  }

  return deepMap;
}

export function classifyMove(beforeScore, afterScore, turnPlayer) {
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
  
  availableValues.sort((a, b) => a - b); 
  
  const roundsRemaining = 3 - round;
  const totalApproxAP = roundsRemaining * 7; 

  let probCaptureIfWin = 0;
  if (totalApproxAP >= 10) probCaptureIfWin = 0.9;
  else if (totalApproxAP >= 7) probCaptureIfWin = 0.6;
  else if (totalApproxAP >= 4) probCaptureIfWin = 0.3;
  else probCaptureIfWin = 0.05;

  let probability = Math.round(probCaptureIfWin * 100);

  if (setNum === 1) {
    if (probCaptureIfWin < 0.6) {
      return {
        recommend: false,
        probability,
        reason: `Too risky! Only ~${totalApproxAP} expected AP left. You don't have enough time to safely recapture a piece.`,
        suggestedPiece: `block-${availableValues[availableValues.length - 1]}`
      };
    }
    
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
  
  const scoreDeficit = defenderScore - attackerScore;
  
  if (scoreDeficit <= 0) {
     return {
       recommend: false,
       probability,
       reason: `You are already winning by ${-scoreDeficit} pts (or tied). Do not risk your lead!`,
       suggestedPiece: `block-${availableValues[0]}`
     };
  }
  
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

export function classifyPlay(sequence) {
  const hasFire = sequence.some(a => a.type === 'laser-press');
  const hasMove = sequence.some(a => a.type === 'move');
  const hasRotate = sequence.some(a => a.type === 'rotate');
  
  if (hasFire && hasMove) return "Move & Fire";
  if (hasFire && hasRotate) return "Aim & Fire";
  if (hasFire) return "Direct Attack";
  if (hasMove && hasRotate) return "Complex Maneuver";
  if (hasMove) return "Tactical Reposition";
  if (hasRotate) return "Re-aiming";
  return "Strategic Pass";
}

export function formatActionText(action) {
  if (action.type === 'place') return `Place ${action.pieceType.replace('block-', '')}pt piece at (${action.r}, ${action.c})`;
  if (action.type === 'laser-press') return 'Fire Lazer!';
  if (action.type === 'move') return `Move piece at (${action.fromR}, ${action.fromC}) to (${action.toR}, ${action.toC})`;
  if (action.type === 'rotate') return `Rotate piece at (${action.r}, ${action.c}) ${action.dir === 'cw' ? 'Right' : 'Left'}`;
  return 'Unknown Move';
}

export function getEngineLines(board, role, difficulty, gameState) {
  const cautiousness = getCautiousness(gameState, gameState.turnPlayer);
  let evalFn = difficulty === 'medium' 
    ? (role === 'attacker' ? evaluateMediumAttacker : evaluateMediumDefender)
    : (role === 'attacker' ? evaluateBoardAttacker : evaluateBoardDefender);

  const maxDepth = Math.min(gameState?.actionPoints || 2, 2); 
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

  for (const play of evaluatedPlays) {
    let score = evalFn(play.board, cautiousness);

    const oppRole = role === 'attacker' ? 'defender' : 'attacker';
    const oppActions = getPossibleActions(play.board, oppRole);
    let worstCaseOppScore = Infinity;
    
    if (oppActions.length > 0) {
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
  
  const totalScore = evalFn(board, cautiousness);

  const { pointPieces } = getBoardState(board);
  const behaviorWarnings = [];

  if (role === 'defender' && pointPieces.length >= 2) {
    for (let i = 0; i < pointPieces.length; i++) {
      for (let j = i + 1; j < pointPieces.length; j++) {
        const p1 = pointPieces[i];
        const p2 = pointPieces[j];
        
        const dist = Math.abs(p1.r - p2.r) + Math.abs(p1.c - p2.c);
        if (dist <= 2) {
          if (!behaviorWarnings.some(w => w.type === 'clustered')) {
            behaviorWarnings.push({ type: 'clustered', message: 'Clustered Defense: Pieces are dangerously close, vulnerable to splash damage or easy consecutive hits.' });
          }
        }

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
export function genericSetupAction(board, phase, playerColor, difficulty, challengedPiece = null, boardHeatmap = null) {
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
        
        const existingPieces = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[r][c] !== null && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(board[r][c].type)) {
              existingPieces.push({ r, c });
            }
          }
        }

        const threatMap = (difficulty === 'hard' || difficulty === 'ga') 
          ? (boardHeatmap || generateThreatMap(board)) 
          : null;

        const evaluateCell = (cell) => {
          let score = 0;
          
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          let cover = 0;
          dirs.forEach(([dr, dc]) => {
            const nr = cell.r + dr, nc = cell.c + dc;
            if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) cover += 0.5; 
          });
          score += cover * 2;

          const distFromCenter = Math.abs(cell.r - 3.5) + Math.abs(cell.c - 3.5);
          score += distFromCenter;

          if (difficulty === 'hard') {
            if (threatMap) {
               score -= (threatMap[cell.r][cell.c].total * 50);
            }

            existingPieces.forEach(p => {
              const dist = Math.abs(cell.r - p.r) + Math.abs(cell.c - p.c);
              if (dist <= 2) {
                score -= 50; 
              } else {
                score += dist * 2; 
              }

              if (cell.r === p.r || cell.c === p.c) {
                score -= 30; 
              }
            });
          } else {
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
          
          const _jitter = difficulty === 'easy' ? 600 : difficulty === 'medium' ? 200 : 50;
          score += Math.random() * _jitter;
          
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
            let bestDistScore = 0;
            for (let r = 0; r < 8; r++) {
              for (let c = 0; c < 8; c++) {
                const cell = board[r][c];
                if (cell && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
                  let weight = 1;
                  if (cell.type === BLOCK_TYPES.BLOCK_50) weight = 5;
                  if (cell.type === BLOCK_TYPES.BLOCK_30) weight = 3;
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
          
          const _lazerJitter = difficulty === 'easy' ? 600 : difficulty === 'medium' ? 200 : 50;
          score += Math.random() * _lazerJitter;

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
