# よくある誤解 FAQ とクイズ

_最終確認: 2026-10-03_

S3 は 2006 年から続くサービスなので、古いブログ記事や過去の仕様に基づく「常識」が今も出回っている。この章では、現場でよく聞く誤解を 1 問ずつ取り上げ、現在の仕様で訂正する。最後に、理解度を確認するためのクイズ (`data/quiz.json`) の使い方を説明する。

## 0. 誤解の早見表

| #   | 誤解                                                     | 実際 (2026-10 時点)                                                                                       |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | S3 は結果整合性なので書き込み直後は読めないことがある    | 2020 年 12 月から強い read-after-write 整合性 (LIST 含む)                                                 |
| 2   | S3 にはフォルダがある                                    | 汎用バケットはフラットなキー空間。フォルダはプレフィックスの表示                                          |
| 3   | キー名の先頭をランダムにしないと遅い                     | 2018 年の改善以降、プレフィックスごとに 3,500/5,500 req/s。ランダム化は不要、分散は有効                   |
| 4   | オブジェクトの最大サイズは 5 TB                          | 2025 年 12 月から 50 TB (48.8 TiB)                                                                        |
| 5   | 暗号化は自分で有効にしないとされない                     | 2023 年 1 月からすべての新規オブジェクトが SSE-S3 で自動暗号化                                            |
| 6   | 新しいバケットはまず ACL を設定する                      | 2023 年 4 月から新規バケットは ACL 無効 (Bucket owner enforced) と BPA 有効が既定                         |
| 7   | 静的サイトは website endpoint で HTTPS 公開できる        | website endpoint は HTTP のみ。HTTPS は CloudFront で                                                     |
| 8   | ETag はファイルの MD5                                    | マルチパートや SSE-KMS では MD5 ではない                                                                  |
| 9   | Glacier に入れたらすぐ読める                             | Instant Retrieval 以外は復元が必要                                                                        |
| 10  | ライフサイクルは設定した瞬間に効く                       | 1 日 1 回非同期評価。数日かかることもある                                                                 |
| 11  | バージョニングをやめれば旧バージョンは消える             | 停止 (Suspended) しかできず、既存バージョンは残る                                                         |
| 12  | レプリケーションを設定すれば既存オブジェクトも複製される | 新規のみ。既存は Batch Replication                                                                        |
| 13  | 削除もレプリケーションで必ず同期される                   | 削除マーカー複製は設定次第、バージョン指定削除は複製されない                                              |
| 14  | 403 が出たら IAM ポリシーだけ見ればよい                  | バケットポリシー、BPA、KMS、VPCE、SCP/RCP、ACL など多層                                                   |
| 15  | 存在しないキーは必ず 404                                 | `s3:ListBucket` がないと 403                                                                              |
| 16  | Presigned URL は最大 7 日有効                            | 一時クレデンシャルで作ればその有効期限が上限                                                              |
| 17  | Intelligent-Tiering は小さなファイルにも得               | 128 KB 未満は監視対象外で常に Frequent Access 料金                                                        |
| 18  | 503 SlowDown は S3 の障害                                | 多くはスケール中のスロットリング。リトライと分散で対処                                                    |
| 19  | One Zone-IA は耐久性が低い                               | 耐久性目標は同じ 11 nines だが AZ 喪失で失われうる                                                        |
| 20  | バケット名はアカウント内で一意であればよい               | グローバル名前空間ではパーティション全体で一意。ただし 2026 年 3 月からアカウントリージョナル名前空間あり |
| 21  | S3 の 403 エラーにも全部課金される                       | 組織外 / アカウント外からの 403 はバケット所有者に課金されない                                            |
| 22  | S3 は同時書き込みの競合を防げない                        | 条件付き書き込み (`If-None-Match` / `If-Match`) と条件付き削除がある                                      |
| 23  | SSE-C が一番安全                                         | 鍵管理の負担が大きく、2026 年 4 月から新規バケット等で既定ブロック                                        |
| 24  | バケットはいくらでも無料で作れる                         | 既定クォータ 10,000、2,000 を超えるバケットには `Global-Bucket-Hrs` 課金                                  |
| 25  | `aws s3 ls --summarize` の合計が請求の保存量             | 非現行バージョン、未完了 MPU、メタデータ等を含まない                                                      |
| 26  | Gateway エンドポイントはオンプレミスからも使える         | VPC 内のみ。オンプレミスは Interface エンドポイント                                                       |
| 27  | イベント通知は 1 回だけ順序通りに届く                    | at-least-once。重複・順序入れ替わりあり                                                                   |
| 28  | 削除したバケット名は自分だけが再利用できる               | グローバル名前空間では誰でも再作成できる                                                                  |

## 1. 整合性と名前空間

### Q1. 書き込み直後に GET すると古いデータが返ることがある

