const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const CONTENT = 'site-content.json';
const PAGE_ASSETS = ['styles.css', 'gallery.js', 'preview.js', 'motion.js', 'filters.js'];
const PAGE_DATE = /<p class="page-updated">更新日：<time datetime="(\d{4}-\d{2}-\d{2})">[^<]*<\/time><\/p>/;
const DEFAULT_AURA = Object.freeze({ color: '#66c0f4', accentColor: '#2a475e', saturation: 100, brightness: 40, speed: 70 });
const INITIAL_DATE = '2026-10-05';
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const textLines = value => escape(value).replace(/\n/g, '<br>');
const paragraphs = value => String(value).split(/\n\s*\n/).filter(part => part.trim()).map(part => `<p>${textLines(part)}</p>`).join('');
const tags = project => [...new Set([project.production, project.year, project.dimension, project.genre, ...project.tags].filter(Boolean))];
const tagList = project => `<ul class="project-tags" aria-label="作品のタグ">${tags(project).map(tag => `<li>${escape(tag)}</li>`).join('')}</ul>`;
const achievements = project => project.achievements.length ? `<ul class="achievement-list">${project.achievements.map(item => `<li>${textLines(item)}</li>`).join('')}</ul>` : '';
const readContent = () => JSON.parse(fs.readFileSync(path.join(ROOT, CONTENT), 'utf8'));

