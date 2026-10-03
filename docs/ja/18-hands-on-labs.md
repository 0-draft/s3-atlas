# ハンズオンラボ

_最終確認: 2026-10-03_

ここまでの章で読んだ仕組みを、手を動かして確かめるための 12 本のラボ。前半 (Lab 1〜3、7、9、12) はローカルの S3 互換サーバーでもほぼ再現でき、後半 (CloudFront、Lambda、レプリケーション、Athena、S3 Tables、S3 Vectors) は実 AWS アカウントが必要になる。各ラボは「ゴール → 前提 → 手順 → 期待される出力 → 学んだこと → 後片付け」の順で書いてある。

> **コスト注意**: どのラボもデータ量を数 MB に抑えているので、後片付けまでやれば料金はほぼ発生しない (多くても数十円程度)。ただし CloudFront ディストリビューション、レプリケーション、Athena のスキャン、S3 Tables、Lambda などは **消し忘れると月額で課金が続く** か、操作ごとに課金される。必ず各ラボの「後片付け」を実行すること。料金は Region によって違うので、最新値は Amazon S3 料金ページで確認する。

## 0. 共通準備

### 0.1 ツール

| ツール            | 用途                     | 入れ方の例                                                                             |
| ----------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| AWS CLI v2        | 全ラボ                   | `brew install awscli` (本章は v2.37.7 で確認)                                          |
| jq                | JSON 整形                | `brew install jq`                                                                      |
| Docker            | ローカル S3 互換サーバー | Docker Desktop / Rancher Desktop / colima など                                         |
| s5cmd             | Lab 12                   | `brew install peak/tap/s5cmd` (または `peakcom/s5cmd` コンテナイメージ)                |
| warp              | Lab 12                   | GitHub Releases (`minio/warp`) からバイナリ取得 (または `minio/warp` コンテナイメージ) |
| Python 3.13 + pip | Lab 5                    | `brew install python@3.13`                                                             |

### 0.2 実 AWS 用の環境変数

ラボ用には **AdministratorAccess 相当を持つ検証専用アカウント** (本番アカウントではない) を使うのが安全。

```bash
export AWS_REGION=ap-northeast-1
export AWS_DEFAULT_REGION=$AWS_REGION
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
# バケット名はグローバルで一意なので、アカウント ID と乱数を混ぜる
export LAB=s3lab-${ACCOUNT_ID}-$(openssl rand -hex 3)
echo $LAB
```

```text
s3lab-111122223333-a1b2c3
```

以後、`${LAB}-l1` のように「ラボ番号付き」のバケット名を使う。

### 0.3 ローカル環境 A: MinIO 互換サーバー (pgsty/silo)

MinIO のコミュニティ版は 2025 年 10 月に公式バイナリ / コンテナイメージの配布を止め、2026 年に GitHub リポジトリもアーカイブされた。2026-09 には Docker Hub の `minio/minio` リポジトリ自体が削除されている。そのため本章では、MinIO サーバーを引き継いでビルドと配布を続けているコミュニティフォーク **pgsty/silo** (旧 `pgsty/minio`) のイメージを使う。S3 API とコマンド体系は MinIO と同じ。

```bash
docker run -d --name s3lab-minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin-change-me \
  -v "$PWD/minio-data:/data" \
  docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z \
  server /data --console-address ":9001"
```

AWS CLI からは専用プロファイルで叩く。`endpoint_url` をプロファイルに書けるので、毎回 `--endpoint-url` を付けなくて済む。

```bash
aws configure set aws_access_key_id minioadmin --profile minio
aws configure set aws_secret_access_key minioadmin-change-me --profile minio
aws configure set region us-east-1 --profile minio
aws configure set endpoint_url http://localhost:9000 --profile minio
aws configure set s3.addressing_style path --profile minio
aws s3 ls --profile minio   # 何も出なければ接続 OK
```

- コンソールは <http://localhost:9001>
- 新しめの CLI はフレキシブルチェックサムを既定で送る。古い S3 互換実装でエラーになる場合は `export AWS_REQUEST_CHECKSUM_CALCULATION=when_required` で旧挙動に戻せる
- ローカルで本ラボを回す場合は、以後のコマンドの `--profile minio` を付け、`LAB=local` のように適当な名前にする
- `LocationConstraint=$AWS_REGION` はローカルでもそのままでよい。silo は空値 (`AWS_REGION` 未設定) も `ap-northeast-1` も受け付けた
- 2026-10-03 に確認: 上の `docker run` で `pgsty/silo:RELEASE.2026-09-16T00-00-00Z` が pull・起動でき (Docker API として Podman 6.1 を使用)、`aws s3 ls --profile minio` は何も返さない (AWS CLI 2.37.7)

### 0.4 ローカル環境 B: LocalStack

LocalStack は 2026-03-23 以降、`localstack/localstack` イメージの起動に **auth token が必須** になった (非商用向けの無料プランはあるがアカウント登録が要る)。Lambda や S3 イベント通知まで含めてローカルで試したい場合に使う。

```bash
export LOCALSTACK_AUTH_TOKEN="your-token-here"   # localstack.cloud で発行したトークン
docker run -d --name s3lab-localstack \
  -p 4566:4566 \
  -e LOCALSTACK_AUTH_TOKEN \
  -v /var/run/docker.sock:/var/run/docker.sock \
  localstack/localstack
aws --endpoint-url http://localhost:4566 s3 ls
```

> **ローカルでは未検証**: 2026-10-03 に token なしで `localstack/localstack:latest` (2026.9.0) を起動したところ、exit code 55 (`License activation failed! ... No credentials were found in the environment`) で終了した。そのため 0.5 の LocalStack 列は実行結果ではなく LocalStack のドキュメントに基づく。

### 0.5 ラボとローカル環境の対応

| ラボ                                       | 実 AWS | MinIO 互換 (silo)                                                                                                                  | LocalStack    |
| ------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Lab 1 バケット + アップロード + Presign    | OK     | 手順 2 以外 OK (Block Public Access / Object Ownership は `NotImplemented`、デフォルト暗号化なし)                                  | OK            |
| Lab 2 バージョニング                       | OK     | OK                                                                                                                                 | OK            |
| Lab 3 ライフサイクル + Intelligent-Tiering | OK     | 失効ルールのみ (Transitions、`AbortIncompleteMultipartUpload`、`INTELLIGENT_TIERING` クラス、Intelligent-Tiering 設定は拒否される) | 設定 API のみ |
| Lab 4 CloudFront OAC                       | OK     | 不可                                                                                                                               | 一部          |
| Lab 5 イベント → Lambda                    | OK     | 不可 (Webhook 通知は可)                                                                                                            | OK            |
| Lab 6 CRR                                  | OK     | 別方式 (サイトレプリケーション)                                                                                                    | 一部          |
| Lab 7 Object Lock                          | OK     | OK (削除拒否時のエラーコードが異なる)                                                                                              | 一部          |
| Lab 8 バケットポリシー / 403               | OK     | 別方式 (MinIO ポリシー)                                                                                                            | 評価は簡略    |
| Lab 9 手動マルチパート                     | OK     | OK                                                                                                                                 | OK            |
| Lab 10 Athena / S3 Tables                  | OK     | 不可                                                                                                                               | 不可          |
| Lab 11 S3 Vectors                          | OK     | 不可                                                                                                                               | 不可          |
| Lab 12 ベンチマーク                        | OK     | OK (ローカル性能になる)                                                                                                            | 非推奨        |

silo 列は 2026-10-03 に実際にラボを実行して確認した (Lab 1〜3、7、9、12)。Lab 4、5、6、8、10、11 は実 AWS では実行しておらず、同じコマンドをローカルのモック (moto 5.2.3 サーバー)に送って AWS CLI が引数を受け付けることだけを確認した。LocalStack 列は未検証 (0.4 参照)。

## Lab 1: バケット作成・アップロード・Presigned URL

### ゴール

バケットを作り、オブジェクトを上げ下ろしし、認証なしで一時的にダウンロードできる Presigned URL を発行する。

### 前提

0.2 の環境変数 (ローカルなら 0.3 の `minio` プロファイル)。

> **ローカルで検証済み**: 2026-10-03 に `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`、AWS CLI 2.37.7 で手順 1、3、4、5 と後片付けが通った。手順 2 (デフォルトのセキュリティ設定) は AWS の挙動なので実 AWS アカウントが必要 (ローカルでは未検証)。

### 手順

```bash
B=${LAB}-l1
# 1. バケット作成 (us-east-1 以外は LocationConstraint が必須)
aws s3api create-bucket --bucket $B \
  --create-bucket-configuration LocationConstraint=$AWS_REGION

# 2. デフォルトのセキュリティ設定を確認 (Block Public Access 全 ON、SSE-S3、ACL 無効)
aws s3api get-public-access-block --bucket $B
aws s3api get-bucket-encryption --bucket $B --query 'ServerSideEncryptionConfiguration.Rules[0]'
aws s3api get-bucket-ownership-controls --bucket $B

# 3. アップロード
echo "hello s3 $(date)" > hello.txt
aws s3 cp hello.txt s3://$B/greetings/hello.txt
aws s3api head-object --bucket $B --key greetings/hello.txt

# 4. Presigned URL を 5 分有効で発行して curl で取る
URL=$(aws s3 presign s3://$B/greetings/hello.txt --expires-in 300)
echo "$URL"
curl -s "$URL"

# 5. 署名なしで直接叩くと 403 になることも確認
curl -s -o /dev/null -w '%{http_code}\n' "https://$B.s3.$AWS_REGION.amazonaws.com/greetings/hello.txt"
```