誤解。S3 は 2020 年 12 月から、追加料金や性能低下なしで全リージョン・全リクエストに強い read-after-write 整合性を提供している。新規 PUT、上書き PUT、DELETE の後の GET、HEAD、LIST はすべて最新の状態を反映する。

ただし注意点がある。

- 同一キーへの並行書き込みは「最後に完了したものが勝つ」であり、ロックはない。競合を防ぐには条件付き書き込みを使う。
- CloudFront などのキャッシュ層は別問題で、古い内容が返ることはある。
- バケット設定の変更は反映に時間がかかる場合があり、一般的な秒数保証はない。ドキュメント上の例: ライフサイクル設定の追加・更新は反映まで「数分」、バージョニングを初めて有効化した後は PUT / DELETE の前に 15 分待つことが推奨されている。

### Q2. S3 にはディレクトリ (フォルダ) がある

誤解 (汎用バケットの場合)。汎用バケットはフラットなキーと値のストアで、`photos/2026/a.jpg` は「`photos/2026/a.jpg` という名前の 1 つのキー」にすぎない。コンソールのフォルダは、`/` を区切り文字 (delimiter) として LIST した結果を表示しているだけ。

例外として、S3 Express One Zone のディレクトリバケットは階層的な名前空間を持ち、ディレクトリが実体として扱われる。

### Q3. キーの先頭をランダムなハッシュにしないと性能が出ない

半分誤解。2018 年の性能改善以前は、キー名の先頭を分散させることが推奨されていた。現在はプレフィックスごとに少なくとも毎秒 3,500 の書き込み系、5,500 の読み取り系リクエストをサポートし、プレフィックスの数に上限はない。

ランダム化そのものは不要だが、「1 つのプレフィックスに極端なリクエストを集中させない」ことは今も有効。急なトラフィック増では内部のパーティション分割が追いつくまで 503 SlowDown が出ることがある。

### Q4. バケット名は自分のアカウントの中で一意なら OK

誤解。従来のグローバル名前空間では、バケット名はパーティション (aws、aws-cn、aws-us-gov) 内のすべてのアカウントで一意でなければならない。他人が使っていれば `BucketAlreadyExists` になり、バケットを削除するとその名前は第三者が取得できる。

2026 年 3 月に導入された「アカウントリージョナル名前空間」では、`mybucket-123456789012-us-east-1-an` のように自アカウント・リージョン固有のサフィックスを付けた名前を使うことで、その名前を自分専用にできる。

## 2. サイズと性能

### Q5. S3 のオブジェクトは最大 5 TB

古い情報。2025 年 12 月に最大オブジェクトサイズは 50 TB に引き上げられた。User Guide のマルチパート制限表では 48.8 TiB と記載されている。単一 PUT の上限は引き続き 5 GiB、マルチパートは 5 MiB〜5 GiB のパートを最大 10,000 個。

### Q6. 大きなファイルは 1 本の PUT で送るのが一番速い

誤解。100 MB を超えたらマルチパートアップロードを検討するのが公式の目安。パートを並列に送るとスループットが上がり、失敗時もそのパートだけ再送すればよい。AWS CRT ベースの SDK や CLI は自動で分割・並列化する。

### Q7. 503 SlowDown が出たら S3 の障害なので待つしかない

誤解。SlowDown はリクエストレートが高すぎることを示すスロットリングで、S3 の保護機構の一部。指数バックオフでのリトライ、プレフィックスの分散、トラフィックの段階的な増加で解消できる。なお 5xx エラーはバケット所有者に課金されない。

## 3. セキュリティと権限

### Q8. 暗号化は明示的に設定しないとされない

古い情報。2023 年 1 月 5 日以降、S3 にアップロードされるすべての新規オブジェクトは、追加料金なしで SSE-S3 (AES-256) により自動的に暗号化される。より強い制御 (キーポリシー、監査) が必要なら SSE-KMS を既定暗号化に設定する。

### Q9. SSE-C (顧客提供キー) が一番安全

誤解しやすい。SSE-C は AWS が鍵を保持しない反面、リクエストのたびに鍵を送る必要があり、鍵を失えばデータは復号できない。また、攻撃者が窃取したクレデンシャルで自前の鍵を使ってデータを上書き暗号化する手口にも使われうる。

S3 は 2025 年 11 月に SSE-C をブロックするバケット設定 (`BlockedEncryptionTypes`) を追加し、2026 年 4 月からは新規バケットと SSE-C オブジェクトを持たない既存バケットで SSE-C を既定で無効化する展開を始めた。多くの場合 SSE-KMS の方が運用・監査の両面で優れている。

### Q10. 新しいバケットを作ったらまず ACL を設定する

古い情報。2023 年 4 月以降、新規バケットは Object Ownership = Bucket owner enforced (ACL 無効) と Block Public Access 全有効が既定になった。アクセス制御はバケットポリシー、IAM、アクセスポイント、Access Grants で行う。

### Q11. 403 が出たら IAM ポリシーを直せば解決する

