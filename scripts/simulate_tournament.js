import fs from 'fs';
import path from 'path';

// Emulate minimal browser environment for React imports to not crash
global.window = {};

import { getInitialState, applySandboxAction } from '../src/core/GameState.js';
import { getBotSetupAction } from '../src/core/BotEngine.js';
import { 
  EasyStrategy, 
  MediumStrategy, 
  HardStrategy, 
  GAStrategy,
  DEFAULT_WEIGHTS,
  findBestActionSequenceExpectiminimax,
  getChallengeRecommendation
} from '../src/core/BotStrategies.js';

// Parse CLI Arguments
const args = process.argv.slice(2);
let numGamesPerMatch = 10;
const gamesArgIdx = args.findIndex(arg => arg === '--games' || arg === '-g');
if (gamesArgIdx !== -1 && args[gamesArgIdx + 1]) {
  const parsed = parseInt(args[gamesArgIdx + 1], 10);
  if (!isNaN(parsed) && parsed > 0) {
    numGamesPerMatch = parsed;
  }
}

console.log(`🤖 Starting Headless Bot Tournament (${numGamesPerMatch} games per matchup)...`);

// Load custom boards if available
const boardsDir = path.resolve('./src/boards');
const customBoards = [null]; // null is the default board
if (fs.existsSync(boardsDir)) {
  const files = fs.readdirSync(boardsDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(boardsDir, file), 'utf8'));
        customBoards.push(data);
      } catch (e) {}
    }
  }
}

// Helpers
const rollDie = () => Math.floor(Math.random() * 6) + 1;

// General function to get a play action for a strategy by its key/id
function getStrategyPlayAction(strategyId, board, role, actionPoints, state) {
  if (strategyId === 'easy') return EasyStrategy.getPlayAction(board, role, actionPoints, state, 'easy');
  if (strategyId === 'medium') return MediumStrategy.getPlayAction(board, role, actionPoints, state, 'medium');
  if (strategyId === 'hard') return HardStrategy.getPlayAction(board, role, actionPoints, state, 'hard');
  if (strategyId === 'ga') return GAStrategy.getPlayAction(board, role, actionPoints, state, 'ga');
  return null;
}

function getStrategyChallengeAction(strategyId, board, state, playerColor) {
  if (strategyId === 'easy') return EasyStrategy.getChallengeAction ? EasyStrategy.getChallengeAction(board, state, playerColor) : null;
  if (strategyId === 'medium') return MediumStrategy.getChallengeAction ? MediumStrategy.getChallengeAction(board, state, playerColor) : null;
  if (strategyId === 'hard') return HardStrategy.getChallengeAction ? HardStrategy.getChallengeAction(board, state, playerColor) : null;
  if (strategyId === 'ga') return GAStrategy.getChallengeAction ? GAStrategy.getChallengeAction(board, state, playerColor) : null;
  return null;
}

// Plays a headless game between two strategies
function simulateMatch(boardData, strategyIdA, strategyIdB, roleA) {
  let state = getInitialState(boardData);
  
  // Assign colors
  const colorA = Math.random() > 0.5 ? 'red' : 'blue';
  const colorB = colorA === 'red' ? 'blue' : 'red';
  
  // Map player roles
  // if roleA is 'attacker', strategyIdA takes the attacker role
  const roleRedInit = (roleA === 'attacker')
    ? (colorA === 'red' ? 'attacker' : 'defender')
    : (colorA === 'red' ? 'defender' : 'attacker');
  const roleBlueInit = roleRedInit === 'attacker' ? 'defender' : 'attacker';
  
  state.roleRed = roleRedInit;
  state.roleBlue = roleBlueInit;
  
  let turns = 0;
  const MAX_TURNS = 3000;
  
  while (!state.winner && turns < MAX_TURNS) {
    turns++;
    
    // Auto-resolve non-action phases
    if (state.phase === 'toss') {
      state = applySandboxAction(state.board, { type: 'toss-roll', value: rollDie() }, 'red', state);
      state = applySandboxAction(state.board, { type: 'toss-roll', value: rollDie() }, 'blue', state);
      if (state.phase === 'toss') continue;
    }
    if (state.phase === 'toss-result') {
      state = applySandboxAction(state.board, { type: 'toss-resolve' }, 'SYSTEM', state);
      continue;
    }
    if (state.phase === 'role-selection') {
      // Respect assigned role
      const tossWinnerColor = state.tossWinner.toLowerCase(); // 'red' or 'blue'
      const tossWinnerStrategy = tossWinnerColor === colorA ? strategyIdA : strategyIdB;
      const tossWinnerTargetRole = tossWinnerColor === colorA ? roleA : (roleA === 'attacker' ? 'defender' : 'attacker');
      
      state = applySandboxAction(state.board, { type: 'toss-select-role', role: tossWinnerTargetRole }, tossWinnerColor, state);
      continue;
    }
    if (state.phase === 'challenge-toss') {
      state = applySandboxAction(state.board, { type: 'challenge-start-roll' }, 'red', state);
      state = applySandboxAction(state.board, { type: 'challenge-start-roll' }, 'blue', state);
      state = applySandboxAction(state.board, { type: 'challenge-roll', value: rollDie() }, 'red', state);
      state = applySandboxAction(state.board, { type: 'challenge-roll', value: rollDie() }, 'blue', state);
      continue;
    }
    if (state.phase === 'challenge-toss-result') {
      state = applySandboxAction(state.board, { type: 'challenge-toss-resolve' }, 'system', state);
      continue;
    }
    
    const activeRole = state.phase === 'setup-defender' || state.phase === 'challenge-setup' ? 'defender' :
                       state.phase === 'setup-attacker' ? 'attacker' : state.turnPlayer;
    const activeColor = state.roleRed === activeRole ? 'red' : 'blue';
    const activeStrategy = activeColor === colorA ? strategyIdA : strategyIdB;
    
    // Placement / Setup
    if (state.phase === 'setup-defender' || state.phase === 'challenge-setup' || state.phase === 'setup-attacker') {
      // Reuse the default placement behavior
      let action = getBotSetupAction(state.board, state.phase, activeColor, activeStrategy, state.challengedPiece);
      if (action) {
        state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
      } else {
        state = applySandboxAction(state.board, { type: 'confirm-setup' }, activeColor.toLowerCase(), state);
      }
      continue;
    }
    
    // Action Playing Turn
    if (state.phase === 'playing') {
      if (!state.hasRolledDice) {
        state = applySandboxAction(state.board, { type: 'end-roll', values: [rollDie(), rollDie()] }, activeColor.toLowerCase(), state);
        continue;
      }
      
      let action = null;
      if (state.actionPoints > 0) {
        action = getStrategyPlayAction(activeStrategy, state.board, activeRole, state.actionPoints, state);
      }
      
      if (action) {
        state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
      } else {
        state = applySandboxAction(state.board, { type: 'end-turn' }, activeColor.toLowerCase(), state);
      }
      continue;
    }
    
    // Challenge Decision
    if (state.phase === 'challenge-declaration') {
      const action = getStrategyChallengeAction(activeStrategy, state.board, state, activeColor);
      if (action) {
        state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
      } else {
        state = applySandboxAction(state.board, { type: 'declare-challenge', declare: false }, activeColor.toLowerCase(), state);
      }
      continue;
    }
  }
  
  if (!state.winner && turns >= MAX_TURNS) {
    const redScore = state.scores?.red || 0;
    const blueScore = state.scores?.blue || 0;
    if (redScore > blueScore) state.winner = 'red';
    else if (blueScore > redScore) state.winner = 'blue';
    else state.winner = 'draw';
  }
  
  const scoreA = state.scores?.[colorA] || 0;
  const scoreB = state.scores?.[colorB] || 0;
  
  const winA = state.winner === colorA;
  const winB = state.winner === colorB;
  const isDraw = state.winner === 'draw' || (!winA && !winB);
  
  return { winA, winB, isDraw, scoreA, scoreB, turns };
}

