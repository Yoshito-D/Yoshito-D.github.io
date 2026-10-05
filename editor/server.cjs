const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { ROOT, CONTENT, validateContent, renderSite, stampUpdates } = require('./lib/site.cjs');
const execute = promisify(execFile);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const serialize = value => JSON.stringify(value, null, 2) + '\n';
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.mp4': 'video/mp4' };
const error = (message, status = 400) => Object.assign(new Error(message), { status });

async function atomicWrite(root, name, value) {
  const target = path.join(root, name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target + '.tmp', value);
  await fs.rename(target + '.tmp', target);
}

async function createEditor({ root = ROOT } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  const contentPath = path.join(root, CONTENT);
  const local = path.join(root, '.editor');
  let gitExecutable = 'git';
  if (process.platform === 'win32') {
    const candidates = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean).map(folder => path.join(folder, 'git.exe'));
    candidates.push(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe'));
    const desktop = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'GitHubDesktop');
    try { for (const folder of (await fs.readdir(desktop)).filter(name => name.startsWith('app-')).sort().reverse()) candidates.push(path.join(desktop, folder, 'resources/app/git/cmd/git.exe')); } catch { /* Optional installed Git. */ }
    for (const candidate of candidates) { try { await fs.access(candidate); gitExecutable = candidate; break; } catch { /* Try the next installation. */ } }
  }
  const git = async (...args) => {
    try { return (await execute(gitExecutable, args, { cwd: root, timeout: 60000, maxBuffer: 2 * 1024 * 1024, windowsHide: true })).stdout.trim(); }
    catch (cause) { throw error((cause.stderr || cause.message).trim(), 500); }
  };
  let savedText = await fs.readFile(contentPath, 'utf8');
  let saved = validateContent(JSON.parse(savedText));
  let revision = hash(savedText);
  let draft = saved;
  let busy = false;
  try {
    const recovery = JSON.parse(await fs.readFile(path.join(local, 'draft.json'), 'utf8'));
    if (recovery.revision === revision) draft = validateContent(recovery.content);
  } catch { /* A missing or obsolete draft leaves the saved content intact. */ }
  let preview = renderSite(draft);
  let pendingPublish = false;
  try { pendingPublish = JSON.parse(await fs.readFile(path.join(local, 'publish-state.json'), 'utf8')).pending === true; } catch { /* No pending publication. */ }
  const respond = (res, status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' });
    res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
  };
  const readBody = async (req, max = 2 * 1024 * 1024) => {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) throw error('ファイルまたは入力内容が大きすぎます。', 413);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  };
  const json = async req => {
    if (req.headers['content-type'] !== 'application/json') throw error('リクエストの形式が正しくありません。', 415);
    try { return JSON.parse(await readBody(req)); } catch (cause) { if (cause.status) throw cause; throw error('入力データを読み取れません。'); }
  };
  const assets = content => [...new Set(content.projects.flatMap(project => [...project.images.map(image => image.src), project.video]).filter(Boolean))];
  const checkAssets = async content => {
    for (const name of assets(content)) {
      try { await fs.access(path.join(root, name)); }
      catch { try { await fs.access(path.join(local, 'uploads', path.basename(name))); } catch { throw error('画像・動画が見つかりません。ファイルを選び直してください。'); } }
    }
  };

  const server = http.createServer(async (req, res) => {
    let ownsMutation = false;
    try {
      const address = server.address();
      const host = `127.0.0.1:${address.port}`;
      if (req.headers.host !== host) throw error('この編集画面はこのPCからのみ利用できます。', 403);
      const url = new URL(req.url, `http://${host}`);
      const name = decodeURIComponent(url.pathname).replace(/^\//, '');
      if (req.method === 'POST') {
        if (req.headers.origin !== `http://${host}` || req.headers['x-editor-token'] !== token) throw error('編集画面を再読み込みしてください。', 403);
        if (busy) throw error('処理中です。少し待ってから再度操作してください。', 409);
        ownsMutation = busy = true;
        if (name === 'api/upload') {
          const extension = String(req.headers['x-file-extension'] || '').toLowerCase();
          if (!['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'mp4'].includes(extension)) throw error('PNG、JPEG、WebP、GIF、AVIF、MP4を選んでください。');
          const buffer = await readBody(req, extension === 'mp4' ? 50 * 1024 * 1024 : 12 * 1024 * 1024);
          const valid = ({ png: buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), jpg: buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255, jpeg: buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255, webp: buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP', gif: /^GIF8[79]a$/.test(buffer.subarray(0,6).toString()), avif: buffer.subarray(4,8).toString() === 'ftyp' && /avif|avis/.test(buffer.subarray(8,32).toString()), mp4: buffer.subarray(4,8).toString() === 'ftyp' })[extension];
          if (!valid) throw error('ファイルの形式を確認してください。');
          const file = `${crypto.randomUUID()}.${extension}`;
          await atomicWrite(root, `.editor/uploads/${file}`, buffer);
          return respond(res, 200, { path: `assets/uploads/${file}` });
        }
        if (name === 'api/preview') {
          const input = await json(req);
          if (input.revision !== revision || hash(await fs.readFile(contentPath, 'utf8')) !== revision) throw error('別の画面で保存されています。編集画面を再読み込みしてください。', 409);
          draft = validateContent(input.content);
          preview = renderSite(draft);
          await atomicWrite(root, '.editor/draft.json', serialize({ revision, content: draft }));
          return respond(res, 200, { ok: true });
        }
        if (name === 'api/discard') {
          await json(req);
          if (hash(await fs.readFile(contentPath, 'utf8')) !== revision) throw error('保存内容が更新されています。画面を再読み込みしてください。', 409);
          draft = saved;
          preview = renderSite(draft);
          await fs.rm(path.join(local, 'draft.json'), { force: true });
          return respond(res, 200, { content: saved, revision });
        }
        if (name === 'api/save') {
          const input = await json(req);
          const content = stampUpdates(input.content, saved);
          if (input.revision !== revision || hash(await fs.readFile(contentPath, 'utf8')) !== revision) throw error('保存内容が更新されています。画面を再読み込みしてください。', 409);
          try {
            await checkAssets(content);
            if (await git('branch', '--show-current') !== 'main') throw error('mainブランチで編集画面を起動してください。');
            if (await git('diff', '--cached', '--name-only')) throw error('別の変更が公開準備中です。このチャットで確認を依頼してください。');
            // Do not overwrite HTML changes made outside this editor.
            for (const [file, expected] of renderSite(saved)) {
              if ((await fs.readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n') !== expected) throw error(`${file}が直接変更されています。このチャットで確認を依頼してください。`);
            }
            await git('fetch', 'origin', 'main');
            try { await git('merge-base', '--is-ancestor', 'origin/main', 'HEAD'); }
            catch { throw error('GitHub側に新しい変更があります。このチャットで同期を依頼してください。', 409); }
            const previousPages = renderSite(saved);
            const pages = renderSite(content);
            for (const file of pages.keys()) {
              if (previousPages.has(file)) continue;
              try { await fs.access(path.join(root, file)); }
              catch { continue; }
              throw error(`${file}がすでに存在します。このチャットで確認を依頼してください。`);
            }
            const names = [CONTENT, ...new Set([...previousPages.keys(), ...pages.keys()]), ...assets(content).filter(file => file.startsWith('assets/uploads/'))];
            await atomicWrite(root, `.editor/backups/${Date.now()}.json`, savedText);
            try {
              for (const file of assets(content)) {
                try { await fs.access(path.join(root, file)); }
                catch { await atomicWrite(root, file, await fs.readFile(path.join(local, 'uploads', path.basename(file)))); }
              }
              for (const [file, html] of pages) await atomicWrite(root, file, html);
              for (const file of previousPages.keys()) if (!pages.has(file)) await fs.rm(path.join(root, file));
              await atomicWrite(root, CONTENT, serialize(content));
            } catch (cause) {
              for (const [file, html] of previousPages) await atomicWrite(root, file, html);
              await atomicWrite(root, CONTENT, savedText);
              for (const file of pages.keys()) if (!previousPages.has(file)) await fs.rm(path.join(root, file), { force: true });
              throw error(`保存に失敗したため、元の内容に戻しました。${cause.message}`, 500);
            }
            savedText = serialize(content);
            saved = draft = content;
            revision = hash(savedText);
            preview = pages;
            await fs.rm(path.join(local, 'draft.json'), { force: true });
            let published = false;
            let message;
            pendingPublish = true;
            await atomicWrite(root, '.editor/publish-state.json', serialize({ pending: true }));
            try {
              await git('add', '--', ...names);
              if (await git('diff', '--cached', '--name-only')) await git('commit', '-m', 'Update portfolio content from local editor', '--only', '--', ...names);
              await git('push', 'origin', 'main');
              published = true;
              pendingPublish = false;
              await atomicWrite(root, '.editor/publish-state.json', serialize({ pending: false }));
              message = '保存してGitHubへ送信しました。公開サイトへの反映には少し時間がかかります。';
            } catch (cause) {
              message = 'このPCには保存しましたが、公開できませんでした。このチャットで公開の再試行を依頼してください。\n' + cause.message;
            }
            return respond(res, 200, { saved: true, published, revision, content, message });
          } finally { busy = false; }
        }
        throw error('操作が見つかりません。', 404);
      }
      if (req.method !== 'GET') throw error('操作が見つかりません。', 405);
      if (name === 'api/content') return respond(res, 200, { content: draft, savedContent: saved, revision, token, pendingPublish, hasDraft: serialize(draft) !== serialize(saved) });
      if (!name) { res.writeHead(302, { Location: '/editor/index.html', 'Cache-Control': 'no-store' }); return res.end(); }
      let file = name || 'editor/index.html';
      if (file.startsWith('preview/')) {
        file = file.slice(8) || 'index.html';
        if (preview.has(file)) return respond(res, 200, preview.get(file), mime['.html']);
      }
      const extension = path.extname(file).toLowerCase();
      // Serve only site assets and the three editor UI files, never Git or recovery data.
      if (!mime[extension] || file.includes('\\') || file.split('/').some(part => !part || part === '.' || part === '..') || !(/^(index\.html|works\.html|styles\.css|motion\.js|filters\.js|preview\.js|gallery\.js|projects\/[a-z0-9-]+\.html|assets\/[a-zA-Z0-9_./-]+|editor\/(index\.html|editor\.css|editor\.js))$/.test(file))) throw error('ページが見つかりません。', 404);
      let buffer;
      try { buffer = await fs.readFile(path.join(root, file)); }
      catch { if (file.startsWith('assets/uploads/')) buffer = await fs.readFile(path.join(local, 'uploads', path.basename(file))); else throw error('ページが見つかりません。', 404); }
      return respond(res, 200, buffer, mime[extension]);
    } catch (cause) {
      if (!res.headersSent) respond(res, cause.status || 500, { error: cause.message });
    } finally {
      if (ownsMutation) busy = false;
    }
  });
  return server;
}

if (require.main === module) {
  createEditor().then(server => {
    const port = Number(process.env.PORT || 4174);
    const open = () => { if (process.argv.includes('--open')) execute('cmd.exe', ['/d', '/c', `start "" "http://127.0.0.1:${port}/"`], { windowsHide: true }).catch(cause => console.error(cause.message)); };
    server.on('error', cause => { console.error(cause.code === 'EADDRINUSE' ? `編集画面は http://127.0.0.1:${port}/ です。すでに起動している画面をご利用ください。` : cause.message); if (cause.code === 'EADDRINUSE') open(); else process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => { console.log(`Portfolio editor: http://127.0.0.1:${port}/\nKeep this window open. Press Ctrl+C to stop.`); open(); });
  }).catch(cause => { console.error(cause.message); process.exitCode = 1; });
}
module.exports = { createEditor, atomicWrite };
