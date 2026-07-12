// Intercept console.log and console.warn to silence TensorFlow's kernel registry spam
const originalLog = console.log;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('is already registered')) return;
  originalLog(...args);
};

console.warn = function(...args) {
  if (typeof args[0] === 'string') {
    if (args[0].includes('is already registered')) return;
    if (args[0].includes('url.parse() behavior is not standardized')) return;
  }
  originalConsoleWarn.apply(console, args);
};

// Remove Node.js DeprecationWarnings (like url.parse())
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning') return;
  console.warn(warning);
});

// Polyfill for a known bug in @tensorflow/tfjs-node 4.22.0 where tfjs-core removed a utility function
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
try {
  const tfjsUtil = require('@tensorflow/tfjs-core/dist/util');
  if (!tfjsUtil.isNullOrUndefined) {
    tfjsUtil.isNullOrUndefined = function(value) {
      return value === null || value === undefined;
    };
  }
} catch (e) {}
