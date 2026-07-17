import { 
  getCautiousness,
  findBestActionSequenceExpectiminimax,
  genericSetupAction,
  getChallengeRecommendation
} from './BotHelpers.js';
import gaWeights from './ga_weights.json' with { type: 'json' };

export const GAStrategy = {
  /**
   * Called during the action-playing phase.
   * Runs the Genetic Algorithm expectiminimax lookahead.
   */
  getPlayAction: (board, role, actionPoints, gameState, botPlayer) => {
    const cautiousness = getCautiousness(gameState, botPlayer);
    const { bestAction } = findBestActionSequenceExpectiminimax(board, role, actionPoints, cautiousness, gaWeights, 1);
    return bestAction;
  },

  /**
   * Called during setup/placement phases.
   * Placements optimized with dispersion and edge-cover logic.
   */
  getSetupAction: (board, phase, playerColor, challengedPiece) => {
    return genericSetupAction(board, phase, 'hard', challengedPiece);
  },

  /**
   * Called during the challenge-declaration phase.
   * Wagers exact point captures based on remaining sets and AP.
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