function validateContent(input) {
  if (!input || input.version !== 1 || !input.profile || !Array.isArray(input.projects)) throw new Error('編集データの形式が正しくありません。');
  const string = (value, label, max = 20000) => {
    if (typeof value !== 'string' || value.length > max || /\0/.test(value)) throw new Error(`${label}の入力を確認してください。`);
    return value.replace(/\r\n?/g, '\n').trim();
  };
  const asset = (value, kind) => {
    const result = string(value, '画像・動画', 250);
    if (!result) return '';
    const extension = kind === 'image' ? /\.(png|jpe?g|webp|gif|avif)$/i : /\.mp4$/i;
    if (!/^assets\/[a-zA-Z0-9_./-]+$/.test(result) || result.split('/').some(part => !part || part === '.' || part === '..') || !extension.test(result)) throw new Error('画像・動画はファイル選択から設定してください。');
    return result;
  };
  const date = value => {
    const result = string(value ?? INITIAL_DATE, '更新日', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error('更新日の形式が正しくありません。');
    return result;
  };
  const desktopColumns = input.desktopColumns ?? 3;
  if (!Number.isInteger(desktopColumns) || desktopColumns < 1 || desktopColumns > 4) throw new Error('PCのカード列数は1〜4列から選択してください。');
  const cardStyle = input.cardStyle ?? 'standard';
  if (!['standard', 'wire'].includes(cardStyle)) throw new Error('カードのデザインは「通常」または「ワイヤー吊り」から選択してください。');
  const sourceAura = input.aura ?? DEFAULT_AURA;
  if (!sourceAura || typeof sourceAura !== 'object' || Array.isArray(sourceAura)) throw new Error('背景のオーラの設定を確認してください。');
  const aura = {};
  for (const key of ['color', 'accentColor']) {
    const value = sourceAura[key] ?? DEFAULT_AURA[key];
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('オーラの色を確認してください。');
    aura[key] = value.toLowerCase();
  }
  for (const [key, max] of [['saturation', 200], ['brightness', 100], ['speed', 200]]) {
    const value = sourceAura[key] ?? DEFAULT_AURA[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) throw new Error('オーラの彩度・明るさ・速さを確認してください。');
    aura[key] = value;
  }
  const profile = {};
  for (const key of ['name', 'reading', 'role', 'school', 'graduation', 'hobby', 'email', 'description']) profile[key] = string(input.profile[key], 'プロフィール');
  if (!profile.name) throw new Error('氏名を入力してください。');
  if (profile.email && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(profile.email)) throw new Error('メールアドレスを確認してください。');
  const knownTools = ['visual-studio', 'github', 'aseprite', 'blender'];
  if (!Array.isArray(input.profile.tools) || input.profile.tools.some(tool => !knownTools.includes(tool))) throw new Error('使用ツールの設定を確認してください。');
  profile.tools = [...new Set(input.profile.tools)];
  if (input.projects.length > 200) throw new Error('作品は200件まで登録できます。');
  const ids = new Set();
  const projects = input.projects.map(item => {
    const project = {};
    project.id = string(item.id, '作品ID', 80);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id) || ids.has(project.id)) throw new Error('作品のURLが重複しているか、形式が正しくありません。');
    ids.add(project.id);
    for (const key of ['title', 'production', 'year', 'dimension', 'genre', 'description', 'environment', 'role', 'teamSize', 'duration', 'implementation']) project[key] = string(item[key], `作品「${item.title || '新しい作品'}」`);
    if (!project.title) throw new Error('作品タイトルを入力してください。');
    if (!['個人制作', 'チーム制作'].includes(project.production) || !/^[1-9]年次$/.test(project.year) || !['2D', '3D'].includes(project.dimension)) throw new Error('制作形態・学年・2D/3Dを確認してください。');
    for (const key of ['tags', 'achievements']) {
      if (!Array.isArray(item[key]) || item[key].length > 100) throw new Error('タグ・実績の入力を確認してください。');
      project[key] = [...new Set(item[key].map(value => string(value, 'タグ・実績', 1000)).filter(Boolean))];
    }
    const images = item.images ?? (item.image ? [{ src: item.image, alt: item.imageAlt ?? '' }] : []);
    if (!Array.isArray(images) || images.length > 20) throw new Error('画像は1作品につき20枚まで登録できます。');
    project.images = images.map(image => {
      if (!image || typeof image !== 'object') throw new Error('画像の設定を確認してください。');
      const src = asset(image.src, 'image');
      if (!src) throw new Error('画像はファイル選択から追加してください。');
      return { src, alt: string(image.alt, '画像の説明', 500) };
    });
    project.updatedAt = date(item.updatedAt);
    project.video = asset(item.video, 'video');
    project.videoLink = string(item.videoLink ?? '', '作品紹介動画リンク', 2000);
    if (project.videoLink) {
      let url;
      try { url = new URL(project.videoLink); } catch { throw new Error('作品紹介動画リンクには、http:// または https:// から始まるURLを入力してください。'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('作品紹介動画リンクには、http:// または https:// から始まるURLを入力してください。');
    }
    project.featured = item.featured === true;
    return project;
  });
  return { version: 1, desktopColumns, cardStyle, pageUpdatedAt: { profile: date(input.pageUpdatedAt?.profile), works: date(input.pageUpdatedAt?.works) }, aura, profile, worksIntro: string(input.worksIntro, '作品一覧の紹介文'), projects };
}

function stampUpdates(input, previous, value = today()) {
  const pages = renderSite(validateContent(previous));
  return stampPageUpdates(input, file => pages.get(file), value);
}

// Compare the generated pages without their date labels, including linked asset versions.
function stampPageUpdates(input, readPreviousPage, value = today()) {
  const content = validateContent(input);
  const pages = renderSite(content);
  const dateFor = file => {
    const previous = readPreviousPage(file)?.replace(/\r\n/g, '\n');
    const date = previous?.match(PAGE_DATE)?.[1];
    return date && previous.replace(PAGE_DATE, '') === pages.get(file).replace(PAGE_DATE, '') ? date : value;
  };
  content.pageUpdatedAt.profile = dateFor('index.html');
  content.pageUpdatedAt.works = dateFor('works.html');
  for (const project of content.projects) {
    project.updatedAt = dateFor(`projects/${project.id}.html`);
  }
  return validateContent(content);
}

const updateLabel = (date, animate = true) => `<p class="page-updated"${animate ? ' data-motion' : ''}>更新日：<time datetime="${date}">${date.replace(/-/g, '/')}</time></p>`;

function gallery(project) {
  if (!project.images.length) return '<div class="empty-media detail-media" role="img" aria-label="作品画像欄（未設定）"></div>';
  const slides = project.images.map((image, index) => `<figure class="gallery-slide"><img src="../${escape(image.src)}" alt="${escape(image.alt || `${project.title}のゲーム画面 ${index + 1}`)}"${index ? ' loading="lazy"' : ''}></figure>`).join('');
  return `<section class="detail-media gallery" aria-label="${escape(project.title)}の作品画像" aria-roledescription="カルーセル" data-gallery><div class="gallery-viewport"><div class="gallery-track">${slides}</div></div>${project.images.length > 1 ? `<div class="gallery-controls" hidden><button type="button" class="gallery-arrow" data-gallery-prev aria-label="前の画像">←</button><p class="gallery-count" aria-live="polite" aria-atomic="true">1 / ${project.images.length}</p><button type="button" class="gallery-arrow" data-gallery-next aria-label="次の画像">→</button></div>` : ''}</section>`;
}

function auraStyle(aura) {
  const rgb = color => color.slice(1).match(/../g).map(value => parseInt(value, 16)).join(',');
  return `--aura-color-rgb:${rgb(aura.color)};--aura-accent-rgb:${rgb(aura.accentColor)};--aura-primary-opacity:${aura.brightness / 100 * .22};--aura-accent-opacity:${aura.brightness / 100 * .20};--aura-saturation:${aura.saturation / 100}`;
}

function shell(content, assetVersions, title, body, detail = false, filters = false, updatedAt = content.pageUpdatedAt[filters ? 'works' : 'profile'], pagePath = filters ? 'works.html' : '') {
  const prefix = detail ? '../' : '';
  const assetUrl = file => `${prefix}${file}?v=${assetVersions[file]}`;
  const pageName = content.profile.name.replace(/\s/g, '');
  const home = detail ? '../index.html' : 'index.html';
  const works = `${prefix}works.html`;
  const siteUrl = 'https://yoshito-d.github.io/';
  const shareImage = content.projects.find(project => project.id === 'planet-action')?.images[0];
  const shareTitle = `${content.profile.name} | ${title}`;
  const description = `${content.profile.role}・${content.profile.name}のポートフォリオ。個人・チームで制作したゲーム作品を紹介します。`;
  const shareUrl = new URL(pagePath, siteUrl).href;
  const imageUrl = shareImage ? new URL(shareImage.src, siteUrl).href : '';
  const metadata = `<meta name="description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:locale" content="ja_JP"><meta property="og:site_name" content="${escape(pageName)} Portfolio"><meta property="og:title" content="${escape(shareTitle)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${escape(shareUrl)}">${imageUrl ? `<meta property="og:image" content="${escape(imageUrl)}"><meta property="og:image:alt" content="GALAXY RACINGのゲーム画面">` : ''}<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(shareTitle)}"><meta name="twitter:description" content="${escape(description)}">${imageUrl ? `<meta name="twitter:image" content="${escape(imageUrl)}"><meta name="twitter:image:alt" content="GALAXY RACINGのゲーム画面">` : ''}`;
  const nav = `<header class="site-header"><a class="brand" href="${title === 'プロフィール' ? '#' : home}" aria-label="Portfolio トップへ">Portfolio</a><nav aria-label="メインナビゲーション"><a href="${title === 'プロフィール' ? '#about' : `${home}#about`}"${title === 'プロフィール' ? ' aria-current="page"' : ''}>プロフィール</a><a href="${works}"${filters ? ' aria-current="page"' : detail ? ' aria-current="location"' : ''}>作品一覧</a></nav></header>`;
  return `<!DOCTYPE html>\n<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">${metadata}<title>${escape(content.profile.name)} | ${escape(title)}</title><link rel="stylesheet" href="${assetUrl('styles.css')}">${detail ? `<script src="${assetUrl('gallery.js')}" defer></script>` : `<script src="${assetUrl('preview.js')}" defer></script>`}<script src="${assetUrl('motion.js')}" defer></script>${filters ? `<script src="${assetUrl('filters.js')}" defer></script>` : ''}</head><body data-aura="${escape(JSON.stringify(content.aura))}" style="${auraStyle(content.aura)};--desktop-columns:${content.desktopColumns}"><a class="skip-link" href="#main">本文へ移動</a>${nav}${body}<footer><a href="#">ページの先頭へ <span class="link-arrow" aria-hidden="true">↑</span></a>${updateLabel(updatedAt, false)}</footer></body></html>\n`;
}

function card(project, cardStyle) {
  const wire = cardStyle === 'wire';
  const hanger = wire ? '<span class="card-pin" aria-hidden="true"></span><div class="card-hanger" aria-hidden="true"><span class="card-wire card-wire-left"></span><span class="card-wire card-wire-right"></span></div>' : '';
  const eyelets = wire ? '<span class="card-eyelet card-eyelet-left" aria-hidden="true"></span><span class="card-eyelet card-eyelet-right" aria-hidden="true"></span>' : '';
  const titleId = `card-${project.id}`;
  const board = `${eyelets}<div class="empty-media" data-preview="${escape(project.video)}" aria-hidden="true">${project.images[0] ? `<img src="${escape(project.images[0].src)}" alt="" loading="lazy">` : ''}</div><h3 class="project-title" id="${titleId}">${escape(project.title)} <span class="link-arrow" aria-hidden="true">→</span></h3><div class="project-meta">${tagList(project)}${achievements(project)}</div>`;
  return `<article class="project-card${wire ? ' project-card-wire' : ''}" data-dimension="${escape(project.dimension)}" data-genre="${escape(project.genre)}" data-production="${escape(project.production)}" data-year="${escape(project.year)}">${hanger}<a class="project-link" href="projects/${project.id}.html" aria-labelledby="${titleId}">${wire ? `<div class="card-board">${board}</div>` : board}</a></article>`;
}

function renderSite(content) {
  const assetVersions = Object.fromEntries(PAGE_ASSETS.map(file => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
    return [file, createHash('sha256').update(source).digest('hex').slice(0, 16)];
  }));
  const renderPage = (...args) => shell(content, assetVersions, ...args);
  const { profile, projects } = content;
  const tools = {
    'visual-studio': ['Visual Studio', 'visual-studio.png', ''],
    github: ['GitHub', 'github.png', 'tool-icon-github'],
    aseprite: ['Aseprite', 'aseprite.png', 'tool-icon-pixel'],
    blender: ['Blender', 'blender.png', '']
  };
  const toolIcons = profile.tools.map(key => {
    const [name, file, cls] = tools[key];
    return `<li><img${cls ? ` class="${cls}"` : ''} src="assets/tools/${file}" alt="" width="48" height="48"><span>${name}</span></li>`;
  }).join('');
  const information = [['所属', profile.school], ['卒業予定', profile.graduation], ['趣味', profile.hobby], ['Email', profile.email]].map(([label, value]) => `<div><dt>${label}</dt><dd>${label === 'Email' && value ? `<a class="email-link" href="mailto:${escape(value)}">${escape(value)}</a>` : textLines(value)}</dd></div>`).join('');
  const pages = new Map();
  const featured = projects.filter(project => project.featured);
  pages.set('index.html', renderPage('プロフィール', `<main id="main" tabindex="-1">
<section id="about" class="profile-section" aria-labelledby="profile-title">
  <div class="profile-identity"><div>${profile.reading ? `<p class="reading" data-motion>${escape(profile.reading)}</p>` : ''}<h1 id="profile-title" data-motion>${escape(profile.name)}</h1>${profile.role ? `<p class="role" data-motion>${escape(profile.role)}</p>` : ''}</div>
    ${toolIcons ? `<div class="profile-tools" data-motion><p class="tools-label">使用ツール</p><ul class="tool-icons" aria-label="使用ツール">${toolIcons}</ul></div>` : ''}
  </div>
  <div class="profile-summary">${profile.description ? `<p class="profile-description" data-motion>${textLines(profile.description)}</p>` : ''}<dl class="profile" data-motion>${information}</dl></div>
</section>
${featured.length ? `<section id="works" class="section" aria-labelledby="works-title">
  <div class="section-heading-row"><h2 id="works-title" data-motion>代表作品</h2><a class="all-works-link" data-motion href="works.html">作品一覧を見る <span class="link-arrow" aria-hidden="true">→</span></a></div>
  <div class="featured-grid">${featured.map(project => card(project, content.cardStyle)).join('\n')}</div>
</section>` : ''}
</main>`));
  const usedTags = [...new Set(projects.flatMap(tags))];
  const filterGroups = [
    ['制作形態', ['個人制作', 'チーム制作']],
    ['学年', Array.from({ length: 9 }, (_, index) => `${index + 1}年次`)],
    ['2D・3D', ['2D', '3D']]
  ];
  const fixedTags = filterGroups.flatMap(([, group]) => group);
  const genres = ['アクション', 'シューティング', 'パズル'];
  filterGroups.push(['ジャンル・その他', [...genres, ...usedTags.filter(tag => !fixedTags.includes(tag) && !genres.includes(tag))]]);
  const visibleFilterGroups = filterGroups.map(([label, group]) => [label, group.filter(tag => usedTags.includes(tag))]).filter(([, group]) => group.length);
  const filter = usedTags.length ? `<section class="work-filters" aria-labelledby="filter-title" data-motion hidden>
  <details class="filter-options" open>
    <summary id="filter-title">タグで絞り込む</summary>
    <p class="filter-help">選択したタグをすべて含む作品を表示します。</p>
    <div class="filter-groups">${visibleFilterGroups.map(([label, group]) => `<fieldset class="filter-group"><legend class="filter-label">${label}</legend><div class="filter-tags">${group.map(tag => `<button type="button" class="filter-tag" data-tag="${escape(tag)}" aria-pressed="false"><span>${escape(tag)}</span></button>`).join('')}</div></fieldset>`).join('')}</div>
  </details>
  <div class="filter-summary"><p class="filter-count" role="status" aria-live="polite" aria-atomic="true"></p><button type="button" class="filter-reset" aria-disabled="true">絞り込みを解除</button></div>
</section><p class="filter-empty" data-motion hidden>条件に一致する作品はありません。絞り込み条件を変更してください。</p>` : '';
  const categories = ['個人制作', 'チーム制作'].map((production, index) => {
    const group = projects.filter(project => project.production === production).sort((a, b) => Number(b.year[0]) - Number(a.year[0]));
    if (!group.length) return '';
    return `<section class="work-category" aria-labelledby="category-${index}"><h2 id="category-${index}">${production}</h2><div class="featured-grid">${group.map(project => card(project, content.cardStyle)).join('\n')}</div></section>`;
  }).join('');
  pages.set('works.html', renderPage('作品一覧', `<main id="main" class="works-page section" tabindex="-1"><div class="section-heading"><h1>作品一覧</h1>${content.worksIntro ? `<p class="works-intro">${textLines(content.worksIntro)}</p>` : ''}</div>${filter}${categories}</main>`, false, true));
  for (const project of projects) {
    const info = [['開発環境', project.environment], ['担当', project.role], ['制作人数', project.teamSize], ['開発期間', project.duration]].map(([label, value]) => `<div><dt>${label}</dt><dd>${textLines(value)}</dd></div>`).join('');
    const media = gallery(project);
    const videoLink = `<div class="detail-video-section">${project.videoLink ? `<a class="detail-video-link" href="${escape(project.videoLink)}" target="_blank" rel="noopener noreferrer"><svg class="video-play-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 7.5 17 12l-7 4.5Z" fill="currentColor"/></svg>作品紹介動画を見る <span class="link-arrow" aria-hidden="true">↗</span><span class="sr-only">（新しいタブで開きます）</span></a>` : '<p class="detail-video-empty">作品紹介動画は準備中</p>'}</div>`;
    pages.set(`projects/${project.id}.html`, renderPage(project.title, `<main id="main" class="detail" tabindex="-1">
<a class="back-link" data-motion href="../works.html"><span class="link-arrow" aria-hidden="true">←</span> 作品一覧へ</a>
<h1>${escape(project.title)}</h1>
<div class="detail-topline" data-motion>${tagList(project)}${videoLink}</div>
<div class="detail-layout">${media}<section class="detail-facts" data-motion><h2>制作情報</h2><dl class="profile">${info}</dl></section></div>
${project.description ? `<section class="detail-section"><h2>作品概要</h2>${paragraphs(project.description)}</section>` : ''}
${project.achievements.length ? `<section class="detail-section"><h2>実績</h2>${achievements(project)}</section>` : ''}
${project.implementation ? `<section class="detail-section"><h2>こだわり・工夫・エピソード</h2>${paragraphs(project.implementation)}</section>` : ''}
</main>`, true, false, project.updatedAt, `projects/${project.id}.html`));
  }
  return pages;
}

module.exports = { ROOT, CONTENT, DEFAULT_AURA, escape, tags, readContent, validateContent, renderSite, stampUpdates, stampPageUpdates, today };
