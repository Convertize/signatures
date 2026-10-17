export * from './core.js';
export * from './clipboard.js';
import './element.js';
import * as core from './core.js';
import * as clipboard from './clipboard.js';

window.ConvertizeSignature = { ...core, ...clipboard };