誤解。S3 の認可は多層で、以下のどれでも拒否されうる。

1. IAM ポリシー (アイデンティティベース)
2. バケットポリシー / アクセスポイントポリシー
3. Block Public Access
4. ACL と Object Ownership (他アカウント所有のオブジェクト)
5. KMS キーポリシー
6. VPC エンドポイントポリシー
7. SCP / RCP / Permissions boundary / セッションポリシー
8. Requester Pays、Object Lock、アーカイブ状態

同一アカウントまたは同一組織内からのリクエストなら、エラーメッセージにどのポリシー種別が拒否したか (明示的拒否なら多くの場合ポリシー ARN も) が含まれるので、まずメッセージを読む。

### Q12. 存在しないキーにアクセスすると必ず 404 が返る

誤解。呼び出し元にそのバケットの `s3:ListBucket` 権限がない場合、S3 はキーの存在を漏らさないために 403 を返す。「403 なのに権限は正しいはず」という場合、キー名の誤りである可能性もある。

### Q13. Presigned URL は誰でも 7 日間有効にできる

半分誤解。SigV4 の Presigned URL の最大有効期限は 7 日 (604,800 秒) だが、URL は生成に使ったクレデンシャルの権限と有効期限に従う。IAM ロールの一時クレデンシャルで生成した場合、セッションが切れた時点で URL も無効になる。また、生成者自身にその操作の権限がなければ URL は機能しない。

### Q14. バケットポリシーで `Principal: "*"` を書いたら必ず公開される

誤解。Block Public Access が有効なら、公開とみなされるポリシーの保存自体や、そのポリシーによるパブリックアクセスがブロックされる。逆に `aws:PrincipalOrgID` などで条件を付けたポリシーは「公開」と判定されない。公開は CloudFront + OAC で行い、バケットは非公開に保つのが推奨。

## 4. ストレージクラスとライフサイクル

### Q15. Glacier に入れたデータはすぐに GET できる

クラスによる。Glacier Instant Retrieval はミリ秒でそのまま読める。Glacier Flexible Retrieval と Glacier Deep Archive、Intelligent-Tiering の Archive Access / Deep Archive Access 層は `RestoreObject` が必要で、復元せずに GET すると `InvalidObjectState` になる。取り出し時間の目安は Flexible が Expedited 1〜5 分、Standard 3〜5 時間、Bulk 5〜12 時間、Deep Archive は Standard 12 時間以内、Bulk 48 時間以内。

### Q16. Intelligent-Tiering に入れておけば何でも安くなる

誤解。128 KB 未満のオブジェクトは監視対象外で、常に Frequent Access 層 (Standard 相当) の料金になる (監視料もかからない)。また 128 KB 以上のオブジェクトにはオブジェクト数に応じた監視・自動化料金がかかる。アクセスパターンが明確なら、ライフサイクルで直接適切なクラスに遷移させた方が安いことがある。

### Q17. ライフサイクルルールは保存した瞬間から有効

誤解。ルールは 1 日 1 回非同期に評価され、期限の日付は翌日の 00:00 UTC に丸められる。大規模なバケットでは処理完了まで数日かかることもある。ただし、オブジェクトが期限切れの対象になった時点で、そのオブジェクトの保存料金は課金されなくなる。

さらに、2024 年 9 月以降は 128 KB 未満のオブジェクトは既定で遷移対象外になった。小さなオブジェクトも遷移させたい場合は `ObjectSizeGreaterThan` などのフィルタで明示する。

### Q18. One Zone-IA は耐久性が低いストレージクラス

半分誤解。One Zone-IA の耐久性の設計目標は他のクラスと同じ 99.999999999% だが、それは 1 つの AZ の中での話。AZ が物理的に失われた場合にはデータが失われる可能性がある。可用性の目標も Standard (99.99%) より低い 99.5%。再生成可能なデータや二次コピーに使う。

## 5. バージョニング・レプリケーション・保護

### Q19. バージョニングを無効にすれば旧バージョンも消える

誤解。一度有効化したバージョニングは「停止 (Suspended)」にしかできず、無効 (Unversioned) には戻せない。停止しても既存のバージョンは残り、課金され続ける。不要なら `NoncurrentVersionExpiration` で削除する。

### Q20. バージョニング有効バケットで DELETE するとデータが消える

誤解。バージョン ID を指定しない DELETE は「削除マーカー」を作るだけで、データは非現行バージョンとして残る。削除マーカーを消せば元に戻せる。完全に消すにはバージョン ID を指定して削除するか、ライフサイクルで非現行バージョンを期限切れにする。

### Q21. レプリケーションを設定すれば既存のオブジェクトも複製される

誤解。レプリケーションルールは設定後に書き込まれたオブジェクトが対象。既存オブジェクトや過去に失敗したオブジェクトは S3 Batch Replication で複製する。また、レプリカはさらに別のバケットへチェーン複製されない。

