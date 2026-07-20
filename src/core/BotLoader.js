// BotLoader.js
// Dynamically reads bot strategies from the src/bots folder.
// Parses tags (NAME, AUTHOR, STRAT) from the top of each file.

export const BUILTIN_BOTS = [];
export const BUILTIN_STRATEGIES = {};

let botModules = {};
let botSources = {};

try {
  botModules = import.meta.glob('../bots/*.js', { eager: true });
  botSources = import.meta.glob('../bots/*.js', { query: '?raw', eager: true, import: 'default' });
} catch (e) {
  // In Node.js environment (e.g., train_ga.js), import.meta.glob is undefined.
  // We handle manual strategy injection in the Node scripts themselves.
}

for (const path in botModules) {
  // Extract strategy exports from the module
  const moduleExports = botModules[path];
  
  // Get raw string content of the JS file to parse metadata tags
  const rawCode = botSources[path] || '';
  
  let name = 'Unknown Bot';
  let author = 'Unknown';
  let strat = 'Unknown';
  
  const nameMatch = rawCode.match(/\/\/\s*NAME:\s*"(.*?)"/i);
  if (nameMatch && nameMatch[1]) name = nameMatch[1];
  
  const authorMatch = rawCode.match(/\/\/\s*AUTHOR:\s*"(.*?)"/i);
  if (authorMatch && authorMatch[1]) author = authorMatch[1];
  
  const stratMatch = rawCode.match(/\/\/\s*STRAT:\s*"(.*?)"/i);
  if (stratMatch && stratMatch[1]) strat = stratMatch[1];
  
  // Create ID from filename (e.g., "../bots/01_EasyStrategy.js" -> "easy")
  const filename = path.split('/').pop().replace('.js', '');
  // Strip the generic XX_ prefix
  const rawId = filename.replace(/^\d+_/, '').toLowerCase().replace('strategy', '');
  const id = rawId;
  
  BUILTIN_BOTS.push({ id, name, author, strat });
  
  if (moduleExports.getPlayAction) {
    BUILTIN_STRATEGIES[id] = moduleExports;
  } else if (moduleExports.default && moduleExports.default.getPlayAction) {
    BUILTIN_STRATEGIES[id] = moduleExports.default;
  } else {
    // Search for any exported object that contains getPlayAction (e.g., EasyStrategy)
    let found = false;
    for (const key in moduleExports) {
      if (moduleExports[key] && typeof moduleExports[key] === 'object' && moduleExports[key].getPlayAction) {
        BUILTIN_STRATEGIES[id] = moduleExports[key];
        found = true;
        break;
      }
    }
    if (!found) {
      BUILTIN_STRATEGIES[id] = moduleExports;
    }
  }
}
