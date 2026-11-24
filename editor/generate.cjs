const fs = require('node:fs');
const path = require('node:path');
const { ROOT, CONTENT, readContent, renderSite, stampPageUpdates } = require('./lib/site.cjs');
const previousPage = file => {
  try { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
};
const source = readContent();
const content = stampPageUpdates(source, previousPage);
const pages = renderSite(content);
for (const [file, html] of pages) {
  fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, file), html);
}
if (JSON.stringify(content) !== JSON.stringify(source)) {
  fs.writeFileSync(path.join(ROOT, CONTENT), JSON.stringify(content, null, 2) + '\n');
}
console.log(`Generated ${pages.size} pages.`);