### Q22. レプリケーションはバックアップの代わりになる

注意が必要。レプリケーションは「変更をそのままコピーする」ので、論理的な破損や悪意のある上書きも複製される。バージョン指定の削除は複製されない仕組みになっているが、ランサムウェア対策には Object Lock、別アカウントへの隔離コピー、AWS Backup (継続バックアップで 35 日以内の任意時点に復元) を組み合わせる。

### Q23. Object Lock は後から簡単に外せる

モードによる。Governance モードは `s3:BypassGovernanceRetention` 権限があれば解除・短縮できるが、Compliance モードは root ユーザーを含め誰も保持期間を短縮できず、期限まで削除できない。テスト時は短い保持期間か Governance モードを使う。

## 6. コストと運用

### Q24. 403 エラーのリクエストにも全部課金される

古い情報。現在は、バケット所有者の個別アカウントまたは組織の外から来た `AccessDenied` (403) リクエストは、バケット所有者に課金されない。5xx エラーも課金されない。

### Q25. バケットはいくつ作っても無料

誤解。既定のクォータは 1 アカウント 10,000 バケット (申請で引き上げ可)。請求データには `Global-Bucket-Hrs-FreeTier` (2,000 バケットまでの無料枠) と `Global-Bucket-Hrs` (無料枠を超えたバケット) の Usage Type があり、2,000 を超えるバケットは課金対象になる。

### Q26. `aws s3 ls --recursive --summarize` の合計が請求額の保存量と一致する

誤解。このコマンドは現行バージョンのみを数える。請求には非現行バージョン、未完了のマルチパートアップロードのパーツ、Glacier のオブジェクトごとのメタデータ分などが含まれる。正確な把握には S3 Storage Lens や CloudWatch の `BucketSizeBytes`、S3 Inventory を使う。

### Q27. ETag を比較すればファイルの同一性を検証できる

条件付きで誤解。単一 PUT かつ SSE-S3 / 暗号化なしなら ETag は MD5 だが、マルチパートアップロードでは「各パートの MD5 を連結した MD5 - パート数」形式になり、SSE-KMS / SSE-C では MD5 ではない。完全性検証には CRC64NVME、CRC32C、SHA-256 などの追加チェックサムを使う。

### Q28. S3 では同じキーへの同時書き込みの衝突を防げない

古い情報。2024 年に条件付き書き込み (`If-None-Match: *` で「存在しなければ作成」、`If-Match: <ETag>` で「変わっていなければ更新」) が汎用バケットで使えるようになり、2025 年 9 月には `If-Match` による条件付き削除も追加された。条件不成立は 412 Precondition Failed、並行操作による競合は 409 Conflict になる。

## 7. その他のよくある誤解

### Q29. S3 Transfer Acceleration を有効にすれば常に速くなり、常に課金される

誤解。Transfer Acceleration は CloudFront のエッジロケーション経由で長距離転送を高速化する機能で、クライアントがバケットのリージョンに近い場合は効果が小さい。AWS は、通常の転送より速くならなかった場合はアクセラレーション料金を課金しないとしている。効果は公式の速度比較ツールで事前に確認できる。また、バケット名にドット (`.`) が含まれると使えない。

### Q30. Gateway VPC エンドポイントを作れば VPC 外からの S3 アクセスを全部防げる

誤解。Gateway エンドポイントは「VPC 内から S3 への経路」を提供するだけで、インターネット経由の S3 アクセスを止めるものではない。VPC 外からのアクセスを拒否したいなら、バケットポリシーで `aws:SourceVpce` や `aws:SourceVpc` を条件にした Deny を書く。逆にこの Deny を書くと、コンソールなどインターネット経由の操作も拒否される点に注意する。

### Q31. Gateway エンドポイントはオンプレミスからも使える

誤解。Gateway エンドポイントは VPC 内のリソースからのみ使え、Direct Connect や VPN の先にあるオンプレミスからは使えない。オンプレミスからプライベートに接続するには Interface エンドポイント (PrivateLink、有料) を使う。

### Q32. S3 のイベント通知は必ず 1 回だけ、順序通りに届く

誤解。S3 Event Notifications は at-least-once 配信で、まれに重複したり順序が入れ替わったりする。同一キーのイベントの前後関係はイベントに含まれる `sequencer` で判定する。処理は冪等に作り、SQS を挟んで DLQ を用意するのが定石。

### Q33. CloudTrail を有効にすればオブジェクトの読み書きもすべて記録される

誤解。CloudTrail が既定で記録するのは管理イベント (バケットの作成、ポリシー変更など) で、`GetObject` や `PutObject` などのデータイベントは追加設定 (有料) が必要。低コストな代替としてサーバーアクセスログもあるが、こちらはベストエフォート配信で、完全性は保証されない。

### Q34. バケットポリシーで Deny を書けば root ユーザーも締め出せるので安全