### 期待される出力

```text
{
    "PublicAccessBlockConfiguration": {
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
    }
}
...
https://s3lab-111122223333-a1b2c3-l1.s3.ap-northeast-1.amazonaws.com/greetings/hello.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Date=20261003T010000Z&X-Amz-Expires=300&X-Amz-SignedHeaders=host&X-Amz-Signature=...
hello s3 Sat Oct  3 01:00:00 JST 2026
403
```

`head-object` は `ContentLength`、`ETag`、`ServerSideEncryption: AES256` などを返す。

ローカルの silo では手順 2 が `NotImplemented` (`get-public-access-block` / `get-bucket-ownership-controls`) と `ServerSideEncryptionConfigurationNotFoundError` (`get-bucket-encryption`) になり、`head-object` に `ServerSideEncryption` は出ない。Presigned URL は `http://localhost:9000/local-l1/greetings/hello.txt?X-Amz-Algorithm=...` になり、手順 5 は代わりに `curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:9000/$B/greetings/hello.txt"` を使う (こちらも `403` になる)。

### 学んだこと

- 新規バケットは最初から「非公開・SSE-S3 暗号化・ACL 無効 (BucketOwnerEnforced)」
- Presigned URL は **クライアント側の計算だけ** で作られ、URL に署名が埋め込まれる (17 章 3.9)
- 署名した認証情報の権限と寿命がそのまま URL の権限と寿命になる

### 後片付け

```bash
aws s3 rb s3://$B --force
```

## Lab 2: バージョニングと削除オブジェクトの復旧

### ゴール

バージョニングを有効にし、上書き・削除されたオブジェクトを過去バージョンから取り戻す。

### 前提

Lab 1 と同じ。

> **ローカルで検証済み**: 2026-10-03 に `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`、AWS CLI 2.37.7 で全手順と後片付けが通った。

### 手順

```bash
B=${LAB}-l2
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION
aws s3api put-bucket-versioning --bucket $B --versioning-configuration Status=Enabled

# v1 → v2 と上書きしてから削除
echo v1 > doc.txt && aws s3 cp doc.txt s3://$B/doc.txt
echo v2 > doc.txt && aws s3 cp doc.txt s3://$B/doc.txt
aws s3 rm s3://$B/doc.txt

# 「消えた」ように見える
aws s3 ls s3://$B/

# 実際はバージョンと削除マーカーが残っている
aws s3api list-object-versions --bucket $B --prefix doc.txt \
  --query '{Versions: Versions[].{V: VersionId, Latest: IsLatest, Size: Size}, Markers: DeleteMarkers[].{V: VersionId, Latest: IsLatest}}'
```

復旧方法は 2 通りある。

```bash
# 方法 A: 削除マーカーを消す (= 直前の v2 が最新に戻る)
MARKER=$(aws s3api list-object-versions --bucket $B --prefix doc.txt \
  --query 'DeleteMarkers[?IsLatest].VersionId' --output text)
aws s3api delete-object --bucket $B --key doc.txt --version-id $MARKER
aws s3 cp s3://$B/doc.txt -    # => v2

# 方法 B: 古いバージョン (v1) をコピーして最新にする
# (方法 A の後は v2 が最新なので、非最新のバージョンは v1 だけ。
#  LastModified は秒精度なので並べ替えでは v1 / v2 を区別できないことがある)
V1=$(aws s3api list-object-versions --bucket $B --prefix doc.txt \
  --query 'Versions[?!IsLatest].VersionId' --output text)
aws s3api copy-object --bucket $B --key doc.txt --copy-source "$B/doc.txt?versionId=$V1"
aws s3 cp s3://$B/doc.txt -    # => v1
```

### 期待される出力

```text
{
    "Versions": [
        {"V": "Fq3...", "Latest": false, "Size": 3},
        {"V": "8bK...", "Latest": false, "Size": 3}
    ],
    "Markers": [
        {"V": "x9Z...", "Latest": true}
    ]
}
{"DeleteMarker": true, "VersionId": "x9Z..."}
v2
{"CopySourceVersionId": "8bK...", "VersionId": "Qm7...", "CopyObjectResult": {...}}
v1
```

実際の CLI は JSON を複数行に整形して出す (ここでは詰めて書いている)。`aws s3 ls` は何も出さない。

### 学んだこと

- バージョニング有効時の `DeleteObject` (versionId なし) は **削除マーカーを積むだけ** で、データは消えない
- versionId を指定した削除だけが物理削除。これを防ぐのが MFA Delete と Object Lock (Lab 7)
- 古いバージョンも課金対象なので、`NoncurrentVersionExpiration` ライフサイクルとセットで運用する

### 後片付け

バージョン付きバケットは `aws s3 rb --force` だけでは空にならない。全バージョンと削除マーカーを消してから削除する。

```bash
empty_versioned() {
  local b=$1 objs errs
  while :; do
    objs=$(aws s3api list-object-versions --bucket "$b" --max-items 1000 \
      --query '{Objects: [Versions, DeleteMarkers][][].{Key: Key, VersionId: VersionId}}' --output json)
    [ "$(echo "$objs" | jq '.Objects | length')" -eq 0 ] && break
    errs=$(aws s3api delete-objects --bucket "$b" --delete "$objs" \
      --query 'length(Errors || `[]`)' --output text)
    [ "$errs" -eq 0 ] || { echo "delete-objects: $errs object(s) could not be deleted" >&2; return 1; }
  done
}
empty_versioned $B && aws s3api delete-bucket --bucket $B
```

この `empty_versioned` 関数は後続のラボでも使う。`delete-objects` は一部のキーが消せなくても終了コード 0 を返す (失敗は `Errors` に入る) ので、関数は `Errors` を見て止まる。このチェックがないと、Object Lock (Lab 7) で保護されたバージョンが残ったときに無限ループになる。`local` をループの外で宣言しているのは、zsh では設定済みの変数を `local` で再宣言するとその値が表示されるため。

## Lab 3: ライフサイクルと Intelligent-Tiering

### ゴール

プレフィックスごとに異なるライフサイクルルールを設定し、Intelligent-Tiering のアーカイブ層を有効化する。

### 前提

Lab 1 と同じ。ライフサイクルは **非同期 (おおむね 1 日 1 回)** に評価されるので、このラボでは「設定が効いていることを API で確認する」までを行う。

> **ローカルで検証済み**: 2026-10-03 に `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`、AWS CLI 2.37.7 で `tmp/` の失効ルールのみ確認した (手順の後の注記参照)。Transitions、`AbortIncompleteMultipartUpload`、Intelligent-Tiering は実 AWS アカウントが必要 (ローカルでは未検証) で、CLI 引数は moto 5.2.3 で確認した。

### 手順

```bash
B=${LAB}-l3
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION

cat > lifecycle.json <<'EOF'
{
  "Rules": [
    {"ID": "logs-tiering-and-expire", "Filter": {"Prefix": "logs/"}, "Status": "Enabled", "Transitions": [{"Days": 30, "StorageClass": "STANDARD_IA"}, {"Days": 90, "StorageClass": "GLACIER_IR"}], "Expiration": {"Days": 365}},
    {"ID": "tmp-expire-1day", "Filter": {"Prefix": "tmp/"}, "Status": "Enabled", "Expiration": {"Days": 1}},
    {"ID": "abort-incomplete-mpu", "Filter": {}, "Status": "Enabled", "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}}
  ]
}
EOF
aws s3api put-bucket-lifecycle-configuration --bucket $B --lifecycle-configuration file://lifecycle.json
aws s3api get-bucket-lifecycle-configuration --bucket $B --query 'Rules[].ID'

# tmp/ のオブジェクトには失効予定日がヘッダで付く
echo x > t.txt && aws s3 cp t.txt s3://$B/tmp/t.txt
aws s3api head-object --bucket $B --key tmp/t.txt --query Expiration

# Intelligent-Tiering: オブジェクトを INTELLIGENT_TIERING で置き、アーカイブ層を有効化
aws s3 cp t.txt s3://$B/data/t.txt --storage-class INTELLIGENT_TIERING
cat > itier.json <<'EOF'
{
  "Id": "archive-after-90-180",
  "Status": "Enabled",
  "Filter": {"Prefix": "data/"},
  "Tierings": [
    {"Days": 90, "AccessTier": "ARCHIVE_ACCESS"},
    {"Days": 180, "AccessTier": "DEEP_ARCHIVE_ACCESS"}
  ]
}
EOF
aws s3api put-bucket-intelligent-tiering-configuration --bucket $B \
  --id archive-after-90-180 --intelligent-tiering-configuration file://itier.json
aws s3api list-bucket-intelligent-tiering-configurations --bucket $B
aws s3api head-object --bucket $B --key data/t.txt --query StorageClass
```

