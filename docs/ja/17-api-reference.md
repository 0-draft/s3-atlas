# S3 API 全体像

_最終確認: 2026-10-03_

この章は S3 の **ワイヤープロトコルとしての API** を扱う。CLI や SDK が裏で何を投げているのか (エンドポイント、SigV4 署名、ヘッダ、エラー形式) を理解したうえで、Amazon S3 API Reference の "Actions" ページに載っている **全オペレーション** をカテゴリ別に一行説明付きで並べる。オペレーション一覧は API Reference の Actions ページと、AWS CLI v2.37.7 同梱の botocore サービスモデル (`s3/2006-03-01`、`s3control/2018-08-20`、`s3tables/2018-05-10`、`s3vectors/2025-07-15`、`s3outposts/2017-07-25`、`s3files/2025-05-05`) を突き合わせて、名前・件数が完全一致することを確認している。機械可読版は `data/api.json` にある。

## 1. S3 の API ファミリー

S3 という名前の下には、プロトコルもエンドポイントも別々の API が 6 系統ある。

| サービス (CLI 名) | 対象 | プロトコル | 署名サービス名 | エンドポイント例 | 操作数 |
| --- | --- | --- | --- | --- | --- |
| Amazon S3 (`s3api`) | オブジェクト、汎用 / ディレクトリバケットの設定 | REST + XML | `s3` (ディレクトリバケットの Zonal API は `s3express` セッション) | `https://{bucket}.s3.{region}.amazonaws.com` | 116 |
| Amazon S3 Control (`s3control`) | アカウント単位の設定、アクセスポイント、Batch Operations、Access Grants、Storage Lens、MRAP、Outposts バケット | REST + XML | `s3` | `https://{account-id}.s3-control.{region}.amazonaws.com` | 97 |
| Amazon S3 Tables (`s3tables`) | テーブルバケット、名前空間、Iceberg テーブル | REST + JSON | `s3tables` | `https://s3tables.{region}.amazonaws.com` | 49 |
| Amazon S3 Vectors (`s3vectors`) | ベクトルバケット、インデックス、ベクトル | REST + JSON | `s3vectors` | `https://s3vectors.{region}.api.aws` | 21 |
| Amazon S3 on Outposts (`s3outposts`) | Outposts 上のエンドポイント | REST + JSON | `s3-outposts` | `https://s3-outposts.{region}.amazonaws.com` | 5 |
| Amazon S3 Files (`s3files`) | S3 バケットをマウント可能なファイルシステムにする | REST + JSON | `s3files` | `https://s3files.{region}.api.aws` | 21 |

```text
                       +-----------------------------+
   aws s3 / s3api ---> |  S3 data plane (rest-xml)   |  GetObject, PutObject, ListObjectsV2 ...
                       |  + bucket subresources      |  ?versioning ?lifecycle ?policy ...
                       +-----------------------------+
   aws s3control ----> |  S3 Control (rest-xml)      |  account-id.s3-control.<region>
                       +-----------------------------+
   aws s3tables -----> |  S3 Tables (rest-json)      |  table bucket / namespace / table
                       +-----------------------------+
   aws s3vectors ----> |  S3 Vectors (rest-json)     |  vector bucket / index / vectors
                       +-----------------------------+
```

`aws s3` (高レベルコマンド: `cp` / `sync` / `ls` / `presign`) は独立した API ではなく、`s3api` 相当の操作を組み合わせて実行するクライアント側のラッパーに過ぎない。たとえば `aws s3 cp` は大きいファイルを自動で `CreateMultipartUpload` → `UploadPart` × N → `CompleteMultipartUpload` に分割する。

## 2. エンドポイントとアドレッシング

### 2.1 汎用バケット

| 形式 | URL | 備考 |
| --- | --- | --- |
| Virtual-hosted-style | `https://amzn-s3-demo-bucket.s3.ap-northeast-1.amazonaws.com/photos/cat.jpg` | 推奨。バケット名がホスト名に入る |
| Path-style | `https://s3.ap-northeast-1.amazonaws.com/amzn-s3-demo-bucket/photos/cat.jpg` | 互換用。AWS は廃止方針を示しており新規実装では使わない。ドットを含むバケット名を TLS で扱う時などに残る |
| Dual-stack (IPv6) | `https://amzn-s3-demo-bucket.s3.dualstack.ap-northeast-1.amazonaws.com` | IPv4 / IPv6 両対応 |
| FIPS | `https://amzn-s3-demo-bucket.s3-fips.us-east-1.amazonaws.com` | FIPS 140 検証済みエンドポイント (対応 Region のみ) |
| Transfer Acceleration | `https://amzn-s3-demo-bucket.s3-accelerate.amazonaws.com` | CloudFront エッジ経由。`PutBucketAccelerateConfiguration` で有効化が必要 |
| アクセスポイント | `https://{ap-name}-{account-id}.s3-accesspoint.{region}.amazonaws.com` | SDK には ARN かエイリアスを渡す |
| Multi-Region Access Point | `https://{mrap-alias}.accesspoint.s3-global.amazonaws.com` | SigV4A (ECDSA) 署名が必須 |
| VPC インターフェースエンドポイント | `https://bucket.vpce-xxxx.s3.{region}.vpce.amazonaws.com` | PrivateLink 経由 |

キー (`photos/cat.jpg`) はパスとして送られ、スラッシュはエンコードしないが、それ以外の予約文字は URI エンコードする。`ListBuckets` などバケットを指定しない操作は `https://s3.{region}.amazonaws.com/` に送る。

### 2.2 ディレクトリバケット (S3 Express One Zone)

ディレクトリバケットは 2 種類のエンドポイントを使い分ける。

| エンドポイント | URL 形式 | 使う API |
| --- | --- | --- |
| Regional (コントロールプレーン) | `https://s3express-control.{region}.amazonaws.com/{bucket}` | `CreateBucket` / `DeleteBucket` / `PutBucketPolicy` / `ListDirectoryBuckets` など |
| Zonal (データプレーン) | `https://{bucket}.s3express-{az-id}.{region}.amazonaws.com` | `CreateSession` / `GetObject` / `PutObject` / `RenameObject` など |

バケット名は `name--{az-id}--x-s3` (例: `logs--apne1-az4--x-s3`) の形になる。Zonal API は **`CreateSession` で得た短命 (5 分) のセッション認証情報** で署名し、トークンを `x-amz-s3session-token` ヘッダで送る。SDK / CLI はセッションの作成と更新を自動でやるので、手書きする必要はほぼない。

### 2.3 S3 Control / S3 Tables / S3 Vectors

```text
S3 Control : https://123456789012.s3-control.ap-northeast-1.amazonaws.com/v20180820/accesspoint/my-ap
             (x-amz-account-id: 123456789012 ヘッダも必須)
S3 Tables  : https://s3tables.ap-northeast-1.amazonaws.com/buckets
S3 Vectors : https://s3vectors.ap-northeast-1.api.aws/QueryVectors
```

## 3. SigV4 署名を手で追う

S3 へのリクエストは (匿名公開オブジェクトを除き) すべて AWS Signature Version 4 で署名する。SigV2 はとうに使えない。ここでは S3 Developer Guide の公式テストベクタ (GET `/test.txt`、`Range: bytes=0-9`) を使い、実際に Node.js で計算して公式の署名値 `f0e8bdb8...` と一致することを確認した。

### 3.1 全体の流れ

```text
 1. CanonicalRequest  = METHOD \n URI \n QUERY \n HEADERS \n \n SIGNED_HEADERS \n HASHED_PAYLOAD
 2. StringToSign      = "AWS4-HMAC-SHA256" \n TIMESTAMP \n SCOPE \n Hex(SHA256(CanonicalRequest))
 3. SigningKey        = HMAC(HMAC(HMAC(HMAC("AWS4"+Secret, Date), Region), "s3"), "aws4_request")
 4. Signature         = Hex(HMAC(SigningKey, StringToSign))
 5. Authorization: AWS4-HMAC-SHA256 Credential=AKID/SCOPE, SignedHeaders=..., Signature=...
```

### 3.2 Step 1: Canonical Request

テスト条件は次の通り。

| 項目 | 値 |
| --- | --- |
| Access Key ID | `AKIAIOSFODNN7EXAMPLE` |
| Secret Access Key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| バケット / キー | `examplebucket` / `test.txt` |
| 日時 | `20130524T000000Z` |
| Region / サービス | `us-east-1` / `s3` |