半分誤解。確かに誤ったバケットポリシーで全員を拒否してしまうことはあるが、同一アカウントの root ユーザーはバケットポリシーを削除して回復できる (公式手順あり)。組織として root やアカウント管理者の操作も制限したい場合は、SCP / RCP を併用する。

### Q35. S3 Express One Zone は S3 Standard の高速版で、同じように使える

誤解。S3 Express One Zone はディレクトリバケットという別のバケット種別を使い、単一 AZ に配置される。セッションベース認証 (`CreateSession`)、階層的な名前空間など挙動が異なり、汎用バケットのすべての機能をサポートするわけではない。AZ の喪失に備えて、再生成可能なデータや一時データ、学習用キャッシュなどに使うのが基本。

### Q36. Requester Pays を有効にすれば、誰がアクセスしても自分は一切払わない

誤解。Requester Pays ではリクエスト料金とデータ転送料金をリクエスタが払うが、保存料金は引き続きバケット所有者が払う。また、匿名アクセスは Requester Pays バケットでは許可されず、リクエスタは認証したうえで `x-amz-request-payer: requester` を付ける必要がある。

### Q37. 削除したバケットの名前は自分だけが再利用できる

誤解 (グローバル名前空間の場合)。バケットを削除すると、その名前は誰でも新たに作成できる状態に戻る。アプリの設定、IaC、DNS の CNAME、公開ドキュメントなどに旧バケット名が残っていると、第三者が同名バケットを作ってデータを受け取ったり、偽のコンテンツを配信したりする危険がある。参照を先に消すこと、`ExpectedBucketOwner` パラメータや `aws:ResourceAccount` 条件で相手アカウントを固定すること、アカウントリージョナル名前空間を使うことが対策になる。

### Q38. S3 Storage Lens は有料サービスなので使わないほうがよい

誤解。Storage Lens には無料のメトリクス (使用量中心) と有料の高度なメトリクス・推奨事項がある。無料のダッシュボードだけでも、バケット別の保存量、非現行バージョンの割合、未完了マルチパートの容量など、想定外の請求の調査に役立つ情報が得られる。

### Q39. コンソールで「フォルダを作成」すると、その下のオブジェクトの容量とは別にフォルダの容量がかかる

ほぼ誤解。コンソールの「フォルダを作成」は、末尾が `/` のゼロバイトのオブジェクトを作るだけなので、保存容量はほぼかからない (PUT リクエスト 1 回分の料金はかかる)。フォルダの中のオブジェクトを全部削除してもフォルダが残って見えるのは、このゼロバイトオブジェクトが残っているため。

## 8. クイズ

`data/quiz.json` に 40 問の 4 択クイズを収録している。Web アプリは英語が既定で日本語に切り替えられるため、各問題は英語と日本語の両方を持つ。

### 8.1 データ形式

| フィールド    | 型                         | 説明                       |
| ------------- | -------------------------- | -------------------------- |
| `id`          | 文字列                     | 一意な ID (`q01`〜`q40`)   |
| `question`    | `{ en, ja }`               | 問題文                     |
| `choices`     | `{ en: [4], ja: [4] }`     | 選択肢。両言語で同じ順序   |
| `answer`      | 数値 (0〜3)                | 正解の選択肢のインデックス |
| `explanation` | `{ en, ja }`               | 解説                       |
| `difficulty`  | `easy` / `medium` / `hard` | 難易度                     |
| `topic`       | `{ en, ja }`               | 分野                       |

```json
{
  "id": "q01",
  "question": { "en": "...", "ja": "..." },
  "choices": { "en": ["A", "B", "C", "D"], "ja": ["A", "B", "C", "D"] },
  "answer": 2,
  "explanation": { "en": "...", "ja": "..." },
  "difficulty": "easy",
  "topic": { "en": "Consistency", "ja": "整合性" }
}
```

### 8.2 出題範囲

| 分野                                                         | 問題数の目安 | 対応する章の内容                           |
| ------------------------------------------------------------ | ------------ | ------------------------------------------ |
| 基礎 (整合性、名前空間、制限値)                              | 8            | バケット、キー、オブジェクトサイズ、整合性 |
| セキュリティ (BPA、ACL、暗号化、ポリシー)                    | 10           | 権限評価、KMS、Presigned URL               |
| ストレージクラスとライフサイクル                             | 7            | 最低保存期間、復元、128 KB ルール          |
| 保護 (バージョニング、Object Lock、レプリケーション、Backup) | 7            | DR とランサムウェア対策                    |
| 性能・運用・コスト                                           | 8            | リクエストレート、エラー、請求             |

### 8.3 検証方法

```bash
node -e 'const q=require("./data/quiz.json"); console.log(q.length, q.every(x => x.choices.en.length===4 && x.choices.ja.length===4 && x.answer>=0 && x.answer<=3))'
```

### 8.4 問題一覧

各問題の正解と解説は `data/quiz.json` を参照。ここでは問題文 (日本語) と分野・難易度のみを示す。

