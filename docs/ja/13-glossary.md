# 用語集

_最終確認: 2026-10-03_

S3 とその周辺で登場する用語を、英字のアルファベット順 (記号・数字は先頭) に並べた。各用語は 1〜3 文で説明し、詳細は各章を参照してほしい。日付付きの記述は、その機能が発表・既定化された時期を示す。

## 読み方

- 「関連」列には、あわせて読むと理解が深まる用語を示す。
- API 名は `PutObject` のようにコード表記にしている。
- 未確認の事項には「未確認」と明記している。

## 記号・数字

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| 11 nines (99.999999999%) | S3 Standard などが設計上目標とする年間のオブジェクト耐久性。1,000 万個のオブジェクトを保存すると、平均して 1 万年に 1 個失う程度の確率を意味する。 | Durability |
| 3,500 / 5,500 | 1 つのプレフィックスあたりで最低限サポートされる 1 秒あたりのリクエスト数 (PUT/COPY/POST/DELETE が 3,500、GET/HEAD が 5,500)。プレフィックスを増やせば合計は線形に伸びる。 | Prefix、SlowDown |

## A

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| ABAC (Attribute-Based Access Control) | タグなどの属性で権限を決める方式。S3 ではプリンシパルタグ (`aws:PrincipalTag`) を ARN に埋め込む方法に加え、2025 年 11 月から汎用バケットのタグ (`aws:ResourceTag`) による制御もサポートされた。 | Session tags、PutBucketAbac |
| Abort Incomplete Multipart Upload | 指定日数を過ぎた未完了マルチパートアップロードを自動中止するライフサイクルアクション。中止しないとアップロード済みパーツの保存料金が発生し続ける。 | Multipart upload、Lifecycle |
| Access Analyzer for S3 | IAM Access Analyzer の機能で、外部アカウントや公開に共有されているバケットを検出する。ポリシーの検証や未使用アクセスの分析にも使う。 | Block Public Access |
| Access Control List (ACL) | バケットやオブジェクトに付与するレガシーな権限リスト。2023 年 4 月以降の新規バケットは既定で無効 (Bucket owner enforced) で、使用は推奨されない。 | Object Ownership |
| Access Grants | IAM Identity Center のユーザー・グループや IAM プリンシパルに、プレフィックス単位でアクセスを付与する仕組み。アプリは `GetDataAccess` で一時クレデンシャルを受け取る。 | Identity Center |
| Access Point | バケットに対する名前付きのネットワークエンドポイント。個別のポリシーと Block Public Access 設定を持ち、VPC からのみのアクセスに限定することもできる。 | Multi-Region Access Point |
| Access Point alias | アクセスポイントに自動付与されるバケット名互換の別名 (`...-s3alias`)。バケット名を要求するツールでもアクセスポイント経由のアクセスができる。 | Access Point |
| Account regional namespace | 2026 年 3 月に導入された、アカウントとリージョン固有のサフィックス (例: `-123456789012-us-east-1-an`) を付けたバケット名を自アカウント専用に予約できる名前空間。名前の先取りを防げる。 | Bucket name |
| AllAccessDisabled | 対象へのアクセスが全面的に無効化されていることを示す 403 エラー。通常はアカウントレベルの問題で、AWS サポートへの問い合わせが必要。 | AccessDenied |
| Amazon S3 Files | 2026 年 4 月に GA した、S3 バケットをファイルシステムとしてマウントできるサービス。Amazon EFS をベースにし、ファイル API と S3 API の両方から同じデータにアクセスできる。 | Mountpoint for Amazon S3 |
| Annotation (S3 annotations) | オブジェクトに 1 バイト〜1 MiB の名前付きペイロードを最大 1,000 個まで付与できる機能。`PutObjectAnnotation` 等の API で後から追加・変更でき、S3 Metadata の annotation テーブルで分析できる。 | Metadata、User-defined metadata |
| ARN (Amazon Resource Name) | AWS リソースの一意な識別子。S3 では `arn:aws:s3:::bucket` (バケット) と `arn:aws:s3:::bucket/key` (オブジェクト) の 2 形式があり、リージョンとアカウントは省略される。 | IAM |
| Archive Access tier | S3 Intelligent-Tiering のオプション層で、90 日以上アクセスのないオブジェクトを移す。取り出しには復元が必要。 | Intelligent-Tiering |
| Archive Instant Access tier | Intelligent-Tiering で 90 日アクセスのないオブジェクトが自動的に移る層。復元不要でミリ秒アクセスできる。 | Intelligent-Tiering |
| AWS Backup for S3 | AWS Backup による S3 のバックアップ。継続バックアップ (35 日以内の任意時点に復元) と定期スナップショットがあり、バージョニングが必須。 | PITR |
| AWS CRT (Common Runtime) | AWS SDK の高性能な基盤ライブラリ。自動的なマルチパート分割・並列転送で S3 のスループットを引き出す。 | Transfer Manager |

