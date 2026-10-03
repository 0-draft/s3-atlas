# Amazon S3 セキュリティ完全ガイド

_最終確認: 2026-10-03_

このドキュメントは Amazon S3 のセキュリティを「なぜそう動くのか」まで分解して解説する。認可評価ロジック、パブリックアクセス制御、暗号化、ネットワーク境界、監査・検知、典型的なインシデント、そしてすぐ使えるポリシー集までを 1 ファイルで網羅する。

日付つきの事実 (例: 「2026-04 に SSE-C がデフォルト無効化」) は 2026-10-03 時点で AWS 公式ドキュメント / What's New / AWS News Blog で確認したもの。確認できなかった項目は「未確認」と明記する。

## 目次

- 第1章 責任共有モデルと S3
- 第2章 認可評価ロジック (最重要)
- 第3章 Object Ownership と ACL の無効化
- 第4章 Block Public Access
- 第5章 暗号化 (保存時 / 転送時)
- 第6章 Access Points / Multi-Region Access Points / Access Grants
- 第7章 署名付き URL / POST ポリシー / CORS
- 第8章 Object Lock と MFA Delete
- 第9章 ネットワーク境界: VPC エンドポイントとデータペリメーター
- 第10章 ログ・監視・検知
- 第11章 典型的なインシデントパターン
- 第12章 すぐ使えるポリシー集 (17 本)
- 第13章 セキュリティチェックリスト
- 参考文献

## 1. 責任共有モデルと S3

AWS の責任共有モデル (Shared Responsibility Model) では、AWS は「クラウド **の** セキュリティ」、利用者は「クラウド **における** セキュリティ」を担う。S3 はマネージドな抽象サービスなので、利用者側の責任範囲は「データとアクセス制御の設定」にほぼ集約される。

| 領域 | AWS の責任 | 利用者の責任 |
| --- | --- | --- |
| 物理 | データセンター、ディスク廃棄、電源、物理アクセス | なし |
| インフラ | S3 のフリート、ネットワーク、ハイパーバイザ、耐久性 (11 9s 設計) | なし |
| サービス既定値 | SSE-S3 の既定暗号化、BPA の既定有効化、ACL 既定無効化、SSE-C 既定無効化 | 既定値を緩める変更をしない / 監査する |
| アクセス制御 | 評価エンジンの正しさ | IAM / バケットポリシー / SCP / RCP / エンドポイントポリシーの設計 |
| 暗号鍵 | SSE-S3 の鍵管理、KMS の HSM | KMS キーポリシー、ローテーション、CMK の選択、SSE-C の鍵保管 |
| データ保護 | 冗長化 | バージョニング、Object Lock、レプリケーション、バックアップ |
| 監査 | CloudTrail / ログ配信基盤 | CloudTrail データイベントの有効化、ログの保全・分析 |
| アプリ | なし | SSRF 等のアプリ脆弱性、認証情報漏洩の防止 |

ポイントは、**AWS は 2018 年以降、段階的に「安全側の既定値」を S3 に組み込んできた** こと。歴史的なインシデントの多くは「当時の既定値が緩かった / 利用者が明示的に緩めた」ことに起因する。

| 時期 | 既定値の変化 |
| --- | --- |
| 2018-11 | S3 Block Public Access 登場 |
| 2023-01-05 | 全バケットの新規オブジェクトに SSE-S3 を既定適用 |
| 2023-04 | 新規バケットで BPA 有効 + ACL 無効 (Object Ownership = BucketOwnerEnforced) が既定 |
| 2025-11 | BPA を AWS Organizations の S3 ポリシーで組織レベル強制可能に |
| 2026-03 | アカウントリージョナル名前空間 (bucketsquatting 対策) |
| 2026-04 | SSE-C を新規バケット等で既定無効化 |

## 2. 認可評価ロジック (最重要)

### 2.1 S3 リクエストに関与しうるポリシーの全種類

S3 への 1 リクエストには、最大で以下のポリシーが同時に関与する。

| ポリシー種別 | アタッチ先 | 役割 | Allow を付与できるか |
| --- | --- | --- | --- |
| SCP (Service Control Policy) | Organizations の Root / OU / アカウント | プリンシパル側の **上限** | 付与しない (フィルタのみ) |
| RCP (Resource Control Policy, 2024-11) | Organizations の Root / OU / アカウント | リソース側の **上限** | 付与しない (フィルタのみ) |
| IAM アイデンティティベースポリシー | IAM ユーザー / ロール / グループ | 権限付与 | する |
| Permissions Boundary | IAM ユーザー / ロール | アイデンティティベース権限の上限 | 付与しない |
| セッションポリシー | AssumeRole / GetFederationToken 時に渡す | セッションの上限 | 付与しない |
| バケットポリシー | バケット | リソースベースの権限付与 | する |
| アクセスポイントポリシー | アクセスポイント | アクセスポイント経由の権限付与 | する (バケットポリシーとの AND) |
| VPC エンドポイントポリシー | Gateway / Interface エンドポイント | エンドポイント経由の上限 | 付与しない (フィルタ) |
| ACL (レガシー) | バケット / オブジェクト | リソースベースの権限付与 | する (ACL 有効時のみ) |
| KMS キーポリシー | KMS キー | SSE-KMS オブジェクトの鍵利用可否 | する (KMS 側) |
| Block Public Access | Org / アカウント / バケット / AP | パブリックな許可を無効化 | 付与しない |

RCP は 2024-11 に AWS Organizations の新しいポリシータイプとして登場し、S3・STS・KMS・SQS・Secrets Manager などが対応している (その後 ECR や OpenSearch Serverless も追加された旨が re:Post に記載)。SCP が「自組織のプリンシパルが何をできるか」の上限なのに対し、RCP は「自組織のリソースに対して **誰が (外部プリンシパル含む)** 何をできるか」の上限になる。SCP と同じくサービスリンクロール (SLR) には適用されない。

### 2.2 評価の基本原則

1. 既定は暗黙の拒否 (implicit deny)。
2. どこか 1 つでも該当する明示的 Deny があれば拒否 (explicit deny wins)。
3. SCP / RCP / Permissions Boundary / セッションポリシー / VPCE ポリシーは「フィルタ」。Allow を与えないが、Allow しないと通らない。
4. 同一アカウント内では、アイデンティティベースポリシー **または** リソースベースポリシーのどちらかの Allow で足りる (例外あり、後述)。
5. クロスアカウントでは、リクエスト元アカウントのアイデンティティベースポリシー **と** リソース側のバケットポリシー (または ACL) の **両方** の Allow が必要。
6. SSE-KMS オブジェクトの読み書きには、S3 の権限に加えて KMS 側 (キーポリシー + IAM) の `kms:Decrypt` / `kms:GenerateDataKey` 等が必要。

### 2.3 評価フローチャート (同一アカウント)

```mermaid
flowchart TD
    A["リクエスト受信"] --> B{"いずれかのポリシーに明示的 Deny?"}
    B -- "Yes" --> DENY["拒否 (403)"]
    B -- "No" --> C{"SCP が Allow?"}
    C -- "No" --> DENY
    C -- "Yes" --> D{"RCP が Allow?"}
    D -- "No" --> DENY
    D -- "Yes" --> E{"VPCE 経由なら VPCE ポリシーが Allow?"}
    E -- "No" --> DENY
    E -- "Yes" --> F{"アクセスポイント経由なら AP ポリシーが Allow?"}
    F -- "No" --> DENY
    F -- "Yes" --> G{"リソースベース ポリシー/ACL が Allow?"}
    G -- "Yes" --> ALLOW["許可 (※セッション/境界の例外は 2.5 参照)"]
    G -- "No" --> H{"アイデンティティベース ポリシーが Allow?"}
    H -- "No" --> DENY
    H -- "Yes" --> I{"Permissions Boundary が Allow?"}
    I -- "No" --> DENY
    I -- "Yes" --> J{"セッションポリシーが Allow?"}
    J -- "No" --> DENY
    J -- "Yes" --> ALLOW
```

### 2.4 評価フローチャート (クロスアカウント)

```mermaid
flowchart TD
    A["アカウント A のプリンシパルが アカウント B のバケットにアクセス"] --> B{"どこかに明示的 Deny?"}
    B -- "Yes" --> DENY["拒否"]
    B -- "No" --> C{"A 側 SCP が Allow?"}
    C -- "No" --> DENY
    C -- "Yes" --> D{"B 側 RCP が Allow?"}
    D -- "No" --> DENY
    D -- "Yes" --> E{"A 側 IAM ポリシー (+境界/セッション) が Allow?"}
    E -- "No" --> DENY
    E -- "Yes" --> F{"B 側バケットポリシー/ACL が A のプリンシパルに Allow?"}
    F -- "No" --> DENY
    F -- "Yes" --> G{"SSE-KMS なら B 側 KMS キーポリシーが A に kms:Decrypt を Allow?"}
    G -- "No" --> DENY
    G -- "Yes" --> ALLOW["許可"]
```

### 2.5 同一アカウントの細かい例外

IAM の評価ロジックでは、同一アカウント内のリソースベースポリシーと Permissions Boundary / セッションポリシーの関係に以下のニュアンスがある (IAM ユーザーガイド "Policy evaluation logic" より)。

| リソースベースポリシーのプリンシパル指定 | Permissions Boundary の暗黙 Deny | セッションポリシーの暗黙 Deny |
| --- | --- | --- |
| IAM ユーザー ARN | 制限されない (リソースポリシーの Allow が有効) | 該当なし |
| IAM ロール ARN | 制限される | 制限される |
| ロールセッション ARN (assumed-role) | 制限されない | 制限されない |

実務上は「同一アカウントでも Boundary を確実に効かせたいならリソースポリシーでロール ARN を指定する」と覚えておけばよい。