| ID  | 分野                     | 難易度 | 問題 (日本語)                                                                                                                                           |
| --- | ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| q01 | 整合性                   | easy   | 既存オブジェクトを PUT で上書きし成功した直後、別のクライアントから同じキーを GET した。S3 は何を返すか。                                               |
| q02 | 制限値                   | easy   | 2026 年時点で、S3 の 1 オブジェクトの最大サイズはどれか。                                                                                               |
| q03 | 制限値                   | easy   | 1 回の PutObject リクエストでアップロードできる最大サイズはどれか。                                                                                     |
| q04 | マルチパートアップロード | easy   | マルチパートアップロードで、最後以外の各パートの最小サイズはどれか。                                                                                    |
| q05 | マルチパートアップロード | easy   | 1 つのマルチパートアップロードの最大パート数はどれか。                                                                                                  |
| q06 | パフォーマンス           | medium | S3 がプレフィックスあたり最低限サポートする GET/HEAD リクエスト数 (毎秒) はどれか。                                                                     |
| q07 | 暗号化                   | easy   | 暗号化を何も指定せずに新しいオブジェクトをアップロードした。どのように保存されるか。                                                                    |
| q08 | アクセス制御             | easy   | 新規作成した汎用バケットの Object Ownership の既定値はどれか。                                                                                          |
| q09 | アーキテクチャ           | easy   | 独自ドメインかつ HTTPS で S3 の静的サイトを配信したい。推奨される方法はどれか。                                                                         |
| q10 | トラブルシューティング   | medium | s3:GetObject はあるが s3:ListBucket がないユーザーが、存在しないキーを GET した。返る HTTP ステータスはどれか。                                         |
| q11 | Presigned URL            | medium | 1 時間で失効するロールの一時クレデンシャルを使い、有効期限 7 日の Presigned URL を生成した。1 時間後はどうなるか。                                      |
| q12 | トラブルシューティング   | hard   | S3 がポリシー種別を含む強化メッセージではなく、汎用の Access Denied メッセージだけを返すのはどれか。                                                    |
| q13 | 暗号化                   | medium | SSE-KMS で暗号化されたオブジェクトをダウンロードするために、呼び出し元に必要な KMS 権限はどれか。                                                       |
| q14 | 暗号化                   | hard   | SSE-KMS オブジェクトをマルチパートアップロードする場合に必要な KMS 権限の組み合わせはどれか。                                                           |
| q15 | 暗号化                   | medium | SSE-KMS で S3 Bucket Keys を有効にする主な利点はどれか。                                                                                                |
| q16 | アクセス制御             | medium | AWS Organizations のリソースコントロールポリシー (RCP) は S3 に対して何をするか。                                                                       |
| q17 | 条件付きリクエスト       | medium | If-None-Match: * ヘッダー付きで PutObject を送ったが、同じキーのオブジェクトが既に存在した。どうなるか。                                                |
| q18 | 条件付きリクエスト       | hard   | 並行する削除が先に成功したため、条件付き CompleteMultipartUpload が 409 Conflict を返した。どうすべきか。                                               |
| q19 | ストレージクラス         | medium | S3 Glacier Deep Archive の最低保存期間 (課金) はどれか。                                                                                                |
| q20 | コスト                   | medium | S3 Standard-IA に保存した 40 KB のオブジェクトはどのように課金されるか。                                                                                |
| q21 | ストレージクラス         | medium | S3 Intelligent-Tiering は 128 KB 未満のオブジェクトをどう扱うか。                                                                                       |
| q22 | ライフサイクル           | hard   | 30 日後に全オブジェクトを Glacier Flexible Retrieval へ遷移するライフサイクルを設定したが、2026 年に作成した 50 KB のオブジェクトが遷移しない。なぜか。 |
| q23 | ストレージクラス         | medium | Glacier Flexible Retrieval のオブジェクトを復元せずに GET した。返るエラーはどれか。                                                                    |
| q24 | ストレージクラス         | medium | S3 Glacier Deep Archive で利用できない取り出しオプションはどれか。                                                                                      |
| q25 | バージョニング           | easy   | バケットのバージョニングを有効化した後、可能な状態変更はどれか。                                                                                        |
| q26 | バージョニング           | easy   | バージョニング有効バケットで、バージョン ID を指定せずに DeleteObject するとどうなるか。                                                                |
| q27 | レプリケーション         | medium | 既に 1,000 万オブジェクトがあるバケットにレプリケーションルールを追加した。既存オブジェクトを複製するにはどうするか。                                   |
| q28 | データ保護               | medium | Object Lock の Compliance モードでロックされたバージョンの保持期間を短縮できるのは誰か。                                                                |
| q29 | データ保護               | medium | AWS Backup の S3 継続バックアップでは、どこまで遡って任意の時点に復元できるか。                                                                         |
| q30 | バージョニング           | hard   | MFA Delete について正しい記述はどれか。                                                                                                                 |
| q31 | パフォーマンス           | easy   | アプリケーションで 503 SlowDown が多発している。最適な対処はどれか。                                                                                    |
| q32 | コスト                   | medium | HTTP 503 Slow Down で失敗したリクエストはバケット所有者に課金されるか。                                                                                 |
| q33 | コスト                   | hard   | 見知らぬ外部アカウントから数百万件の未認可リクエストが来て 403 AccessDenied になった。料金は誰が払うか。                                                |
| q34 | コスト                   | medium | 請求で Usage Type「TimedStorage-ByteHrs」が急増した。これは何を表すか。                                                                                 |
| q35 | コスト                   | medium | S3 Standard の Usage Type「Requests-Tier1」に含まれるリクエストはどれか。                                                                               |
| q36 | イベント                 | hard   | S3 Event Notifications を SQS FIFO キューに直接送りたい。どうなるか。                                                                                   |
| q37 | ネットワーク             | easy   | プライベートサブネットの EC2 が、同一リージョンの S3 から NAT Gateway 経由で数 TB をダウンロードしている。最も簡単にコストを下げる変更はどれか。        |
| q38 | データ完全性             | medium | SSE-S3 でマルチパートアップロードしたオブジェクトの ETag が「...-12」の形式だった。正しいのはどれか。                                                   |
| q39 | バケット                 | hard   | 2026 年に導入された S3 のアカウントリージョナル名前空間では、バケット名はどのような形式になるか。                                                       |
| q40 | アーキテクチャ           | easy   | S3 のアンチパターンはどれか。                                                                                                                           |