## B

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Batch Operations | マニフェスト (CSV か Inventory レポート) に列挙した数十億のオブジェクトに対し、コピー、タグ付け、復元、Lambda 呼び出しなどを一括実行するマネージド機能。 | Inventory |
| Batch Replication | 既存オブジェクトや過去に複製に失敗したオブジェクトを、Batch Operations ジョブで後追い複製する機能。 | Replication |
| Block Public Access (BPA) | ACL やポリシーによる公開を一括で禁止する 4 つの設定。アカウント、バケット、アクセスポイント単位で設定でき、新規バケットは既定で全て ON。 | Public access |
| BlockedEncryptionTypes | バケットの既定暗号化設定に含められるパラメータで、SSE-C を指定した書き込みを拒否できる。2026 年 4 月から新規バケット等で SSE-C が既定ブロックされる展開が始まった。 | SSE-C |
| Bucket | オブジェクトを格納する最上位のコンテナ。汎用バケット、ディレクトリバケット、テーブルバケット、ベクトルバケットの種類がある。 | General purpose bucket |
| Bucket Key (S3 Bucket Keys) | SSE-KMS で、バケット単位の短期キーを使って KMS へのリクエスト数を最大 99% 削減する機能。KMS 料金とスロットリングを抑えられる。 | SSE-KMS |
| Bucket name | バケットの名前。3〜63 文字の小文字・数字・ハイフン・ドットで、グローバル名前空間ではパーティション内で一意でなければならない。 | Account regional namespace |
| Bucket owner enforced | Object Ownership の設定値の 1 つで、ACL を無効にし、すべてのオブジェクトの所有者をバケット所有者に統一する。推奨設定。 | Object Ownership |
| Bucket policy | バケットに付与するリソースベースの JSON ポリシー。クロスアカウントアクセスや条件付きの拒否 (TLS 強制等) に使う。 | IAM policy |
| BucketAlreadyExists | 作成しようとしたバケット名を他アカウントが使っているときの 409 エラー。自アカウント所有なら `BucketAlreadyOwnedByYou`。 | Bucket name |
| Byte-range fetch | `Range` ヘッダーでオブジェクトの一部だけを取得すること。並列ダウンロードや大きなファイルの部分読みに使う。 | GetObject |

## C

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Checksum (additional checksums) | CRC64NVME、CRC32、CRC32C、SHA-1、SHA-256 によるデータ完全性検証。アップロード時に計算してオブジェクトに保存でき、2025 年以降は SDK が既定で CRC 系チェックサムを付与する。 | ETag |
| CloudFront | AWS の CDN。S3 の前段に置くことで HTTPS、キャッシュ、WAF を提供する。 | OAC |
| CloudTrail data events | `GetObject` や `PutObject` などのオブジェクト操作を記録する CloudTrail のイベント。既定では記録されず、有料で有効化する。 | Server access logging |
| Compliance mode | Object Lock の保持モードの 1 つで、保持期間中は root ユーザーを含め誰も削除・期間短縮できない。 | Governance mode |
| Conditional delete | `If-Match` ヘッダーで ETag が一致する場合だけ削除する機能。2025 年 9 月に汎用バケットで提供開始された。 | Conditional write |
| Conditional write | `If-None-Match: *` (存在しなければ書く) や `If-Match: ETag` (変わっていなければ書く) で上書き競合を防ぐ機能。条件不成立は 412、競合は 409 になる。 | PreconditionFailed |
| Content-MD5 | アップロード内容の MD5 を Base64 で送るヘッダー。不一致なら `BadDigest` で拒否される。 | Checksum |
| CopyObject | S3 内でオブジェクトをコピーする API。単一リクエストでは 5 GB までで、それ以上は `UploadPartCopy` を使う。 | Multipart upload |
| CORS | ブラウザが別オリジンのリソースにアクセスするための仕組み。S3 ではバケットに CORS ルールを設定する。 | Presigned URL |
| CreateSession | ディレクトリバケットで使う、短期のセッション認証情報を取得する API。以降のリクエストのレイテンシを下げる。 | Directory bucket |
| Cross-Region Replication (CRR) | 異なるリージョンのバケットへオブジェクトを非同期に複製する機能。DR やレイテンシ削減に使う。 | SRR |
| CUR (Cost and Usage Report) | AWS の詳細な請求データ。S3 では Usage Type と Operation の組み合わせでコストの原因を分析できる。現在は Data Exports の CUR 2.0 が推奨。 | Usage type |

## D

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Data perimeter | 信頼できるアイデンティティ、リソース、ネットワークだけがアクセスできるようにする境界の考え方。`aws:PrincipalOrgID`、`aws:ResourceOrgID`、`aws:SourceVpce` 等を SCP/RCP/VPCE ポリシーで組み合わせる。 | RCP、SCP |
| Deep Archive Access tier | Intelligent-Tiering のオプション層で、180 日以上アクセスのないオブジェクトを移す。取り出しは最大 12 時間程度。 | Intelligent-Tiering |
| Default encryption | バケットに書き込まれたオブジェクトに自動的に適用される暗号化設定。2023 年 1 月以降、すべての新規オブジェクトは少なくとも SSE-S3 で暗号化される。 | SSE-S3 |
| Delete marker | バージョニング有効バケットでバージョン ID を指定せずに削除したとき作られるプレースホルダ。データ自体は非現行バージョンとして残る。 | Versioning |
| DeleteObjects | 1 リクエストで最大 1,000 オブジェクトを削除するバッチ削除 API。 | Lifecycle |
| Directory bucket | S3 Express One Zone などで使うバケット種別。単一 AZ (またはローカルゾーン) に配置され、階層的な名前空間とセッション認証を持つ。 | Express One Zone |
| DSSE-KMS | KMS キーを使い 2 層の暗号化を行うサーバー側暗号化。特定のコンプライアンス要件向け。 | SSE-KMS |
| Durability | データが失われない確率。S3 Standard 等は 99.999999999% (11 nines) を目標に設計されている。 | Availability |

