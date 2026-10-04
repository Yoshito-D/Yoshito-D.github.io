const fs = require('node:fs');
const path = require('node:path');
const { ROOT, readContent, validateContent, renderSite } = require('./lib/site.cjs');
const pages = renderSite(validateContent(readContent()));
for (const [file, html] of pages) {
  fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, file), html);
}
console.log(`Generated ${pages.size} pages.`);