```text
GET
/test.txt

host:examplebucket.s3.amazonaws.com
range:bytes=0-9
x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
x-amz-date:20130524T000000Z

host;range;x-amz-content-sha256;x-amz-date
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

ルールの要点:

- 1 行目は HTTP メソッド、2 行目は URI エンコード済みパス (S3 はキー中の `/` をエンコードしない、かつ **二重エンコードしない**)
- 3 行目はクエリ文字列。キー名でソートし、`key=value` を `&` で連結。値のないサブリソースは `versioning=` のように `=` 付きで書く。今回は空行
- ヘッダ名は小文字化、値は前後の空白を trim、名前でソート。最後に空行を 1 つ
- `SignedHeaders` は署名対象ヘッダ名を `;` 区切りで。`host` と `x-amz-*` は必ず含める
- 最終行は `x-amz-content-sha256` と同じ値 (ここでは空ボディの SHA-256)

### 3.3 Step 2: String to Sign

```text
AWS4-HMAC-SHA256
20130524T000000Z
20130524/us-east-1/s3/aws4_request
7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972
```

4 行目が Canonical Request の SHA-256 (16 進小文字)。3 行目の `日付/Region/サービス/aws4_request` を **credential scope** と呼ぶ。

### 3.4 Step 3〜4: 署名鍵と署名

```javascript
import crypto from 'node:crypto';
const hmac = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
let key = hmac('AWS4' + 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', '20130524');
key = hmac(key, 'us-east-1');
key = hmac(key, 's3');
key = hmac(key, 'aws4_request');
const sig = crypto.createHmac('sha256', key).update(stringToSign).digest('hex');
// => f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41
```

署名鍵は日付・Region・サービス単位で決まるので、同じ日のリクエストではキャッシュして使い回せる。

### 3.5 Step 5: Authorization ヘッダ

```http
GET /test.txt HTTP/1.1
Host: examplebucket.s3.amazonaws.com
Range: bytes=0-9
x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
x-amz-date: 20130524T000000Z
Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41
```

一時認証情報 (STS / IAM ロール) の場合は `x-amz-security-token` ヘッダを追加し、それも署名対象に含める。サーバー側は `x-amz-date` と現在時刻のずれが 15 分を超えると `RequestTimeTooSkewed` を返す。

### 3.6 ペイロードの扱い: `x-amz-content-sha256` の値

S3 は他の AWS サービスと違い、**`x-amz-content-sha256` ヘッダが必須** で、その値がボディの扱い方を宣言する。

| 値 | 意味 | 主な用途 |
| --- | --- | --- |
| ボディの SHA-256 (16 進) | 単一チャンクの署名付きペイロード | 小さい PUT、XML 設定系 API |
| `UNSIGNED-PAYLOAD` | ボディを署名に含めない (TLS が完全性を担保) | 大容量アップロード、Presigned URL (常にこれ) |
| `STREAMING-AWS4-HMAC-SHA256-PAYLOAD` | `aws-chunked` で分割し各チャンクに署名を連鎖 | ハッシュを事前計算できないストリーム |
| `STREAMING-AWS4-HMAC-SHA256-PAYLOAD-TRAILER` | 上記 + 末尾トレーラ (チェックサム) にも署名 | 署名付きストリーム + フレキシブルチェックサム |
| `STREAMING-UNSIGNED-PAYLOAD-TRAILER` | チャンクは無署名、末尾トレーラでチェックサムだけ送る | 現行 SDK の PutObject / UploadPart の既定 (HTTPS 時) |
| `STREAMING-AWS4-ECDSA-P256-SHA256-PAYLOAD` / `...-TRAILER` | SigV4A (MRAP 向け) 版のチャンク署名 | Multi-Region Access Point |

バケットポリシーで `s3:x-amz-content-sha256` 条件キーを使えば「UNSIGNED-PAYLOAD を拒否する」ことも可能 (CDK の `BucketDeployment` が `signContent` オプションを持つのはこのため)。

### 3.7 チャンク署名 (aws-chunked) の構造

`STREAMING-AWS4-HMAC-SHA256-PAYLOAD` のときは、まずヘッダだけで **シード署名** を作り (Authorization ヘッダに載る)、各チャンクの署名は直前の署名を含めて連鎖させる。

```text
PUT /big.bin HTTP/1.1
Host: examplebucket.s3.amazonaws.com
Content-Encoding: aws-chunked
x-amz-content-sha256: STREAMING-AWS4-HMAC-SHA256-PAYLOAD
x-amz-decoded-content-length: 66560
Content-Length: 66824
Authorization: AWS4-HMAC-SHA256 Credential=.../s3/aws4_request, SignedHeaders=content-encoding;content-length;host;x-amz-content-sha256;x-amz-date;x-amz-decoded-content-length, Signature=<seed>

10000;chunk-signature=<sig1>\r\n
<65536 bytes>\r\n
400;chunk-signature=<sig2>\r\n
<1024 bytes>\r\n
0;chunk-signature=<sig3>\r\n
\r\n
```

チャンク署名の String to Sign は次の形。

```text
AWS4-HMAC-SHA256-PAYLOAD
<timestamp>
<scope>
<previous-signature>
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
<Hex(SHA256(chunk-data))>
```

- チャンクサイズは最終チャンク以外 8 KB 以上 (64 KB 以上推奨)
- 最後に長さ 0 のチャンクを送って終端する
- `x-amz-decoded-content-length` は元データの長さ、`Content-Length` はチャンクメタデータ込みの送信長 (`Transfer-Encoding` を使う場合は省略)

### 3.8 トレーラ付きチェックサム

フレキシブルチェックサム (CRC32 / CRC32C / CRC64NVME / SHA-1 / SHA-256 など) をボディを読み終わってから送るための仕組み。SDK の既定動作はこれ。

```text
PUT /photo.jpg HTTP/1.1
Content-Encoding: aws-chunked
x-amz-content-sha256: STREAMING-UNSIGNED-PAYLOAD-TRAILER
x-amz-decoded-content-length: 1048576
x-amz-sdk-checksum-algorithm: CRC64NVME
x-amz-trailer: x-amz-checksum-crc64nvme

100000\r\n
<1048576 bytes>\r\n
0\r\n
x-amz-checksum-crc64nvme:<base64>\r\n
\r\n
```

署名付き版 (`...-PAYLOAD-TRAILER`) では最後に `x-amz-trailer-signature:<sig>` 行が付く。S3 はサーバー側で同じチェックサムを計算し、一致しなければ `BadDigest` 系のエラーで書き込みを拒否する。

### 3.9 Presigned URL (クエリ文字列認証)

署名をヘッダではなくクエリに載せる形式。`X-Amz-Algorithm` / `X-Amz-Credential` / `X-Amz-Date` / `X-Amz-Expires` (最大 604800 秒 = 7 日) / `X-Amz-SignedHeaders` / `X-Amz-Signature` が付く。ペイロードは常に `UNSIGNED-PAYLOAD` 扱い。有効期限は「URL の Expires」と「署名に使った認証情報の残り寿命」の短い方になる (IAM ロールの一時認証情報で作ると数時間で切れる)。

```text
https://examplebucket.s3.amazonaws.com/test.txt
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request
  &X-Amz-Date=20130524T000000Z
  &X-Amz-Expires=86400
  &X-Amz-SignedHeaders=host
  &X-Amz-Signature=<64 hex>
```

## 4. ヘッダ・エラー・リクエスト ID

### 4.1 よく使う `x-amz-*` ヘッダ

| ヘッダ | 方向 | 意味 |
| --- | --- | --- |
| `x-amz-date` | Req | 署名時刻 (ISO 8601 basic、UTC) |
| `x-amz-content-sha256` | Req | ペイロードハッシュ / 署名モード (3.6 参照) |
| `x-amz-security-token` | Req | STS 一時認証情報のセッショントークン |
| `x-amz-s3session-token` | Req | ディレクトリバケットの CreateSession トークン |
| `x-amz-expected-bucket-owner` | Req | バケット所有者のアカウント ID。違えば 403 (バケット名乗っ取り対策) |
| `x-amz-request-payer: requester` | Req | Requester Pays バケットへのアクセスで料金負担に同意 |
| `x-amz-server-side-encryption` | Req / Res | `AES256` / `aws:kms` / `aws:kms:dsse` |
| `x-amz-server-side-encryption-aws-kms-key-id` | Req / Res | SSE-KMS のキー ARN |
| `x-amz-server-side-encryption-customer-algorithm` / `-key` / `-key-MD5` | Req | SSE-C の鍵 (新規バケットでは既定で SSE-C がブロックされる) |
| `x-amz-storage-class` | Req / Res | `STANDARD` / `INTELLIGENT_TIERING` / `GLACIER_IR` など |
| `x-amz-meta-*` | Req / Res | ユーザー定義メタデータ (合計 2 KB まで) |
| `x-amz-tagging` | Req | PUT 時にタグを `k=v&k2=v2` 形式で付与 |
| `x-amz-acl` / `x-amz-grant-*` | Req | Canned ACL / 明示グラント (BucketOwnerEnforced では使えない) |
| `x-amz-copy-source` / `x-amz-copy-source-range` | Req | CopyObject / UploadPartCopy の元 |
| `x-amz-checksum-{crc32,crc32c,crc64nvme,sha1,sha256}` | Req / Res | フレキシブルチェックサム |
| `x-amz-sdk-checksum-algorithm` / `x-amz-trailer` | Req | チェックサムのアルゴリズム / トレーラ宣言 |
| `x-amz-object-lock-mode` / `-retain-until-date` / `-legal-hold` | Req / Res | Object Lock |
| `x-amz-bypass-governance-retention` | Req | GOVERNANCE モードの保持を権限付きで迂回 |
| `x-amz-mfa` | Req | MFA Delete 時のシリアル + コード |
| `x-amz-website-redirect-location` | Req | ウェブサイトエンドポイントでのリダイレクト先 |
| `If-Match` / `If-None-Match` | Req | 条件付き読み書き (`If-None-Match: *` で上書き防止 PUT) |
| `x-amz-version-id` | Res | 書き込まれた / 読んだバージョン ID |
| `x-amz-delete-marker` | Res | 削除マーカーかどうか |
| `x-amz-bucket-region` | Res | バケットの Region (HeadBucket や 301 応答で返る) |
| `x-amz-request-id` / `x-amz-id-2` | Res | リクエスト ID / 拡張リクエスト ID (サポート問い合わせに必須) |

### 4.2 エラー応答の形

`s3` / `s3control` は XML、`s3tables` / `s3vectors` は JSON でエラーを返す。S3 の XML エラーは次の形 (`HEAD` リクエストはボディがないのでステータスコードだけで判断する)。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>NoSuchKey</Code>
  <Message>The specified key does not exist.</Message>
  <Key>photos/cat.jpg</Key>
  <RequestId>4442587FB7D0A2F9</RequestId>
  <HostId>bW9jay1ob3N0LWlkLWZvci1kb2NzLWV4YW1wbGU=</HostId>
</Error>
```

| HTTP | Code 例 | 典型的な原因 |
| --- | --- | --- |
| 301 | `PermanentRedirect` | 別 Region のエンドポイントに投げた。`x-amz-bucket-region` を見る |
| 304 | (ボディなし) | `If-None-Match` / `If-Modified-Since` で変更なし |
| 400 | `InvalidArgument` / `InvalidRequest` / `EntityTooSmall` / `AuthorizationHeaderMalformed` | パラメータ不正、パートが 5 MiB 未満、scope の Region 間違い |
| 403 | `AccessDenied` / `SignatureDoesNotMatch` / `InvalidAccessKeyId` / `RequestTimeTooSkewed` / `ExpiredToken` | 権限不足、署名計算ミス、時刻ずれ、トークン期限切れ |
| 404 | `NoSuchBucket` / `NoSuchKey` / `NoSuchUpload` / `NoSuchVersion` | 存在しない (ただし `s3:ListBucket` 権限がないと 404 ではなく 403 になる) |
| 405 | `MethodNotAllowed` | 削除マーカーに対する GET など |
| 409 | `BucketAlreadyExists` / `BucketNotEmpty` / `OperationAborted` / `ConditionalRequestConflict` | 名前衝突、空でないバケット削除、同時更新 |
| 412 | `PreconditionFailed` | `If-Match` / `If-None-Match` 不一致 |
| 416 | `InvalidRange` | Range がオブジェクトサイズ外 |
| 500 | `InternalError` | リトライ対象 |
| 503 | `SlowDown` / `ServiceUnavailable` | プレフィックスあたりのレート超過。指数バックオフでリトライ |

`SignatureDoesNotMatch` のエラー XML には S3 側が計算した `StringToSign` と `CanonicalRequest` が含まれるので、自前実装のデバッグでは自分の値と 1 行ずつ diff するのが最速。

### 4.3 リクエスト ID の取り方

```bash
# CLI: --debug の末尾に x-amz-request-id / x-amz-id-2 が出る
aws s3api head-object --bucket amzn-s3-demo-bucket --key a.txt --debug 2>&1 | grep -iE 'x-amz-(request-id|id-2)'

# curl: -i でレスポンスヘッダを表示
curl -sI https://amzn-s3-demo-bucket.s3.ap-northeast-1.amazonaws.com/public.txt | grep -i x-amz
```

サーバーアクセスログと CloudTrail データイベントにも同じリクエスト ID が記録されるので、ログ突き合わせのキーとしても使える。

## 5. Amazon S3 (データプレーン + バケット設定) の全オペレーション (116 個)

`s3` (API バージョン `2006-03-01`、プロトコル `rest-xml`) は、オブジェクトの読み書きとバケット設定のほぼすべてを担う。バケット設定系は `?versioning` `?lifecycle` のような **サブリソース (クエリ文字列)** で対象を切り替えるのが特徴で、同じ `PUT /{Bucket}` でもクエリが違えば別の API になる。Path 欄はサービスモデルの `requestUri` をそのまま載せている (実際の送信では virtual-hosted-style にすると `/{Bucket}` 部分がホスト名へ移る)。

非推奨 (deprecated) 扱いの 4 つ (`GetBucketLifecycle` / `PutBucketLifecycle` / `GetBucketNotification` / `PutBucketNotification`) も API Reference には載っているので一覧に含めている。

### 5.1 オブジェクト操作

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CopyObject` | `PUT /{Bucket}/{Key+}` | S3 内でオブジェクトをサーバーサイドコピーする (単発は 5 GB まで) |
| `DeleteObject` | `DELETE /{Bucket}/{Key+}` | オブジェクトを削除する。バージョニング有効時は削除マーカーを作る (versionId 指定で物理削除) |
| `DeleteObjects` | `POST /{Bucket}?delete` | 1 リクエストで最大 1,000 キーを一括削除する |
| `GetObject` | `GET /{Bucket}/{Key+}` | オブジェクト本体とメタデータを取得する。Range / 条件付き GET 対応 |
| `GetObjectAttributes` | `GET /{Bucket}/{Key+}?attributes` | 本体を返さずに ETag・チェックサム・パーツ情報・サイズ・ストレージクラスなどを取得する |
| `GetObjectTorrent` | `GET /{Bucket}/{Key+}?torrent` | オブジェクトの BitTorrent ファイルを返す (レガシー機能) |
| `HeadObject` | `HEAD /{Bucket}/{Key+}` | 本体を返さずにオブジェクトのメタデータだけ取得する |
| `ListObjects` | `GET /{Bucket}` | バケット内オブジェクトを最大 1,000 件列挙する (旧版。新規は V2 を使う) |
| `ListObjectsV2` | `GET /{Bucket}?list-type=2` | バケット内オブジェクトを最大 1,000 件ずつ列挙する (continuation-token でページング) |
| `PutObject` | `PUT /{Bucket}/{Key+}` | オブジェクトをバケットに書き込む (単発 PUT は最大 5 GB。100 MB 超ならマルチパート推奨) |
| `RenameObject` | `PUT /{Bucket}/{Key+}?renameObject` | S3 Express One Zone のディレクトリバケット内でオブジェクトをアトミックにリネームする |
| `RestoreObject` | `POST /{Bucket}/{Key+}?restore` | Glacier 系にアーカイブされたオブジェクトの一時コピーを復元する |
| `SelectObjectContent` | `POST /{Bucket}/{Key+}?select&select-type=2` | CSV / JSON / Parquet オブジェクトに SQL を投げてサーバー側でフィルタする (新規顧客には提供終了) |

### 5.2 マルチパートアップロード

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `AbortMultipartUpload` | `DELETE /{Bucket}/{Key+}` | マルチパートアップロードを中止し、アップロード済みパートを破棄する |
| `CompleteMultipartUpload` | `POST /{Bucket}/{Key+}` | パート一覧を渡してオブジェクトを組み立て、アップロードを完了する |
| `CreateMultipartUpload` | `POST /{Bucket}/{Key+}?uploads` | マルチパートアップロードを開始し UploadId を受け取る |
| `ListMultipartUploads` | `GET /{Bucket}?uploads` | 進行中 (未完了) のマルチパートアップロードを列挙する |
| `ListParts` | `GET /{Bucket}/{Key+}` | 特定 UploadId のアップロード済みパートを列挙する |
| `UploadPart` | `PUT /{Bucket}/{Key+}` | パート (5 MiB〜5 GiB、最終パートのみ小さくて可) を 1 つアップロードする |
| `UploadPartCopy` | `PUT /{Bucket}/{Key+}` | 既存オブジェクトのバイト範囲をパートとしてコピーする |

### 5.3 バケット

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateBucket` | `PUT /{Bucket}` | バケットを作成する (汎用バケット / ディレクトリバケット) |
| `DeleteBucket` | `DELETE /{Bucket}` | 空のバケットを削除する |
| `GetBucketLocation` | `GET /{Bucket}?location` | バケットの Region を返す (新規実装では HeadBucket 推奨) |
| `HeadBucket` | `HEAD /{Bucket}` | バケットの存在とアクセス権を確認する (Region も x-amz-bucket-region で返る) |
| `ListBuckets` | `GET /` | 呼び出し元が所有する汎用バケットを列挙する |

### 5.4 ディレクトリバケット / CreateSession

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateSession` | `GET /{Bucket}?session` | ディレクトリバケットの Zonal エンドポイント用に短命のセッション認証情報を発行する |
| `ListDirectoryBuckets` | `GET /` | 呼び出し元が所有するディレクトリバケットを列挙する |

### 5.5 バージョニング

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `GetBucketVersioning` | `GET /{Bucket}?versioning` | バージョニング状態と MFA Delete 状態を取得する |
| `ListObjectVersions` | `GET /{Bucket}?versions` | すべてのバージョンと削除マーカーを列挙する |
| `PutBucketVersioning` | `PUT /{Bucket}?versioning` | バージョニングを Enabled / Suspended にする (MFA Delete もここ) |

### 5.6 ライフサイクル

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteBucketLifecycle` | `DELETE /{Bucket}?lifecycle` | ライフサイクル設定を削除する |
| `GetBucketLifecycle` | `GET /{Bucket}?lifecycle` | 旧 API のライフサイクル取得 (非推奨。GetBucketLifecycleConfiguration を使う) |
| `GetBucketLifecycleConfiguration` | `GET /{Bucket}?lifecycle` | ライフサイクル設定を取得する |
| `PutBucketLifecycle` | `PUT /{Bucket}?lifecycle` | 旧 API のライフサイクル設定 (非推奨。PutBucketLifecycleConfiguration を使う) |
| `PutBucketLifecycleConfiguration` | `PUT /{Bucket}?lifecycle` | ライフサイクルルール (移行・失効・未完了 MPU 削除など) を設定 / 置換する |

### 5.7 レプリケーション

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteBucketReplication` | `DELETE /{Bucket}?replication` | レプリケーション設定を削除する |
| `GetBucketReplication` | `GET /{Bucket}?replication` | レプリケーション設定を取得する |
| `PutBucketReplication` | `PUT /{Bucket}?replication` | レプリケーション設定 (CRR / SRR、RTC、削除マーカー複製など) を作成 / 置換する |

### 5.8 イベント通知

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `GetBucketNotification` | `GET /{Bucket}?notification` | 旧 API の通知設定取得 (非推奨) |
| `GetBucketNotificationConfiguration` | `GET /{Bucket}?notification` | イベント通知設定を取得する |
| `PutBucketNotification` | `PUT /{Bucket}?notification` | 旧 API の通知設定 (非推奨) |
| `PutBucketNotificationConfiguration` | `PUT /{Bucket}?notification` | イベント通知 (SNS / SQS / Lambda / EventBridge) を設定する |

### 5.9 暗号化

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteBucketEncryption` | `DELETE /{Bucket}?encryption` | デフォルト暗号化を SSE-S3 にリセットする |
| `GetBucketEncryption` | `GET /{Bucket}?encryption` | デフォルト暗号化設定を取得する |
| `PutBucketEncryption` | `PUT /{Bucket}?encryption` | デフォルト暗号化 (SSE-S3 / SSE-KMS / DSSE-KMS) と S3 Bucket Key を設定する。暗号化タイプのブロックも可 |
| `UpdateObjectEncryption` | `PUT /{Bucket}/{Key+}?encryption` | 既存オブジェクトの SSE 種別 (SSE-S3 → SSE-KMS、KMS キー変更、Bucket Key 適用) をデータ移動なしで更新する |

### 5.10 ポリシー / ACL / Ownership / Block Public Access / ABAC

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteBucketOwnershipControls` | `DELETE /{Bucket}?ownershipControls` | Object Ownership 設定を削除する |
| `DeleteBucketPolicy` | `DELETE /{Bucket}?policy` | バケットポリシーを削除する |
| `DeletePublicAccessBlock` | `DELETE /{Bucket}?publicAccessBlock` | バケット単位のブロックパブリックアクセス設定を削除する |
| `GetBucketAbac` | `GET /{Bucket}?abac` | 汎用バケットの ABAC 状態を取得する |
| `GetBucketAcl` | `GET /{Bucket}?acl` | バケット ACL を取得する |
| `GetBucketOwnershipControls` | `GET /{Bucket}?ownershipControls` | Object Ownership 設定を取得する |
| `GetBucketPolicy` | `GET /{Bucket}?policy` | バケットポリシーを取得する |
| `GetBucketPolicyStatus` | `GET /{Bucket}?policyStatus` | バケットポリシーがパブリック扱いかどうかを返す |
| `GetObjectAcl` | `GET /{Bucket}/{Key+}?acl` | オブジェクト ACL を取得する |
| `GetPublicAccessBlock` | `GET /{Bucket}?publicAccessBlock` | バケット単位のブロックパブリックアクセス設定を取得する |
| `PutBucketAbac` | `PUT /{Bucket}?abac` | 汎用バケットの ABAC (タグベースのアクセス制御) を Enabled / Disabled にする |
| `PutBucketAcl` | `PUT /{Bucket}?acl` | バケット ACL を設定する (Object Ownership が BucketOwnerEnforced だと不可) |
| `PutBucketOwnershipControls` | `PUT /{Bucket}?ownershipControls` | Object Ownership (BucketOwnerEnforced 等) を設定する |
| `PutBucketPolicy` | `PUT /{Bucket}?policy` | バケットポリシー (JSON) を設定する |
| `PutObjectAcl` | `PUT /{Bucket}/{Key+}?acl` | オブジェクト ACL を設定する |
| `PutPublicAccessBlock` | `PUT /{Bucket}?publicAccessBlock` | バケット単位のブロックパブリックアクセス 4 設定を作成 / 変更する |

### 5.11 Analytics / Inventory / Metrics

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteBucketAnalyticsConfiguration` | `DELETE /{Bucket}?analytics` | Storage Class Analysis 設定を削除する |
| `DeleteBucketInventoryConfiguration` | `DELETE /{Bucket}?inventory` | S3 Inventory 設定を削除する |
| `DeleteBucketMetricsConfiguration` | `DELETE /{Bucket}?metrics` | リクエストメトリクス設定を削除する |
| `GetBucketAnalyticsConfiguration` | `GET /{Bucket}?analytics` | Storage Class Analysis 設定を ID 指定で取得する |
| `GetBucketInventoryConfiguration` | `GET /{Bucket}?inventory` | S3 Inventory 設定を ID 指定で取得する |
| `GetBucketMetricsConfiguration` | `GET /{Bucket}?metrics` | リクエストメトリクス設定を ID 指定で取得する |
| `ListBucketAnalyticsConfigurations` | `GET /{Bucket}?analytics` | Storage Class Analysis 設定を列挙する |
| `ListBucketInventoryConfigurations` | `GET /{Bucket}?inventory` | S3 Inventory 設定を列挙する |
| `ListBucketMetricsConfigurations` | `GET /{Bucket}?metrics` | リクエストメトリクス設定を列挙する |
| `PutBucketAnalyticsConfiguration` | `PUT /{Bucket}?analytics` | Storage Class Analysis の設定を追加 / 置換する |
| `PutBucketInventoryConfiguration` | `PUT /{Bucket}?inventory` | S3 Inventory レポート設定を追加 / 置換する |
| `PutBucketMetricsConfiguration` | `PUT /{Bucket}?metrics` | CloudWatch リクエストメトリクスのフィルタ設定を追加 / 置換する |

### 5.12 Intelligent-Tiering 設定

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteBucketIntelligentTieringConfiguration` | `DELETE /{Bucket}?intelligent-tiering` | Intelligent-Tiering 設定を削除する |
| `GetBucketIntelligentTieringConfiguration` | `GET /{Bucket}?intelligent-tiering` | Intelligent-Tiering 設定を ID 指定で取得する |
| `ListBucketIntelligentTieringConfigurations` | `GET /{Bucket}?intelligent-tiering` | Intelligent-Tiering 設定を列挙する |
| `PutBucketIntelligentTieringConfiguration` | `PUT /{Bucket}?intelligent-tiering` | Intelligent-Tiering の Archive / Deep Archive 層への自動移行を設定する |

### 5.13 静的ウェブサイト

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteBucketWebsite` | `DELETE /{Bucket}?website` | ウェブサイト設定を削除する |
| `GetBucketWebsite` | `GET /{Bucket}?website` | ウェブサイト設定を取得する |
| `PutBucketWebsite` | `PUT /{Bucket}?website` | 静的ウェブサイトホスティング (index / error / リダイレクトルール) を設定する |

### 5.14 CORS

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteBucketCors` | `DELETE /{Bucket}?cors` | CORS ルールを削除する |
| `GetBucketCors` | `GET /{Bucket}?cors` | CORS ルールを取得する |
| `PutBucketCors` | `PUT /{Bucket}?cors` | CORS ルールを設定する |

### 5.15 Object Lock

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `GetObjectLegalHold` | `GET /{Bucket}/{Key+}?legal-hold` | リーガルホールド状態を取得する |
| `GetObjectLockConfiguration` | `GET /{Bucket}?object-lock` | Object Lock 設定を取得する |
| `GetObjectRetention` | `GET /{Bucket}/{Key+}?retention` | オブジェクトバージョンの保持設定を取得する |
| `PutObjectLegalHold` | `PUT /{Bucket}/{Key+}?legal-hold` | オブジェクトバージョンのリーガルホールドを ON / OFF する |
| `PutObjectLockConfiguration` | `PUT /{Bucket}?object-lock` | バケットの Object Lock とデフォルト保持 (GOVERNANCE / COMPLIANCE) を設定する |
| `PutObjectRetention` | `PUT /{Bucket}/{Key+}?retention` | オブジェクトバージョンに保持期限 (Retain Until Date) を設定する |

### 5.16 タグ

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteBucketTagging` | `DELETE /{Bucket}?tagging` | バケットタグを削除する (ABAC 有効時は UntagResource を使う) |
| `DeleteObjectTagging` | `DELETE /{Bucket}/{Key+}?tagging` | オブジェクトのタグセットを全削除する |
| `GetBucketTagging` | `GET /{Bucket}?tagging` | バケットタグを取得する |
| `GetObjectTagging` | `GET /{Bucket}/{Key+}?tagging` | オブジェクトのタグセットを取得する |
| `PutBucketTagging` | `PUT /{Bucket}?tagging` | バケットタグを設定する (ABAC 有効時は TagResource を使う) |
| `PutObjectTagging` | `PUT /{Bucket}/{Key+}?tagging` | オブジェクトのタグセット (最大 10 個) を置換する |

### 5.17 S3 Metadata 設定

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateBucketMetadataConfiguration` | `POST /{Bucket}?metadataConfiguration` | S3 Metadata V2 設定 (ジャーナルテーブル + ライブインベントリテーブル) を作成する |
| `CreateBucketMetadataTableConfiguration` | `POST /{Bucket}?metadataTable` | V1 S3 Metadata 設定を作成する (非推奨。V2 を使う) |
| `DeleteBucketMetadataConfiguration` | `DELETE /{Bucket}?metadataConfiguration` | S3 Metadata 設定を削除する (V1 / V2 両方に使える) |
| `DeleteBucketMetadataTableConfiguration` | `DELETE /{Bucket}?metadataTable` | V1 S3 Metadata 設定を削除する (非推奨) |
| `GetBucketMetadataConfiguration` | `GET /{Bucket}?metadataConfiguration` | S3 Metadata V2 設定を取得する |
| `GetBucketMetadataTableConfiguration` | `GET /{Bucket}?metadataTable` | V1 S3 Metadata 設定を取得する (非推奨) |
| `UpdateBucketMetadataAnnotationTableConfiguration` | `PUT /{Bucket}?metadataAnnotationTable` | アノテーションテーブル (アノテーションの Iceberg テーブル) を有効 / 無効化、IAM ロールを更新する |
| `UpdateBucketMetadataInventoryTableConfiguration` | `PUT /{Bucket}?metadataInventoryTable` | ライブインベントリテーブルを有効 / 無効化する |
| `UpdateBucketMetadataJournalTableConfiguration` | `PUT /{Bucket}?metadataJournalTable` | ジャーナルテーブルのレコード失効を有効 / 無効化する |

### 5.18 オブジェクトアノテーション

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteObjectAnnotation` | `DELETE /{Bucket}/{Key+}?annotation` | オブジェクトのアノテーションを 1 件削除する (x-amz-object-if-match で条件付き削除可) |
| `GetObjectAnnotation` | `GET /{Bucket}/{Key+}?annotation` | オブジェクトのアノテーションを 1 件取得する |
| `ListObjectAnnotations` | `GET /{Bucket}/{Key+}?annotation` | オブジェクトに付いたアノテーションを列挙する (prefix で絞り込み可) |
| `PutObjectAnnotation` | `PUT /{Bucket}/{Key+}?annotation` | オブジェクト (またはバージョン) に 1 B〜1 MiB の名前付きアノテーションを付ける (1 オブジェクト最大 1,000 個) |

### 5.19 Object Lambda

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `WriteGetObjectResponse` | `POST /WriteGetObjectResponse` | Object Lambda の関数から、変換済みのレスポンスを GetObject の呼び出し元に返す |

### 5.20 Transfer Acceleration

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `GetBucketAccelerateConfiguration` | `GET /{Bucket}?accelerate` | Transfer Acceleration の状態を取得する |
| `PutBucketAccelerateConfiguration` | `PUT /{Bucket}?accelerate` | Transfer Acceleration を Enabled / Suspended にする |

### 5.21 サーバーアクセスログ

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `GetBucketLogging` | `GET /{Bucket}?logging` | サーバーアクセスログ設定を取得する |
| `PutBucketLogging` | `PUT /{Bucket}?logging` | サーバーアクセスログの出力先・プレフィックスを設定する |

### 5.22 リクエスタ支払い

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `GetBucketRequestPayment` | `GET /{Bucket}?requestPayment` | リクエスタ支払い設定を取得する |
| `PutBucketRequestPayment` | `PUT /{Bucket}?requestPayment` | リクエスタ支払い (Requester Pays) を設定する |

## 6. Amazon S3 Control の全オペレーション (97 個)

`s3control` (API バージョン `2018-08-20`、`rest-xml`) は **アカウント単位のコントロールプレーン**。エンドポイントは `https://{AccountId}.s3-control.{Region}.amazonaws.com` で、ほぼ全リクエストに `x-amz-account-id` ヘッダが必要。SigV4 の署名サービス名は `s3`。名前に `Bucket` を含む操作 (`CreateBucket` / `GetBucketPolicy` など) は **S3 on Outposts バケット専用** で、通常の汎用バケットには `s3` 側の同名 API を使う点に注意。

### 6.1 アクセスポイント

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateAccessPoint` | `PUT /v20180820/accesspoint/{name}` | アクセスポイントを作成しバケットに紐付ける (汎用 / ディレクトリバケット) |
| `DeleteAccessPoint` | `DELETE /v20180820/accesspoint/{name}` | アクセスポイントを削除する |
| `DeleteAccessPointPolicy` | `DELETE /v20180820/accesspoint/{name}/policy` | アクセスポイントポリシーを削除する |
| `DeleteAccessPointScope` | `DELETE /v20180820/accesspoint/{name}/scope` | ディレクトリバケット用アクセスポイントのスコープを削除する |
| `GetAccessPoint` | `GET /v20180820/accesspoint/{name}` | アクセスポイントの設定を取得する |
| `GetAccessPointPolicy` | `GET /v20180820/accesspoint/{name}/policy` | アクセスポイントポリシーを取得する |
| `GetAccessPointPolicyStatus` | `GET /v20180820/accesspoint/{name}/policyStatus` | アクセスポイントポリシーがパブリックか判定する |
| `GetAccessPointScope` | `GET /v20180820/accesspoint/{name}/scope` | ディレクトリバケット用アクセスポイントのスコープを取得する |
| `ListAccessPoints` | `GET /v20180820/accesspoint` | 汎用バケットのアクセスポイントを列挙する |
| `ListAccessPointsForDirectoryBuckets` | `GET /v20180820/accesspointfordirectory` | ディレクトリバケットのアクセスポイントを列挙する |
| `PutAccessPointPolicy` | `PUT /v20180820/accesspoint/{name}/policy` | アクセスポイントポリシーを設定する |
| `PutAccessPointScope` | `PUT /v20180820/accesspoint/{name}/scope` | ディレクトリバケット用アクセスポイントのスコープ (プレフィックス / 許可 API) を設定する |

### 6.2 Object Lambda

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateAccessPointForObjectLambda` | `PUT /v20180820/accesspointforobjectlambda/{name}` | Object Lambda アクセスポイントを作成する |
| `DeleteAccessPointForObjectLambda` | `DELETE /v20180820/accesspointforobjectlambda/{name}` | Object Lambda アクセスポイントを削除する |
| `DeleteAccessPointPolicyForObjectLambda` | `DELETE /v20180820/accesspointforobjectlambda/{name}/policy` | Object Lambda アクセスポイントのポリシーを削除する |
| `GetAccessPointConfigurationForObjectLambda` | `GET /v20180820/accesspointforobjectlambda/{name}/configuration` | Object Lambda アクセスポイントの変換設定を取得する |
| `GetAccessPointForObjectLambda` | `GET /v20180820/accesspointforobjectlambda/{name}` | Object Lambda アクセスポイント情報を取得する |
| `GetAccessPointPolicyForObjectLambda` | `GET /v20180820/accesspointforobjectlambda/{name}/policy` | Object Lambda アクセスポイントのポリシーを取得する |
| `GetAccessPointPolicyStatusForObjectLambda` | `GET /v20180820/accesspointforobjectlambda/{name}/policyStatus` | Object Lambda アクセスポイントポリシーのパブリック判定を取得する |
| `ListAccessPointsForObjectLambda` | `GET /v20180820/accesspointforobjectlambda` | Object Lambda アクセスポイントを列挙する |
| `PutAccessPointConfigurationForObjectLambda` | `PUT /v20180820/accesspointforobjectlambda/{name}/configuration` | Object Lambda アクセスポイントの変換設定を置換する |
| `PutAccessPointPolicyForObjectLambda` | `PUT /v20180820/accesspointforobjectlambda/{name}/policy` | Object Lambda アクセスポイントのポリシーを設定する |

### 6.3 Multi-Region Access Points

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateMultiRegionAccessPoint` | `POST /v20180820/async-requests/mrap/create` | Multi-Region Access Point を作成する (非同期) |
| `DeleteMultiRegionAccessPoint` | `POST /v20180820/async-requests/mrap/delete` | Multi-Region Access Point を削除する (非同期) |
| `DescribeMultiRegionAccessPointOperation` | `GET /v20180820/async-requests/mrap/{request_token+}` | MRAP の非同期操作の状態を取得する |
| `GetMultiRegionAccessPoint` | `GET /v20180820/mrap/instances/{name+}` | MRAP の設定を取得する |
| `GetMultiRegionAccessPointPolicy` | `GET /v20180820/mrap/instances/{name+}/policy` | MRAP のポリシーを取得する |
| `GetMultiRegionAccessPointPolicyStatus` | `GET /v20180820/mrap/instances/{name+}/policystatus` | MRAP ポリシーのパブリック判定を取得する |
| `GetMultiRegionAccessPointRoutes` | `GET /v20180820/mrap/instances/{mrap+}/routes` | MRAP のルーティング (どの Region が active / passive か) を取得する |
| `ListMultiRegionAccessPoints` | `GET /v20180820/mrap/instances` | MRAP を列挙する |
| `PutMultiRegionAccessPointPolicy` | `POST /v20180820/async-requests/mrap/put-policy` | MRAP のポリシーを設定する (非同期) |
| `SubmitMultiRegionAccessPointRoutes` | `PATCH /v20180820/mrap/instances/{mrap+}/routes` | MRAP のルーティングを更新する (フェイルオーバー) |

### 6.4 Batch Operations

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateJob` | `POST /v20180820/jobs` | S3 Batch Operations ジョブを作成する |
| `DeleteJobTagging` | `DELETE /v20180820/jobs/{id}/tagging` | ジョブのタグを削除する |
| `DescribeJob` | `GET /v20180820/jobs/{id}` | ジョブの設定と状態を取得する |
| `GetJobTagging` | `GET /v20180820/jobs/{id}/tagging` | ジョブのタグを取得する |
| `ListJobs` | `GET /v20180820/jobs` | ジョブを列挙する (終了後 90 日以内のものを含む) |
| `PutJobTagging` | `PUT /v20180820/jobs/{id}/tagging` | ジョブのタグを設定する |
| `UpdateJobPriority` | `POST /v20180820/jobs/{id}/priority` | ジョブの優先度を変更する |
| `UpdateJobStatus` | `POST /v20180820/jobs/{id}/status` | ジョブを確認 (Ready) / キャンセルする |

### 6.5 Access Grants

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `AssociateAccessGrantsIdentityCenter` | `POST /v20180820/accessgrantsinstance/identitycenter` | Access Grants インスタンスを IAM Identity Center と関連付ける |
| `CreateAccessGrant` | `POST /v20180820/accessgrantsinstance/grant` | グランティー (IAM / Identity Center のユーザー・グループ) に READ / WRITE / READWRITE を付与する |
| `CreateAccessGrantsInstance` | `POST /v20180820/accessgrantsinstance` | S3 Access Grants インスタンスを作成する |
| `CreateAccessGrantsLocation` | `POST /v20180820/accessgrantsinstance/location` | S3 のロケーション (バケット / プレフィックス) を IAM ロール付きで登録する |
| `DeleteAccessGrant` | `DELETE /v20180820/accessgrantsinstance/grant/{id}` | アクセスグラントを削除する |
| `DeleteAccessGrantsInstance` | `DELETE /v20180820/accessgrantsinstance` | Access Grants インスタンスを削除する |
| `DeleteAccessGrantsInstanceResourcePolicy` | `DELETE /v20180820/accessgrantsinstance/resourcepolicy` | Access Grants インスタンスのリソースポリシーを削除する |
| `DeleteAccessGrantsLocation` | `DELETE /v20180820/accessgrantsinstance/location/{id}` | 登録ロケーションを解除する |
| `DissociateAccessGrantsIdentityCenter` | `DELETE /v20180820/accessgrantsinstance/identitycenter` | IAM Identity Center との関連付けを解除する |
| `GetAccessGrant` | `GET /v20180820/accessgrantsinstance/grant/{id}` | アクセスグラントの詳細を取得する |
| `GetAccessGrantsInstance` | `GET /v20180820/accessgrantsinstance` | Region の Access Grants インスタンスを取得する |
| `GetAccessGrantsInstanceForPrefix` | `GET /v20180820/accessgrantsinstance/prefix` | 指定プレフィックスを含む Access Grants インスタンスを取得する |
| `GetAccessGrantsInstanceResourcePolicy` | `GET /v20180820/accessgrantsinstance/resourcepolicy` | Access Grants インスタンスのリソースポリシーを取得する |
| `GetAccessGrantsLocation` | `GET /v20180820/accessgrantsinstance/location/{id}` | 登録ロケーションの詳細を取得する |
| `GetDataAccess` | `GET /v20180820/accessgrantsinstance/dataaccess` | グラントに基づく一時認証情報 (STS トークン) を払い出す |
| `ListAccessGrants` | `GET /v20180820/accessgrantsinstance/grants` | アクセスグラントを列挙する |
| `ListAccessGrantsInstances` | `GET /v20180820/accessgrantsinstances` | Access Grants インスタンスを列挙する |
| `ListAccessGrantsLocations` | `GET /v20180820/accessgrantsinstance/locations` | 登録ロケーションを列挙する |
| `ListCallerAccessGrants` | `GET /v20180820/accessgrantsinstance/caller/grants` | 呼び出し元に効いているアクセスグラントを列挙する |
| `PutAccessGrantsInstanceResourcePolicy` | `PUT /v20180820/accessgrantsinstance/resourcepolicy` | Access Grants インスタンスのリソースポリシーを設定する |
| `UpdateAccessGrantsLocation` | `PUT /v20180820/accessgrantsinstance/location/{id}` | 登録ロケーションの IAM ロールを変更する |

### 6.6 Storage Lens

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateStorageLensGroup` | `POST /v20180820/storagelensgroup` | Storage Lens グループ (プレフィックス / タグ / サイズ等でまとめたオブジェクト群) を作成する |
| `DeleteStorageLensConfiguration` | `DELETE /v20180820/storagelens/{storagelensid}` | Storage Lens 設定を削除する |
| `DeleteStorageLensConfigurationTagging` | `DELETE /v20180820/storagelens/{storagelensid}/tagging` | Storage Lens 設定のタグを削除する |
| `DeleteStorageLensGroup` | `DELETE /v20180820/storagelensgroup/{name}` | Storage Lens グループを削除する |
| `GetStorageLensConfiguration` | `GET /v20180820/storagelens/{storagelensid}` | Storage Lens 設定を取得する |
| `GetStorageLensConfigurationTagging` | `GET /v20180820/storagelens/{storagelensid}/tagging` | Storage Lens 設定のタグを取得する |
| `GetStorageLensGroup` | `GET /v20180820/storagelensgroup/{name}` | Storage Lens グループを取得する |
| `ListStorageLensConfigurations` | `GET /v20180820/storagelens` | Storage Lens 設定を列挙する |
| `ListStorageLensGroups` | `GET /v20180820/storagelensgroup` | Storage Lens グループを列挙する |
| `PutStorageLensConfiguration` | `PUT /v20180820/storagelens/{storagelensid}` | Storage Lens ダッシュボード設定を作成 / 置換する |
| `PutStorageLensConfigurationTagging` | `PUT /v20180820/storagelens/{storagelensid}/tagging` | Storage Lens 設定のタグを設定する |
| `UpdateStorageLensGroup` | `PUT /v20180820/storagelensgroup/{name}` | Storage Lens グループを更新する |

### 6.7 アカウント設定

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeletePublicAccessBlock` | `DELETE /v20180820/configuration/publicAccessBlock` | アカウント単位のブロックパブリックアクセスを削除する |
| `GetPublicAccessBlock` | `GET /v20180820/configuration/publicAccessBlock` | アカウント単位のブロックパブリックアクセスを取得する |
| `PutPublicAccessBlock` | `PUT /v20180820/configuration/publicAccessBlock` | アカウント単位のブロックパブリックアクセスを設定する |

### 6.8 タグ

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `ListTagsForResource` | `GET /v20180820/tags/{resourceArn+}` | S3 リソースのタグを列挙する |
| `TagResource` | `POST /v20180820/tags/{resourceArn+}` | S3 リソース (汎用バケット、Storage Lens グループ、Access Grants 等) にタグを付ける |
| `UntagResource` | `DELETE /v20180820/tags/{resourceArn+}` | S3 リソースからタグを外す |

### 6.9 S3 on Outposts バケット (Control 経由)

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateBucket` | `PUT /v20180820/bucket/{name}` | Outposts バケットを作成する |
| `DeleteBucket` | `DELETE /v20180820/bucket/{name}` | Outposts バケットを削除する |
| `DeleteBucketLifecycleConfiguration` | `DELETE /v20180820/bucket/{name}/lifecycleconfiguration` | Outposts バケットのライフサイクルを削除する |
| `DeleteBucketPolicy` | `DELETE /v20180820/bucket/{name}/policy` | Outposts バケットのポリシーを削除する |
| `DeleteBucketReplication` | `DELETE /v20180820/bucket/{name}/replication` | Outposts バケットのレプリケーションを削除する |
| `DeleteBucketTagging` | `DELETE /v20180820/bucket/{name}/tagging` | Outposts バケットのタグを削除する |
| `GetBucket` | `GET /v20180820/bucket/{name}` | Outposts バケットを取得する |
| `GetBucketLifecycleConfiguration` | `GET /v20180820/bucket/{name}/lifecycleconfiguration` | Outposts バケットのライフサイクルを取得する |
| `GetBucketPolicy` | `GET /v20180820/bucket/{name}/policy` | Outposts バケットのポリシーを取得する |
| `GetBucketReplication` | `GET /v20180820/bucket/{name}/replication` | Outposts バケットのレプリケーションを取得する |
| `GetBucketTagging` | `GET /v20180820/bucket/{name}/tagging` | Outposts バケットのタグを取得する |
| `GetBucketVersioning` | `GET /v20180820/bucket/{name}/versioning` | Outposts バケットのバージョニング状態を取得する |
| `ListRegionalBuckets` | `GET /v20180820/bucket` | Outpost 上のバケットを列挙する |
| `PutBucketLifecycleConfiguration` | `PUT /v20180820/bucket/{name}/lifecycleconfiguration` | Outposts バケットのライフサイクルを設定する |
| `PutBucketPolicy` | `PUT /v20180820/bucket/{name}/policy` | Outposts バケットのポリシーを設定する |
| `PutBucketReplication` | `PUT /v20180820/bucket/{name}/replication` | Outposts バケットのレプリケーションを設定する |
| `PutBucketTagging` | `PUT /v20180820/bucket/{name}/tagging` | Outposts バケットのタグを設定する |
| `PutBucketVersioning` | `PUT /v20180820/bucket/{name}/versioning` | Outposts バケットのバージョニングを設定する |

## 7. Amazon S3 Tables の全オペレーション (49 個)

`s3tables` (API バージョン `2018-05-10`、`rest-json`) は Apache Iceberg テーブルを格納する **テーブルバケット** の管理 API。エンドポイントは `https://s3tables.{Region}.amazonaws.com`、署名サービス名は `s3tables`。テーブルの中身 (Parquet データファイル・Iceberg メタデータ) の読み書きは Iceberg REST Catalog エンドポイントや Athena / Spark などのエンジン経由で行い、ここにあるのは「入れ物とポリシーと運用設定」の API。

### 7.1 テーブルバケット

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateTableBucket` | `PUT /buckets` | テーブルバケットを作成する |
| `DeleteTableBucket` | `DELETE /buckets/{tableBucketARN}` | テーブルバケットを削除する |
| `DeleteTableBucketPolicy` | `DELETE /buckets/{tableBucketARN}/policy` | テーブルバケットポリシーを削除する |
| `GetTableBucket` | `GET /buckets/{tableBucketARN}` | テーブルバケットの詳細を取得する |
| `GetTableBucketPolicy` | `GET /buckets/{tableBucketARN}/policy` | テーブルバケットポリシーを取得する |
| `ListTableBuckets` | `GET /buckets` | テーブルバケットを列挙する |
| `PutTableBucketPolicy` | `PUT /buckets/{tableBucketARN}/policy` | テーブルバケットポリシーを設定する |

### 7.2 名前空間

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateNamespace` | `PUT /namespaces/{tableBucketARN}` | テーブルバケット内に名前空間 (テーブルの論理グループ) を作る |
| `DeleteNamespace` | `DELETE /namespaces/{tableBucketARN}/{namespace}` | 名前空間を削除する |
| `GetNamespace` | `GET /namespaces/{tableBucketARN}/{namespace}` | 名前空間の詳細を取得する |
| `ListNamespaces` | `GET /namespaces/{tableBucketARN}` | 名前空間を列挙する |

### 7.3 テーブル

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateTable` | `PUT /tables/{tableBucketARN}/{namespace}` | 名前空間に Iceberg テーブルを作成する |
| `DeleteTable` | `DELETE /tables/{tableBucketARN}/{namespace}/{name}` | テーブルを削除する |
| `DeleteTablePolicy` | `DELETE /tables/{tableBucketARN}/{namespace}/{name}/policy` | テーブルポリシーを削除する |
| `GetTable` | `GET /get-table` | テーブルの詳細を取得する |
| `GetTableMetadataLocation` | `GET /tables/{tableBucketARN}/{namespace}/{name}/metadata-location` | テーブルの現在の Iceberg メタデータファイルの場所を取得する |
| `GetTablePolicy` | `GET /tables/{tableBucketARN}/{namespace}/{name}/policy` | テーブルポリシーを取得する |
| `ListTables` | `GET /tables/{tableBucketARN}` | テーブルを列挙する |
| `PutTablePolicy` | `PUT /tables/{tableBucketARN}/{namespace}/{name}/policy` | テーブルポリシーを設定する |
| `RenameTable` | `PUT /tables/{tableBucketARN}/{namespace}/{name}/rename` | テーブル名を変更する / 別の名前空間へ移す |
| `UpdateTableMetadataLocation` | `PUT /tables/{tableBucketARN}/{namespace}/{name}/metadata-location` | Iceberg メタデータファイルの場所を更新する (コミット) |

### 7.4 メンテナンス

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `GetTableBucketMaintenanceConfiguration` | `GET /buckets/{tableBucketARN}/maintenance` | テーブルバケットのメンテナンス設定を取得する |
| `GetTableMaintenanceConfiguration` | `GET /tables/{tableBucketARN}/{namespace}/{name}/maintenance` | テーブルのメンテナンス設定を取得する |
| `GetTableMaintenanceJobStatus` | `GET /tables/{tableBucketARN}/{namespace}/{name}/maintenance-job-status` | テーブルのメンテナンスジョブの状態を取得する |
| `PutTableBucketMaintenanceConfiguration` | `PUT /buckets/{tableBucketARN}/maintenance/{type}` | テーブルバケットのメンテナンス (未参照ファイル削除など) を設定する |
| `PutTableMaintenanceConfiguration` | `PUT /tables/{tableBucketARN}/{namespace}/{name}/maintenance/{type}` | テーブルのメンテナンス (コンパクション / スナップショット管理) を設定する |

### 7.5 暗号化

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteTableBucketEncryption` | `DELETE /buckets/{tableBucketARN}/encryption` | テーブルバケットの暗号化設定を削除する |
| `GetTableBucketEncryption` | `GET /buckets/{tableBucketARN}/encryption` | テーブルバケットの暗号化設定を取得する |
| `GetTableEncryption` | `GET /tables/{tableBucketARN}/{namespace}/{name}/encryption` | テーブルの暗号化設定を取得する |
| `PutTableBucketEncryption` | `PUT /buckets/{tableBucketARN}/encryption` | テーブルバケットのデフォルト暗号化 (SSE-S3 / SSE-KMS) を設定する |

### 7.6 レプリケーション

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteTableBucketReplication` | `DELETE /table-bucket-replication` | テーブルバケットのレプリケーション設定を削除する |
| `DeleteTableReplication` | `DELETE /table-replication` | テーブル単位のレプリケーション設定を削除する |
| `GetTableBucketReplication` | `GET /table-bucket-replication` | テーブルバケットのレプリケーション設定を取得する |
| `GetTableReplication` | `GET /table-replication` | テーブル単位のレプリケーション設定を取得する |
| `GetTableReplicationStatus` | `GET /replication-status` | テーブルの宛先ごとのレプリケーション状態を取得する |
| `PutTableBucketReplication` | `PUT /table-bucket-replication` | テーブルバケット単位のレプリケーションを設定する |
| `PutTableReplication` | `PUT /table-replication` | テーブル単位のレプリケーションを設定する |

### 7.7 ストレージクラス

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `GetTableBucketStorageClass` | `GET /buckets/{tableBucketARN}/storage-class` | テーブルバケットのストレージクラス設定を取得する |
| `GetTableStorageClass` | `GET /tables/{tableBucketARN}/{namespace}/{name}/storage-class` | テーブルのストレージクラス設定を取得する |
| `PutTableBucketStorageClass` | `PUT /buckets/{tableBucketARN}/storage-class` | テーブルバケットのデフォルトストレージクラスを設定する (新規テーブルに適用) |

### 7.8 レコード失効

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `GetTableRecordExpirationConfiguration` | `GET /table-record-expiration` | テーブルのレコード失効設定を取得する |
| `GetTableRecordExpirationJobStatus` | `GET /table-record-expiration-job-status` | 直近のレコード失効ジョブの状態と統計を取得する |
| `PutTableRecordExpirationConfiguration` | `PUT /table-record-expiration` | テーブルのレコード失効 (N 日後に自動削除) を設定する |

### 7.9 メトリクス

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteTableBucketMetricsConfiguration` | `DELETE /buckets/{tableBucketARN}/metrics` | テーブルバケットのメトリクス設定を削除する |
| `GetTableBucketMetricsConfiguration` | `GET /buckets/{tableBucketARN}/metrics` | テーブルバケットのメトリクス設定を取得する |
| `PutTableBucketMetricsConfiguration` | `PUT /buckets/{tableBucketARN}/metrics` | テーブルバケットのメトリクス設定を行う |

### 7.10 タグ

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `ListTagsForResource` | `GET /tag/{resourceArn}` | S3 Tables リソースのタグを列挙する |
| `TagResource` | `POST /tag/{resourceArn}` | S3 Tables リソースにタグを付ける |
| `UntagResource` | `DELETE /tag/{resourceArn}` | S3 Tables リソースからタグを外す |

## 8. Amazon S3 Vectors の全オペレーション (21 個)

`s3vectors` (API バージョン `2025-07-15`、`rest-json`) はベクトルバケット / ベクトルインデックス / ベクトルを扱う。エンドポイントは `https://s3vectors.{Region}.api.aws` (dual-stack ドメイン)、署名サービス名は `s3vectors`。タグ系以外はすべて `POST /<OperationName>` に JSON ボディを投げる RPC 風の形になっている。2026 年 9 月にインデックスモード (`CLASSIC` = 検索中にメタデータフィルタ、`ENHANCED` = 検索前にフィルタ) が導入され、`CLASSIC` は 2026-09-30 より前に作られたベクトルバケット内のインデックスにしか指定できない。

### 8.1 ベクトルバケット

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateVectorBucket` | `POST /CreateVectorBucket` | ベクトルバケットを作成する |
| `DeleteVectorBucket` | `POST /DeleteVectorBucket` | ベクトルバケットを削除する (空である必要あり) |
| `DeleteVectorBucketPolicy` | `POST /DeleteVectorBucketPolicy` | ベクトルバケットポリシーを削除する |
| `GetVectorBucket` | `POST /GetVectorBucket` | ベクトルバケットの属性を取得する |
| `GetVectorBucketPolicy` | `POST /GetVectorBucketPolicy` | ベクトルバケットポリシーを取得する |
| `ListVectorBuckets` | `POST /ListVectorBuckets` | ベクトルバケットを列挙する |
| `PutVectorBucketDefaultIndexMode` | `POST /PutVectorBucketDefaultIndexMode` | 以後作るインデックスのデフォルトモード (CLASSIC / ENHANCED) を設定する |
| `PutVectorBucketPolicy` | `POST /PutVectorBucketPolicy` | ベクトルバケットポリシーを設定する |

### 8.2 ベクトルインデックス

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateIndex` | `POST /CreateIndex` | ベクトルインデックス (次元数・距離関数 cosine / euclidean) を作成する |
| `DeleteIndex` | `POST /DeleteIndex` | ベクトルインデックスを削除する |
| `GetIndex` | `POST /GetIndex` | インデックスの属性を取得する |
| `ListIndexes` | `POST /ListIndexes` | インデックスを列挙する |
| `UpdateIndexMode` | `POST /UpdateIndexMode` | 既存インデックスのモードを変更する (ENHANCED = フィルタを検索前に適用) |

### 8.3 ベクトル

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `DeleteVectors` | `POST /DeleteVectors` | キー指定でベクトルを削除する |
| `GetVectors` | `POST /GetVectors` | キー指定でベクトルを取得する |
| `ListVectors` | `POST /ListVectors` | インデックス内のベクトルを列挙する (segment 指定で並列化可) |
| `PutVectors` | `POST /PutVectors` | ベクトル (key + float32 配列 + メタデータ) を最大 500 件書き込む |
| `QueryVectors` | `POST /QueryVectors` | クエリベクトルで近似最近傍 (ANN) 検索する。メタデータフィルタ可 |

### 8.4 タグ

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `ListTagsForResource` | `GET /tags/{resourceArn}` | S3 Vectors リソースのタグを列挙する |
| `TagResource` | `POST /tags/{resourceArn}` | S3 Vectors リソースにタグを付ける |
| `UntagResource` | `DELETE /tags/{resourceArn}` | S3 Vectors リソースからタグを外す |

## 9. S3 on Outposts と S3 Files のオペレーション

API Reference の Actions ページには上記 4 系統に加えて **S3 on Outposts** (`s3outposts`、エンドポイント管理のみ) と **S3 Files** (`s3files`、S3 バケットを EFS ベースのファイルシステムとしてマウントする新サービス) も載っている。`data/api.json` は 4 サービス (`s3` / `s3control` / `s3tables` / `s3vectors`) に限定しているため、この 2 つは本章の表だけに載せる。

### 9.1 S3 on Outposts (s3outposts)

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateEndpoint` | `POST /S3Outposts/CreateEndpoint` | Outpost にエンドポイント (VPC からのアクセス口) を作る |
| `DeleteEndpoint` | `DELETE /S3Outposts/DeleteEndpoint` | エンドポイントを削除する |
| `ListEndpoints` | `GET /S3Outposts/ListEndpoints` | Outpost のエンドポイントを列挙する |
| `ListOutpostsWithS3` | `GET /S3Outposts/ListOutpostsWithS3` | S3 on Outposts 容量を持つ Outpost を列挙する |
| `ListSharedEndpoints` | `GET /S3Outposts/ListSharedEndpoints` | RAM で共有された Outpost のエンドポイントを列挙する |

### 9.2 S3 Files (s3files)

| Operation | Method / Path | 説明 |
| --- | --- | --- |
| `CreateAccessPoint` | `PUT /access-points` | POSIX ユーザー / ルートディレクトリを強制するファイルシステムアクセスポイントを作る |
| `CreateFileSystem` | `PUT /file-systems` | バケット (またはプレフィックス) をスコープにした S3 ファイルシステムを作成する |
| `CreateMountTarget` | `PUT /mount-targets` | AZ / VPC にマウントターゲット (NFS マウント口) を作る |
| `DeleteAccessPoint` | `DELETE /access-points/{accessPointId}` | ファイルシステムアクセスポイントを削除する |
| `DeleteFileSystem` | `DELETE /file-systems/{fileSystemId}` | S3 ファイルシステムを削除する |
| `DeleteFileSystemPolicy` | `DELETE /file-systems/{fileSystemId}/policy` | ファイルシステムのリソースポリシーを削除する |
| `DeleteMountTarget` | `DELETE /mount-targets/{mountTargetId}` | マウントターゲットを削除する |
| `GetAccessPoint` | `GET /access-points/{accessPointId}` | ファイルシステムアクセスポイントを取得する |
| `GetFileSystem` | `GET /file-systems/{fileSystemId}` | S3 ファイルシステムの状態・設定を取得する |
| `GetFileSystemPolicy` | `GET /file-systems/{fileSystemId}/policy` | ファイルシステムのリソースポリシーを取得する |
| `GetMountTarget` | `GET /mount-targets/{mountTargetId}` | マウントターゲットの詳細を取得する |
| `GetSynchronizationConfiguration` | `GET /file-systems/{fileSystemId}/synchronization-configuration` | 同期設定を取得する |
| `ListAccessPoints` | `GET /access-points` | ファイルシステムアクセスポイントを列挙する |
| `ListFileSystems` | `GET /file-systems` | S3 ファイルシステムを列挙する |
| `ListMountTargets` | `GET /mount-targets` | マウントターゲットを列挙する |
| `ListTagsForResource` | `GET /resource-tags/{resourceId}` | S3 Files リソースのタグを列挙する |
| `PutFileSystemPolicy` | `PUT /file-systems/{fileSystemId}/policy` | ファイルシステムの IAM リソースポリシーを設定する |
| `PutSynchronizationConfiguration` | `PUT /file-systems/{fileSystemId}/synchronization-configuration` | S3 との同期設定 (インポート / 失効ルール) を作成 / 更新する |
| `TagResource` | `POST /resource-tags/{resourceId}` | S3 Files リソースにタグを付ける |
| `UntagResource` | `DELETE /resource-tags/{resourceId}` | S3 Files リソースからタグを外す |
| `UpdateMountTarget` | `PUT /mount-targets/{mountTargetId}` | マウントターゲットのセキュリティグループを更新する |

## 10. 生 HTTP で見る代表 3 オペレーション

以下は形を示すための例で、署名値・ID は架空。`Authorization` は 3 章の手順で作ったものが入る。

### 10.1 PutObject

```http
PUT /reports/2026-10.csv HTTP/1.1
Host: amzn-s3-demo-bucket.s3.ap-northeast-1.amazonaws.com
Content-Type: text/csv
Content-Length: 18
x-amz-date: 20261003T010000Z
x-amz-content-sha256: UNSIGNED-PAYLOAD
x-amz-checksum-crc32: rCjJ1w==
x-amz-server-side-encryption: aws:kms
x-amz-meta-owner: data-team
If-None-Match: *
Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261003/ap-northeast-1/s3/aws4_request, SignedHeaders=content-length;content-type;host;if-none-match;x-amz-checksum-crc32;x-amz-content-sha256;x-amz-date;x-amz-meta-owner;x-amz-server-side-encryption, Signature=<64 hex>

id,amount
1,100
```

```http
HTTP/1.1 200 OK
x-amz-id-2: <extended request id>
x-amz-request-id: 7Q1BV6XKZ0EXAMPLE
ETag: "a3f1c0de0example0example0example0"
x-amz-checksum-crc32: rCjJ1w==
x-amz-server-side-encryption: aws:kms
x-amz-server-side-encryption-aws-kms-key-id: arn:aws:kms:ap-northeast-1:111122223333:key/1234abcd-12ab-34cd-56ef-1234567890ab
x-amz-version-id: 3HL4kqtJlcpXroDTDmJ.rmSpXd3dIbrHY
Content-Length: 0
```

`If-None-Match: *` を付けると「同じキーが既にあれば 412 で失敗」する条件付き書き込みになる。バージョニングが無効なバケットでは `x-amz-version-id` は返らない (実際には `null` バージョン)。

### 10.2 GetObject (Range + 条件付き)

```http
GET /reports/2026-10.csv HTTP/1.1
Host: amzn-s3-demo-bucket.s3.ap-northeast-1.amazonaws.com
Range: bytes=0-8
If-Match: "a3f1c0de0example0example0example0"
x-amz-date: 20261003T010500Z
x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20261003/ap-northeast-1/s3/aws4_request, SignedHeaders=host;if-match;range;x-amz-content-sha256;x-amz-date, Signature=<64 hex>
```

```http
HTTP/1.1 206 Partial Content
x-amz-request-id: 9ZK2XJ4M1EXAMPLE
Last-Modified: Sat, 03 Oct 2026 01:00:00 GMT
ETag: "a3f1c0de0example0example0example0"
Accept-Ranges: bytes
Content-Range: bytes 0-8/18
Content-Type: text/csv
Content-Length: 9
x-amz-meta-owner: data-team
x-amz-server-side-encryption: aws:kms

id,amount
```

`response-content-disposition` などの `response-*` クエリパラメータを付けると、返すヘッダを上書きできる (Presigned URL でダウンロード名を変える定番テク)。

### 10.3 ListObjectsV2

```http
GET /?list-type=2&prefix=reports%2F&delimiter=%2F&max-keys=2 HTTP/1.1
Host: amzn-s3-demo-bucket.s3.ap-northeast-1.amazonaws.com
x-amz-date: 20261003T011000Z
x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
Authorization: AWS4-HMAC-SHA256 Credential=.../s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=<64 hex>
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>amzn-s3-demo-bucket</Name>
  <Prefix>reports/</Prefix>
  <Delimiter>/</Delimiter>
  <MaxKeys>2</MaxKeys>
  <KeyCount>2</KeyCount>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>1ueGcxLPRx1Tr/XYExHnhbYLgveDs2J/wm36Hy4vbOwM=</NextContinuationToken>
  <Contents>
    <Key>reports/2026-09.csv</Key>
    <LastModified>2026-09-01T00:00:00.000Z</LastModified>
    <ETag>"0c3b0e2bexample0example0example0"</ETag>
    <ChecksumAlgorithm>CRC32</ChecksumAlgorithm>
    <Size>2048</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <Contents>
    <Key>reports/2026-10.csv</Key>
    <LastModified>2026-10-03T01:00:00.000Z</LastModified>
    <ETag>"a3f1c0de0example0example0example0"</ETag>
    <ChecksumAlgorithm>CRC32</ChecksumAlgorithm>
    <Size>18</Size>
    <StorageClass>STANDARD</StorageClass>
  </Contents>
  <CommonPrefixes>
    <Prefix>reports/archive/</Prefix>
  </CommonPrefixes>
</ListBucketResult>
```

- `delimiter=/` を付けると「フォルダ」相当が `CommonPrefixes` にまとめられる (S3 に実体としてのフォルダはない)
- `IsTruncated=true` なら `continuation-token=<NextContinuationToken>` を付けて次ページを取る
- 汎用バケットはキーの UTF-8 バイナリ順で返る。ディレクトリバケットは順序が保証されない

## 11. curl `--aws-sigv4` で直接叩く

curl 7.75 以降は `--aws-sigv4` で SigV4 署名を自前でやってくれる。ローカルの curl 8.7.1 で、`s3` サービス指定時に `x-amz-content-sha256` を自動付与し、ユーザーが同ヘッダを渡せばそれを優先することを確認した。

```bash
export AWS_REGION=ap-northeast-1
BUCKET=amzn-s3-demo-bucket
EP="https://${BUCKET}.s3.${AWS_REGION}.amazonaws.com"
SIGV4="aws:amz:${AWS_REGION}:s3"

# GetObject
curl -sS --aws-sigv4 "$SIGV4" \
  --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}" \
  -H "x-amz-security-token: ${AWS_SESSION_TOKEN}" \
  "${EP}/reports/2026-10.csv"