## E

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Early delete fee | IA 系 (30 日)、Glacier Instant/Flexible Retrieval (90 日)、Deep Archive (180 日) の最低保存期間前に削除・上書き・遷移したときの日割り料金。 | Storage class |
| Endpoint | S3 にリクエストを送る URL。`bucket.s3.region.amazonaws.com` (仮想ホスト形式)、website endpoint、FIPS、デュアルスタック、アクセスポイント等がある。 | Virtual-hosted style |
| ETag | オブジェクトのエンティティタグ。単一 PUT かつ SSE-S3/平文なら内容の MD5 だが、マルチパートや SSE-KMS では MD5 ではない。 | Checksum |
| Event Notifications | オブジェクトの作成・削除・復元などを SNS、SQS、Lambda、EventBridge に通知する機能。配信は at-least-once。 | EventBridge |
| EventBridge integration | バケット単位で有効化すると全 S3 イベントを Amazon EventBridge に送る機能。高度なフィルタ、複数ターゲット、リプレイが使える。 | Event Notifications |
| Expedited retrieval | Glacier Flexible Retrieval からの最速の取り出し (通常 1〜5 分)。プロビジョンド容量で可用性を保証できる。 | Restore |
| ExpectedBucketOwner | リクエストに付けると、バケット所有者のアカウント ID が一致しない場合に 403 で失敗させるパラメータ。バケット名の乗っ取り対策になる。 | Bucket sniping |
| Expiration | ライフサイクルで、指定日数を過ぎたオブジェクトを期限切れにするアクション。バージョニング有効時は削除マーカーが付く。 | Lifecycle |
| Expired object delete marker | 非現行バージョンが 1 つも残っていない削除マーカー。ライフサイクルで自動削除できる。 | Delete marker |
| Express One Zone (S3 Express One Zone) | 単一 AZ に置かれ、1 桁ミリ秒の一貫したレイテンシを提供する高性能ストレージクラス。ディレクトリバケットを使う。 | Directory bucket |

## F

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| FIPS endpoint | FIPS 140 検証済みの暗号モジュールを使うエンドポイント (`s3-fips.region.amazonaws.com`)。米国政府系の要件で使う。 | Endpoint |
| Folder | S3 コンソール上の表示概念で、実体はキー名に含まれる `/` 区切りのプレフィックス。汎用バケットに本物のディレクトリはない。 | Prefix |
| Frequent Access tier | Intelligent-Tiering の既定層。S3 Standard と同等の料金・性能。 | Intelligent-Tiering |

## G

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Gateway endpoint | S3 と DynamoDB 用の VPC エンドポイント。ルートテーブルにルートを追加する方式で、追加料金がかからない。 | Interface endpoint |
| General purpose bucket | 従来型の S3 バケット。ほぼすべての機能とストレージクラスをサポートし、既定で 1 アカウントあたり 10,000 個まで作成できる。 | Directory bucket |
| GetObject | オブジェクトを取得する API。条件付きヘッダー、Range、バージョン指定、レスポンスヘッダーの上書きなどが使える。 | HeadObject |
| Glacier Deep Archive | 最も安価なアーカイブ用ストレージクラス。取り出しは Standard で通常 12 時間以内、Bulk で 48 時間以内。最低保存期間 180 日。 | Restore |
| Glacier Flexible Retrieval | 数分〜数時間で取り出せるアーカイブ用ストレージクラス (旧称 S3 Glacier)。最低保存期間 90 日。 | Restore |
| Glacier Instant Retrieval | ミリ秒で取り出せるアーカイブ用ストレージクラス。四半期に一度程度アクセスするデータ向け。最低保存期間 90 日。 | Standard-IA |
| Governance mode | Object Lock の保持モードの 1 つで、`s3:BypassGovernanceRetention` 権限を持つユーザーは保持を解除・短縮できる。 | Compliance mode |
| GuardDuty Malware Protection for S3 | 新しくアップロードされたオブジェクトを GuardDuty がマルウェアスキャンし、結果をタグ等で返す機能。 | GuardDuty S3 Protection |
| GuardDuty S3 Protection | CloudTrail の S3 データイベントを分析し、異常なアクセスや流出の兆候を検知する GuardDuty の機能。 | CloudTrail data events |

## H

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| HeadBucket | バケットの存在とアクセス権を確認する API。レスポンスヘッダーでリージョンもわかる。 | HeadObject |
| HeadObject | ボディなしでオブジェクトのメタデータを取得する API。エラー時は汎用ステータスコードのみが返る。 | GetObject |
| Hive-style partition | `year=2026/month=10/` のように `キー=値` 形式でプレフィックスを切るパーティション規則。Athena や Glue が自動認識する。 | Data lake |

## I

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| IAM policy | IAM ユーザー・ロールに付与するアイデンティティベースのポリシー。同一アカウント内では、IAM かバケットポリシーのどちらかで Allow され Deny がなければアクセスできる。 | Bucket policy |
| Iceberg (Apache Iceberg) | 大規模分析向けのオープンなテーブル形式。S3 Tables はこの形式をネイティブにサポートする。 | S3 Tables |
| Infrequent Access tier | Intelligent-Tiering で 30 日アクセスのないオブジェクトが自動的に移る層。 | Intelligent-Tiering |
| Intelligent-Tiering | アクセスパターンに応じてオブジェクトを自動的に層移動するストレージクラス。取り出し料金はなく、オブジェクトごとの監視料がかかる (128 KB 未満は対象外)。 | Storage class |
| Interface endpoint | AWS PrivateLink による S3 の VPC エンドポイント。プライベート IP を持ち、オンプレミスから Direct Connect / VPN 経由でも使える (有料)。 | Gateway endpoint |
| Inventory (S3 Inventory) | バケット内のオブジェクト一覧とメタデータを日次または週次で CSV / ORC / Parquet で出力する機能。LIST の代替として使う。 | Batch Operations |
| InvalidObjectState | 復元していないアーカイブ層のオブジェクトを GET したときの 403 エラー。 | Restore |

