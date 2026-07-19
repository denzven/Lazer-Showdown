import { 
  getCautiousness,
  findBestActionSequenceExpectiminimax,
  genericSetupAction,
  getChallengeRecommendation
} from './BotHelpers.js';
import gaWeights from './ga/ga_best_weights.json' with { type: 'json' };

export const GAStrategy = {
  /**
   * Called during the action-playing phase.
   * Runs the Genetic Algorithm expectiminimax lookahead.
   */
  getPlayAction: (board, role, actionPoints, gameState, botPlayer) => {
    const cautiousness = getCautiousness(gameState, botPlayer);

    // Calculate Luck Tier
    let luckTier = 'average';
    if (gameState.diceStats && gameState.diceStats[botPlayer]) {
        const stats = gameState.diceStats[botPlayer];
        if (stats.count > 0) {
            const avg = stats.total / stats.count;
            if (avg <= 5.0) luckTier = 'unlucky';
            else if (avg >= 9.0) luckTier = 'lucky';
        }
    }

    // Calculate Score Tier
    const botScore = gameState.scores[botPlayer] || 0;
    const oppColor = botPlayer === 'red' ? 'blue' : 'red';
    const oppScore = gameState.scores[oppColor] || 0;

    let scoreTier = 'tied';
    if (botScore > oppScore) scoreTier = 'winning';
    else if (botScore < oppScore) scoreTier = 'losing';

    // Select specific gear weights
    const gearName = `${luckTier}_${scoreTier}`;
    const gearWeights = gaWeights[gearName] || Object.values(gaWeights)[0] || gaWeights;

    const { action: bestAction } = findBestActionSequenceExpectiminimax(board, role, actionPoints, cautiousness, gearWeights, 1);
    return bestAction;
  },

  /**
   * Called during setup/placement phases.
   * Placements optimized with dispersion and edge-cover logic.
   */
  getSetupAction: (board, phase, playerColor, challengedPiece, boardHeatmap) => {
    return genericSetupAction(board, phase, playerColor, 'ga', challengedPiece, boardHeatmap);
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