## 9. 誤解が生まれる理由: 仕様変更の年表

S3 の誤解の多くは「昔は正しかった」情報。ブログや書籍を読むときは、次の年表と照らし合わせて書かれた時期を確認するとよい。

| 時期                 | 変更                                                              | 影響を受ける「古い常識」                                        |
| -------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| 2018 年 7 月         | リクエスト性能の大幅向上 (プレフィックスあたり 3,500/5,500 req/s) | 「キー先頭をランダムハッシュにせよ」                            |
| 2020 年 9 月         | 2020-09-30 より後に作成されたバケットでパス形式 URL が非対応に    | 「`s3.amazonaws.com/bucket/key` で何でもアクセスできる」        |
| 2020 年 12 月        | 強い read-after-write 整合性 (LIST 含む)                          | 「上書き直後は古いデータが返る」                                |
| 2023 年 1 月         | すべての新規オブジェクトを SSE-S3 で自動暗号化                    | 「既定では暗号化されない」                                      |
| 2023 年 4 月         | 新規バケットで BPA 有効・ACL 無効が既定                           | 「まず ACL を設定する」                                         |
| 2024 年              | 組織外 / アカウント外からの 403 はバケット所有者に課金しない変更  | 「403 の攻撃リクエストでも課金される」                          |
| 2024 年 8 月 / 11 月 | 条件付き書き込み (`If-None-Match`、続いて `If-Match`)             | 「S3 では楽観ロックできない」                                   |
| 2024 年 9 月         | 128 KB 未満はライフサイクル遷移の既定対象外                       | 「全オブジェクトが遷移される」                                  |
| 2024 年 11 月        | AWS Organizations の RCP                                          | 「外部プリンシパル対策はバケットポリシー頼み」                  |
| 2025 年 9 月         | 汎用バケットの条件付き削除                                        | 「削除の競合は防げない」                                        |
| 2025 年 11 月        | 汎用バケットの ABAC、SSE-C ブロック設定                           | 「バケットタグはコスト配分専用」                                |
| 2025 年 12 月        | 最大オブジェクトサイズ 50 TB                                      | 「最大 5 TB」                                                   |
| 2026 年 3 月         | アカウントリージョナル名前空間                                    | 「バケット名は早い者勝ちのみ」                                  |
| 2026 年 4 月         | SSE-C の既定無効化の展開、Amazon S3 Files の GA                   | 「SSE-C は常に使える」「S3 はファイルシステムとしては使えない」 |

上記の月は What's New / ブログの発表時期に基づく。条件付き書き込みは 2024-08-20 (`If-None-Match`) と 2024-11-25 (`If-Match`) に発表された。

## 10. 自己診断チェックリスト

以下に「はい」と即答できなければ、該当する章を読み直すとよい。