## K

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Key (object key) | バケット内でオブジェクトを一意に識別する名前。最大 1,024 バイト (UTF-8)。 | Prefix |
| KMS key | AWS KMS で管理する暗号化キー。SSE-KMS では AWS マネージドキー (`aws/s3`) かカスタマーマネージドキーを使い、クロスアカウントには後者が必要。 | SSE-KMS |

## L

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Legal hold | Object Lock の機能で、期限なしでオブジェクトバージョンの削除を禁止する。`s3:PutObjectLegalHold` 権限で解除する。 | Object Lock |
| Lifecycle configuration | オブジェクトのストレージクラス遷移や期限切れ削除を自動化するルール群。1 日 1 回非同期に評価される。 | Transition |
| ListObjectsV2 | バケット内のオブジェクトを 1 回最大 1,000 件ずつ列挙する API。`prefix` と `delimiter` で階層的に絞り込める。 | Inventory |
| ListObjectVersions | 全バージョンと削除マーカーを列挙する API。 | Versioning |

## M

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Macie | 機械学習とパターンマッチで S3 内の機密データ (個人情報等) を検出するサービス。 | GuardDuty |
| Manifest | Batch Operations が処理対象とするオブジェクトの一覧。CSV、S3 Inventory レポート、またはジョブ作成時の自動生成で用意する。 | Batch Operations |
| Metadata (S3 Metadata) | バケットのオブジェクト情報を S3 Tables 上の Iceberg テーブル (journal、live inventory、annotation) として自動的に保持し、SQL でクエリできる機能。 | S3 Tables |
| MFA Delete | バージョンの完全削除とバージョニング状態の変更に MFA を要求する設定。root ユーザーのみが有効化でき、ライフサイクルと併用できない。 | Versioning |
| Mountpoint for Amazon S3 | S3 バケットをローカルファイルシステムとしてマウントするオープンソースのクライアント。大きなファイルの逐次読み込みに最適化されている。 | Amazon S3 Files |
| Multi-Region Access Point (MRAP) | 複数リージョンのバケットを 1 つのグローバルエンドポイントで扱う機能。最寄りのリージョンにルーティングし、フェイルオーバー制御もできる。 | CRR |
| Multipart upload (MPU) | 大きなオブジェクトをパートに分けて並列アップロードする仕組み。パートは 5 MiB〜5 GiB、最大 10,000 パート。 | UploadPart |

## N

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| NoSuchKey | 存在しないキーを GET したときの 404 エラー。呼び出し元に `s3:ListBucket` がない場合は 403 になる。 | AccessDenied |
| Noncurrent version | バージョニング有効バケットで、上書きや削除によって最新ではなくなったバージョン。保存料金がかかり続ける。 | NoncurrentVersionExpiration |
| NoncurrentVersionExpiration | 非現行になってから指定日数経過したバージョンを完全削除するライフサイクルアクション。`NewerNoncurrentVersions` で保持数を指定できる。 | Lifecycle |

## O

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| OAC (Origin Access Control) | CloudFront が SigV4 で署名して S3 オリジンにアクセスする仕組み。バケットを非公開のまま配信でき、SSE-KMS にも対応する。 | OAI |
| OAI (Origin Access Identity) | CloudFront から S3 へのアクセスを制限する旧方式。新規構築では OAC が推奨される。 | OAC |
| Object | S3 に保存されるデータの単位。データ本体、キー、メタデータ、バージョン ID などからなり、最大サイズは 2025 年 12 月から 50 TB (48.8 TiB)。 | Key |
| Object Lambda | GET 等のリクエスト時に Lambda でデータを変換して返す機能 (S3 Object Lambda)。未確認: 新規顧客への提供状況は変わっている可能性がある。 | Access Point |
| Object Lock | WORM (Write Once Read Many) モデルでオブジェクトバージョンの削除・上書きを防ぐ機能。保持期間 (Governance / Compliance) と Legal hold がある。 | WORM |
| Object Ownership | オブジェクトの所有者と ACL の扱いを決めるバケット設定。Bucket owner enforced、Bucket owner preferred、Object writer の 3 種類。 | ACL |
| Object tag | オブジェクトに付けるキーと値のペア (最大 10 個)。ライフサイクルフィルタや権限条件に使える。 | Lifecycle |
| One Zone-IA | 単一 AZ に保存される低頻度アクセス用ストレージクラス。安価だが AZ の喪失でデータを失う可能性がある。 | Standard-IA |
| Outposts (S3 on Outposts) | オンプレミスの AWS Outposts 上で S3 API を使えるようにする機能。 | Directory bucket |

