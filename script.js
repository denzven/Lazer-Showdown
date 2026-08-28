const fs = require('fs');
const path = require('path');
const file = path.join('d:', 'Lazer_showdown_WebRTC', 'src', 'core', 'TutorialScenario.js');

let content = fs.readFileSync(file, 'utf8');

const highlights = [
  'PROCEED',
  'LEAVE',
  'ROLL TOSS',
  'ROLL AP DICE',
  'CONFIRM',
  'MOVE',
  'ROTATE',
  'FIRE',
  'Action Points',
  'Challenge Toss',
  'Lazer',
  'ATTACKER',
  'DEFENDER'
];

highlights.forEach(word => {
  // Use word boundaries and avoid replacing inside existing **
  const regex = new RegExp('(?<!\\\\*\\\\*)(?:\\\\b)(' + word + ')(?:\\\\b)(?!\\\\*\\\\*)', 'g');
  content = content.replace(regex, '****');
});

// Also manually add some specific highlights
content = content.replace(/Attacker/g, '**Attacker**');
content = content.replace(/Defender/g, '**Defender**');
// Fix any double stars that might have occurred like ****Attacker****
content = content.replace(/\*\*\*\*/g, '**');

fs.writeFileSync(file, content, 'utf8');
