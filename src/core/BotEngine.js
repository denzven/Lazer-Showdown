import { EasyStrategy, MediumStrategy, HardStrategy, generateThreatMap, getBoardAnalysis, generatePossibilityWeb } from './BotStrategies.js';
import { NeuralStrategy } from './NeuralBot.js';

// --- MAIN ROUTERS ---

export function getBotSetupAction(board, phase, playerColor, difficulty = 'medium', challengedPiece = null) {
  if (difficulty === 'easy') return HardStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
  if (difficulty === 'medium') return MediumStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
  if (difficulty === 'hard') return HardStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
  if (difficulty === 'neural') return NeuralStrategy.getSetupAction(board, phase, playerColor, challengedPiece) || HardStrategy.getSetupAction(board, phase, playerColor, challengedPiece);
  
  return null;
}

export async function getBotPlayAction(board, role, actionPoints, difficulty = 'medium', gameState = null, botPlayer = null) {
  if (actionPoints <= 0) return null;

  if (difficulty === 'easy') return EasyStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
  if (difficulty === 'medium') return MediumStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
  if (difficulty === 'hard') return HardStrategy.getPlayAction(board, role, actionPoints, gameState, botPlayer);
  if (difficulty === 'neural') return await NeuralStrategy.getPlayActionAsync(board, role, actionPoints, gameState, botPlayer);

  return null;
}

export async function getBoardAnalysisAsync(board, role, difficulty, gameState, botPlayer) {
  // If we just need the math score, we can call getBoardAnalysis which is sync,
  // but this function wraps it nicely and adds Neural capability.
  const attackerMathAnalysis = getBoardAnalysis(board, 'attacker', difficulty === 'neural' ? 'hard' : difficulty, gameState, botPlayer);
  const defenderMathAnalysis = getBoardAnalysis(board, 'defender', difficulty === 'neural' ? 'hard' : difficulty, gameState, botPlayer);
  
  if (difficulty !== 'neural') {
    const res = role === 'attacker' ? attackerMathAnalysis : defenderMathAnalysis;
    return { 
      ...res, 
      attackerMathScore: attackerMathAnalysis.totalScore,
      defenderMathScore: defenderMathAnalysis.totalScore,
      isNeural: false 
    };
  }

  try {
    const attackerNeuralScore = await NeuralStrategy.evaluateBoardAsync(board, 'attacker', gameState);
    const defenderNeuralScore = await NeuralStrategy.evaluateBoardAsync(board, 'defender', gameState);
    
    const mathAnalysis = role === 'attacker' ? attackerMathAnalysis : defenderMathAnalysis;
    return { 
      totalScore: mathAnalysis.totalScore, // Classic math score
      attackerMathScore: attackerMathAnalysis.totalScore,
      defenderMathScore: defenderMathAnalysis.totalScore,
      neuralScore: role === 'attacker' ? attackerNeuralScore : defenderNeuralScore,
      attackerNeuralScore,
      defenderNeuralScore,
      cautiousness: mathAnalysis.cautiousness, 
      behaviorWarnings: mathAnalysis.behaviorWarnings,
      advancedMetrics: mathAnalysis.advancedMetrics,
      difficulty, 
      role, 
      isNeural: true 
    };
  } catch (e) {
    console.error('Neural evaluation failed, falling back to Math engine', e);
    const res = role === 'attacker' ? attackerMathAnalysis : defenderMathAnalysis;
    return { 
      ...res, 
      attackerMathScore: attackerMathAnalysis.totalScore,
      defenderMathScore: defenderMathAnalysis.totalScore,
      isNeural: false 
    };
  }
}

export async function getBotEngineLinesAsync(board, role, actionPoints, difficulty, gameState) {
  if (difficulty === 'neural') {
    return await NeuralStrategy.getRankedPlaysAsync(board, role, actionPoints, gameState);
  } else {
    // Math engines run synchronously, we can just return it wrapped in a promise
    const { getEngineLines } = await import('./BotStrategies');
    return getEngineLines(board, role, difficulty, gameState);
  }
}

export { generateThreatMap, getBoardAnalysis, generatePossibilityWeb };