## P

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Part | マルチパートアップロードの分割単位。パート番号 1〜10,000 を持ち、最後以外は 5 MiB 以上が必要。 | Multipart upload |
| Path-style URL | `s3.region.amazonaws.com/bucket/key` 形式の URL。2020 年 9 月 30 日より後に作成されたバケットでは非対応で、仮想ホスト形式が推奨される。 | Virtual-hosted style |
| PermanentRedirect | バケットと異なるリージョンのエンドポイントにリクエストしたときの 301 エラー。 | Endpoint |
| PITR (Point-in-time restore) | AWS Backup の継続バックアップで、過去 35 日以内の任意の時点の状態に S3 データを復元すること。 | AWS Backup for S3 |
| Prefix | キーの先頭部分の文字列。リクエストレートのスケーリング、ライフサイクル、権限、LIST の単位になる。 | Folder |
| Presigned POST | ブラウザフォームから直接アップロードするための署名付きポリシー。`content-length-range` などの条件でサイズや Content-Type を制限できる。 | Presigned URL |
| Presigned URL | 生成者の権限で特定の操作を期限付きで許可する URL。SigV4 では最大 7 日だが、一時クレデンシャルで作るとその有効期限が上限になる。 | SigV4 |
| Principal | ポリシーでアクセスを許可・拒否される主体 (IAM ユーザー、ロール、アカウント、サービス、`*`)。 | Bucket policy |
| Public access | 匿名ユーザー (`Principal: "*"`) などへのアクセス許可。Block Public Access で一括禁止できる。 | BPA |
| PutBucketAbac | 汎用バケットの ABAC を有効化する API。有効化後はバケットタグを `TagResource` / `UntagResource` で管理する。 | ABAC |
| PutObject | オブジェクトをアップロードする API。単一リクエストで最大 5 GiB。 | Multipart upload |

## R

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| RCP (Resource Control Policy) | AWS Organizations のポリシーで、リソース側 (S3 バケット等) に組織全体のガードレールを課す。2024 年 11 月に導入され、外部プリンシパルからのアクセス制限などに使う。 | SCP、Data perimeter |
| Read-after-write consistency | 書き込み直後の読み取りで最新データが返ること。S3 は 2020 年 12 月以降、全リージョンで強い整合性を提供する (LIST を含む)。 | Strong consistency |
| Reduced Redundancy Storage (RRS) | 耐久性を下げた旧ストレージクラス。現在は非推奨で、Standard の方が安価な場合が多い。 | Storage class |
| Replica modification sync | レプリカ側で変更されたメタデータ (タグ、ACL、Object Lock 設定) を送信元に同期する設定。双方向レプリケーションで使う。 | Replication |
| Replication | バケット間でオブジェクトを非同期に自動複製する機能 (CRR、SRR)。送信元と送信先の両方でバージョニングが必要。 | Batch Replication |
| Replication Time Control (RTC) | 新しいオブジェクトの 99.99% を 15 分以内に複製する SLA 付きのレプリケーションオプション。メトリクスと通知も付く。 | Replication |
| Request rate | 1 秒あたりのリクエスト数。プレフィックスごとに自動スケールし、急増時は一時的に 503 SlowDown が返ることがある。 | SlowDown |
| Requester Pays | リクエストとデータ転送の料金をリクエスタ側に請求するバケット設定。リクエスタは `x-amz-request-payer: requester` を付ける必要がある。 | Billing |
| Restore (RestoreObject) | アーカイブ層のオブジェクトの一時コピーを作り、読めるようにする操作。Expedited、Standard、Bulk の取り出し速度を選ぶ。 | Glacier |
| Retention period | Object Lock の保持期限。期間中は対象バージョンの削除・上書きができない。 | Object Lock |
| Routing rules | 静的 Web サイトホスティングで、条件に応じてリダイレクトするルール。 | Website endpoint |

## S

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| S3 Tables (table bucket) | Apache Iceberg テーブルを格納・管理するための専用バケット種別。コンパクションやスナップショット管理を自動で行う。 | Iceberg |
| S3 Vectors (vector bucket) | ベクトル埋め込みを保存し類似検索するための専用バケット種別。ベクトルインデックス単位で管理する。 | RAG |
| SCP (Service Control Policy) | AWS Organizations で、アカウント内のプリンシパルが使える権限の上限を定めるポリシー。 | RCP |
| Server access logging | バケットへのリクエストをログファイルとして別バケットに配信する機能。ベストエフォート配信で、無料 (保存料は別)。 | CloudTrail data events |
| Server-side encryption (SSE) | S3 がデータを保存時に暗号化する方式。SSE-S3、SSE-KMS、DSSE-KMS、SSE-C がある。 | Default encryption |
| Session tags | `AssumeRole` 時に付与するタグ。`aws:PrincipalTag` としてポリシーで参照でき、マルチテナント ABAC に使う。 | ABAC |
| SigV4 (Signature Version 4) | AWS API リクエストの署名方式。S3 では SigV2 は非推奨で、新しいリージョンや機能は SigV4 のみ対応。 | Presigned URL |
| SignatureDoesNotMatch | 計算した署名がサーバー側と一致しないときの 403 エラー。キーの誤り、ヘッダー改変、エンコード差などが原因。 | SigV4 |
| SlowDown | リクエストレートが高すぎるときの 503 エラー。指数バックオフでリトライし、プレフィックスを分散する。 | Request rate |
| SRR (Same-Region Replication) | 同一リージョン内の別バケットへの複製。ログ集約やアカウント間のコピーに使う。 | CRR |
| SSE-C | 顧客が毎回提供する鍵で S3 が暗号化する方式。AWS は鍵を保存しない。2026 年 4 月から新規バケット等で既定ブロックが展開されている。 | BlockedEncryptionTypes |
| SSE-KMS | AWS KMS のキーで暗号化する方式。キーポリシーと CloudTrail によるアクセス制御・監査ができる。 | Bucket Key |
| SSE-S3 | S3 が管理する鍵 (AES-256) で暗号化する方式。すべての新規オブジェクトの既定。 | Default encryption |
| Standard (S3 Standard) | 頻繁にアクセスするデータ向けの既定ストレージクラス。3 つ以上の AZ に保存される。 | Storage class |
| Standard-IA | 低頻度アクセス向けのストレージクラス。保存料は安いが取り出し料金と最低 30 日・最低 128 KB の課金がある。 | One Zone-IA |
| Static website hosting | バケットを HTTP の Web サイトとして公開する機能。website endpoint は HTTPS 非対応なので本番では CloudFront を前段に置く。 | Website endpoint |
| Storage class | 耐久性、可用性、料金、取り出し特性の組み合わせ。オブジェクトごとに指定する。 | Lifecycle |
| Storage Class Analysis | プレフィックスやタグ単位でアクセスパターンを分析し、Standard-IA への遷移タイミングを提案する機能。 | Lifecycle |
| Storage Lens | 組織全体の S3 の使用量・アクティビティ・コスト最適化・データ保護の指標をダッシュボードで可視化する機能。無料メトリクスと高度なメトリクスがある。 | Usage type |
| Strong consistency | 書き込み・上書き・削除の直後から、すべての読み取りと LIST が最新状態を反映する性質。S3 は追加料金なしで提供する。 | Read-after-write consistency |

