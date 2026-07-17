import { 
  getBoardState, 
  getPossibleActions, 
  applyLightweightAction, 
  traceLaserBeam,
  getPieceValue,
  genericSetupAction
} from './BotHelpers.js';

export const EasyStrategy = {
  /**
   * Called during setup/placement phases.
   * Simple randomized corner and baseline placements.
   */
  getSetupAction: (board, phase, playerColor, challengedPiece) => {
    return genericSetupAction(board, phase, 'easy', challengedPiece);
  },

  /**
   * Called during the action-playing phase.
   * Pulls pieces towards target by Manhattan distance or shoots straight shots if possible.
   */
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
  },

  /**
   * Called during the challenge-declaration phase.
   * Challenges with a basic 40% probability.
   */
  getChallengeAction: (board, gameState, playerColor) => {
    const captured = gameState.capturedPieces || [];
    if (captured.length === 0) return { type: 'declare-challenge', declare: false };
    if (Math.random() < 0.4) return { type: 'declare-challenge', declare: false };
    const target = captured[Math.floor(Math.random() * captured.length)];
    return { type: 'declare-challenge', declare: true, pieceType: target };
  }
};
