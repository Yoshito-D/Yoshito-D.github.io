# 吉戸大貴 — Game Programmer Portfolio

GitHub Pages向けの静的サイトです。ビルドは不要です。

## 編集するファイル

- `index.html`: プロフィール（連絡先・資料リンクを含む） → 代表作品（画像とタイトル）。
- `styles.css`: 色、文字、レイアウト、スマートフォン対応。
- `projects/*.html`: 各作品の詳細ページ。確認できた概要を掲載し、未確認の内容は空欄です。

## 埋める項目

- 所属、卒業予定、連絡先・資料URL。
- 個人制作作品の正式タイトル（トップと詳細ページの両方）。
- 作品画像。`empty-media`の中に `<img src="assets/messy-world.webp" alt="MESSY WORLDのゲーム画面">` を追加します。詳細ページからは `../assets/messy-world.webp` を使います。16:9推奨です。
- 詳細ページの開発期間、実装・工夫、動画・関連資料。

`index.html`をブラウザで開いて確認できます。画像や詳細ページのリンクは相対パスなので、GitHub Pagesのサブディレクトリでも動作します。

GitHub Pagesで公開する場合は、Settings → Pagesで main ブランチのルートを公開元に設定します。

## 作品一覧ページ

`works.html`に作品一覧とポートフォリオスライドへのリンクをまとめています。トップの代表作品の下とヘッダーから移動できます。作品画像・タイトルを変更するときは、`index.html`、`works.html`、該当する`projects/*.html`を編集してください。