## T

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| TagStorage | オブジェクトタグの保存料金を表す Usage Type (`TagStorage-TagHrs`)。 | Object tag |
| Transfer Acceleration | CloudFront のエッジロケーション経由で長距離のアップロード・ダウンロードを高速化する機能。速くならなかった転送には課金されない。 | Endpoint |
| Transfer Manager | SDK の高レベル転送 API。マルチパートの分割、並列化、リトライを自動で行う。 | AWS CRT |
| Transition | ライフサイクルでオブジェクトを別のストレージクラスへ移すアクション。上位クラスへの移動はできない (ウォーターフォールモデル)。 | Lifecycle |

## U

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| UploadPart | マルチパートアップロードの 1 パートを送る API。レスポンスの ETag を Complete 時に指定する。 | Multipart upload |
| UploadPartCopy | 既存オブジェクトの一部をパートとしてコピーする API。5 GB を超えるコピーに使う。 | CopyObject |
| Usage type | 請求データでの使用量の種類。`TimedStorage-ByteHrs` (Standard 保存量)、`Requests-Tier1` (PUT/LIST 等)、`DataTransfer-Out-Bytes` (インターネット転送) など。 | CUR |
| User-defined metadata | `x-amz-meta-` で始まるユーザー定義のメタデータ。合計 2 KB まで。変更するにはオブジェクトをコピーし直す必要がある。 | Annotation |

## V

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Version ID | バージョニング有効バケットでオブジェクトの各バージョンに付く一意な ID。無効時は `null`。 | Versioning |
| Versioning | 同一キーの全バージョンを保持する機能。一度有効化すると無効には戻せず、停止 (Suspended) のみ可能。 | Delete marker |
| Virtual-hosted style | `bucket.s3.region.amazonaws.com/key` 形式の URL。推奨されるアドレス指定方式。 | Path-style URL |
| VPC endpoint policy | VPC エンドポイントに付けるポリシー。そのエンドポイント経由でアクセスできるバケットやアクションを制限する。 | Gateway endpoint |

## W

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Website endpoint | 静的 Web サイトホスティング用のエンドポイント (`bucket.s3-website-region.amazonaws.com` 等)。HTTP のみで、インデックスドキュメントやリダイレクトに対応する。 | Static website hosting |
| Well-Architected Framework | AWS の設計原則集。セキュリティ、信頼性、パフォーマンス効率、コスト最適化、運用上の優秀性、持続可能性の 6 つの柱からなる。 | — |
| WORM | Write Once Read Many。一度書いたら変更・削除できない保存方式で、S3 では Object Lock で実現する。 | Object Lock |
| WriteGetObjectResponse | S3 Object Lambda の関数が変換結果を呼び出し元に返すための API。 | Object Lambda |

## X

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| `x-amz-bucket-region` | `HeadBucket` などのレスポンスで返る、バケットのリージョンを示すヘッダー。 | PermanentRedirect |
| `x-amz-restore` | `HeadObject` で返る復元状態のヘッダー。`ongoing-request` と `expiry-date` で進捗と期限を示す。 | Restore |
| `x-amz-server-side-encryption` | オブジェクトの暗号化方式を示す / 指定するヘッダー (`AES256`、`aws:kms`、`aws:kms:dsse`)。 | SSE |

## 周辺サービス・関連概念 (A–Z)

S3 単体の機能ではないが、S3 を使う上で頻出する周辺サービスや一般概念をまとめる。