ローカルの silo では、Transitions (STANDARD_IA / GLACIER_IR はリモート層の設定が必要で `InvalidStorageClass`) と `AbortIncompleteMultipartUpload` が未対応のため、`put-bucket-lifecycle-configuration` が設定全体を拒否する (`InvalidArgument`)。`--storage-class INTELLIGENT_TIERING` は `InvalidStorageClass`、Intelligent-Tiering 設定 API は `MalformedXML` / `NotImplemented` になる。ローカルでは失効ルールだけを登録する。

```bash
jq '{Rules: [.Rules[] | select(.ID == "tmp-expire-1day")]}' lifecycle.json > lifecycle-local.json
aws s3api put-bucket-lifecycle-configuration --bucket $B --lifecycle-configuration file://lifecycle-local.json
aws s3api get-bucket-lifecycle-configuration --bucket $B --query 'Rules[].ID'
aws s3 cp t.txt s3://$B/tmp/t.txt
aws s3api head-object --bucket $B --key tmp/t.txt --query Expiration
```

### 期待される出力

```text
[
    "logs-tiering-and-expire",
    "tmp-expire-1day",
    "abort-incomplete-mpu"
]
"expiry-date=\"Sun, 04 Oct 2026 00:00:00 GMT\", rule-id=\"tmp-expire-1day\""
...
"INTELLIGENT_TIERING"
```

上の `expiry-date` は 2026-10-03 01:00 JST (= 10-02 16:00 UTC) に作ったオブジェクトの場合。10-03 の 00:00 UTC 以降に作ると `Mon, 05 Oct 2026 00:00:00 GMT` になる (13:30 UTC に実行したローカル silo の結果もこの値だった)。

### 学んだこと

- ライフサイクルの日数は「作成日の翌日 0 時 UTC から数える」ので、`Expiration` ヘッダの日付は作成日 + N 日に丸められる
- STANDARD_IA / ONEZONE_IA への移行は **作成後 30 日以上** が必要、128 KB 未満のオブジェクトは既定で移行されない
- Intelligent-Tiering のアクセス頻度層 (Frequent / Infrequent / Archive Instant) は自動、Archive / Deep Archive 層は **オプトイン** で、そこに落ちたオブジェクトの読み出しには `RestoreObject` が要る
- `AbortIncompleteMultipartUpload` は全バケットに入れておくべき「見えないゴミ」対策

### 後片付け

```bash
aws s3 rb s3://$B --force
rm -f lifecycle.json lifecycle-local.json itier.json t.txt
```

## Lab 4: CloudFront + OAC で静的サイト配信

### ゴール

バケットを非公開のまま、CloudFront の Origin Access Control (OAC) 経由でだけ配信する。

### 前提

実 AWS。CloudFront はグローバルサービスなので、作成や削除の反映に数分〜15 分程度かかる。

> **実 AWS アカウントが必要 (ローカルでは未検証)**。2026-10-03 に全手順と後片付けを AWS CLI 2.37.7 からローカルのモック (moto 5.2.3 サーバー)に送り、CLI が引数を受け付けること (`create-origin-access-control` の shorthand、`dist.json`、`--if-match` 付きの `update-distribution` / `delete-*`) を確認した。CloudFront 経由の実配信と直アクセス時の 403 は未検証。

### 手順

```bash
B=${LAB}-l4
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION
echo '<h1>Hello from S3 via CloudFront</h1>' > index.html
aws s3 cp index.html s3://$B/index.html --content-type text/html

# 1. OAC を作成
OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
  "Name=${B}-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
  --query OriginAccessControl.Id --output text)

# 2. ディストリビューションを作成 (CachingOptimized マネージドポリシーを使用)
cat > dist.json <<EOF
{
  "CallerReference": "${B}-$(date +%s)",
  "Comment": "s3 lab 4",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {"Id": "s3origin", "DomainName": "${B}.s3.${AWS_REGION}.amazonaws.com", "OriginAccessControlId": "${OAC_ID}", "S3OriginConfig": {"OriginAccessIdentity": ""}}
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3origin",
    "ViewerProtocolPolicy": "redirect-to-https",
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }
}
EOF
read DIST_ID DIST_DOMAIN < <(aws cloudfront create-distribution --distribution-config file://dist.json \
  --query 'Distribution.[Id,DomainName]' --output text)
echo $DIST_ID $DIST_DOMAIN

# 3. バケットポリシーで「このディストリビューションからだけ」許可
cat > policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {"Sid": "AllowCloudFrontOAC", "Effect": "Allow", "Principal": {"Service": "cloudfront.amazonaws.com"}, "Action": "s3:GetObject", "Resource": "arn:aws:s3:::${B}/*", "Condition": {"StringEquals": {"AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"}}}
  ]
}
EOF
aws s3api put-bucket-policy --bucket $B --policy file://policy.json

# 4. デプロイ完了を待って確認
aws cloudfront wait distribution-deployed --id $DIST_ID
curl -s https://$DIST_DOMAIN/
curl -s -o /dev/null -w '%{http_code}\n' https://$B.s3.$AWS_REGION.amazonaws.com/index.html
```

### 期待される出力

```text
E2ABCDEXAMPLE d111111abcdef8.cloudfront.net
<h1>Hello from S3 via CloudFront</h1>
403
```

### 学んだこと

- OAC は CloudFront が **SigV4 でオリジンリクエストに署名** する仕組み。旧来の OAI より推奨で、SSE-KMS 暗号化オブジェクトも扱える (KMS キーポリシーで CloudFront に `kms:Decrypt` を許可する)
- Block Public Access を全部 ON のままにできる (プリンシパルが AWS サービスで、条件付きなのでパブリック扱いにならない)
- S3 の「静的ウェブサイトホスティング」エンドポイントは HTTP のみで OAC と併用できない。SPA のルーティングは CloudFront のカスタムエラーレスポンスや CloudFront Functions で対応する

### 後片付け

```bash
ETAG=$(aws cloudfront get-distribution-config --id $DIST_ID --query ETag --output text)
aws cloudfront get-distribution-config --id $DIST_ID --query DistributionConfig \
  | jq '.Enabled=false' > dist-disabled.json
aws cloudfront update-distribution --id $DIST_ID --if-match $ETAG --distribution-config file://dist-disabled.json > /dev/null
aws cloudfront wait distribution-deployed --id $DIST_ID
ETAG=$(aws cloudfront get-distribution --id $DIST_ID --query ETag --output text)
aws cloudfront delete-distribution --id $DIST_ID --if-match $ETAG
OAC_ETAG=$(aws cloudfront get-origin-access-control --id $OAC_ID --query ETag --output text)
aws cloudfront delete-origin-access-control --id $OAC_ID --if-match $OAC_ETAG
aws s3 rb s3://$B --force
rm -f index.html dist.json dist-disabled.json policy.json
```

## Lab 5: イベント通知 → Lambda でサムネイル生成

### ゴール

`uploads/` に画像が置かれたら Lambda が起動し、別バケットに縮小画像を書き出す。

### 前提

実 AWS (または LocalStack)。Python 3.13 と pip。**入力と出力を必ず別バケットにする** (同じバケットに書くと自分の出力で再起動する無限ループになり、課金が膨らむ)。

> **実 AWS アカウントが必要 (ローカルでは未検証)**。2026-10-03 に S3 / IAM / Lambda のコマンドと後片付けを AWS CLI 2.37.7 からローカルのモック (moto 5.2.3 サーバー)に送って CLI が引数を受け付けることを確認し、手順 2 の `pip install` が Python 3.13 x86_64 向け wheel (Pillow 12.2.0) を取得することも確認した。`app.py` 自体は Lambda の外で手作りの S3 イベントを渡して実行し、821 バイトの `thumbs/test.png.jpg` が書かれた。Lambda 上での実行、S3 → Lambda のトリガー、CloudWatch Logs は未検証。

### 手順