1. 403 が出たとき、エラーメッセージからどのポリシー種別が原因かを読み取れる。
2. `s3:ListBucket` と `s3:GetObject` の Resource ARN の違い (バケット ARN とオブジェクト ARN) を説明できる。
3. 自分のバケットの非現行バージョンと未完了マルチパートの容量を確認する方法を知っている。
4. 各ストレージクラスの最低保存期間と最小課金サイズを言える。
5. CloudFront + OAC でバケットを非公開のまま配信する構成を組める。
6. 条件付き書き込みで 412 と 409 が返る違いを説明できる。
7. ランサムウェアに対して、本番アカウントが完全に乗っ取られても残るコピーを持っている。
8. Usage Type の `TimedStorage-ByteHrs`、`Requests-Tier1`、`DataTransfer-Out-Bytes` が何を意味するか説明できる。
9. レプリケーションで既存オブジェクトと削除がどう扱われるかを説明できる。
10. 2023 年以降に変わった既定値 (暗号化、BPA、ACL) と 2025〜2026 年の変更 (50 TB、ABAC、名前空間、SSE-C) を把握している。

## 11. クイズの使い方のヒント

- まず `easy` だけを解き、全問正解できたら `medium`、`hard` に進む。
- 間違えた問題は `topic` を手がかりに、対応する章 (セキュリティ、ストレージクラス、トラブルシューティング等) を読み直す。
- 解説には、関連する制限値や例外 (例: 128 KB ルール、組織外の 403 の扱い) を含めているので、正解した問題でも解説を読むと知識が広がる。
- 選択肢の順序は英語と日本語で同じなので、言語を切り替えても `answer` のインデックスはそのまま使える。

## 参考文献

- Amazon S3 data consistency model: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html#ConsistencyModel>
- Amazon S3 Update – Strong Read-After-Write Consistency (2020-12): <https://aws.amazon.com/blogs/aws/amazon-s3-update-strong-read-after-write-consistency/>
- Organizing objects using prefixes: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-prefixes.html>
- Performance design patterns for Amazon S3: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance-design-patterns.html>
- Amazon S3 multipart upload limits: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html>
- Amazon S3 increases the maximum object size to 50 TB (2025-12): <https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-s3-maximum-object-size-50-tb/>
- Amazon S3 now automatically encrypts all new objects (2023-01): <https://aws.amazon.com/about-aws/whats-new/2023/01/amazon-s3-automatically-encrypts-new-objects/>
- Controlling ownership of objects and disabling ACLs: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html>
- Amazon S3 adds new bucket-level setting to standardize encryption types (2025-11): <https://aws.amazon.com/about-aws/whats-new/2025/11/amazon-s3-bucket-level-standardize-encryption-types/>
- Amazon S3 default bucket security setting for SSE-C (2026-04): <https://aws.amazon.com/about-aws/whats-new/2026/04/s3-default-bucket-security-setting/>
- Troubleshoot access denied (403 Forbidden) errors: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshoot-403-errors.html>
- Billing for Amazon S3 error responses: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/ErrorCodeBilling.html>
- Sharing objects with presigned URLs: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html>
- Amazon S3 Glacier storage classes: <https://aws.amazon.com/s3/storage-classes/glacier/>
- How do I troubleshoot lifecycle configuration rule issues: <https://repost.aws/knowledge-center/s3-lifecycle-configuration-rule>
- Understanding your AWS billing and usage reports for Amazon S3: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/aws-usage-report-understand.html>
- General purpose bucket quotas: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/BucketRestrictions.html>
- Introducing account regional namespaces for S3 general purpose buckets (2026-03): <https://aws.amazon.com/blogs/aws/introducing-account-regional-namespaces-for-amazon-s3-general-purpose-buckets/>
- How to prevent object overwrites with conditional writes: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html>
- Amazon S3 Path Deprecation Plan – The Rest of the Story: <https://aws.amazon.com/blogs/aws/amazon-s3-path-deprecation-plan-the-rest-of-the-story/>
- Amazon S3 conditional deletes (2025-09): <https://aws.amazon.com/about-aws/whats-new/2025/09/amazon-s3-conditional-deletes-s3-general-purpose-buckets/>
- Locking objects with Object Lock: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html>
- Replicating objects: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html>
- AWS Backup FAQs: <https://aws.amazon.com/backup/faqs/>
- Configuring MFA delete: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/MultiFactorAuthenticationDelete.html>
- Amazon S3 Event Notifications: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html>
- Gateway endpoints for Amazon S3: <https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html>
- Using Requester Pays buckets: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/RequesterPaysBuckets.html>
- Amazon S3 Transfer Acceleration: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration.html>
- Amazon S3 Storage Lens: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage_lens.html>
- S3 Express One Zone: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/directory-bucket-high-performance.html>
- Setting an S3 Lifecycle configuration on a bucket (propagation delay): <https://docs.aws.amazon.com/AmazonS3/latest/userguide/how-to-set-lifecycle-configuration-intro.html>
- put-bucket-versioning (wait 15 minutes after enabling): <https://docs.aws.amazon.com/cli/latest/reference/s3api/put-bucket-versioning.html>
- Amazon S3 adds support for conditional writes (2024-08-20): <https://aws.amazon.com/about-aws/whats-new/2024/08/amazon-s3-conditional-writes/>
- Amazon S3 adds new functionality for conditional writes (2024-11-25): <https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-s3-functionality-conditional-writes/>