| 用語 | 説明 | 関連 |
| --- | --- | --- |
| Amazon Athena | S3 上のデータに標準 SQL を直接実行するサーバーレスクエリサービス。スキャンしたデータ量で課金されるため、Parquet 化とパーティションが重要。 | Glue Data Catalog |
| AssumeRole | IAM ロールの一時クレデンシャルを取得する STS の API。セッションタグやセッションポリシーを付けられる。 | Session tags |
| At-least-once delivery | 少なくとも 1 回は届くが重複する可能性がある配信保証。S3 Event Notifications はこの方式なので処理を冪等にする。 | Event Notifications |
| Availability | サービスが利用可能な時間の割合。S3 Standard は 99.99% の可用性を目標に設計され、SLA は別途定められている。 | Durability |
| Availability Zone (AZ) | リージョン内の物理的に独立したデータセンター群。Standard 等は 3 つ以上の AZ にデータを保存する。 | One Zone-IA |
| AWS DataSync | オンプレミスや他クラウドと S3 の間で大量データを高速に転送・同期するマネージドサービス。 | Transfer Acceleration |
| AWS Glue Data Catalog | S3 上のデータのスキーマとパーティション情報を保持するメタデータカタログ。Athena や EMR が参照する。 | Athena |
| AWS Lake Formation | データレイクの権限 (データベース、テーブル、列、行) を一元管理するサービス。S3 への直接権限の代わりに使う。 | Data lake |
| AWS Snowball | 物理デバイスでペタバイト級のデータを S3 に移送するサービス。ネットワーク転送が非現実的な場合に使う。 | DataSync |
| AWS Storage Gateway | オンプレミスから NFS/SMB/iSCSI で S3 を使うためのハイブリッドストレージサービス (S3 File Gateway 等)。 | Amazon S3 Files |
| Bulk retrieval | Glacier の最も安価な取り出し方式。Flexible Retrieval で通常 5〜12 時間、Deep Archive で 48 時間以内。 | Restore |
| Cache-Control | オブジェクトのメタデータとして保存でき、ブラウザや CloudFront のキャッシュ期間を制御する HTTP ヘッダー。 | CloudFront |
| Canned ACL | `private`、`public-read`、`bucket-owner-full-control` などの定義済み ACL。Bucket owner enforced のバケットでは `bucket-owner-full-control` 以外を指定すると拒否される。 | ACL |
| Content-Type | オブジェクトのメディアタイプを示すメタデータ。誤っているとブラウザで正しく表示されない。 | User-defined metadata |
| Control Tower Log Archive | AWS Control Tower が作成する、組織の CloudTrail と Config ログを集約する専用アカウントと S3 バケット。 | Object Lock |
| Cross-account access | 別アカウントのプリンシパルからのアクセス。原則として、相手の IAM ポリシーと自分のバケットポリシーの両方で許可が必要。 | Bucket policy |
| Data Exports (CUR 2.0) | AWS の請求データを S3 にエクスポートする機能。SQL で列を選べ、Athena で分析しやすい。 | CUR |
| Data lake | 生データから加工済みデータまでを S3 にゾーン分けして蓄積し、複数の分析エンジンから使うアーキテクチャ。 | Iceberg |
| Default root object | CloudFront でルート (`/`) へのリクエストに返すオブジェクト (例: `index.html`)。サブディレクトリには効かない。 | Static website hosting |
| Dual-stack endpoint | IPv4 と IPv6 の両方に対応する S3 エンドポイント (`s3.dualstack.region.amazonaws.com`)。 | Endpoint |
| Exponential backoff | リトライのたびに待ち時間を指数的に増やす手法。503 SlowDown や 500 InternalError への標準対処。 | SlowDown |
| Idempotency | 同じ操作を何度実行しても結果が変わらない性質。イベント駆動処理の重複対策の基本。 | At-least-once delivery |
| Index document | 静的 Web サイトホスティングでディレクトリへのリクエストに返すオブジェクト (例: `index.html`)。 | Website endpoint |
| Lambda recursive loop detection | Lambda と S3 などの間で同じイベントが循環していることを検出して停止する Lambda の機能。設計で入出力バケットを分けるのが前提。 | Event Notifications |
| Optimistic locking | 読み取り時の ETag を `If-Match` に指定して書き込み、変更されていれば失敗させる並行制御。S3 の条件付き書き込みで実現できる。 | Conditional write |
| Parquet | 列指向のファイル形式。圧縮率が高く、Athena などでスキャン量を減らせる。 | Data lake |
| PrivateLink | AWS のプライベート接続技術。S3 の Interface endpoint はこれを使う。 | Interface endpoint |
| Provisioned capacity unit | Glacier Flexible Retrieval の Expedited 取り出し容量を予約する単位。需要が多い時でも Expedited を確実に使える。 | Expedited retrieval |
| Region | AWS の地理的な拠点。バケットは作成時に 1 つのリージョンに属し、後から変更できない。 | Endpoint |
| RPO / RTO | 目標復旧時点 (どこまでのデータを失ってよいか) と目標復旧時間 (どれだけで復旧するか)。バックアップ・レプリケーション設計の基準。 | CRR |
| Sequencer | S3 イベントに含まれる値で、同一キーのイベントの順序を判定するために使う。 | Event Notifications |
| Signed cookies / signed URLs (CloudFront) | CloudFront が発行する期限付きアクセス。S3 の Presigned URL とは別の仕組みで、キーペアで署名する。 | Presigned URL |
| Small object overhead | 128 KB 未満のオブジェクトに対する最小課金や監視対象外といった扱いの総称 (本書での呼称)。小さなファイルはまとめると有利。 | Standard-IA |
| STS (Security Token Service) | 一時的なセキュリティ認証情報を発行するサービス。ロールの引き受けやフェデレーションで使う。 | AssumeRole |
| TLS | 通信の暗号化プロトコル。S3 では `aws:SecureTransport` で HTTPS を強制し、`s3:TlsVersion` で最小バージョンを条件にできる。 | Bucket policy |
| Unicode normalization | 同じ見た目の文字を同じバイト列に揃える処理 (NFC、NFD)。S3 のキーはバイト列で比較されるので、正規化の違いで別キーになる。 | Key |
| WAF (AWS WAF) | Web アプリケーションファイアウォール。CloudFront に付けて S3 配信を保護する。 | CloudFront |

## 混同しやすい用語のペア