```bash
SRC=${LAB}-l5-src
DST=${LAB}-l5-dst
for b in $SRC $DST; do
  aws s3api create-bucket --bucket $b --create-bucket-configuration LocationConstraint=$AWS_REGION
done

# 1. Lambda コード
mkdir -p l5/pkg && cat > l5/pkg/app.py <<'EOF'
import io, os, urllib.parse
import boto3
from PIL import Image

s3 = boto3.client("s3")
DST = os.environ["DST_BUCKET"]

def handler(event, context):
    for rec in event["Records"]:
        bucket = rec["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(rec["s3"]["object"]["key"])
        body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
        img = Image.open(io.BytesIO(body))
        img.thumbnail((128, 128))
        out = io.BytesIO()
        img.convert("RGB").save(out, format="JPEG")
        s3.put_object(Bucket=DST, Key=f"thumbs/{os.path.basename(key)}.jpg",
                      Body=out.getvalue(), ContentType="image/jpeg")
        print(f"thumbnail written for s3://{bucket}/{key}")
EOF

# 2. Pillow を Lambda (Amazon Linux, x86_64) 用 wheel で同梱
pip install --target l5/pkg --platform manylinux2014_x86_64 \
  --implementation cp --python-version 3.13 --only-binary=:all: pillow
(cd l5/pkg && zip -qr ../fn.zip .)

# 3. 実行ロール
cat > l5/trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}
  ]
}
EOF
ROLE_ARN=$(aws iam create-role --role-name ${LAB}-l5-role \
  --assume-role-policy-document file://l5/trust.json --query Role.Arn --output text)
aws iam attach-role-policy --role-name ${LAB}-l5-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --role-name ${LAB}-l5-role --policy-name s3 --policy-document "{
  \"Version\": \"2012-10-17\", \"Statement\": [
   {\"Effect\": \"Allow\", \"Action\": \"s3:GetObject\", \"Resource\": \"arn:aws:s3:::$SRC/*\"},
   {\"Effect\": \"Allow\", \"Action\": \"s3:PutObject\", \"Resource\": \"arn:aws:s3:::$DST/*\"}]}"
sleep 10   # IAM の伝播待ち

# 4. 関数作成
FN_ARN=$(aws lambda create-function --function-name ${LAB}-thumb \
  --runtime python3.13 --handler app.handler --role $ROLE_ARN \
  --zip-file fileb://l5/fn.zip --timeout 30 --memory-size 512 \
  --environment "Variables={DST_BUCKET=$DST}" --query FunctionArn --output text)
aws lambda wait function-active-v2 --function-name ${LAB}-thumb

# 5. S3 からの呼び出しを許可し、通知を設定
aws lambda add-permission --function-name ${LAB}-thumb --statement-id s3invoke \
  --action lambda:InvokeFunction --principal s3.amazonaws.com \
  --source-arn arn:aws:s3:::$SRC --source-account $ACCOUNT_ID
aws s3api put-bucket-notification-configuration --bucket $SRC --notification-configuration "{
  \"LambdaFunctionConfigurations\": [{
    \"LambdaFunctionArn\": \"$FN_ARN\",
    \"Events\": [\"s3:ObjectCreated:*\"],
    \"Filter\": {\"Key\": {\"FilterRules\": [
      {\"Name\": \"prefix\", \"Value\": \"uploads/\"},
      {\"Name\": \"suffix\", \"Value\": \".png\"}]}}}]}"

# 6. テスト画像を生成してアップロード
# (標準ライブラリだけで 640x480 の単色 PNG を作る)
python3 - <<'EOF'
import struct, zlib
w, h = 640, 480
raw = b"".join(b"\x00" + bytes([30, 120, 200]) * w for _ in range(h))
def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) \
    + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
open("test.png", "wb").write(png)
EOF
aws s3 cp test.png s3://$SRC/uploads/test.png
sleep 10
aws s3 ls s3://$DST/thumbs/
aws logs tail /aws/lambda/${LAB}-thumb --since 5m
```

### 期待される出力

```text
2026-10-03 01:20:00        821 test.png.jpg
... START RequestId: ...
... thumbnail written for s3://s3lab-111122223333-a1b2c3-l5-src/uploads/test.png
... END RequestId: ...
```

### 学んだこと

- S3 イベント通知は **at-least-once** で、まれに重複・順不同で届く。処理は冪等に作る (出力キーを入力キーから決める等)
- イベント中のキーは URL エンコードされている (`unquote_plus` が必要)
- プレフィックス / サフィックスより複雑なフィルタや複数ターゲットが要るなら、`EventBridgeConfiguration` を有効にして EventBridge ルールで振り分ける

### 後片付け

```bash
aws s3api put-bucket-notification-configuration --bucket $SRC --notification-configuration '{}'
aws lambda delete-function --function-name ${LAB}-thumb
aws logs delete-log-group --log-group-name /aws/lambda/${LAB}-thumb
aws iam delete-role-policy --role-name ${LAB}-l5-role --policy-name s3
aws iam detach-role-policy --role-name ${LAB}-l5-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name ${LAB}-l5-role
aws s3 rb s3://$SRC --force && aws s3 rb s3://$DST --force
rm -rf l5 test.png
```

## Lab 6: クロスリージョンレプリケーション (CRR)

### ゴール

東京 (ap-northeast-1) のバケットへの書き込みを大阪 (ap-northeast-3) のバケットへ自動複製する。

### 前提

実 AWS。**リージョン間データ転送料金** が複製量に応じてかかる (このラボは数 KB なので誤差)。

> **実 AWS アカウントが必要 (ローカルでは未検証)**。2026-10-03 に全手順と後片付けを AWS CLI 2.37.7 からローカルのモック (moto 5.2.3 サーバー)に送り、CLI が引数を受け付けること (`repl.json` が受理され `get-bucket-replication` で読み戻せる) を確認した。実際の複製と `PENDING` → `COMPLETED` / `REPLICA` の状態遷移は未検証。

### 手順

```bash
SRC=${LAB}-l6-tokyo
DST=${LAB}-l6-osaka
aws s3api create-bucket --bucket $SRC --create-bucket-configuration LocationConstraint=ap-northeast-1
aws s3api create-bucket --bucket $DST --region ap-northeast-3 --create-bucket-configuration LocationConstraint=ap-northeast-3
# レプリケーションには両側のバージョニングが必須
aws s3api put-bucket-versioning --bucket $SRC --versioning-configuration Status=Enabled
aws s3api put-bucket-versioning --bucket $DST --region ap-northeast-3 --versioning-configuration Status=Enabled

# レプリケーション用ロール
cat > trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Principal": {"Service": "s3.amazonaws.com"}, "Action": "sts:AssumeRole"}
  ]
}
EOF
ROLE_ARN=$(aws iam create-role --role-name ${LAB}-l6-repl \
  --assume-role-policy-document file://trust.json --query Role.Arn --output text)
cat > repl-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect": "Allow", "Action": ["s3:GetReplicationConfiguration", "s3:ListBucket"], "Resource": "arn:aws:s3:::${SRC}"},
    {"Effect": "Allow", "Action": ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl", "s3:GetObjectVersionTagging"], "Resource": "arn:aws:s3:::${SRC}/*"},
    {"Effect": "Allow", "Action": ["s3:ReplicateObject", "s3:ReplicateDelete", "s3:ReplicateTags"], "Resource": "arn:aws:s3:::${DST}/*"}
  ]
}
EOF
aws iam put-role-policy --role-name ${LAB}-l6-repl --policy-name repl --policy-document file://repl-policy.json
sleep 10

cat > repl.json <<EOF
{
  "Role": "${ROLE_ARN}",
  "Rules": [
    {"ID": "all-to-osaka", "Priority": 1, "Status": "Enabled", "Filter": {}, "DeleteMarkerReplication": {"Status": "Enabled"}, "Destination": {"Bucket": "arn:aws:s3:::${DST}", "StorageClass": "STANDARD_IA"}}
  ]
}
EOF
aws s3api put-bucket-replication --bucket $SRC --replication-configuration file://repl.json

# 書き込んで状態を観察
echo "replicate me" > r.txt && aws s3 cp r.txt s3://$SRC/r.txt
aws s3api head-object --bucket $SRC --key r.txt --query ReplicationStatus
sleep 30
aws s3api head-object --bucket $SRC --key r.txt --query ReplicationStatus
aws s3api head-object --bucket $DST --key r.txt --region ap-northeast-3 \
  --query '{Status: ReplicationStatus, Class: StorageClass, Version: VersionId}'
```

### 期待される出力

```text
"PENDING"
"COMPLETED"
{"Status": "REPLICA", "Class": "STANDARD_IA", "Version": "w8A... (送信元と同じバージョン ID)"}
```

### 学んだこと

- レプリケーションは **設定後に書かれたオブジェクト** だけが対象。既存オブジェクトは S3 Batch Replication (`s3control create-job` の `S3ReplicateObject`) で流す
- 送信元は `PENDING` → `COMPLETED` / `FAILED`、宛先は `REPLICA` になる。バージョン ID は保持される
- 多くは 15 分以内に複製されるが SLA はない。SLA が必要なら Replication Time Control (RTC、99.99% を 15 分以内) を有効化する (追加料金)
- 宛先側でストレージクラスを変えられるので、DR 用コピーを安いクラスに置ける

### 後片付け

```bash
aws s3api delete-bucket-replication --bucket $SRC
empty_versioned $SRC && aws s3api delete-bucket --bucket $SRC
AWS_REGION=ap-northeast-3 empty_versioned $DST && aws s3api delete-bucket --bucket $DST --region ap-northeast-3
aws iam delete-role-policy --role-name ${LAB}-l6-repl --policy-name repl
aws iam delete-role --role-name ${LAB}-l6-repl
rm -f trust.json repl-policy.json repl.json r.txt
```

## Lab 7: Object Lock で WORM 保護

### ゴール

GOVERNANCE モードの保持期間とリーガルホールドで、バージョンの削除・上書きを防ぐ。

### 前提

実 AWS または MinIO 互換サーバー。**COMPLIANCE モードは絶対に使わない** (保持期限まで root ユーザーでもバージョンを消せず、バケットも削除できない)。このラボでは保持期限を「今から 3 分後」にする。

> **ローカルで検証済み**: 2026-10-03 に `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`、AWS CLI 2.37.7 で全手順と後片付け (`sleep 180` を含む) が通った。コメント内の `--bypass-governance-retention` 付き削除も動いた。削除拒否時のエラーだけが異なる (期待される出力を参照)。