// Register Bots participating in the tournament
const bots = [
  { id: 'easy', name: 'Zlorooklp (Easy)' },
  { id: 'medium', name: 'Lizbishmir (Medium)' },
  { id: 'hard', name: 'Shahlzrmir (Hard)' },
  { id: 'ga', name: 'GA-Bot (Tuned Expectiminimax)' }
];

// Initialize Leaderboard
const stats = {};
for (const b of bots) {
  stats[b.id] = { id: b.id, name: b.name, matchesPlayed: 0, wins: 0, losses: 0, draws: 0, totalScore: 0, totalTurns: 0 };
}

// Double round-robin matchups (fair role swaps)
for (let i = 0; i < bots.length; i++) {
  for (let j = i + 1; j < bots.length; j++) {
    const botA = bots[i];
    const botB = bots[j];
    
    console.log(`⚔️ Matchup: ${botA.name} vs ${botB.name}`);
    
    let aWins = 0;
    let bWins = 0;
    let draws = 0;
    
    for (let g = 0; g < numGamesPerMatch; g++) {
      const boardData = customBoards[g % customBoards.length];
      
      // Alternating initial roles
      const roleA = g % 2 === 0 ? 'attacker' : 'defender';
      const res = simulateMatch(boardData, botA.id, botB.id, roleA);
      
      // Update statistics
      stats[botA.id].matchesPlayed++;
      stats[botB.id].matchesPlayed++;
      stats[botA.id].totalScore += res.scoreA;
      stats[botB.id].totalScore += res.scoreB;
      stats[botA.id].totalTurns += res.turns;
      stats[botB.id].totalTurns += res.turns;
      
      if (res.winA) {
        stats[botA.id].wins++;
        stats[botB.id].losses++;
        aWins++;
      } else if (res.winB) {
        stats[botB.id].wins++;
        stats[botA.id].losses++;
        bWins++;
      } else {
        stats[botA.id].draws++;
        stats[botB.id].draws++;
        draws++;
      }
    }
    console.log(`   └─ Results: ${botA.name} won ${aWins} | ${botB.name} won ${bWins} | ${draws} Draws`);
  }
}

// Generate Leaderboard
const leaderboard = Object.values(stats).map(b => {
  const winRate = ((b.wins / b.matchesPlayed) * 100).toFixed(1);
  const avgScore = (b.totalScore / b.matchesPlayed).toFixed(1);
  const avgTurns = (b.totalTurns / b.matchesPlayed).toFixed(1);
  return {
    Name: b.name,
    Wins: b.wins,
    Losses: b.losses,
    Draws: b.draws,
    'Win Rate (%)': `${winRate}%`,
    'Avg Score': avgScore,
    'Avg Turns': avgTurns
  };
});

// Sort by Wins descending
leaderboard.sort((a, b) => b.Wins - a.Wins);

console.log('\n================================== LEADERBOARD ==================================');
console.table(leaderboard);
console.log('=================================================================================\n');