| A | B | 違い |
| --- | --- | --- |
| Durability (耐久性) | Availability (可用性) | 耐久性は「データが失われないか」、可用性は「今アクセスできるか」。One Zone-IA は耐久性 11 nines を目標としつつ、AZ 喪失時のデータ消失リスクがある点に注意。 |
| Bucket policy | IAM policy | 前者はリソースに付き Principal を指定する。後者はプリンシパルに付き、Principal 要素を持たない。 |
| SCP | RCP | SCP は「自組織のプリンシパルができること」の上限、RCP は「自組織のリソースに対して誰が何をできるか」の上限。 |
| Access Point | Access Grants | 前者はネットワーク+ポリシーのエンドポイント、後者はアイデンティティ (IdP のユーザー/グループ) へのプレフィックス単位の付与。 |
| OAC | OAI | どちらも CloudFront から S3 へのアクセス制限。OAC が新方式で SSE-KMS や全リージョン対応。 |
| Presigned URL (S3) | Signed URL (CloudFront) | 前者は IAM クレデンシャルの SigV4 署名、後者は CloudFront キーグループの鍵で署名。 |
| Expiration | NoncurrentVersionExpiration | 前者は現行バージョンを期限切れにする (バージョニング有効なら削除マーカー)、後者は非現行バージョンを完全削除する。 |
| Governance mode | Compliance mode | 前者は特別な権限で解除可能、後者は誰も解除・短縮できない。 |
| Glacier Instant Retrieval | Glacier Flexible Retrieval | 前者はミリ秒で読める (復元不要)、後者は復元が必要 (数分〜数時間)。 |
| SRR | CRR | 同一リージョン内か、リージョンをまたぐか。 |
| Gateway endpoint | Interface endpoint | 前者はルートテーブル方式で無料・VPC 内のみ、後者は ENI 方式で有料・オンプレミスからも使える。 |
| ETag | Checksum | ETag は MD5 とは限らない識別子、追加チェックサムは明示的に指定したアルゴリズムでの完全性検証値。 |
| Server access logging | CloudTrail data events | 前者はベストエフォートのログファイル、後者は API 呼び出しの構造化イベントで、他サービスとの統合や Lake で分析しやすい。 |
| Directory bucket | General purpose bucket | 前者は単一 AZ・階層的名前空間・セッション認証、後者は従来型で全機能対応。 |
| Folder | Prefix | フォルダはコンソールの表示概念、実体はプレフィックス (キー文字列の先頭部分)。 |

## 略語一覧

| 略語 | 正式名称 |
| --- | --- |
| ABAC | Attribute-Based Access Control |
| ACL | Access Control List |
| AZ | Availability Zone |
| BPA | Block Public Access |
| CRR | Cross-Region Replication |
| CUR | Cost and Usage Report |
| DSSE-KMS | Dual-layer Server-Side Encryption with AWS KMS keys |
| GDA | Glacier Deep Archive (Usage Type の略記) |
| GIR | Glacier Instant Retrieval (Usage Type の略記) |
| INT | Intelligent-Tiering (Usage Type の略記) |
| MPU | Multipart Upload |
| MRAP | Multi-Region Access Point |
| OAC | Origin Access Control |
| OAI | Origin Access Identity |
| PITR | Point-In-Time Restore |
| RCP | Resource Control Policy |
| RTC | Replication Time Control |
| SCP | Service Control Policy |
| SIA | Standard-Infrequent Access (Usage Type の略記) |
| SRR | Same-Region Replication |
| SSE | Server-Side Encryption |
| VPCE | VPC Endpoint |
| WORM | Write Once Read Many |
| XZ | S3 Express One Zone (Usage Type の略記) |
| ZIA | One Zone-Infrequent Access (Usage Type の略記) |

## 参考文献

- What is Amazon S3: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html>
- Amazon S3 API Reference: <https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html>
- Amazon S3 storage classes: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html>
- Amazon S3 multipart upload limits: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html>
- General purpose bucket quotas: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/BucketRestrictions.html>
- Controlling ownership of objects and disabling ACLs: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html>
- Protecting data with server-side encryption: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/serv-side-encryption.html>
- Locking objects with Object Lock: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html>
- How to prevent object overwrites with conditional writes: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html>
- Amazon S3 conditional deletes (2025-09): <https://aws.amazon.com/about-aws/whats-new/2025/09/amazon-s3-conditional-deletes-s3-general-purpose-buckets/>
- Amazon S3 now supports attribute-based access control (2025-11): <https://aws.amazon.com/about-aws/whats-new/2025/11/amazon-s3-attribute-based-access-control/>
- Amazon S3 increases the maximum object size to 50 TB (2025-12): <https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-s3-maximum-object-size-50-tb/>
- Amazon S3 account regional namespaces (2026-03): <https://aws.amazon.com/about-aws/whats-new/2026/03/amazon-s3-account-regional-namespaces/>
- Amazon S3 Files (2026-04): <https://aws.amazon.com/about-aws/whats-new/2026/04/amazon-s3-files/>
- S3 default bucket security setting for SSE-C (2026-04): <https://aws.amazon.com/about-aws/whats-new/2026/04/s3-default-bucket-security-setting/>
- Analyze Amazon S3 annotations at scale with materialized views: <https://aws.amazon.com/blogs/storage/analyze-amazon-s3-annotations-at-scale-with-materialized-views/>
- Understanding your AWS billing and usage reports for Amazon S3: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/aws-usage-report-understand.html>
- AWS Backup continuous backups and PITR: <https://docs.aws.amazon.com/aws-backup/latest/devguide/point-in-time-recovery.html>
