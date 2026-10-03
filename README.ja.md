# S3 Atlas

Amazon S3 を、水面から海底まで。仕組み、料金、セキュリティ、必要なコマンドのすべて、そして業界での立ち位置までを一つにまとめた地図帳です。

[English](./README.md) | 日本語

![S3 Atlas トップページ](./.github/assets/hero.png)

## 中身

S3 Atlas は同じ情報源を共有する 2 つの部分でできています。

- **調査ドキュメント** ([`docs/`](./docs)): 全 18 章、各言語およそ 15,000 行。日本語で調査・執筆し、英語に翻訳しています。各章の末尾に参考文献があり、確認できなかった事項は「未確認」と明記しています。
- **Web アプリ** ([`src/`](./src)): ドキュメントを表示し、[`data/`](./data) の構造化データを使ったツールを提供します。

### 章立て

| #   | 章                                           | 日本語                                      | English                                     |
| --- | -------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| 1   | S3 とは何か                                  | [ja](./docs/ja/01-overview.md)              | [en](./docs/en/01-overview.md)              |
| 2   | ストレージクラス                             | [ja](./docs/ja/02-storage-classes.md)       | [en](./docs/en/02-storage-classes.md)       |
| 3   | 料金体系                                     | [ja](./docs/ja/08-pricing.md)               | [en](./docs/en/08-pricing.md)               |
| 4   | セキュリティ                                 | [ja](./docs/ja/03-security.md)              | [en](./docs/en/03-security.md)              |
| 5   | データ管理                                   | [ja](./docs/ja/04-data-management.md)       | [en](./docs/en/04-data-management.md)       |
| 6   | パフォーマンス                               | [ja](./docs/ja/05-performance.md)           | [en](./docs/en/05-performance.md)           |
| 7   | トラブルシューティング                       | [ja](./docs/ja/12-troubleshooting.md)       | [en](./docs/en/12-troubleshooting.md)       |
| 8   | 最前線 (Tables / Vectors / Files / Metadata) | [ja](./docs/ja/06-new-frontiers.md)         | [en](./docs/en/06-new-frontiers.md)         |
| 9   | 設計パターン                                 | [ja](./docs/ja/11-architecture-patterns.md) | [en](./docs/en/11-architecture-patterns.md) |
| 10  | エコシステム                                 | [ja](./docs/ja/16-ecosystem.md)             | [en](./docs/en/16-ecosystem.md)             |
| 11  | 企業の活用事例                               | [ja](./docs/ja/15-case-studies.md)          | [en](./docs/en/15-case-studies.md)          |
| 12  | ハンズオン                                   | [ja](./docs/ja/18-hands-on-labs.md)         | [en](./docs/en/18-hands-on-labs.md)         |
| 13  | 競合比較                                     | [ja](./docs/ja/09-competitors.md)           | [en](./docs/en/09-competitors.md)           |
| 14  | 業界での立ち位置                             | [ja](./docs/ja/10-industry.md)              | [en](./docs/en/10-industry.md)              |
| 15  | コマンド大全                                 | [ja](./docs/ja/07-cli-cookbook.md)          | [en](./docs/en/07-cli-cookbook.md)          |
| 16  | API リファレンス                             | [ja](./docs/ja/17-api-reference.md)         | [en](./docs/en/17-api-reference.md)         |
| 17  | 用語集                                       | [ja](./docs/ja/13-glossary.md)              | [en](./docs/en/13-glossary.md)              |
| 18  | FAQ とよくある誤解                           | [ja](./docs/ja/14-faq-and-quiz.md)          | [en](./docs/en/14-faq-and-quiz.md)          |

ファイル番号は調査した順番です。サイトとこの表は読む順番で並べています。

### インタラクティブツール

| ページ           | 内容                                                                             | データ                                                                       |
| ---------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ストレージクラス | 全クラスを水柱の層として表示。価格、レイテンシ、最低保存期間、取り出しオプション | `data/storage-classes.json`                                                  |
| コスト試算       | 1 つのワークロードを全 S3 クラスと 20 以上の事業者で試算 (転送料込み)            | `data/storage-classes.json`、`data/s3-pricing.json`、`data/competitors.json` |
| 競合比較         | 22 サービスの価格散布図、価格表、機能マトリクス、特徴                            | `data/competitors.json`                                                      |
| 市場             | 四半期別クラウド市場シェア、オブジェクトストレージ市場規模、数字で見る S3        | `data/market.json`                                                           |
| 活用事例         | S3 を離れた企業も含む 38 の公開事例                                              | `data/cases.json`                                                            |
| 年表             | 2006〜2026 年の 68 の出来事                                                      | `data/timeline.json`                                                         |
| コマンド         | 検索できる CLI / SDK / サードパーティのレシピ 134 件。破壊的操作には印つき       | `data/commands.json`                                                         |
| API              | S3 / S3 Control / Tables / Vectors / Files / Outposts の 309 オペレーション      | `data/api.json`                                                              |
| エコシステム     | S3 を読み書きする 77 のサービスとツール                                          | `data/ecosystem.json`                                                        |
| クイズ           | 3 段階の難易度で 40 問                                                           | `data/quiz.json`                                                             |

サイトのデフォルトは英語です。ヘッダーの言語切り替えで、全ページ・全章・全データが日本語になり、選択はブラウザに保存されます。

## ローカルで動かす

Node.js 22 以上が必要です。

```bash
npm ci
npm run dev        # http://localhost:5173
```

その他のスクリプト:

```bash
npm run build      # 型チェックして dist/ にビルド
npm run preview    # 本番ビルドを配信
npm test           # ユニット・コンポーネントテスト (Vitest)
npm run lint       # ESLint
npm run lint:md    # 全 Markdown に markdownlint-cli2
npm run check      # CI と同じチェックを順に実行
node scripts/validate-data.mjs   # JSON の妥当性と日英ドキュメントの対応を検証
```

## CI

| ワークフロー     | 内容                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ci.yml`         | 型チェック、ESLint、Prettier、markdownlint、Node 22 / 24 での Vitest (カバレッジ付き)、データと日英対応の検証、本番ビルド、外部リンクチェック (lychee) |
| `deploy.yml`     | `main` への push ごとに GitHub Pages へビルド・公開                                                                                                    |
| `codeql.yml`     | push、プルリクエスト、毎週の CodeQL 解析                                                                                                               |
| `freshness.yml`  | 毎月 1 日と 15 日に、AWS What's New の新しい S3 発表と古くなった価格データを追跡 Issue にまとめる                                                      |
| `dependabot.yml` | npm パッケージと GitHub Actions を毎週グループ単位で更新                                                                                               |

サイトを公開するには **Settings → Pages → Source** を **GitHub Actions** に設定してください。

## 正確性について

内容は 2026-10-03 時点の AWS 公式ドキュメント、AWS Price List API、What's New、AWS News Blog、各社の料金ページ、調査会社のレポートで確認しています。価格は特記がない限り us-east-1 の定価です。クラウドの価格はよく変わるため、数字を使う前に公式の料金ページで確認してください。訂正は歓迎します。[CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

S3 Atlas は個人による学習ガイドであり、Amazon Web Services とは無関係で、承認も受けていません。

## ライセンス

コードは [MIT License](./LICENSE)、`docs/` と `data/` のドキュメントとデータは [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) です。