### 手順

```bash
B=${LAB}-l7
# Object Lock を有効にして作成 (バージョニングも自動で有効になる)
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION \
  --object-lock-enabled-for-bucket
aws s3api get-object-lock-configuration --bucket $B

echo "audit log" > audit.txt
VID=$(aws s3api put-object --bucket $B --key audit.txt --body audit.txt \
  --query VersionId --output text)

# 3 分後まで GOVERNANCE で保持 (macOS の date。GNU date なら -d '+3 minutes')
UNTIL=$(date -u -v+3M +%Y-%m-%dT%H:%M:%SZ)
aws s3api put-object-retention --bucket $B --key audit.txt --version-id $VID \
  --retention "Mode=GOVERNANCE,RetainUntilDate=$UNTIL"
aws s3api get-object-retention --bucket $B --key audit.txt --version-id $VID

# バージョンを消そうとすると拒否される
aws s3api delete-object --bucket $B --key audit.txt --version-id $VID

# s3:BypassGovernanceRetention 権限があれば明示的に迂回できる (= GOVERNANCE の意味)
# aws s3api delete-object --bucket $B --key audit.txt --version-id $VID --bypass-governance-retention

# リーガルホールド: 期限なしの保持フラグ
aws s3api put-object-legal-hold --bucket $B --key audit.txt --version-id $VID --legal-hold Status=ON
aws s3api get-object-legal-hold --bucket $B --key audit.txt --version-id $VID
```

### 期待される出力

```text
{"ObjectLockConfiguration": {"ObjectLockEnabled": "Enabled"}}
{"Retention": {"Mode": "GOVERNANCE", "RetainUntilDate": "2026-10-03T01:33:00+00:00"}}
aws: [ERROR]: An error occurred (AccessDenied) when calling the DeleteObject operation: Access Denied because object protected by object lock.
{"LegalHold": {"Status": "ON"}}
```

AWS CLI 2.37 はエラー行の先頭に `aws: [ERROR]:` を付ける。ローカルの silo では削除が代わりに `An error occurred (InvalidRequest) when calling the DeleteObject operation: Object is WORM protected and cannot be overwritten` で失敗し、バージョン ID は UUID になる。

### 学んだこと

- Object Lock は **バージョン単位** の保護。versionId なしの DELETE は削除マーカーを積むだけなので普通に成功する (データは守られる)
- GOVERNANCE は特権 (`s3:BypassGovernanceRetention`) で迂回可能、COMPLIANCE は誰も迂回できない
- リーガルホールドは期限なし。保持期間とは独立に ON / OFF できる
- 既存バケットにも後から `put-object-lock-configuration` で有効化できる (バージョニング有効が前提)

### 後片付け

```bash
aws s3api put-object-legal-hold --bucket $B --key audit.txt --version-id $VID --legal-hold Status=OFF
sleep 180   # 保持期限が過ぎるのを待つ (または --bypass-governance-retention で削除)
empty_versioned $B && aws s3api delete-bucket --bucket $B
rm -f audit.txt
```

保持期限が過ぎる前に `empty_versioned` を実行すると `delete-objects: 1 object(s) could not be deleted` で止まる (Lab 2 の `Errors` チェックはこのためにある)。待ってからもう一度実行する。

## Lab 8: バケットポリシーと 403 のデバッグ

### ゴール

わざと 403 を起こし、「どのポリシーのどの文が原因か」を切り分ける手順を体得する。

### 前提

実 AWS。自アカウント内で引き受けられる IAM ロールを 1 つ作る。

> **実 AWS アカウントが必要 (ローカルでは未検証)**。2026-10-03 に全手順と後片付けを AWS CLI 2.37.7 からローカルのモック (moto 5.2.3 サーバー)に送り、CLI が引数を受け付けることと、`eval $(aws sts assume-role ... | awk ...)` の行が 3 つの変数を export することを確認した。モックはポリシーを評価しないので、403 とそのメッセージは未検証。期待される出力のうち CLI 側の書式 (`download failed: ...` / `aws: [ERROR]: ...`) は AWS CLI 2.37.7 で確認した。

### 手順

```bash
B=${LAB}-l8
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION
echo secret > s.txt && aws s3 cp s.txt s3://$B/team-a/s.txt

# 1. GetObject だけ許可したロールを作る (ListBucket なし)
aws iam create-role --role-name ${LAB}-l8-reader --assume-role-policy-document "{
  \"Version\": \"2012-10-17\", \"Statement\": [{\"Effect\": \"Allow\",
  \"Principal\": {\"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\"}, \"Action\": \"sts:AssumeRole\"}]}" > /dev/null
aws iam put-role-policy --role-name ${LAB}-l8-reader --policy-name read --policy-document "{
  \"Version\": \"2012-10-17\", \"Statement\": [{\"Effect\": \"Allow\",
  \"Action\": \"s3:GetObject\", \"Resource\": \"arn:aws:s3:::$B/team-a/*\"}]}"
sleep 10

# 2. ロールを引き受けて試す
eval $(aws sts assume-role --role-arn arn:aws:iam::${ACCOUNT_ID}:role/${LAB}-l8-reader \
  --role-session-name lab8 --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text \
  | awk '{print "export AWS_ACCESS_KEY_ID="$1" AWS_SECRET_ACCESS_KEY="$2" AWS_SESSION_TOKEN="$3}')
aws sts get-caller-identity --query Arn
aws s3 cp s3://$B/team-a/s.txt -          # (a) 成功
aws s3 cp s3://$B/team-a/missing.txt -    # (b) 存在しないのに 404 ではなく 403
aws s3 cp s3://$B/team-b/x.txt -          # (c) 許可外プレフィックスで 403
aws s3 ls s3://$B/                        # (d) ListBucket がないので 403
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

# 3. バケットポリシーで明示 Deny (HTTP 拒否 + team-a 以外の読み取り拒否)
cat > deny.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {"Sid": "DenyInsecureTransport", "Effect": "Deny", "Principal": "*", "Action": "s3:*", "Resource": ["arn:aws:s3:::${B}", "arn:aws:s3:::${B}/*"], "Condition": {"Bool": {"aws:SecureTransport": "false"}}}
  ]
}
EOF
aws s3api put-bucket-policy --bucket $B --policy file://deny.json
curl -s --aws-sigv4 "aws:amz:${AWS_REGION}:s3" \
  --user "$(aws configure get aws_access_key_id):$(aws configure get aws_secret_access_key)" \
  "http://$B.s3.$AWS_REGION.amazonaws.com/team-a/s.txt" | head -5   # (e) HTTP は明示 Deny
```

`aws configure get` で取れない (SSO などの) 場合は `eval $(aws configure export-credentials --format env)` してから `$AWS_ACCESS_KEY_ID` などを使い、`-H "x-amz-security-token: $AWS_SESSION_TOKEN"` を足す。

### 期待される出力

```text
"arn:aws:sts::111122223333:assumed-role/s3lab-...-l8-reader/lab8"
secret
download failed: s3://s3lab-...-l8/team-a/missing.txt to - An error occurred (403) when calling the HeadObject operation: Forbidden
download failed: s3://s3lab-...-l8/team-b/x.txt to - An error occurred (403) when calling the HeadObject operation: Forbidden
aws: [ERROR]: An error occurred (AccessDenied) when calling the ListObjectsV2 operation: User: arn:aws:sts::111122223333:assumed-role/s3lab-...-l8-reader/lab8 is not authorized to perform: s3:ListBucket on resource: "arn:aws:s3:::s3lab-...-l8" because no identity-based policy allows the s3:ListBucket action
<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>AccessDenied</Code><Message>User: ... is not authorized to perform: s3:GetObject on resource: "..." with an explicit deny in a resource-based policy</Message>...
```

### 403 の切り分け手順

1. **誰として** 叩いているか: `aws sts get-caller-identity`。プロファイルや環境変数の取り違えが一番多い
2. **何の API が何のアクションに対応するか**: `HeadObject` → `s3:GetObject`、`ListObjectsV2` → `s3:ListBucket` (バケット ARN に対して、`/*` ではない)
3. **エラーメッセージを読む**: 同一アカウント内なら「no identity-based policy allows」「explicit deny in a resource-based policy」「explicit deny in a service control policy」のように、どの種類のポリシーが原因かが書かれている
4. **404 が 403 に化ける**: `s3:ListBucket` がないと存在しないキーでも 403 になる (存在確認による情報漏えいを防ぐため)
5. **見落としがちな Deny 源**: SCP / RCP、VPC エンドポイントポリシー、アクセスポイントポリシー、KMS キーポリシー (SSE-KMS オブジェクトは `kms:Decrypt` も要る)、Block Public Access、Object Ownership
6. **シミュレーション**: `aws iam simulate-principal-policy --policy-source-arn <role-arn> --action-names s3:GetObject --resource-arns arn:aws:s3:::bucket/key` で ID ベースポリシーだけ評価できる
7. **記録で確認**: CloudTrail (データイベント有効時) とサーバーアクセスログに `errorCode=AccessDenied` と `x-amz-request-id` が残る