### 2.6 S3 固有: 3 つのコンテキスト (ACL 有効時のレガシー)

ACL が有効なバケットでは、S3 は歴史的に以下の 3 コンテキストで評価していた。

```text
+-------------------+     +---------------------+     +----------------------+
| 1. User context   | --> | 2. Bucket context   | --> | 3. Object context    |
| 親アカウントの     |     | バケット所有者の     |     | オブジェクト所有者の  |
| IAM ポリシー       |     | バケットポリシー/ACL |     | オブジェクト ACL      |
+-------------------+     +---------------------+     +----------------------+
```

オブジェクト所有者がバケット所有者と異なる場合 (クロスアカウントで ACL なしにアップロードされた等)、バケット所有者でさえそのオブジェクトを読めない、という古典的問題が起きた。Object Ownership = BucketOwnerEnforced にすると ACL が無効化され、全オブジェクトの所有者がバケット所有者に統一されるので、このコンテキスト 3 の問題が消える。

### 2.7 アクセスポイント経由の評価

アクセスポイント経由のリクエストでは、**アクセスポイントポリシーとバケットポリシーの両方** で許可が必要。毎回バケットポリシーを書き換えずに済むよう、「アクセス制御をアクセスポイントに委任する」バケットポリシーを置くのが定石 (ポリシー例 12.11)。

### 2.8 よくある 403 の原因マトリクス

