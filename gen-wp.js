const fs = require('fs');
const orig = fs.readFileSync('C:/temp/orig-ps.html', 'utf8');
const lines = orig.split('\n');
let cssStart = null, cssEnd = null;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<style>') && i > 4) { cssStart = i; }
  if (lines[i].includes('</style>') && cssStart) { cssEnd = i; break; }
}
const cssBlock = lines.slice(cssStart, cssEnd + 1).join('\n');
console.log('CSS extracted:', cssStart, '-', cssEnd);