### 学んだこと

- 評価は「明示 Deny > 明示 Allow > 暗黙 Deny」。同一アカウントなら ID ベースかリソースベースのどちらか一方の Allow で足り、クロスアカウントは両方要る
- `aws:SecureTransport` の Deny はすべてのバケットに入れておくべき定番ガードレール

### 後片付け

```bash
aws s3api delete-bucket-policy --bucket $B
aws s3 rb s3://$B --force
aws iam delete-role-policy --role-name ${LAB}-l8-reader --policy-name read
aws iam delete-role --role-name ${LAB}-l8-reader
rm -f s.txt deny.json
```

## Lab 9: s3api で手動マルチパートアップロード

### ゴール

`aws s3 cp` が裏でやっているマルチパートアップロードを、5 つの API で 1 ステップずつ実行する。

### 前提

実 AWS または MinIO 互換サーバー。

> **ローカルで検証済み**: 2026-10-03 に `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`、AWS CLI 2.37.7 で全手順と後片付けが通った (合成 CRC32 の `...-3` と `COMPOSITE` も期待どおり返った)。

### 手順

```bash
B=${LAB}-l9
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION

# 12 MiB のファイルを 5 MiB ずつに分割 (最後のパートだけ 2 MiB)
dd if=/dev/urandom of=big.bin bs=1048576 count=12 2>/dev/null
split -b 5m big.bin part-
ls -l part-*

# 1. 開始 (チェックサムアルゴリズムを明示しておくと後工程が素直になる)
UPLOAD_ID=$(aws s3api create-multipart-upload --bucket $B --key big.bin \
  --checksum-algorithm CRC32 --query UploadId --output text)

# 2. パートを並べてアップロード (順不同・並列でもよい)
n=1
for p in part-*; do
  aws s3api upload-part --bucket $B --key big.bin --upload-id "$UPLOAD_ID" \
    --part-number $n --body $p --checksum-algorithm CRC32 --query ETag --output text
  n=$((n+1))
done

# 3. 途中経過を確認
aws s3api list-multipart-uploads --bucket $B --query 'Uploads[].{Key: Key, Id: UploadId}'
aws s3api list-parts --bucket $B --key big.bin --upload-id "$UPLOAD_ID" \
  --query 'Parts[].{N: PartNumber, Size: Size, ETag: ETag}'

# 4. パート一覧を組み立てて完了
aws s3api list-parts --bucket $B --key big.bin --upload-id "$UPLOAD_ID" \
  --query '{Parts: Parts[].{PartNumber: PartNumber, ETag: ETag, ChecksumCRC32: ChecksumCRC32}}' > parts.json
aws s3api complete-multipart-upload --bucket $B --key big.bin --upload-id "$UPLOAD_ID" \
  --multipart-upload file://parts.json

# 5. 結果の検証
aws s3api head-object --bucket $B --key big.bin --checksum-mode ENABLED \
  --query '{Size: ContentLength, ETag: ETag, CRC32: ChecksumCRC32, Type: ChecksumType}'
aws s3api get-object-attributes --bucket $B --key big.bin --object-attributes ObjectParts \
  --query 'ObjectParts.TotalPartsCount'
aws s3 cp s3://$B/big.bin downloaded.bin && cmp big.bin downloaded.bin && echo "identical"

# おまけ: 放置されたアップロードを作って中止する
ID2=$(aws s3api create-multipart-upload --bucket $B --key orphan.bin --query UploadId --output text)
aws s3api abort-multipart-upload --bucket $B --key orphan.bin --upload-id "$ID2"
```

### 期待される出力

```text
-rw-r--r--  1 you  staff  5242880 Oct  3 01:40 part-aa
-rw-r--r--  1 you  staff  5242880 Oct  3 01:40 part-ab
-rw-r--r--  1 you  staff  2097152 Oct  3 01:40 part-ac
"9b2c..."
"41e7..."
"c0d3..."
...
{
    "Size": 12582912,
    "ETag": "\"5f8e...-3\"",
    "CRC32": "Xy1a2Q==-3",
    "Type": "COMPOSITE"
}
3
download: s3://s3lab-111122223333-a1b2c3-l9/big.bin to ./downloaded.bin
identical
```

`--output text` では ETag が前後のダブルクォートごとそのまま出る (`"9b2c..."`)。

### 学んだこと

- パートは 5 MiB〜5 GiB (最終パートは小さくてよい)、最大 10,000 パート、オブジェクトは最大 50 TB (48.8 TiB)
- マルチパートの ETag は「各パート MD5 を連結したものの MD5 + `-パート数`」で、ファイル全体の MD5 ではない。完全性確認にはフレキシブルチェックサムを使う
- 完了も中止もされないアップロードのパートは **見えないまま課金される**。`ListMultipartUploads` で確認し、ライフサイクルの `AbortIncompleteMultipartUpload` で自動掃除する (Lab 3)

### 後片付け

```bash
aws s3 rb s3://$B --force
rm -f big.bin downloaded.bin part-* parts.json
```

## Lab 10: Athena で S3 上のデータと S3 Tables をクエリ

### ゴール

(A) 普通のバケットの CSV を Athena の外部テーブルとして SQL で読む。(B) S3 Tables のテーブルバケットに Iceberg テーブルを作り、Athena から INSERT / SELECT する。

### 前提

実 AWS。Athena はスキャン量課金 (このラボは KB 単位)。S3 Tables はストレージ・リクエスト・メンテナンス (コンパクション) に課金がある。

> **実 AWS アカウントが必要 (ローカルでは未検証)**。2026-10-03 にコマンドを AWS CLI 2.37.7 からローカルのモック (moto 5.2.3 サーバー)に送り、CLI が引数を受け付けることを確認した。`athena` ヘルパーと `s3tables` の作成・一覧・削除 (`--metadata` のスキーマを含む) は最後まで通り、`glue create-catalog` は CLI の検証を通過した (モックは未実装)。SQL の結果 (DDL、`MSCK REPAIR`、`INSERT`、`$snapshots`) は未検証。

### 手順 (A): 汎用バケット + 外部テーブル

```bash
B=${LAB}-l10
RES=${LAB}-l10-results
for b in $B $RES; do aws s3api create-bucket --bucket $b --create-bucket-configuration LocationConstraint=$AWS_REGION; done

cat > sales.csv <<'EOF'
order_id,region,amount,order_date
1,tokyo,1200,2026-09-01
2,osaka,800,2026-09-01
3,tokyo,450,2026-09-02
4,fukuoka,3000,2026-09-03
EOF
aws s3 cp sales.csv s3://$B/sales/dt=2026-09/sales.csv

athena() {  # SQL を投げて結果を表示する小さなヘルパー
  local qid
  qid=$(aws athena start-query-execution --work-group primary \
    --result-configuration OutputLocation=s3://$RES/ \
    ${CTX:+--query-execution-context} ${CTX:+"$CTX"} \
    --query-string "$1" --query QueryExecutionId --output text)
  while :; do
    st=$(aws athena get-query-execution --query-execution-id $qid --query QueryExecution.Status.State --output text)
    case $st in SUCCEEDED|FAILED|CANCELLED) break;; esac; sleep 1
  done
  echo "[$st]"
  aws athena get-query-results --query-execution-id $qid \
    --query 'ResultSet.Rows[].Data[*].VarCharValue' --output text 2>/dev/null
}

athena "CREATE DATABASE IF NOT EXISTS s3lab"
athena "CREATE EXTERNAL TABLE s3lab.sales (order_id int, region string, amount int, order_date date)
  PARTITIONED BY (dt string)
  ROW FORMAT DELIMITED FIELDS TERMINATED BY ','
  LOCATION 's3://$B/sales/'
  TBLPROPERTIES ('skip.header.line.count'='1')"
athena "MSCK REPAIR TABLE s3lab.sales"
athena "SELECT region, sum(amount) AS total FROM s3lab.sales WHERE dt='2026-09' GROUP BY region ORDER BY total DESC"
```

`athena` ヘルパーで `--query-execution-context` と値を別々の展開に分けているのは zsh (macOS の既定シェル) でも動かすため。zsh はクォートなしの展開を単語分割しないので、`${CTX:+--query-execution-context "$CTX"}` だと 1 つの引数として CLI に渡ってしまう。

### 手順 (B): S3 Tables