| 症状 | 典型原因 | 確認方法 |
| --- | --- | --- |
| 同一アカウントで GetObject が 403 | 明示的 Deny (例: aws:SourceVpce 条件) | CloudTrail の errorMessage、IAM Policy Simulator |
| クロスアカウントで 403 | 片側の Allow 不足 | 両アカウントのポリシーを確認 |
| SSE-KMS オブジェクトのみ 403 | KMS キーポリシー不足 | CloudTrail の kms.amazonaws.com イベント |
| ListBucket だけ 403 | Resource にバケット ARN (末尾 /* なし) を書いていない | ポリシーの Resource |
| 組織全体で突然 403 | SCP / RCP 追加 | Organizations のポリシー一覧 |
| SSE-C アップロードが 403 | 2026-04 以降の SSE-C 既定ブロック | GetBucketEncryption の BlockedEncryptionTypes |

S3 の AccessDenied メッセージには、2024-08 以降、同一アカウント内リクエストについて「拒否したポリシー種別 (例: `explicit deny in a service control policy`)・理由・リクエスト元プリンシパル」が含まれるようになった。さらに 2026-08 には、同一アカウント / 同一組織のリクエストで **拒否したポリシーの ARN** (SCP / RCP / アイデンティティ / セッション / 境界) まで含まれるよう拡張され、切り分けが大幅に容易になっている。

## 3. Object Ownership と ACL の無効化

### 3.1 3 つの設定値

| 設定 | ACL | オブジェクト所有者 | 推奨 |
| --- | --- | --- | --- |
| BucketOwnerEnforced | 無効 (ACL 付き PUT は `bucket-owner-full-control` 以外拒否) | 常にバケット所有者 | 推奨・2023-04 以降の既定 |
| BucketOwnerPreferred | 有効 | `bucket-owner-full-control` 付きならバケット所有者 | 移行期のみ |
| ObjectWriter | 有効 | アップロードしたアカウント | レガシー |

2023-04 以降、新規バケットは BPA 有効かつ BucketOwnerEnforced が既定。ACL が必要な用途 (例: 一部の古い AWS サービスのログ配信、CloudFront 標準ログの旧方式など) は限られる。

### 3.2 ACL 無効化への移行手順

1. S3 Inventory や Storage Lens で ACL に依存したアクセスがないか確認する (サーバーアクセスログの `aclRequired` フィールドが有効)。
2. ACL で許可していた権限をバケットポリシーに移植する。
3. `bucket-owner-full-control` を要求していたクロスアカウント書き込みは、BucketOwnerEnforced 下では不要になる (ACL 指定なしでも所有者がバケット所有者になる)。
4. Object Ownership を BucketOwnerEnforced に変更する。

```bash
# 現状確認
aws s3api get-bucket-ownership-controls --bucket amzn-s3-demo-bucket

# ACL 無効化
aws s3api put-bucket-ownership-controls \
  --bucket amzn-s3-demo-bucket \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
```

## 4. Block Public Access

### 4.1 4 つの設定

| 設定 | 対象 | 効果 |
| --- | --- | --- |
| BlockPublicAcls | ACL | パブリック ACL を付与する PUT を拒否 (既存 ACL は変えない) |
| IgnorePublicAcls | ACL | 既存のパブリック ACL を無視 |
| BlockPublicPolicy | ポリシー | パブリックなバケット / アクセスポイントポリシーの設定を拒否 |
| RestrictPublicBuckets | ポリシー | パブリックポリシーを持つバケットへのアクセスを、AWS サービスプリンシパルとバケット所有者アカウント内の許可済みユーザーに限定 (パブリック・クロスアカウントアクセスを無視) |

「Block」系は **新規設定を拒否**、「Ignore / Restrict」系は **既存設定を無効化** という違いがある。

### 4.2 適用レベルと優先順位

```mermaid
flowchart LR
    ORG["Organizations S3 ポリシー (2025-11〜)"] --> ACC["アカウントレベル BPA"]
    ACC --> BKT["バケットレベル BPA"]
    BKT --> AP["アクセスポイント BPA"]
    AP --> EFF["実効設定 = 最も制限的なもの"]
```

- 組織レベル: 2025-11 に AWS Organizations の **S3 ポリシー** (policy type) で BPA を強制できるようになった。`s3_attributes.public_access_block_configuration` に `@@assign: "all"` または `"none"` を指定する、4 設定一括のオン / オフ。Root / OU / アカウントにアタッチでき、新規メンバーアカウントにも自動継承される。アカウント単位で BPA を管理したい場合は組織レベルの S3 ポリシータイプを無効にする。
- アカウントレベル: `s3control put-public-access-block`。
- バケットレベル: `s3api put-public-access-block`。新規バケットは既定で 4 つすべて有効。
- アクセスポイント: 作成時のみ設定可能 (後から変更不可)。

S3 は「バケット・アカウント・組織」の設定のうち **最も制限的なもの** を採用する。

### 4.3 「パブリック」の判定基準

S3 は、ポリシーの Principal が `*` (または全 AWS ユーザー) で、かつ以下のような「固定値で絞り込む条件」がない場合に「パブリック」と判定する。

| パブリック扱いにならない条件の例 | 説明 |
| --- | --- |
| `aws:SourceVpce` / `aws:SourceVpc` | 特定 VPC / VPCE に限定 |
| `aws:SourceIp` (固定 CIDR) | 特定 IP に限定 (ただし 0.0.0.0/1 のような広い範囲は不可) |
| `aws:PrincipalOrgID` / `aws:PrincipalAccount` | 特定組織 / アカウントに限定 |
| `aws:SourceArn` / `aws:SourceAccount` | 特定 AWS サービスリソースに限定 (CloudFront OAC など) |

ワイルドカードやポリシー変数を含む条件はパブリック判定上「固定値」とみなされない点に注意。

### 4.4 CLI 例

```bash
# アカウントレベルで 4 つ全部有効化
aws s3control put-public-access-block \
  --account-id 111122223333 \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# バケットのパブリック状態を確認
aws s3api get-bucket-policy-status --bucket amzn-s3-demo-bucket
```

組織レベルの S3 ポリシー (BPA) の JSON 例。

```json
{
  "s3_attributes": {
    "public_access_block_configuration": {
      "@@assign": "all"
    }
  }
}
```

```bash
aws organizations enable-policy-type \
  --root-id r-examplerootid \
  --policy-type S3_POLICY

aws organizations create-policy \
  --name org-s3-bpa \
  --type S3_POLICY \
  --content file://s3-bpa-policy.json \
  --description "Block all public access org-wide"
```

`S3_POLICY` は `enable-policy-type --policy-type` と `create-policy --type` の両方で受け付ける列挙値として、AWS CLI v2 (2.37.7 で確認) の `aws organizations enable-policy-type help` / `create-policy help` と CLI リファレンスに載っている。古い CLI では列挙値に無い場合があるので、エラーになったら CLI を更新する。

## 5. 暗号化

### 5.1 全体像

```mermaid
flowchart TD
    E["S3 の暗号化"] --> T["転送時 (in transit)"]
    E --> R["保存時 (at rest)"]
    T --> T1["TLS 1.2 以上 (aws:SecureTransport / s3:TlsVersion で強制)"]
    R --> SSE["サーバーサイド"]
    R --> CSE["クライアントサイド (S3 Encryption Client)"]
    SSE --> S3["SSE-S3 (既定, AES-256)"]
    SSE --> KMS["SSE-KMS (+ S3 Bucket Keys)"]
    SSE --> DSSE["DSSE-KMS (二重暗号化)"]
    SSE --> SSEC["SSE-C (2026-04〜既定無効)"]
```

### 5.2 サーバーサイド暗号化の比較

| 方式 | 鍵の所在 | 鍵のアクセス制御 | 監査 | コスト | 主な用途 |
| --- | --- | --- | --- | --- | --- |
| SSE-S3 | S3 管理 | S3 の権限のみ | なし (鍵利用ログはない) | 無料 | 既定。最低限の at-rest 暗号化 |
| SSE-KMS (AWS 管理キー `aws/s3`) | KMS | キーポリシー変更不可 | CloudTrail に KMS 呼び出し | KMS リクエスト料 | クロスアカウント不可なので非推奨寄り |
| SSE-KMS (カスタマー管理キー) | KMS | キーポリシー / グラントで細かく制御 | CloudTrail | キー月額 + リクエスト料 | 規制対応、職務分離、クロスアカウント |
| DSSE-KMS | KMS | 同上 | CloudTrail | SSE-KMS より高い | CNSSP 15 等の二層暗号化要件 |
| SSE-C | 利用者が毎リクエスト送る | 鍵を知っているか | なし | 無料 | 2026-04 以降は既定ブロック。新規採用は非推奨 |
| CSE | 利用者 | 利用者 | 利用者 | 利用者 | S3 にも平文を見せたくない場合 |

### 5.3 SSE-S3 の既定化 (2023-01)

2023-01-05 以降、すべての新規オブジェクトは、利用者が何も指定しなくても SSE-S3 で暗号化される。既存のバケット既定暗号化設定 (SSE-KMS 等) がある場合はそちらが優先。つまり「暗号化されていない S3 オブジェクト」は 2023 年以降のアップロードでは原則存在しない (それ以前の古いオブジェクトは残りうる)。

### 5.4 SSE-KMS と S3 Bucket Keys

SSE-KMS はオブジェクトごとにデータキーを KMS から取得するため、大量 PUT/GET で KMS のリクエストクォータ・料金がボトルネックになる。S3 Bucket Keys を有効にすると、バケット単位の短命な中間キーを S3 側で使い回し、KMS へのリクエストを最大 99% 削減できる。

```text
Bucket Key なし:  Object --(毎回)--> KMS GenerateDataKey/Decrypt
Bucket Key あり:  Object --> Bucket-level key (S3 内で一定期間キャッシュ) --(まれに)--> KMS
```

注意点。

- Bucket Key 有効時、KMS の暗号化コンテキストはオブジェクト ARN ではなくバケット ARN になる。キーポリシーで `kms:EncryptionContext:aws:s3:arn` をオブジェクト ARN で絞っている場合は修正が必要。
- CloudTrail の KMS イベント数が減る (監査粒度が粗くなる)。

```bash
aws s3api put-bucket-encryption \
  --bucket amzn-s3-demo-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:ap-northeast-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab"
      },
      "BucketKeyEnabled": true
    }]
  }'
```

### 5.5 DSSE-KMS

2023-06 に登場した、KMS キーを使って 2 層の独立した AES-256 暗号化を施す方式。米国 CNSSP 15 などの「二層暗号化」要件向け。`x-amz-server-side-encryption: aws:kms:dsse` を指定する。S3 Bucket Keys は DSSE-KMS では使えない。

### 5.6 SSE-C と 2026-04 の既定無効化

SSE-C は 2014-06 から存在する方式で、利用者が毎リクエスト 256-bit 鍵を HTTPS ヘッダで送る。S3 は鍵を保存せず、鍵の HMAC のみを保持する。

AWS Storage Blog の事前告知どおり、**2026-04-06 から順次、以下の変更が 37 リージョン (China / GovCloud 含む) にロールアウトされた**。

- すべての新規汎用バケットで SSE-C による新規書き込みが既定でブロックされる。
- SSE-C 暗号化オブジェクトを 1 つも持たないアカウントでは、既存バケットも SSE-C がブロックされた。
- SSE-C オブジェクトを持つアカウントでは、既存バケットの設定は変更されていない。
- FAQ には、中東 (バーレーン) と中東 (UAE) を除く全リージョンで新規バケットが既定無効、との注記がある。

ブロックされた状態で SSE-C を指定した `PutObject` / `CopyObject` / `PostObject` / マルチパートアップロード / レプリケーションは HTTP 403 `AccessDenied` になる。既存の SSE-C オブジェクトは、正しい SSE-C ヘッダを付ければ GetObject / HeadObject で読める。

設定は `PutBucketEncryption` の `BlockedEncryptionTypes` パラメータで行う (必要権限は `s3:PutEncryptionConfiguration`)。

```bash
# SSE-C をブロック
aws s3api put-bucket-encryption \
  --bucket amzn-s3-demo-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "BlockedEncryptionTypes": { "EncryptionType": ["SSE-C"] }
    }]
  }'

# SSE-C を明示的に許可 (どうしても必要な場合のみ)
aws s3api put-bucket-encryption \
  --bucket amzn-s3-demo-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "BlockedEncryptionTypes": { "EncryptionType": ["NONE"] }
    }]
  }'
```

背景として、2025-01 に AWS Security Blog が「盗んだ正規の認証情報で SSE-C 付き CopyObject を大量に実行し、顧客データを攻撃者の鍵で再暗号化する」活動の増加を報告し、不要なら SSE-C をブロックするよう推奨していた (同時期に Halcyon も同じ手口を報告。11.4 参照)。ただし 2026-04 の既定変更を告知した AWS Storage Blog (2025-11-19)、What's New、FAQ はいずれもこの攻撃に触れていない。AWS が挙げている理由は「AWS KMS の登場以降、SSE-C には実質的なセキュリティ上の利点がない」「現代のワークロードの多くは、SSE-KMS のような柔軟性がないため SSE-C を使っていない」 (原文: "Most modern workloads do not use SSE-C encryption because it lacks the flexibility of SSE-KMS.")「顧客が検討すべき暗号化オプションを整理するため」というもの。

### 5.7 暗号化タイプの事後変更: UpdateObjectEncryption (2026-01)

2026-01 に `UpdateObjectEncryption` API が登場し、**データ移動 (コピー) なしで** 既存の暗号化オブジェクトの SSE タイプを変更できるようになった。SSE-S3 から SSE-KMS への変更、カスタマー管理キーの切り替え、S3 Bucket Keys の適用などが対象。S3 Batch Operations で 1 ジョブ最大 200 億オブジェクトに適用できる。以前は CopyObject による再暗号化が必要で、ストレージクラス遷移タイマーのリセット等の副作用があった。

### 5.8 クライアントサイド暗号化

Amazon S3 Encryption Client (Java / Python / Go / .NET / C++ 等) を使い、アップロード前にクライアント側で暗号化する。S3 から見ると暗号文の BLOB でしかないため、S3 Select や Object Lambda 等のサーバー側処理は意味をなさない。

2025-12-17 のセキュリティ速報 AWS-2025-032 (CVE-2025-14759〜14764) で、暗号化データキー (EDK) を「Instruction File」に保存する構成で Invisible Salamanders 攻撃 (EDK の差し替え) が可能な問題が公表された。対策として「鍵コミットメント (key commitment)」が導入され、読み取りのみ対応するマイナーバージョンと、読み書き両対応の新メジャーバージョン (Java 等では V4) がリリースされた。CSE を使っている場合は最新メジャーバージョンへの移行が推奨される。

### 5.9 転送時の暗号化: TLS

- S3 のエンドポイントは HTTPS (TLS) を提供し、AWS は全サービスで TLS 1.2 を最低バージョンとする方針を公表している (FIPS エンドポイントは 2021 年、その他エンドポイントも順次 TLS 1.0/1.1 を廃止)。
- それでも「HTTP (平文) でのアクセス」自体はエンドポイントが受け付けうるため、バケットポリシーで `aws:SecureTransport = false` を Deny するのが定石 (Security Hub の S3.5)。
- より新しい TLS を要求したい場合は `s3:TlsVersion` 条件キーを使う (`NumericLessThan` で 1.2 や 1.3 未満を Deny)。Control Tower には「TLS 1.3 以上を要求する」RCP コントロール (CT.S3.PV.3) もある。

## 6. Access Points / Multi-Region Access Points / Access Grants

### 6.1 S3 Access Points (汎用バケット)

アクセスポイントは、バケットに対する「名前付きの入口」で、それぞれ独自のポリシー・ネットワーク制限 (VPC 限定) ・BPA を持つ。1 バケットのポリシーが巨大化する問題 (20 KB 上限) を、アプリ単位の入口に分割して解決する。

```text
                    +--> AP: analytics-ap (VPC 限定, prefix=analytics/* 読み取り)
アプリ群 ---------> +--> AP: ingest-ap    (書き込みのみ)
                    +--> AP: partner-ap   (パートナーアカウントに限定)
                              |
                              v
                       amzn-s3-demo-bucket (バケットポリシーで AP に委任)
```

ARN 形式: `arn:aws:s3:ap-northeast-1:111122223333:accesspoint/analytics-ap`。オブジェクト ARN は `.../accesspoint/analytics-ap/object/key`。

```bash
aws s3control create-access-point \
  --account-id 111122223333 \
  --name analytics-ap \
  --bucket amzn-s3-demo-bucket \
  --vpc-configuration VpcId=vpc-0abc1234def567890
```

### 6.2 ディレクトリバケット用アクセスポイント (2025)

2025-05 に S3 Express One Zone (ディレクトリバケット) でアクセスポイントが使えるようになった。

- 名前は `accesspointname--zoneID--xa-s3` 形式。
- アクセスポイントスコープでプレフィックスや API 操作を制限できる (全プレフィックス文字数の合計は 256 バイト未満)。
- VPC 限定にできる。
- ディレクトリバケットは `CreateSession` によるセッションベース認可 (`s3express:CreateSession`) が基本なので、ポリシーの書き方が汎用バケットと異なる。

### 6.3 Multi-Region Access Points (MRAP)

複数リージョンのバケットを 1 つのグローバルエンドポイント (`xxxx.mrap.accesspoint.s3-global.amazonaws.com`) で束ね、AWS Global Accelerator 基盤で最寄りリージョンにルーティングする。

| 項目 | 内容 |
| --- | --- |
| 署名 | SigV4A (マルチリージョン非対称署名) が必要 |
| フェイルオーバー | Active-Active または Active-Passive (フェイルオーバーコントロールで手動切替) |
| BPA | MRAP 単位で BPA (作成後変更不可) - Security Hub S3.24 |
| データ同期 | MRAP 自体は複製しない。CRR を別途設定 |
| 料金 | データルーティング料金 + (インターネット経由なら) 加速料金 |

### 6.4 S3 Access Grants

2023-11 に登場。IAM Identity Center (企業ディレクトリ: Entra ID / Okta 等) のユーザー・グループや IAM プリンシパルに対し、S3 のプレフィックス単位で READ / WRITE / READWRITE を付与する。

```mermaid
sequenceDiagram
    participant U as アプリ / ユーザー
    participant AG as S3 Access Grants インスタンス
    participant STS as IAM ロール (ロケーション登録用)
    participant S3 as S3
    U->>AG: GetDataAccess (target=s3://bucket/prefix/*, permission=READ)
    AG->>AG: グラント照合 (ユーザー/グループ → ロケーション)
    AG->>STS: ロケーションに紐づくロールを引き受け
    AG-->>U: 一時認証情報 (スコープ限定)
    U->>S3: 一時認証情報で GetObject
```

数千〜数万のユーザー × プレフィックスの組合せを IAM ポリシーで表現すると破綻するケースで有効。CloudTrail には「どのディレクトリユーザーがアクセスしたか」が記録される。

## 7. 署名付き URL / POST ポリシー / CORS

### 7.1 署名付き URL (Presigned URL)

署名付き URL は「作成者の権限で、特定の操作を、期限付きで、URL を持つ人に委任する」仕組み。SigV4 のクエリ文字列認証 (`X-Amz-Algorithm`, `X-Amz-Credential`, `X-Amz-Date`, `X-Amz-Expires`, `X-Amz-SignedHeaders`, `X-Amz-Signature`) を使う。

| 作成に使う認証情報 | 最大有効期間 |
| --- | --- |
| IAM ユーザーの長期アクセスキー (SigV4) | 最大 7 日 (604800 秒) |
| IAM ロールの一時認証情報 | ロールセッションの失効まで (長い Expires を指定しても先に失効) |
| EC2 インスタンスプロファイル | ロール認証情報の有効期間 (通常 6 時間程度) |
| STS の一時認証情報 | 一時認証情報の有効期間 |
| コンソール | 1 分〜12 時間 |

重要な注意点。

- URL は「作成者の権限」で評価される。作成者が権限を失えば URL も使えない。認証情報が失効・削除・無効化されれば、指定した期限より前でも無効になる。
- URL を持つ人なら誰でも使えるベアラートークン。ログや Referer ヘッダ経由の漏洩に注意。
- 7 日を超える共有が必要なら CloudFront の署名付き URL / 署名付き Cookie を検討する。
- バケットポリシーで署名の年齢 (`s3:signatureAge`) や認証方式 (`s3:authType = REST-QUERY-STRING`)、署名バージョン (`s3:signatureversion`) を制限できる (ポリシー例 12.13)。

```bash
# 1 時間有効な GET 用署名付き URL
aws s3 presign s3://amzn-s3-demo-bucket/report.pdf --expires-in 3600
```

### 7.2 POST ポリシー (ブラウザベースアップロード)

HTML フォームから直接 S3 にアップロードさせる方式。サーバー側で「ポリシードキュメント (JSON)」を作り、Base64 化して SigV4 署名する。ポリシーで有効期限・バケット・キーのプレフィックス・Content-Type・サイズ上限 (`content-length-range`) などを強制できる。

```json
{
  "expiration": "2026-10-03T12:00:00.000Z",
  "conditions": [
    {"bucket": "amzn-s3-demo-bucket"},
    ["starts-with", "$key", "uploads/user-42/"],
    {"acl": "private"},
    ["starts-with", "$Content-Type", "image/"],
    ["content-length-range", 1, 10485760],
    {"x-amz-server-side-encryption": "aws:kms"},
    {"x-amz-algorithm": "AWS4-HMAC-SHA256"},
    {"x-amz-credential": "AKIAIOSFODNN7EXAMPLE/20261003/ap-northeast-1/s3/aws4_request"},
    {"x-amz-date": "20261003T000000Z"}
  ]
}
```

署名付き PUT URL と比べた POST ポリシーの利点は、`content-length-range` でサイズ上限を S3 側で強制できる点。

### 7.3 CORS

CORS はブラウザの同一オリジンポリシーを緩める仕組みであり、**認可機構ではない**。CORS を設定しても権限は増えないし、CORS を絞っても curl からのアクセスは防げない。

```json
[
  {
    "AllowedOrigins": ["https://app.example.com"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "x-amz-version-id"],
    "MaxAgeSeconds": 3000
  }
]
```

```bash
aws s3api put-bucket-cors --bucket amzn-s3-demo-bucket --cors-configuration file://cors.json
```

`"AllowedOrigins": ["*"]` + 署名付き URL の組合せ自体は危険ではないが、意図しないオリジンからのブラウザ経由アクセスを許すので、可能な限りオリジンを固定する。

## 8. Object Lock と MFA Delete

### 8.1 Object Lock の概念

Object Lock は WORM (Write Once Read Many) を実現する機能で、SEC 17a-4(f)、FINRA 4511、CFTC 1.31 などの要件に対する第三者評価 (Cohasset Associates) がある。バージョニングが前提で、ロックは **オブジェクトバージョン単位** で効く。

| 仕組み | 内容 | 解除できる人 |
| --- | --- | --- |
| Retention (Governance モード) | 保持期限までの削除・上書き・設定変更を禁止 | `s3:BypassGovernanceRetention` 権限 + `x-amz-bypass-governance-retention: true` ヘッダ |
| Retention (Compliance モード) | 保持期限まで誰も削除不可。期限短縮・モード変更も不可 | 誰もできない (root も AWS サポートも不可。アカウント閉鎖のみ) |
| Legal Hold | 期限なしの保持。解除するまで有効 | `s3:PutObjectLegalHold` 権限を持つ人 |
| Default Retention | バケットの既定保持設定 (新規オブジェクトに自動適用) | `s3:PutBucketObjectLockConfiguration` |
| Event Hold (2026-09) | 将来のイベント (契約終了・監査完了等) を起点に保持期間を開始する可変保持。hold 中は保護され、解除後に指定期間だけ WORM 保持される | 専用の IAM / バケットポリシー条件キーで設定・解除者や期間の上下限を制御 |

```mermaid
stateDiagram-v2
    [*] --> Unlocked
    Unlocked --> Governance: PutObjectRetention (GOVERNANCE)
    Unlocked --> Compliance: PutObjectRetention (COMPLIANCE)
    Governance --> Compliance: モード強化は可能
    Governance --> Unlocked: Bypass 権限で解除 / 期限到来
    Compliance --> Unlocked: 期限到来のみ
    Unlocked --> LegalHold: PutObjectLegalHold ON
    LegalHold --> Unlocked: PutObjectLegalHold OFF
```

注意点。

- Object Lock は現在、既存バケットでも (バージョニング有効化後に `PutObjectLockConfiguration` で) 有効化できる (以前はバケット作成時のみ)。一度有効化すると無効化できず、バージョニングも停止できない。
- Legal Hold は解除した瞬間に保護が終わるのに対し、2026-09 に追加された Event Hold は「解除後に指定期間保持」なので、イベント起点の保持要件 (例: 契約終了後 7 年) をデータの過剰保持なしに満たせる。Batch Operations やバケット既定値でも適用でき、Cohasset Associates の評価対象。
- ロックされるのは「バージョン」。キーに対する DELETE (バージョン ID 指定なし) は削除マーカーを作るだけなので成功する。ロックされたバージョン自体は消えない。
- Compliance モードを誤って長期で設定すると、ストレージ料金を止める手段がない。テストは短期間 + Governance で。

```bash
aws s3api put-object-lock-configuration \
  --bucket amzn-s3-demo-bucket \
  --object-lock-configuration '{
    "ObjectLockEnabled": "Enabled",
    "Rule": { "DefaultRetention": { "Mode": "GOVERNANCE", "Days": 30 } }
  }'

aws s3api put-object-legal-hold \
  --bucket amzn-s3-demo-bucket --key evidence/case-001.zip \
  --legal-hold Status=ON
```

### 8.2 MFA Delete

バージョニング設定に付加する機能で、以下の操作に MFA を要求する。

- バージョニング状態の変更 (Suspended への変更)
- オブジェクトバージョンの完全削除

制約。

- 有効化・無効化はルートユーザーのみ、かつ CLI / API からのみ (コンソール不可)。
- Lifecycle による期限切れ削除とは併用できない (MFA Delete 有効なバケットでは Lifecycle 設定を置けない)。
- 運用負荷が高いため、多くの組織では Object Lock + SCP / RCP による Deny で代替している。

```bash
aws s3api put-bucket-versioning \
  --bucket amzn-s3-demo-bucket \
  --versioning-configuration Status=Enabled,MFADelete=Enabled \
  --mfa "arn:aws:iam::111122223333:mfa/root-account-mfa-device 123456"
```

## 9. ネットワーク境界: VPC エンドポイントとデータペリメーター

### 9.1 Gateway エンドポイント vs Interface エンドポイント

| 項目 | Gateway エンドポイント | Interface エンドポイント (PrivateLink) |
| --- | --- | --- |
| 仕組み | ルートテーブルにプレフィックスリスト (pl-xxxx) を追加 | VPC 内に ENI (プライベート IP) を作成 |
| 料金 | 無料 | 時間料金 + データ処理料金 |
| オンプレ / 他 VPC から | 使えない (VPC 内のみ) | Direct Connect / VPN / ピアリング経由で使える |
| DNS | パブリック DNS 名のまま | エンドポイント固有 DNS、またはプライベート DNS 有効化 |
| リージョン | 同一リージョンのみ | 同一リージョンに加え、2025-11 以降は同一パーティション内の別リージョンの S3 にもクロスリージョン PrivateLink で接続できる (`vpce:AllowMultiRegion` 権限が必要) |
| ポリシー | エンドポイントポリシー可 | エンドポイントポリシー可 |
| 条件キー | `aws:SourceVpce`, `aws:SourceVpc` | `aws:SourceVpce`, `aws:SourceVpc` |

```text
[EC2 in VPC] --(route: pl-xxxx)--> [Gateway VPCE] ----> S3 (同一リージョン)
[On-prem]   --(DX/VPN)--> [Interface VPCE ENI 10.0.1.23] ----> S3
```

VPC エンドポイント経由のリクエストでは送信元 IP がプライベート IP になるため、**`aws:SourceIp` 条件は効かない**。VPCE 経由を許可したい場合は `aws:SourceVpce` / `aws:SourceVpc` を使う。

### 9.2 エンドポイントポリシーで「自組織のバケット以外に出させない」

VPC エンドポイントポリシーは「この VPC から、どの S3 リソースにアクセスしてよいか」の上限になる。データ持ち出し (exfiltration) 対策として、`aws:ResourceOrgID` で自組織のバケットに限定するのが定石 (ポリシー例 12.9)。ただし Amazon Linux のパッケージリポジトリ、ECR のレイヤー保存先など AWS 所有バケットへのアクセスが必要な場合は例外を設ける。

### 9.3 データペリメーター

AWS のデータペリメーター (Data Perimeter) は、以下 3 つの境界を「アイデンティティ」「リソース」「ネットワーク」の 3 軸で組み合わせて構築する考え方。

| 境界 | 意味 | 主な実装 | 主な条件キー |
| --- | --- | --- | --- |
| 信頼できるアイデンティティのみ | 自組織のプリンシパル (と AWS サービス) だけが自組織リソースにアクセス | RCP、バケットポリシー | `aws:PrincipalOrgID`, `aws:PrincipalIsAWSService`, `aws:SourceOrgID` |
| 信頼できるリソースのみ | 自組織のプリンシパルは自組織のリソースだけにアクセス | SCP、VPCE ポリシー | `aws:ResourceOrgID` |
| 想定ネットワークのみ | 自社ネットワーク / VPC からのみアクセス | RCP、SCP、バケットポリシー | `aws:SourceIp`, `aws:SourceVpc`, `aws:SourceVpce`, `aws:ViaAWSService` |

```mermaid
flowchart LR
    subgraph ORG["自組織 (o-exampleorgid)"]
        P["プリンシパル"]
        R["S3 バケット"]
        N["社内 NW / VPC"]
    end
    X["外部プリンシパル"] -. "RCP: aws:PrincipalOrgID で拒否" .-> R
    P -. "SCP/VPCE: aws:ResourceOrgID で外部バケット拒否" .-> XR["外部バケット"]
    I["インターネット上の盗まれた認証情報"] -. "aws:SourceIp / aws:SourceVpc で拒否" .-> R
    P --> R
    N --> R
```

RCP の登場以前は、すべてのバケットポリシーに同じ Deny 文を書く必要があった。RCP は組織全体に一括で「リソース側の上限」を課せるので、開発者がバケットポリシーで誤ってクロスアカウント許可を書いても組織外には開かない。ただし RCP は SLR には効かず、AWS サービスプリンシパルによるアクセス (CloudTrail のログ配信など) は `aws:PrincipalIsAWSService` で除外する必要がある。

## 10. ログ・監視・検知

### 10.1 サーバーアクセスログ vs CloudTrail データイベント

| 項目 | S3 サーバーアクセスログ | CloudTrail データイベント |
| --- | --- | --- |
| 料金 | ログ配信自体は無料 (保存料金のみ) | データイベント 10 万件あたり課金 |
| 配信保証 | ベストエフォート (欠落・遅延ありうる) | 高信頼 (通常 5 分程度以内) |
| 形式 | スペース区切りテキスト | JSON |
| 記録内容 | 認証失敗、匿名アクセス、ライフサイクル遷移、HTTP ステータス、`aclRequired`、TLS バージョン等 | IAM プリンシパル詳細、リクエストパラメータ、`tlsDetails`、組織横断の集約 |
| 粒度指定 | バケット単位 | 高度なイベントセレクタでバケット / プレフィックス / 読み書き種別を指定 |
| 配信先 | 同一リージョン・同一アカウント所有の別バケット推奨 | S3 / CloudWatch Logs / CloudTrail Lake |
| 主用途 | 低コストな大量アクセス分析、課金調査 | セキュリティ監査、フォレンジック、検知 |

```bash
# CloudTrail: 特定バケットの書き込みデータイベントのみ記録
aws cloudtrail put-event-selectors \
  --trail-name org-trail \
  --advanced-event-selectors '[{
    "Name": "S3 write events for sensitive bucket",
    "FieldSelectors": [
      {"Field": "eventCategory", "Equals": ["Data"]},
      {"Field": "resources.type", "Equals": ["AWS::S3::Object"]},
      {"Field": "readOnly", "Equals": ["false"]},
      {"Field": "resources.ARN", "StartsWith": ["arn:aws:s3:::amzn-s3-demo-bucket/"]}
    ]
  }]'

# サーバーアクセスログ
aws s3api put-bucket-logging --bucket amzn-s3-demo-bucket \
  --bucket-logging-status '{
    "LoggingEnabled": {
      "TargetBucket": "amzn-s3-demo-logs",
      "TargetPrefix": "s3-access/amzn-s3-demo-bucket/",
      "TargetObjectKeyFormat": {"PartitionedPrefix": {"PartitionDateSource": "EventTime"}}
    }
  }'
```

ログ保存先バケットを監視対象バケット自身にすると無限ループになるので避ける。ログ配信先バケットは、`logging.s3.amazonaws.com` サービスプリンシパルにバケットポリシーで書き込みを許可する (ACL 無効化後の推奨方式)。

### 10.2 GuardDuty S3 Protection と Malware Protection for S3

| 機能 | 内容 |
| --- | --- |
| GuardDuty S3 Protection | CloudTrail の S3 データイベントを (利用者側でトレイル設定不要で) 分析し、異常な API パターン (不審な IP からの大量 GetObject、BPA 無効化、ログ無効化等) を検出。検出結果タイプ例: `Exfiltration:S3/AnomalousBehavior`, `Policy:S3/BucketBlockPublicAccessDisabled`, `Stealth:S3/ServerAccessLoggingDisabled` |
| Malware Protection for S3 (2024-06) | 新規アップロードされたオブジェクトをスキャン。GuardDuty 本体を有効化せず単独でも利用可能。結果は EventBridge に発行され、オプションで `GuardDutyMalwareScanStatus` タグ (`NO_THREATS_FOUND` / `THREATS_FOUND` / `UNSUPPORTED` / `ACCESS_DENIED` / `FAILED`) を付与 |

タグを使った TBAC (Tag-Based Access Control) で「スキャン済みで脅威なしのオブジェクトしか読めない」バケットを作れる (ポリシー例 12.14)。オブジェクトのタグ上限は 10 個なので、既に 10 個使っているとタグ付けできない点に注意。

### 10.3 Amazon Macie

S3 内のデータを機械学習とパターンマッチで分析し、PII・認証情報・金融情報などの機密データを検出する。

- 自動機密データ検出 (automated sensitive data discovery): 組織全体のバケットを継続的にサンプリング。
- 機密データ検出ジョブ: 特定バケットを全件 / スケジュールでスキャン。
- バケットのセキュリティ態勢 (パブリック、暗号化、共有状況) のインベントリも提供。

### 10.4 IAM Access Analyzer for S3

| 機能 | 内容 |
| --- | --- |
| 外部アクセス検出 | バケットポリシー / ACL / アクセスポイントポリシーを自動推論 (automated reasoning) で解析し、ゾーンオブトラスト (アカウント / 組織) 外からアクセス可能なバケットを検出 |
| 内部アクセス検出 (2025-06) | 組織内のどのユーザー / ロールが S3 等のリソースにアクセスできるかを、アイデンティティ / リソース / SCP / RCP を総合評価して検出 |
| ポリシー検証 | ポリシー作成時の文法・ベストプラクティスチェック |
| カスタムポリシーチェック | 「このポリシーは新しいアクセスを付与するか」を CI で判定 |

S3 コンソールの「IAM Access Analyzer for S3」ビューから、パブリック / 共有バケットの一覧と一括 BPA 適用ができる。

### 10.5 Security Hub CSPM の S3 コントロール

| ID | 内容 |
| --- | --- |
| S3.1 | アカウントレベル BPA が有効 |
| S3.2 | パブリック読み取りを禁止 |
| S3.3 | パブリック書き込みを禁止 |
| S3.5 | TLS (SecureTransport) を要求 |
| S3.6 | 他アカウントへの許可を制限 |
| S3.7 | クロスリージョンレプリケーション |
| S3.8 | バケットレベル BPA |
| S3.9 | サーバーアクセスログ有効 |
| S3.10 | バージョニング有効バケットに Lifecycle |
| S3.11 | イベント通知有効 |
| S3.12 | ACL でユーザーアクセスを管理しない |
| S3.13 | Lifecycle 設定 |
| S3.14 | バージョニング有効 |
| S3.15 | Object Lock 有効 |
| S3.17 | KMS キーで保存時暗号化 |
| S3.19 | アクセスポイントの BPA |
| S3.20 | MFA Delete 有効 |
| S3.22 | オブジェクトレベル書き込みイベントのログ |
| S3.23 | オブジェクトレベル読み取りイベントのログ |
| S3.24 | MRAP の BPA |
| S3.25 | ディレクトリバケットに Lifecycle |

(S3.4 / S3.16 / S3.18 / S3.21 は欠番または廃止。2026-10 時点の Security Hub CSPM ドキュメントの一覧に基づく。)

### 10.6 監視アーキテクチャ例

```mermaid
flowchart LR
    S3["S3 バケット群"] -->|データイベント| CT["CloudTrail (組織トレイル)"]
    S3 -->|アクセスログ| LOG["ログアーカイブアカウントのバケット (Object Lock)"]
    CT --> LOG
    CT --> GD["GuardDuty S3 Protection"]
    S3 -->|新規オブジェクト| MP["Malware Protection for S3"]
    S3 --> MAC["Macie"]
    S3 --> AA["IAM Access Analyzer"]
    S3 --> CFG["AWS Config"]
    GD --> SH["Security Hub"]
    MAC --> SH
    AA --> SH
    CFG --> SH
    MP --> EB["EventBridge"]
    SH --> EB
    EB --> SNS["SNS / チケット / 自動修復 Lambda"]
```

## 11. 典型的なインシデントパターン

### 11.1 パブリックバケットからの漏洩

2017〜2019 年頃、UpGuard などのセキュリティ研究者が、パブリック読み取り可能な S3 バケットから大企業・政府関係の大量データが閲覧可能になっていた事例を多数報告した。原因の典型は以下。

- ACL で `AllUsers` / `AuthenticatedUsers` (「任意の AWS アカウント」であり「自社ユーザー」ではない) に READ を付与。
- `"Principal": "*"` かつ条件なしのバケットポリシー。
- 静的サイト用に公開したバケットに機密ファイルを置いた。

対策は既定化された: 新規バケットは BPA 有効・ACL 無効。アカウント / 組織レベルの BPA で「公開してよいアカウント」以外を封じる。

### 11.2 Capital One (2019) — 過剰権限ロール + SSRF

事実関係 (公開報道・裁判記録・OCC の発表に基づく)。

- 2019-07-29 に Capital One が公表。米国約 1 億人・カナダ約 600 万人分、合計約 1 億 600 万件のクレジットカード申込データが流出。
- 攻撃者 (元 AWS 従業員) は、Capital One が AWS 上で運用していた WAF の設定不備による SSRF (Server-Side Request Forgery) を悪用し、EC2 インスタンスメタデータサービス (IMDSv1) からその WAF に付与された IAM ロールの一時認証情報を取得した。
- そのロールが S3 の広範な List / Get 権限を持っていたため、多数のバケットからデータをダウンロードできた。**パブリックバケットの事故ではなく、プライベートバケットに対する「過剰権限 + 認証情報窃取」の事故** である点が重要。
- 2020-08 に米国通貨監督庁 (OCC) が 8,000 万ドルの民事制裁金を科した。攻撃者は 2022-06 に有罪判決。

教訓と S3 側の対策。

| 教訓 | 対策 |
| --- | --- |
| IMDSv1 は SSRF に弱い | IMDSv2 の強制 (EC2 側) |
| ロールが過剰権限 | 最小権限、IAM Access Analyzer の未使用アクセス検出 |
| 盗まれた一時認証情報が外部から使えた | ネットワーク境界: `aws:SourceVpc` / `aws:SourceIp` / `aws:ViaAWSService` による Deny、GuardDuty の `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration` 検出 |
| 大量 GetObject に気づけなかった | CloudTrail データイベント、GuardDuty S3 Protection の異常検知 |

### 11.3 Bucketsquatting / 放棄バケットの再取得

S3 の汎用バケット名は歴史的にグローバル一意で、**削除されたバケット名は誰でも再取得できる**。これを悪用するのが bucketsquatting。

- 2019 年頃から Ian Mckay 氏 (onecloudplease.com) らが「bucketsquatting」として問題提起。
- 2024 年には Aqua Security が「Shadow Resources」として、AWS サービスが予測可能な名前 (アカウント ID + リージョン) でバケットを自動作成する挙動を悪用し、先回りしてバケットを作ることで他アカウントのリソースを乗っ取れる問題を報告 (AWS は修正済み)。
- 2025-02 に watchTowr Labs が、ソフトウェア配布・CloudFormation テンプレート・VM イメージ等の参照先として使われていた放棄バケット約 150 個を約 400 ドルで再登録し、2 か月で 800 万件超のリクエスト (政府機関、Fortune 500 企業等から) を受けたと報告。AWS は当該バケット名の再作成をブロックした。

**アカウントリージョナル名前空間 (2026-03)**。AWS は汎用バケット向けにオプトインの名前空間を導入した。

- バケット名は `<prefix>-<12桁アカウントID>-<リージョン>-an` 形式 (例: `mybucket-123456789012-us-east-1-an`)。
- そのサフィックスを持つ名前は当該アカウントしか作成できず、削除後も他アカウントに取られない。
- `CreateBucket` に `x-amz-bucket-namespace: account-regional` ヘッダを付けて作成。CLI は `--bucket-namespace account-regional`。
- 新しい条件キー `s3:x-amz-bucket-namespace` で、SCP / IAM により「アカウントリージョナル名前空間以外でのバケット作成を禁止」できる (ポリシー例 12.12)。
- 既定ではない (オプトイン)。既存バケットは移行不要だが、保護したければ新バケットを作り S3 Replication 等で移行する。
- 指摘されているトレードオフ: アカウント ID とリージョンが分かればバケット名を推測しやすくなる (Pwned Labs)、リージョンに名前が紐づくのでマルチリージョンで論理名が同一にならない (Authress)。

```bash
aws s3api create-bucket \
  --bucket mybucket-111122223333-ap-northeast-1-an \
  --bucket-namespace account-regional \
  --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1
```

`--create-bucket-configuration` の併用は us-east-1 以外での CreateBucket の一般規則による。

### 11.4 SSE-C を悪用したランサムウェア

2025-01-13、セキュリティベンダー Halcyon が自社ブログで「Codefinger」と名付けた攻撃者の手口を報告した。公開・漏洩した AWS キーを使って被害者のオブジェクトを攻撃者の SSE-C 鍵で暗号化し、Lifecycle で 7 日以内の削除を設定して身代金を要求するもの。S3 は SSE-C 鍵を保存せず CloudTrail にも鍵の HMAC しか残らないため、攻撃者の鍵なしでは復号できない。AWS 側も 2025-01-15 の AWS Security Blog で、CIRT が SSE-C を使った CopyObject による再暗号化の増加を検知したこと、AWS の脆弱性ではなく正規の認証情報の悪用であることを公表している。対策 (AWS Security Blog の推奨と同じ): SSE-C のブロック (2026-04 以降は既定)、長期アクセスキーの廃止と短期認証情報への移行、バージョニングなどのデータ復旧手段、CloudTrail 等での監視。加えて Object Lock や、`s3:PutLifecycleConfiguration` 等の危険操作の SCP 制限も有効。

### 11.5 その他の頻出パターン

| パターン | 内容 | 対策 |
| --- | --- | --- |
| アクセスキーの GitHub 流出 | 長期キーがリポジトリに混入 | IAM Identity Center / ロール、Secret scanning、AWS の自動検知 (AWSCompromisedKeyQuarantine ポリシー) |
| 署名付き URL のログ流出 | URL が CDN / プロキシログに残る | 短い有効期限、ロール認証情報で作成 |
| CORS の誤解 | CORS で保護しているつもり | CORS は認可ではないと理解 |
| サブドメインテイクオーバー | CNAME が削除済みバケットを指したまま | DNS の棚卸し、アカウントリージョナル名前空間 |
| ログ無効化による痕跡消し | `PutBucketLogging` / `StopLogging` | SCP で禁止、GuardDuty `Stealth:` 系検知 |
| 「Authenticated Users」ACL | 全 AWS ユーザーに許可 | ACL 無効化 |

## 12. すぐ使えるポリシー集

以下はすべてバケットポリシー (一部 RCP / SCP / VPCE ポリシー) の実例。`amzn-s3-demo-bucket`、`111122223333`、`o-exampleorgid` 等は置き換えること。

### 12.1 TLS 以外のアクセスを拒否 (aws:SecureTransport)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::amzn-s3-demo-bucket",
        "arn:aws:s3:::amzn-s3-demo-bucket/*"
      ],
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

### 12.2 TLS 1.2 未満を拒否 (s3:TlsVersion)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOldTLS",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::amzn-s3-demo-bucket",
        "arn:aws:s3:::amzn-s3-demo-bucket/*"
      ],
      "Condition": {
        "NumericLessThan": { "s3:TlsVersion": "1.2" }
      }
    }
  ]
}
```

### 12.3 特定 KMS キーでの暗号化を強制

既定暗号化が SSE-KMS でも、クライアントが明示的に SSE-S3 を指定すると SSE-S3 になる。特定キーを強制したい場合はこのポリシーを併用する。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyNonKMSUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Condition": {
        "StringNotEqualsIfExists": {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    },
    {
      "Sid": "DenyWrongKMSKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Condition": {
        "StringNotEqualsIfExists": {
          "s3:x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:ap-northeast-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab"
        }
      }
    }
  ]
}
```

`IfExists` を付けるのは、ヘッダ省略時に既定暗号化 (このキー) で暗号化される PUT を許すため。ヘッダ必須にしたい場合は `Null` 条件で `"s3:x-amz-server-side-encryption": "true"` を Deny する。

### 12.4 暗号化ヘッダなしのアップロードを拒否 (レガシー互換)

2023-01 以降は既定で SSE-S3 が適用されるため、このポリシーの必要性は下がった。ただし監査要件で「クライアントが明示的に暗号化を指定すること」を求める場合に使う。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedObjectUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Condition": {
        "Null": { "s3:x-amz-server-side-encryption": "true" }
      }
    }
  ]
}
```

### 12.5 特定 VPC エンドポイント経由のみ許可

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyNotFromVPCE",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::amzn-s3-demo-bucket",
        "arn:aws:s3:::amzn-s3-demo-bucket/*"
      ],
      "Condition": {
        "StringNotEquals": { "aws:SourceVpce": "vpce-1a2b3c4d" },
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::111122223333:role/BreakGlassAdmin"
        }
      }
    }
  ]
}
```

このポリシーはコンソール操作も遮断する。管理者を締め出さないよう、Break Glass ロールを除外しておくこと。

### 12.6 自組織のプリンシパルのみ許可 (aws:PrincipalOrgID)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideOrg",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::amzn-s3-demo-bucket",
        "arn:aws:s3:::amzn-s3-demo-bucket/*"
      ],
      "Condition": {
        "StringNotEqualsIfExists": { "aws:PrincipalOrgID": "o-exampleorgid" },
        "BoolIfExists": { "aws:PrincipalIsAWSService": "false" }
      }
    }
  ]
}
```

AWS サービスプリンシパル (例: `logging.s3.amazonaws.com`, `cloudtrail.amazonaws.com`) からのアクセスを壊さないよう `aws:PrincipalIsAWSService` で除外している。

### 12.7 CloudFront OAC からの読み取りのみ許可

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipalReadOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/EDFDVBD6EXAMPLE"
        }
      }
    }
  ]
}
```

OAC (Origin Access Control) は旧来の OAI の後継で、SSE-KMS オブジェクト、全リージョン、PUT/DELETE をサポートする。SSE-KMS の場合は KMS キーポリシーにも `cloudfront.amazonaws.com` に `kms:Decrypt` を同条件で許可する。バケットは BPA 有効のままでよい (`AWS:SourceArn` 条件付きなのでパブリック判定されない)。

### 12.8 クロスアカウント読み取り (ロール指定)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPartnerList",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::444455556666:role/PartnerReader" },
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket",
      "Condition": {
        "StringLike": { "s3:prefix": ["shared/*"] }
      }
    },
    {
      "Sid": "AllowPartnerGet",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::444455556666:role/PartnerReader" },
      "Action": ["s3:GetObject", "s3:GetObjectVersion"],
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/shared/*"
    }
  ]
}
```

アカウント 444455556666 側でも `PartnerReader` ロールの IAM ポリシーに同じ Action / Resource を許可する必要がある。SSE-KMS なら KMS キーポリシーにも `kms:Decrypt` を付与する (AWS 管理キー `aws/s3` はクロスアカウント不可なので、カスタマー管理キーが必須)。

### 12.9 VPC エンドポイントポリシー: 自組織のバケットのみ

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlyOrgBuckets",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:ResourceOrgID": "o-exampleorgid" }
      }
    },
    {
      "Sid": "AllowAmazonLinuxRepos",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::EXAMPLE-AMAZON-LINUX-REPO-BUCKET/*"
      ]
    }
  ]
}
```

Amazon Linux のパッケージリポジトリなど AWS 所有バケットの実名はリージョン・ディストリビューションごとに異なるため、プレースホルダにしてある。実際の名前は Amazon Linux のドキュメント / re:Post で確認すること。

### 12.10 IP アドレス制限 (VPCE 経由は別扱い)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideCorpNetwork",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::amzn-s3-demo-bucket",
        "arn:aws:s3:::amzn-s3-demo-bucket/*"
      ],
      "Condition": {
        "NotIpAddress": { "aws:SourceIp": ["203.0.113.0/24", "198.51.100.10/32"] },
        "Null": { "aws:SourceVpce": "true" },
        "BoolIfExists": { "aws:ViaAWSService": "false" }
      }
    }
  ]
}
```

`Null: aws:SourceVpce = true` により「VPCE を経由していないリクエスト」だけに IP 条件を適用する。`aws:ViaAWSService` で、Athena や Glue などがユーザーの代わりに呼ぶ forward access session を除外している。

### 12.11 アクセスポイントへのアクセス制御委任

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DelegateToAccessPoints",
      "Effect": "Allow",
      "Principal": { "AWS": "*" },
      "Action": "*",
      "Resource": [
        "arn:aws:s3:::amzn-s3-demo-bucket",
        "arn:aws:s3:::amzn-s3-demo-bucket/*"
      ],
      "Condition": {
        "StringEquals": { "s3:DataAccessPointAccount": "111122223333" }
      }
    }
  ]
}
```

「自アカウントが所有するアクセスポイント経由なら、判断はアクセスポイントポリシーに任せる」という意味。`Principal: *` だが条件付きなのでパブリック判定されない。

### 12.12 SCP: アカウントリージョナル名前空間以外でのバケット作成を禁止

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RequireAccountRegionalNamespace",
      "Effect": "Deny",
      "Action": "s3:CreateBucket",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-bucket-namespace": "account-regional"
        }
      }
    }
  ]
}
```

条件キー名と、このポリシーが「`x-amz-bucket-namespace` ヘッダが `account-regional` でない、またはヘッダ自体が無い CreateBucket を拒否する」ことは S3 ユーザーガイド (Namespaces for general purpose buckets) のポリシー例に明記されている。

### 12.13 署名付き URL の署名年齢と方式を制限

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOldPresignedUrls",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Condition": {
        "StringEquals": { "s3:authType": "REST-QUERY-STRING" },
        "NumericGreaterThan": { "s3:signatureAge": "600000" }
      }
    },
    {
      "Sid": "DenySigV2",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Condition": {
        "StringEquals": { "s3:signatureversion": "AWS" }
      }
    }
  ]
}
```

`s3:signatureAge` はミリ秒単位 (600000 = 10 分)。署名から 10 分以上経った署名付き URL を拒否する。

### 12.14 GuardDuty のマルウェアスキャン結果で読み取りを制限 (TBAC)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyReadUnlessNoThreatsFound",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:GetObject", "s3:GetObjectVersion"],
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Condition": {
        "StringNotEquals": {
          "s3:ExistingObjectTag/GuardDutyMalwareScanStatus": "NO_THREATS_FOUND",
          "aws:PrincipalArn": "arn:aws:iam::111122223333:role/GuardDutyMalwareProtectionRole"
        }
      }
    }
  ]
}
```

複数キーを 1 つの `StringNotEquals` に書くと AND 評価になるため、「タグが NO_THREATS_FOUND でなく、かつ GuardDuty のロールでもない」場合に拒否される。

### 12.15 レガシー: クロスアカウント書き込みに bucket-owner-full-control を要求

Object Ownership = BucketOwnerEnforced なら不要。ACL が有効なまま残っている古いバケット向け。

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPartnerPutWithBOFC",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::444455556666:root" },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/incoming/*",
      "Condition": {
        "StringEquals": { "s3:x-amz-acl": "bucket-owner-full-control" }
      }
    }
  ]
}
```

### 12.16 RCP: 組織全体の S3 データペリメーター

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EnforceOrgIdentities",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringNotEqualsIfExists": { "aws:PrincipalOrgID": "o-exampleorgid" },
        "BoolIfExists": { "aws:PrincipalIsAWSService": "false" }
      }
    },
    {
      "Sid": "EnforceSecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "BoolIfExists": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

RCP では `Principal` は `"*"` 固定、`Effect` は Deny が基本 (RCPFullAWSAccess 以外の Allow は書けない)。意図的に外部共有したいバケットがある場合は `aws:ResourceTag` 等で例外を作る。

### 12.17 SCP: 危険な S3 設定変更を禁止

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyBPAChangesAndLoggingTampering",
      "Effect": "Deny",
      "Action": [
        "s3:PutAccountPublicAccessBlock",
        "s3:PutBucketPublicAccessBlock",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketLogging",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketObjectLockConfiguration"
      ],
      "Resource": "*",
      "Condition": {
        "ArnNotLike": {
          "aws:PrincipalArn": "arn:aws:iam::*:role/PlatformAdmin"
        }
      }
    }
  ]
}
```

## 13. セキュリティチェックリスト

### 13.1 組織 / アカウントレベル

- [ ] Organizations の S3 ポリシーで BPA を組織レベル強制 (公開用アカウントのみ例外 OU)
- [ ] アカウントレベル BPA を全アカウントで有効化 (Security Hub S3.1)
- [ ] RCP で `aws:PrincipalOrgID` + `aws:SecureTransport` のデータペリメーター
- [ ] SCP で BPA 変更・ログ改ざん・危険な暗号化変更を制限
- [ ] SCP で `s3:x-amz-bucket-namespace = account-regional` を新規バケットに強制 (bucketsquatting 対策)
- [ ] 長期アクセスキーを廃止し、IAM Identity Center / ロールへ移行
- [ ] IMDSv2 を全 EC2 で強制
- [ ] 組織 CloudTrail + S3 データイベント (機密バケットだけでも)
- [ ] GuardDuty (S3 Protection) を全アカウント・全リージョンで有効化
- [ ] Macie 自動機密データ検出
- [ ] IAM Access Analyzer (外部アクセス + 内部アクセス)
- [ ] Security Hub CSPM の FSBP 標準

### 13.2 バケットレベル

- [ ] Object Ownership = BucketOwnerEnforced (ACL 無効, S3.12)
- [ ] バケットレベル BPA 有効 (S3.8)
- [ ] `aws:SecureTransport` Deny (S3.5)、必要なら `s3:TlsVersion`
- [ ] 既定暗号化: 機密データは SSE-KMS (CMK) + Bucket Keys (S3.17)
- [ ] SSE-C がブロックされていることを確認 (`get-bucket-encryption`)
- [ ] バージョニング有効 (S3.14) + 非現行バージョンの Lifecycle (S3.10)
- [ ] 重要データは Object Lock (S3.15) / AWS Backup / CRR (S3.7)
- [ ] アクセスログまたは CloudTrail データイベント (S3.9 / S3.22 / S3.23)
- [ ] バケットポリシーのクロスアカウント許可を最小化 (S3.6)
- [ ] 必要に応じて VPCE / IP 制限
- [ ] アップロード受付バケットには Malware Protection for S3 + TBAC
- [ ] CORS は特定オリジンのみ
- [ ] 署名付き URL は短期・ロール認証情報で発行

### 13.3 運用

- [ ] 削除済みバケット名を参照している DNS / コード / ドキュメントを棚卸し
- [ ] Access Denied の切り分け手順をランブック化 (CloudTrail errorMessage → ポリシー種別)
- [ ] インシデント時の手順: アクセスキー無効化、バケットポリシーで全 Deny、Object Lock / バージョンからの復旧

## 参考文献

- [Shared Responsibility Model](https://aws.amazon.com/compliance/shared-responsibility-model/)
- [Policy evaluation logic (IAM User Guide)](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
- [How Amazon S3 authorizes a request](https://docs.aws.amazon.com/AmazonS3/latest/userguide/how-s3-evaluates-access-control.html)
- [Resource control policies (RCPs) - AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps.html)
- [Controls implemented with RCPs - AWS Control Tower](https://docs.aws.amazon.com/controltower/latest/controlreference/rcp-controls.html)
- [IAM policy types: How and when to use them (AWS Security Blog)](https://aws.amazon.com/blogs/security/iam-policy-types-how-and-when-to-use-them/)
- [How do I troubleshoot explicit deny error messages (re:Post)](https://repost.aws/knowledge-center/iam-explicit-deny-errors)
- [Controlling ownership of objects and disabling ACLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/about-object-ownership.html)
- [Blocking public access to your Amazon S3 storage](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)
- [Amazon S3 Block Public Access feature page](https://aws.amazon.com/s3/features/block-public-access/)
- [Amazon S3 Block Public Access now supports organization-level enforcement (2025-11)](https://aws.amazon.com/about-aws/whats-new/2025/11/amazon-s3-block-public-access-organization-level-enforcement/)
- [Amazon S3 policy syntax and examples - AWS Organizations](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_s3_syntax.html)
- [aws organizations enable-policy-type (AWS CLI Command Reference)](https://docs.aws.amazon.com/cli/latest/reference/organizations/enable-policy-type.html)
- [Protecting data with encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html)
- [Reducing the cost of SSE-KMS with Amazon S3 Bucket Keys](https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-key.html)
- [Using dual-layer server-side encryption with AWS KMS keys (DSSE-KMS)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingDSSEncryption.html)
- [Using server-side encryption with customer-provided keys (SSE-C)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ServerSideEncryptionCustomerKeys.html)
- [Default SSE-C setting for new buckets FAQ](https://docs.aws.amazon.com/AmazonS3/latest/userguide/default-s3-c-encryption-setting-faq.html)
- [Blocking or unblocking SSE-C for a general purpose bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/blocking-unblocking-s3-c-encryption-gpb.html)
- [Advanced notice: Amazon S3 to disable the use of SSE-C encryption by default (AWS Storage Blog)](https://aws.amazon.com/blogs/storage/advanced-notice-amazon-s3-to-disable-the-use-of-sse-c-encryption-by-default-for-all-new-buckets-and-select-existing-buckets-in-april-2026/)
- [Preventing unintended encryption of Amazon S3 objects (AWS Security Blog, 2025-01-15)](https://aws.amazon.com/blogs/security/preventing-unintended-encryption-of-amazon-s3-objects/)
- [Abusing AWS Native Services: Ransomware Encrypting S3 Buckets with SSE-C (Halcyon, 2025-01-13)](https://www.halcyon.ai/blog/abusing-aws-native-services-ransomware-encrypting-s3-buckets-with-sse-c)
- [Amazon S3 starts rolling out new security best practice (2026-04)](https://aws.amazon.com/about-aws/whats-new/2026/04/s3-default-bucket-security-setting/)
- [Change the server-side encryption type of Amazon S3 objects (2026-01)](https://aws.amazon.com/about-aws/whats-new/2026/01/change-the-server-side-encryption-type-of-s3-objects/)
- [Update object encryption (Batch Operations)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/batch-ops-update-encryption.html)
- [How do I enforce TLS 1.2 or later for my S3 buckets? (re:Post)](https://repost.aws/knowledge-center/s3-enforce-modern-tls)
- [TLS 1.2 to become the minimum for all AWS FIPS endpoints (AWS Security Blog)](https://aws.amazon.com/blogs/security/tls-1-2-to-become-the-minimum-for-all-aws-fips-endpoints/)
- [Managing access to shared datasets with access points](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points.html)
- [Managing access to shared datasets in directory buckets with access points](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-points-directory-buckets.html)
- [Amazon S3 Express One Zone now supports granular access controls with S3 Access Points (2025-05)](https://aws.amazon.com/about-aws/whats-new/2025/05/amazon-s3-express-one-zone-granular-access-controls-access-points/)
- [Multi-Region Access Points in Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/MultiRegionAccessPoints.html)
- [Managing access with S3 Access Grants](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-grants.html)
- [Download and upload objects with presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [Why does the presigned URL expire before the expiration time? (re:Post)](https://repost.aws/knowledge-center/presigned-url-s3-bucket-expiration)
- [Browser-based uploads using POST (SigV4)](https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-UsingHTTPPOST.html)
- [Using cross-origin resource sharing (CORS)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)
- [Locking objects with Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
- [Configuring MFA delete](https://docs.aws.amazon.com/AmazonS3/latest/userguide/MultiFactorAuthenticationDelete.html)
- [Gateway endpoints for Amazon S3](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints-s3.html)
- [AWS PrivateLink for Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/privatelink-interface-endpoints.html)
- [AWS PrivateLink now supports cross-region connectivity for AWS Services (What's New, 2025-11-19)](https://aws.amazon.com/about-aws/whats-new/2025/11/aws-privatelink-cross-region-connectivity-aws-services/)
- [Cross-region enabled AWS services (AWS PrivateLink Guide)](https://docs.aws.amazon.com/vpc/latest/privatelink/aws-services-cross-region-privatelink-support.html)
- [Building a data perimeter on AWS (whitepaper)](https://docs.aws.amazon.com/whitepapers/latest/building-a-data-perimeter-on-aws/perimeter-overview.html)
- [Logging options for Amazon S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/logging-with-S3.html)
- [GuardDuty S3 Protection](https://docs.aws.amazon.com/guardduty/latest/ug/s3-protection.html)
- [How does Malware Protection for S3 work?](https://docs.aws.amazon.com/guardduty/latest/ug/how-malware-protection-for-s3-gdu-works.html)
- [Using tag-based access control (TBAC) with Malware Protection for S3](https://docs.aws.amazon.com/guardduty/latest/ug/tag-based-access-s3-malware-protection.html)
- [Amazon Macie](https://docs.aws.amazon.com/macie/latest/user/what-is-macie.html)
- [IAM Access Analyzer now identifies who in your AWS organization can access your AWS resources (2025-06)](https://aws.amazon.com/about-aws/whats-new/2025/06/iam-access-analyzer-aws-organization-access-resources/)
- [Security Hub CSPM controls for Amazon S3](https://docs.aws.amazon.com/securityhub/latest/userguide/s3-controls.html)
- [Top 10 security best practices for securing data in Amazon S3 (AWS Security Blog)](https://aws.amazon.com/blogs/security/top-10-security-best-practices-for-securing-data-in-amazon-s3/)
- [Introducing account regional namespaces for Amazon S3 general purpose buckets (AWS News Blog)](https://aws.amazon.com/blogs/aws/introducing-account-regional-namespaces-for-amazon-s3-general-purpose-buckets/)
- [Amazon S3 introduces account regional namespaces (2026-03)](https://aws.amazon.com/about-aws/whats-new/2026/03/amazon-s3-account-regional-namespaces/)
- [Namespaces for general purpose buckets](https://docs.aws.amazon.com/AmazonS3/latest/userguide/gpbucketnamespaces.html)
- [Migrate to Amazon S3 account regional namespaces (AWS Storage Blog)](https://aws.amazon.com/blogs/storage/migrate-to-amazon-s3-account-regional-namespaces/)
- [Bucketsquatting is (Finally) Dead (onecloudplease)](https://onecloudplease.com/blog/bucketsquatting-is-finally-dead)
- [A new S3 namespace - and a new problem (Pwned Labs)](https://blog.pwnedlabs.io/a-new-s3-namespace-and-a-new-problem)
- [Reused AWS S3 buckets a weak link in supply chain security (The Register, 2025-02)](https://www.theregister.com/2025/02/04/abandoned_aws_s3/)
- [WatchTowr warns abandoned S3 buckets pose supply chain risk (TechTarget)](https://www.techtarget.com/searchsecurity/news/366618663/WatchTowr-warns-abandoned-S3-buckets-pose-supply-chain-risk)
- [Capital One to pay $80M penalty over 2019 data breach (CIO Dive)](https://www.ciodive.com/news/capital-one-breach-penalty/583063/)
- [Capital One freed from consent order tied to 2019 breach (Cybersecurity Dive)](https://www.cybersecuritydive.com/news/capital-one-breach-cloud-treasury-consent-order/632183/)
- [Amazon S3 condition key examples](https://docs.aws.amazon.com/AmazonS3/latest/userguide/amazon-s3-policy-keys.html)
- [Restricting access to an Amazon S3 origin (CloudFront OAC)](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