# PutObject (ボディは無署名で送る)
curl -sS --aws-sigv4 "$SIGV4" \
  --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}" \
  -H "x-amz-security-token: ${AWS_SESSION_TOKEN}" \
  -H "x-amz-content-sha256: UNSIGNED-PAYLOAD" \
  -H "Content-Type: text/csv" \
  -T ./2026-10.csv "${EP}/reports/2026-10.csv" -i

# ListObjectsV2
curl -sS --aws-sigv4 "$SIGV4" \
  --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}" \
  -H "x-amz-security-token: ${AWS_SESSION_TOKEN}" \
  "${EP}/?list-type=2&prefix=reports/&max-keys=10"

# S3 Vectors (JSON API): サービス名は s3vectors
curl -sS --aws-sigv4 "aws:amz:${AWS_REGION}:s3vectors" \
  --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}" \
  -H "x-amz-security-token: ${AWS_SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}' "https://s3vectors.${AWS_REGION}.api.aws/ListVectorBuckets"
```

- 長期アクセスキーを使う場合は `x-amz-security-token` 行を消す (空のトークンを送ると `InvalidToken` になる)
- `aws configure export-credentials --format env` で SSO / ロールの一時認証情報を環境変数に出せる
- `-v` を付けると curl が作った `Authorization` ヘッダが見えるので、3 章の手計算と突き合わせると理解が深まる

## 12. SDK / CLI とのマッピングの勘所

| 見かけ | 実体 |
| --- | --- |
| `aws s3 cp big.iso s3://b/` | `CreateMultipartUpload` + `UploadPart` 並列 + `CompleteMultipartUpload` (既定 8 MiB 閾値・8 MiB パート) |
| `aws s3 sync` | `ListObjectsV2` で差分判定 → `PutObject` / `CopyObject` / `DeleteObject` |
| `aws s3 rm --recursive` | `ListObjectsV2` + `DeleteObjects` (1,000 件ずつ) |
| `aws s3 presign` | クライアント側だけで署名 URL を計算。API 呼び出しは発生しない |
| `aws s3 mb` / `rb` | `CreateBucket` / `DeleteBucket` |
| SDK の Paginator | `continuation-token` / `key-marker` / `NextToken` を自動で回す |
| SDK の Waiter (`bucket-exists` など) | `HeadBucket` / `HeadObject` をポーリング |
| IAM のアクション名 | API 名とほぼ同じだが例外あり (`ListObjectsV2` → `s3:ListBucket`、`HeadObject` → `s3:GetObject`、`PutBucketLifecycleConfiguration` → `s3:PutLifecycleConfiguration`、`UploadPart` → `s3:PutObject`) |