```bash
TB=${LAB}-l10-tables
TB_ARN=$(aws s3tables create-table-bucket --name $TB --query arn --output text)
aws s3tables create-namespace --table-bucket-arn $TB_ARN --namespace analytics
aws s3tables create-table --table-bucket-arn $TB_ARN --namespace analytics --name daily_sales \
  --format ICEBERG --metadata '{"iceberg": {"schema": {"fields": [
    {"name": "region", "type": "string", "required": true},
    {"name": "total", "type": "long"},
    {"name": "dt", "type": "date"}]}}}'
aws s3tables list-tables --table-bucket-arn $TB_ARN --query 'tables[].{name: name, ns: namespace}'

# AWS 分析サービスとの統合 (Region ごとに 1 回)。コンソールの「Enable integration」と同じことを CLI でやる
aws glue create-catalog --name s3tablescatalog --catalog-input "{
  \"FederatedCatalog\": {\"Identifier\": \"arn:aws:s3tables:${AWS_REGION}:${ACCOUNT_ID}:bucket/*\", \"ConnectionName\": \"aws:s3tables\"},
  \"CreateDatabaseDefaultPermissions\": [{\"Principal\": {\"DataLakePrincipalIdentifier\": \"IAM_ALLOWED_PRINCIPALS\"}, \"Permissions\": [\"ALL\"]}],
  \"CreateTableDefaultPermissions\": [{\"Principal\": {\"DataLakePrincipalIdentifier\": \"IAM_ALLOWED_PRINCIPALS\"}, \"Permissions\": [\"ALL\"]}]}"

# (A) の外部テーブルから集計して S3 Tables に書き込み、読み出す
CTX="Catalog=s3tablescatalog/$TB,Database=analytics"
athena "INSERT INTO daily_sales
  SELECT region, sum(amount), order_date FROM awsdatacatalog.s3lab.sales GROUP BY region, order_date"
athena "SELECT * FROM daily_sales ORDER BY dt, region"
athena "SELECT snapshot_id, operation FROM \"daily_sales\$snapshots\""
unset CTX
```

既に `s3tablescatalog` が存在する (コンソールで統合済み) 場合、`create-catalog` は `AlreadyExistsException` になるが問題ない。

### 期待される出力

```text
[SUCCEEDED]
region  total
fukuoka 3000
tokyo   1650
osaka   800
...
[SUCCEEDED]
region  total   dt
tokyo   1200    2026-09-01
osaka   800     2026-09-01
tokyo   450     2026-09-02
fukuoka 3000    2026-09-03
[SUCCEEDED]
snapshot_id     operation
5023...         append
```

### 学んだこと

- 外部テーブルは「S3 のパス + スキーマ」をカタログに登録するだけ。パーティション (`dt=...`) で読む範囲を絞るのがコストと速度の鍵
- S3 Tables は Iceberg テーブルを **S3 側がマネージド** で持ち、コンパクションやスナップショット期限切れを自動実行する。テーブルバケット → 名前空間 → テーブルが Glue では「サブカタログ → データベース → テーブル」に見える
- Iceberg なのでスナップショット履歴 (`$snapshots`) やタイムトラベルが使える

### 後片付け

```bash
aws s3tables delete-table --table-bucket-arn $TB_ARN --namespace analytics --name daily_sales
aws s3tables delete-namespace --table-bucket-arn $TB_ARN --namespace analytics
aws s3tables delete-table-bucket --table-bucket-arn $TB_ARN
athena "DROP TABLE s3lab.sales"
athena "DROP DATABASE s3lab"
aws s3 rb s3://$B --force && aws s3 rb s3://$RES --force
rm -f sales.csv
# s3tablescatalog は他のテーブルバケットでも共用するので、このラボ専用でなければ残してよい
```

## Lab 11: S3 Vectors でベクトルを保存・検索

### ゴール

ベクトルバケットとインデックスを作り、メタデータ付きのベクトルを書き込んで近傍検索 (フィルタ付き) する。

### 前提

実 AWS (S3 Vectors 提供 Region)。本番では Amazon Bedrock の埋め込みモデル等でベクトルを作るが、ここでは仕組みに集中するため 4 次元の手書きベクトルを使う。

> **実 AWS アカウントが必要 (ローカルでは未検証)**。2026-10-03 にコマンドを AWS CLI 2.37.7 からローカルのモック (moto 5.2.3 サーバー)に送った。`create-vector-bucket` / `create-index` / `put-vectors` / `get-vectors` / `delete-*` は最後まで通り、`query-vectors` (`--filter` と `--query-mode ENHANCED` を含む) は CLI の検証を通過した (モックは未実装)。期待される出力の距離はローカルで計算した値。

### 手順

```bash
VB=${LAB}-l11-vec
aws s3vectors create-vector-bucket --vector-bucket-name $VB
aws s3vectors create-index --vector-bucket-name $VB --index-name docs \
  --data-type float32 --dimension 4 --distance-metric cosine \
  --metadata-configuration '{"nonFilterableMetadataKeys": ["text"]}'
aws s3vectors get-index --vector-bucket-name $VB --index-name docs

cat > vectors.json <<'EOF'
[{"key": "doc-1", "data": {"float32": [0.9, 0.1, 0.0, 0.0]}, "metadata": {"genre": "storage", "path": "/s3/versioning", "text": "S3 versioning keeps every version"}}, {"key": "doc-2", "data": {"float32": [0.8, 0.2, 0.1, 0.0]}, "metadata": {"genre": "storage", "path": "/s3/lifecycle", "text": "Lifecycle moves objects to cheaper classes"}}, {"key": "doc-3", "data": {"float32": [0.0, 0.1, 0.9, 0.2]}, "metadata": {"genre": "compute", "path": "/lambda/basics", "text": "Lambda runs code without servers"}}, {"key": "doc-4", "data": {"float32": [0.1, 0.0, 0.8, 0.4]}, "metadata": {"genre": "compute", "path": "/ec2/basics", "text": "EC2 provides virtual machines"}}]
EOF
aws s3vectors put-vectors --vector-bucket-name $VB --index-name docs --vectors file://vectors.json

# 1. フィルタなしの近傍検索 (「ストレージっぽい」クエリ)
aws s3vectors query-vectors --vector-bucket-name $VB --index-name docs \
  --query-vector '{"float32": [0.85, 0.15, 0.05, 0.0]}' --top-k 3 \
  --return-distance --return-metadata --query 'vectors[].{key: key, d: distance, genre: metadata.genre}'

# 2. メタデータフィルタ付き
aws s3vectors query-vectors --vector-bucket-name $VB --index-name docs \
  --query-vector '{"float32": [0.85, 0.15, 0.05, 0.0]}' --top-k 3 \
  --filter '{"genre": {"$eq": "compute"}}' --return-distance \
  --query 'vectors[].{key: key, d: distance}'

# 3. プレフィックス一致 ($startsWith、2026-09 追加) とクエリごとのモード指定
aws s3vectors query-vectors --vector-bucket-name $VB --index-name docs \
  --query-vector '{"float32": [0.85, 0.15, 0.05, 0.0]}' --top-k 3 \
  --filter '{"path": {"$startsWith": "/s3/"}}' --query-mode ENHANCED \
  --query 'vectors[].key'

aws s3vectors get-vectors --vector-bucket-name $VB --index-name docs --keys doc-1 --return-metadata
```

### 期待される出力

```text
[
    {"key": "doc-1", "d": 0.0037, "genre": "storage"},
    {"key": "doc-2", "d": 0.0044, "genre": "storage"},
    {"key": "doc-4", "d": 0.8394, "genre": "compute"}
]
[
    {"key": "doc-4", "d": 0.8394},
    {"key": "doc-3", "d": 0.9252}
]
[
    "doc-1",
    "doc-2"
]
```

距離は cosine 距離 (1 - コサイン類似度) なので小さいほど近い。上の値は手元で計算した厳密値で、S3 Vectors は近似最近傍 (ANN) 検索なので実際の返却値は小数点以下がわずかにずれることがある。

### 学んだこと

- 構造は「ベクトルバケット → インデックス (次元数・距離関数を固定) → ベクトル (key + float32 配列 + メタデータ)」
- メタデータは既定でフィルタ可能。`nonFilterableMetadataKeys` に入れたキー (本文テキストなど) は返却専用で、フィルタには使えない代わりに大きな値を持てる
- 2026-09 から `ENHANCED` モード (フィルタを検索前に適用) が入り、絞り込みが強いクエリでも件数が欠けにくくなった。既存インデックスは `UpdateIndexMode` で切り替える
- 低コストで大量ベクトルを持つのが得意。高 QPS・低レイテンシが要るなら OpenSearch などと併用する

### 後片付け

```bash
aws s3vectors delete-index --vector-bucket-name $VB --index-name docs
aws s3vectors delete-vector-bucket --vector-bucket-name $VB
rm -f vectors.json
```

## Lab 12: s5cmd と warp で性能を測る

### ゴール

多数の小さいファイルの並列転送と、オブジェクトサイズ別のスループットを計測し、「並列度がすべて」という S3 性能の基本を体感する。

### 前提

実 AWS (できれば同じ Region の EC2 から。手元回線だとネットワークが律速になる) または MinIO 互換サーバー。**warp は対象バケットの中身をベンチ前後に全削除する** ので、必ず専用の空バケットを使う。

> **ローカルで検証済み**: 2026-10-03 に `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`、AWS CLI 2.37.7、s5cmd v2.3.0 (`peakcom/s5cmd`)、warp 1.3.1 (`minio/warp`) で、AWS CLI / s5cmd の手順、ローカル向けの warp コマンド、後片付けが通った。実 AWS 向けの warp コマンドは実 AWS アカウントが必要 (ローカルでは未検証)。

### 手順: 小さいファイル 2,000 個のアップロード比較

