import { 
  genericSetupAction,
  getDefenderCautiousness,
  getCautiousness,
  evaluateBoardAttacker,
  evaluateBoardDefender,
  planReverseAttack,
  findBestActionSequence,
  getChallengeRecommendation
} from './BotHelpers.js';

export const HardStrategy = {
  /**
   * Called during setup/placement phases.
   * Places blocks dynamically based on baseline threat map profiles and dispersion metrics.
   */
  getSetupAction: (board, phase, playerColor, challengedPiece) => {
    return genericSetupAction(board, phase, 'hard', challengedPiece);
  },

  /**
   * Called during the action-playing phase.
   * Employs reverse BFS backtrack pathfinding for attacker and Depth-3 lookahead for defender.
   */
  getPlayAction: (board, role, actionPoints, gameState, botPlayer) => {
    const cautiousness = role === 'defender'
      ? getDefenderCautiousness(board)
      : getCautiousness(gameState, botPlayer);
    const evalFn = role === 'attacker' ? evaluateBoardAttacker : evaluateBoardDefender;

    if (role === 'attacker') {
      // Priority backtracking: Fire now, Rotate-to-fire, Move-then-fire paths.
      const reverseAction = planReverseAttack(board, actionPoints, cautiousness);
      if (reverseAction) return reverseAction;
    }

    // Depth-3 search with BFS safety pull penalty parameters
    const depth = Math.min(actionPoints, 3);
    const currentScore = evalFn(board, cautiousness);
    const { bestAction, bestScore } = findBestActionSequence(board, role, depth, evalFn, cautiousness);
    if (bestAction && bestScore >= currentScore) return bestAction;
    return null; 
  },

  /**
   * Called during the challenge-declaration phase.
   * Performs strategic sets calculations to compute target challenge actions.
   */
  getChallengeAction: (board, gameState, playerColor) => {
    const captured = gameState.capturedPieces || [];
    if (captured.length === 0) return { type: 'declare-challenge', declare: false };
    const attColor = gameState.roleRed === 'attacker' ? 'red' : 'blue';
    if (playerColor !== attColor) return { type: 'declare-challenge', declare: false };
    const attackerScore = playerColor === 'red' ? gameState.scores.red : gameState.scores.blue;
    const defenderScore = playerColor === 'red' ? gameState.scores.blue : gameState.scores.red;
    const rec = getChallengeRecommendation(captured, gameState.round, gameState.actionPoints, attackerScore, defenderScore, gameState.set);
    return { type: 'declare-challenge', declare: rec.recommend, pieceType: rec.suggestedPiece };
  }
};