## 参考文献

- Amazon S3 API Reference: Actions: <https://docs.aws.amazon.com/AmazonS3/latest/API/API_Operations.html>
- Amazon S3 API Reference: Welcome: <https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html>
- Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk: <https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sig-v4-header-based-auth.html>
- Signature Calculations for the Authorization Header: Transferring Payload in Multiple Chunks: <https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-streaming.html>
- Authenticating Requests: Using Query Parameters (AWS Signature Version 4): <https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html>
- Checking object integrity in Amazon S3: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html>
- Error responses (List of error codes): <https://docs.aws.amazon.com/AmazonS3/latest/developerguide/ErrorResponses.html>
- Virtual hosting of general purpose buckets: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/VirtualHosting.html>
- Regional and Zonal endpoints for directory buckets: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-express-Regions-and-Zones.html>
- CreateSession: <https://docs.aws.amazon.com/AmazonS3/latest/API/API_CreateSession.html>
- PutObjectAnnotation: <https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObjectAnnotation.html>
- UpdateObjectEncryption: <https://docs.aws.amazon.com/AmazonS3/latest/API/API_UpdateObjectEncryption.html>
- PutBucketAbac: <https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutBucketAbac.html>
- RenameObject: <https://docs.aws.amazon.com/AmazonS3/latest/API/API_RenameObject.html>
- S3 Vectors UpdateIndexMode: <https://docs.aws.amazon.com/AmazonS3/latest/API/API_S3VectorBuckets_UpdateIndexMode.html>
- Amazon S3 Vectors introduces metadata pre-filtering (2026-09): <https://aws.amazon.com/about-aws/whats-new/2026/09/s3-vectors-introduces-metadata-pre-filtering/>
- Uploading objects (サイズ上限): <https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html>
- Amazon S3 multipart upload limits: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html>
- botocore サービスモデル (AWS CLI v2 同梱 `awscli/botocore/data/{s3,s3control,s3tables,s3vectors,s3outposts,s3files}`): <https://github.com/boto/botocore/tree/develop/botocore/data>
- curl `--aws-sigv4`: <https://curl.se/docs/manpage.html#--aws-sigv4>