```bash
B=${LAB}-l12
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION
mkdir -p small && for i in $(seq 1 2000); do head -c 16384 /dev/urandom > small/f$i.bin; done

# AWS CLI (既定の並列数 10)
time aws s3 cp small s3://$B/cli/ --recursive --quiet

# AWS CLI の並列数を上げる (使用中のプロファイルに効く。ローカルでは --profile minio を付ける)
aws configure set s3.max_concurrent_requests 64
time aws s3 cp small s3://$B/cli64/ --recursive --quiet
aws configure set s3.max_concurrent_requests 10

# s5cmd (既定 256 ワーカー)
time s5cmd cp 'small/*' s3://$B/s5cmd/
time s5cmd --numworkers 32 cp 'small/*' s3://$B/s5cmd32/

# 大きいファイル 1 個: パート並列度 (concurrency) を変える
head -c $((512*1024*1024)) /dev/urandom > large.bin
time s5cmd cp --concurrency 5  large.bin s3://$B/large-c5.bin
time s5cmd cp --concurrency 32 large.bin s3://$B/large-c32.bin
```

ローカルの MinIO 互換サーバーなら `s5cmd --endpoint-url http://localhost:9000` を付け、`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を `minioadmin` 系にする。

`default.s3.max_concurrent_requests` は常に `[default]` プロファイルに書かれるので、`--profile minio` で回すときは効かない。`s3.max_concurrent_requests` なら使用中のプロファイルに書かれる。

s5cmd / warp をインストールしたくなければコンテナで動かせる。`--network container:s3lab-minio` を付けると、コンテナ内の `localhost:9000` が silo に届く。

```bash
s5cmd() {
  docker run --rm --network container:s3lab-minio -v "$PWD:/w" -w /w \
    -e AWS_ACCESS_KEY_ID=minioadmin -e AWS_SECRET_ACCESS_KEY=minioadmin-change-me \
    docker.io/peakcom/s5cmd:latest --endpoint-url http://localhost:9000 "$@"
}
warp() { docker run --rm --network container:s3lab-minio docker.io/minio/warp:latest "$@"; }
```

### 手順: warp で負荷を掛ける

```bash
WB=${LAB}-l12-warp
aws s3api create-bucket --bucket $WB --create-bucket-configuration LocationConstraint=$AWS_REGION

eval $(aws configure export-credentials --format env)
# 一時認証情報 (SSO / AssumeRole) の場合、warp はセッショントークンを WARP_SESSION_TOKEN (または --session-token) から読む
export WARP_SESSION_TOKEN=${AWS_SESSION_TOKEN:-}
warp put   --host s3.$AWS_REGION.amazonaws.com --tls --region $AWS_REGION --bucket $WB \
  --access-key $AWS_ACCESS_KEY_ID --secret-key $AWS_SECRET_ACCESS_KEY \
  --obj.size 1MiB --concurrent 32 --duration 1m
warp mixed --host s3.$AWS_REGION.amazonaws.com --tls --region $AWS_REGION --bucket $WB \
  --access-key $AWS_ACCESS_KEY_ID --secret-key $AWS_SECRET_ACCESS_KEY \
  --obj.size 64KiB --concurrent 64 --duration 2m --autoterm

# ローカル (MinIO 互換) の場合 (--bucket を省くと warp は warp-benchmark-bucket を作って残す)
warp mixed --host localhost:9000 --access-key minioadmin --secret-key minioadmin-change-me \
  --bucket $WB --obj.size 1MiB --concurrent 16 --duration 1m
```

### 期待される出力

数値は環境次第なので形だけ示す。

```text
aws s3 cp (10 並列)   real    1m10s
aws s3 cp (64 並列)   real    0m15s
s5cmd (256 workers)   real    0m06s
s5cmd (32 workers)    real    0m11s

Report: PUT. Concurrency: 32. Ran: 58s
 * Average: 170.60 MiB/s, 170.60 obj/s
 * Reqs: Avg: 186.3ms, 50%: 170.2ms, 90%: 260.4ms, 99%: 410.0ms, Fastest: ..., Slowest: ..., StdDev: ...
...
Report: GET. Concurrency: 64. Ran: 1m58s
 * Average: 95.20 MiB/s, 1523.21 obj/s
 * Reqs: Avg: 41.2ms, 50%: 35.9ms, 90%: 67.0ms, 99%: 140.1ms, Fastest: ..., Slowest: ..., StdDev: ...
 * TTFB: Avg: 30ms, ...
```

ローカルサーバーでは手元の CPU が律速になるので、並列度による差は小さい (2026-10-03 の実行では 2,000 ファイルが AWS CLI で約 5 秒、s5cmd で約 3 秒、warp mixed は合計 225 MiB/s)。

### 学んだこと

- 1 接続あたりの帯域やレイテンシは大きく変わらない。**スループットは並列接続数でスケールする** (小さいファイルはファイル並列、大きいファイルはパート / Range 並列)
- S3 はプレフィックスあたり毎秒 3,500 PUT / 5,500 GET 程度から自動でスケールする。急増させると一時的に `503 SlowDown` が出るので、指数バックオフ付きリトライ前提で設計する
- 小さいオブジェクトはリクエスト数課金が支配的になる。2,000 個 × 数回のアップロードでも PUT 料金が発生する点に注意
- 本番の大量転送は AWS CRT ベースの転送 (`aws configure set default.s3.preferred_transfer_client crt`) や Mountpoint for Amazon S3 も比較対象になる

### 後片付け

```bash
aws s3 rb s3://$B --force
aws s3 rb s3://$WB --force
rm -rf small large.bin
```

## 全ラボ共通の後片付けチェック

最後に、ラボ用の名前が付いたリソースが残っていないかまとめて確認する。

```bash
aws s3api list-buckets --query "Buckets[?starts_with(Name, '${LAB}')].Name"
aws s3api list-buckets --region ap-northeast-3 --query "Buckets[?starts_with(Name, '${LAB}')].Name"
aws iam list-roles --query "Roles[?starts_with(RoleName, '${LAB}')].RoleName"
aws lambda list-functions --query "Functions[?starts_with(FunctionName, '${LAB}')].FunctionName"
aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='s3 lab 4'].Id"
aws s3tables list-table-buckets --query "tableBuckets[?starts_with(name, '${LAB}')].name"
aws s3vectors list-vector-buckets --query "vectorBuckets[?starts_with(vectorBucketName, '${LAB}')].vectorBucketName"
docker rm -f s3lab-minio s3lab-localstack 2>/dev/null
rm -rf minio-data   # ローカル silo のデータディレクトリ (Linux では sudo が要る場合がある)
```

すべて空 (`[]`) なら完了。

## 参考文献

- Amazon S3 User Guide: Getting started: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/GetStartedWithS3.html>
- Sharing objects with presigned URLs: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html>
- Retaining multiple versions of objects with S3 Versioning: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html>
- Managing the lifecycle of objects: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html>
- Managing storage costs with Amazon S3 Intelligent-Tiering: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/intelligent-tiering.html>
- Restricting access to an Amazon S3 origin (CloudFront OAC): <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html>
- CloudFront managed cache policies: <https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html>
- Tutorial: Using an Amazon S3 trigger to create thumbnail images: <https://docs.aws.amazon.com/lambda/latest/dg/with-s3-tutorial.html>
- Amazon S3 Event Notifications: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html>
- Replicating objects within and across Regions: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html>
- Locking objects with Object Lock: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html>
- Troubleshoot access denied (403 Forbidden) errors in Amazon S3: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshoot-403-errors.html>
- Uploading and copying objects using multipart upload: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html>
- Amazon S3 multipart upload limits: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html>
- Checking object integrity in Amazon S3: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html>
- Register S3 table bucket catalogs and query Tables from Athena: <https://docs.aws.amazon.com/athena/latest/ug/gdc-register-s3-table-bucket-cat.html>
- Enabling S3 Tables integration with the Data Catalog: <https://docs.aws.amazon.com/glue/latest/dg/enable-s3-tables-catalog-integration.html>
- Amazon S3 Tables integration with AWS analytics services overview: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-tables-integration-overview.html>
- Transform your data to Amazon S3 Tables with Amazon Athena (AWS Big Data Blog): <https://aws.amazon.com/blogs/big-data/transform-your-data-to-amazon-s3-tables-with-amazon-athena/>
- Working with S3 Vectors and vector buckets: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors.html>
- Amazon S3 Vectors introduces metadata pre-filtering (2026-09): <https://aws.amazon.com/about-aws/whats-new/2026/09/s3-vectors-introduces-metadata-pre-filtering/>
- Best practices design patterns: optimizing Amazon S3 performance: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html>
- Uploading objects (オブジェクトサイズ上限 50 TB): <https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html>
- peak/s5cmd: <https://github.com/peak/s5cmd>
- minio/warp: <https://github.com/minio/warp>
- pgsty/silo (MinIO サーバーのコミュニティフォーク): <https://github.com/pgsty/silo>
- MinIO の Docker イメージ配布終了の経緯 (michelangelo-ai/michelangelo issue #672): <https://github.com/michelangelo-ai/michelangelo/issues/672>
- LocalStack image requires authentication from March 23, 2026 (testcontainers-rs-modules-community issue #465): <https://github.com/testcontainers/testcontainers-rs-modules-community/issues/465>
- AWS CLI: Configuration and credential file settings (endpoint_url / s3 設定): <https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html>
