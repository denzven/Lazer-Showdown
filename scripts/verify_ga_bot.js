import fs from 'fs';
import path from 'path';

// Emulate minimal browser environment for React imports to not crash
global.window = {};

import { GAStrategy } from '../src/core/BotStrategies.js';
import { getInitialState } from '../src/core/GameState.js';

console.log('🔍 Verifying GA Strategy and Expectiminimax setup...');

// 1. Check GA Strategy export
if (!GAStrategy) {
  console.error('❌ GAStrategy is not defined or exported!');
  process.exit(1);
}
console.log('✅ GAStrategy successfully imported.');

// 2. Load game state and test getPlayAction
try {
  let state = getInitialState(null); // default classic board
  console.log('✅ Successfully initialized game state.');
  
  // Set to playing phase with attacker turn
  state.phase = 'playing';
  state.turnPlayer = 'attacker';
  state.hasRolledDice = true;
  state.actionPoints = 4;
  
  // Manually place pieces on the board
  // Laser piece at (0, 0) facing 0 degrees (pointing right or down depending on definition)
  state.board[0][0] = { type: 'block-lazer', rotation: 0 };
  // Point piece at (0, 3)
  state.board[0][3] = { type: 'block-20' };
  
  console.log('🤖 Querying GA Bot action...');
  const action = GAStrategy.getPlayAction(state.board, 'attacker', state.actionPoints, state, 'ga');
  console.log('✅ GA Bot action found:', action);
  
  if (!action) {
    console.error('❌ GA Bot did not return any action when it had AP!');
    process.exit(1);
  }
  
  console.log('🎉 GA Bot and Expectiminimax verification PASSED successfully!');
} catch (e) {
  console.error('❌ Verification failed with error:', e);
  process.exit(1);
}
