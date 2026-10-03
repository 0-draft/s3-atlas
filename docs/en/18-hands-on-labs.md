# Hands-on labs

_Last verified: 2026-10-03_

Twelve labs for confirming, hands-on, the mechanisms covered in earlier chapters. The first group (Labs 1–3, 7, 9, and 12) can mostly be reproduced on a local S3-compatible server; the rest (CloudFront, Lambda, replication, Athena, S3 Tables, S3 Vectors) need a real AWS account. Each lab follows the order "Goal → Prerequisites → Steps → Expected output → What you learned → Cleanup".

> **Cost warning**: Every lab keeps data to a few MB, so if you run the cleanup, charges are close to zero (a few tens of yen at most). However, CloudFront distributions, replication, Athena scans, S3 Tables, Lambda, and similar resources **keep billing monthly if you forget to delete them**, or are billed per operation. Always run each lab's "Cleanup". Prices differ by Region, so check the Amazon S3 pricing page for current values.

## 0. Common setup

### 0.1 Tools

| Tool | Purpose | Example install |
| --- | --- | --- |
| AWS CLI v2 | All labs | `brew install awscli` (this chapter was verified with v2.37.7) |
| jq | JSON formatting | `brew install jq` |
| Docker | Local S3-compatible server | Docker Desktop / Rancher Desktop / colima, etc. |
| s5cmd | Lab 12 | `brew install peak/tap/s5cmd` (or the `peakcom/s5cmd` container image) |
| warp | Lab 12 | Download the binary from GitHub Releases (`minio/warp`) (or the `minio/warp` container image) |
| Python 3.13 + pip | Lab 5 | `brew install python@3.13` |

### 0.2 Environment variables for real AWS

For the labs, it is safest to use a **dedicated test account with AdministratorAccess-equivalent permissions** (not a production account).

```bash
export AWS_REGION=ap-northeast-1
export AWS_DEFAULT_REGION=$AWS_REGION
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
# Bucket names are globally unique, so mix in the account ID and a random value
export LAB=s3lab-${ACCOUNT_ID}-$(openssl rand -hex 3)
echo $LAB
```

```text
s3lab-111122223333-a1b2c3
```

From here on, bucket names carry the lab number, like `${LAB}-l1`.

### 0.3 Local environment A: MinIO-compatible server (pgsty/silo)

The MinIO community edition stopped distributing official binaries and container images in October 2025, and its GitHub repository was archived in 2026. In 2026-09 the `minio/minio` repository on Docker Hub itself was deleted. This chapter therefore uses the image from **pgsty/silo** (formerly `pgsty/minio`), a community fork that took over the MinIO server and continues building and distributing it. The S3 API and command set are the same as MinIO.

```bash
docker run -d --name s3lab-minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin-change-me \
  -v "$PWD/minio-data:/data" \
  docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z \
  server /data --console-address ":9001"
```

Call it from the AWS CLI with a dedicated profile. Because `endpoint_url` can be set in the profile, you do not need `--endpoint-url` on every command.

```bash
aws configure set aws_access_key_id minioadmin --profile minio
aws configure set aws_secret_access_key minioadmin-change-me --profile minio
aws configure set region us-east-1 --profile minio
aws configure set endpoint_url http://localhost:9000 --profile minio
aws configure set s3.addressing_style path --profile minio
aws s3 ls --profile minio   # No output means the connection works
```

- The console is at <http://localhost:9001>
- Recent CLI versions send flexible checksums by default. If an older S3-compatible implementation returns errors, `export AWS_REQUEST_CHECKSUM_CALCULATION=when_required` restores the old behavior
- To run these labs locally, add `--profile minio` to the commands that follow and set `LAB` to any name, such as `LAB=local`
- `LocationConstraint=$AWS_REGION` can stay as written locally: silo accepted both an empty value (`AWS_REGION` unset) and `ap-northeast-1`
- Verified on 2026-10-03: the `docker run` above pulls and starts `pgsty/silo:RELEASE.2026-09-16T00-00-00Z` (Podman 6.1 as the Docker API), and `aws s3 ls --profile minio` returns nothing (AWS CLI 2.37.7)

### 0.4 Local environment B: LocalStack

Since 2026-03-23, starting the `localstack/localstack` image **requires an auth token** (there is a free plan for non-commercial use, but it requires account registration). Use it when you want to try Lambda and S3 event notifications locally as well.

```bash
export LOCALSTACK_AUTH_TOKEN="your-token-here"   # Token issued at localstack.cloud
docker run -d --name s3lab-localstack \
  -p 4566:4566 \
  -e LOCALSTACK_AUTH_TOKEN \
  -v /var/run/docker.sock:/var/run/docker.sock \
  localstack/localstack
aws --endpoint-url http://localhost:4566 s3 ls
```

> **Not verified locally**: on 2026-10-03, `localstack/localstack:latest` (2026.9.0) started without a token exited with code 55 (`License activation failed! ... No credentials were found in the environment`). The LocalStack column in 0.5 is therefore based on LocalStack's documentation, not on an actual run.

### 0.5 Labs by environment

| Lab | Real AWS | MinIO-compatible (silo) | LocalStack |
| --- | --- | --- | --- |
| Lab 1 Bucket + upload + presign | OK | OK except step 2 (Block Public Access / Object Ownership return `NotImplemented`, no default encryption) | OK |
| Lab 2 Versioning | OK | OK | OK |
| Lab 3 Lifecycle + Intelligent-Tiering | OK | Expiration rules only (Transitions, `AbortIncompleteMultipartUpload`, the `INTELLIGENT_TIERING` class, and Intelligent-Tiering configuration are rejected) | Configuration API only |
| Lab 4 CloudFront OAC | OK | Not possible | Partial |
| Lab 5 Events → Lambda | OK | Not possible (webhook notifications work) | OK |
| Lab 6 CRR | OK | Different mechanism (site replication) | Partial |
| Lab 7 Object Lock | OK | OK (the error code on a rejected delete differs) | Partial |
| Lab 8 Bucket policy / 403 | OK | Different mechanism (MinIO policies) | Simplified evaluation |
| Lab 9 Manual multipart | OK | OK | OK |
| Lab 10 Athena / S3 Tables | OK | Not possible | Not possible |
| Lab 11 S3 Vectors | OK | Not possible | Not possible |
| Lab 12 Benchmarking | OK | OK (measures local performance) | Not recommended |

The silo column was verified by actually running the labs on 2026-10-03 (Labs 1–3, 7, 9, and 12). Labs 4, 5, 6, 8, 10, and 11 were not run on real AWS; only their CLI arguments were checked by sending the same commands to a local mock (moto 5.2.3 server) to confirm that the AWS CLI accepts them. The LocalStack column was not verified (see 0.4).

## Lab 1: Create a bucket, upload, and presigned URLs

### Goal

Create a bucket, upload and download objects, and issue a presigned URL that allows temporary download without authentication.

### Prerequisites

The environment variables from 0.2 (or the `minio` profile from 0.3 when running locally).

> **Verified locally** on 2026-10-03 with `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, AWS CLI 2.37.7: steps 1, 3, 4, and 5 and the cleanup pass. Step 2 (the default security settings) is AWS behavior and requires a real AWS account (not verified locally).

### Steps

```bash
B=${LAB}-l1
# 1. Create the bucket (LocationConstraint is required outside us-east-1)
aws s3api create-bucket --bucket $B \
  --create-bucket-configuration LocationConstraint=$AWS_REGION

# 2. Check the default security settings (Block Public Access all ON, SSE-S3, ACLs disabled)
aws s3api get-public-access-block --bucket $B
aws s3api get-bucket-encryption --bucket $B --query 'ServerSideEncryptionConfiguration.Rules[0]'
aws s3api get-bucket-ownership-controls --bucket $B

# 3. Upload
echo "hello s3 $(date)" > hello.txt
aws s3 cp hello.txt s3://$B/greetings/hello.txt
aws s3api head-object --bucket $B --key greetings/hello.txt

# 4. Issue a presigned URL valid for 5 minutes and fetch it with curl
URL=$(aws s3 presign s3://$B/greetings/hello.txt --expires-in 300)
echo "$URL"
curl -s "$URL"

# 5. Also confirm that a direct unsigned request returns 403
curl -s -o /dev/null -w '%{http_code}\n' "https://$B.s3.$AWS_REGION.amazonaws.com/greetings/hello.txt"
```

### Expected output

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

`head-object` returns `ContentLength`, `ETag`, `ServerSideEncryption: AES256`, and more.

On the local silo server, step 2 returns `NotImplemented` (`get-public-access-block` / `get-bucket-ownership-controls`) and `ServerSideEncryptionConfigurationNotFoundError` (`get-bucket-encryption`), and `head-object` has no `ServerSideEncryption`. The presigned URL becomes `http://localhost:9000/local-l1/greetings/hello.txt?X-Amz-Algorithm=...`, and for step 5 use `curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:9000/$B/greetings/hello.txt"` instead (this also returns `403`).

### What you learned

- New buckets are "private, SSE-S3 encrypted, ACLs disabled (BucketOwnerEnforced)" from the start
- A presigned URL is created **purely by client-side computation**, with the signature embedded in the URL (Chapter 17, 3.9)
- The permissions and lifetime of the signing credentials become the permissions and lifetime of the URL

### Cleanup

```bash
aws s3 rb s3://$B --force
```

## Lab 2: Versioning and recovering deleted objects

### Goal

Enable versioning and recover an overwritten and deleted object from a previous version.

### Prerequisites

Same as Lab 1.

> **Verified locally** on 2026-10-03 with `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, AWS CLI 2.37.7: all steps and the cleanup pass.

### Steps

```bash
B=${LAB}-l2
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION
aws s3api put-bucket-versioning --bucket $B --versioning-configuration Status=Enabled

# Overwrite v1 → v2, then delete
echo v1 > doc.txt && aws s3 cp doc.txt s3://$B/doc.txt
echo v2 > doc.txt && aws s3 cp doc.txt s3://$B/doc.txt
aws s3 rm s3://$B/doc.txt

# It looks "gone"
aws s3 ls s3://$B/

# In reality, the versions and a delete marker remain
aws s3api list-object-versions --bucket $B --prefix doc.txt \
  --query '{Versions: Versions[].{V: VersionId, Latest: IsLatest, Size: Size}, Markers: DeleteMarkers[].{V: VersionId, Latest: IsLatest}}'
```

There are two ways to recover.

```bash
# Method A: Delete the delete marker (= the previous v2 becomes current again)
MARKER=$(aws s3api list-object-versions --bucket $B --prefix doc.txt \
  --query 'DeleteMarkers[?IsLatest].VersionId' --output text)
aws s3api delete-object --bucket $B --key doc.txt --version-id $MARKER
aws s3 cp s3://$B/doc.txt -    # => v2

# Method B: Copy an older version (v1) to make it current
# (after Method A, v2 is current, so the only noncurrent version is v1.
#  Sorting by LastModified is unreliable because it has 1-second precision.)
V1=$(aws s3api list-object-versions --bucket $B --prefix doc.txt \
  --query 'Versions[?!IsLatest].VersionId' --output text)
aws s3api copy-object --bucket $B --key doc.txt --copy-source "$B/doc.txt?versionId=$V1"
aws s3 cp s3://$B/doc.txt -    # => v1
```

### Expected output

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

The CLI actually prints JSON pretty-printed over multiple lines; it is shown compressed here. `aws s3 ls` prints nothing.

### What you learned

- With versioning enabled, `DeleteObject` (without a versionId) **only adds a delete marker**; no data is deleted
- Only a delete that specifies a versionId removes data permanently. MFA Delete and Object Lock (Lab 7) exist to prevent this
- Older versions are also billed, so run versioning together with a `NoncurrentVersionExpiration` lifecycle rule

### Cleanup

A versioned bucket is not emptied by `aws s3 rb --force` alone. Delete all versions and delete markers, then delete the bucket.

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

This `empty_versioned` function is reused in later labs. `delete-objects` exits with 0 even when some keys fail (they are reported in `Errors`), so the function checks `Errors` and stops. Without that check, versions protected by Object Lock (Lab 7) make the loop spin forever. `local` is declared outside the loop because in zsh, redeclaring an already set variable with `local` prints its value.

## Lab 3: Lifecycle and Intelligent-Tiering

### Goal

Configure different lifecycle rules per prefix and enable the Intelligent-Tiering archive tiers.

### Prerequisites

Same as Lab 1. Lifecycle rules are evaluated **asynchronously (roughly once a day)**, so this lab goes as far as "confirming through the API that the configuration is in effect".

> **Verified locally** on 2026-10-03 with `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, AWS CLI 2.37.7: only the `tmp/` expiration rule (see the note after the steps). Transitions, `AbortIncompleteMultipartUpload`, and Intelligent-Tiering require a real AWS account (not verified locally); their CLI arguments were confirmed against moto 5.2.3.

### Steps

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

# Objects under tmp/ get their scheduled expiration date in a header
echo x > t.txt && aws s3 cp t.txt s3://$B/tmp/t.txt
aws s3api head-object --bucket $B --key tmp/t.txt --query Expiration

# Intelligent-Tiering: store an object as INTELLIGENT_TIERING and enable the archive tiers
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

On the local silo server, `put-bucket-lifecycle-configuration` rejects the whole configuration (`InvalidArgument`), because Transitions (STANDARD_IA / GLACIER_IR need a configured remote tier: `InvalidStorageClass`) and `AbortIncompleteMultipartUpload` are not supported. `--storage-class INTELLIGENT_TIERING` fails with `InvalidStorageClass`, and the Intelligent-Tiering configuration API returns `MalformedXML` / `NotImplemented`. Locally, register only the expiration rule.

```bash
jq '{Rules: [.Rules[] | select(.ID == "tmp-expire-1day")]}' lifecycle.json > lifecycle-local.json
aws s3api put-bucket-lifecycle-configuration --bucket $B --lifecycle-configuration file://lifecycle-local.json
aws s3api get-bucket-lifecycle-configuration --bucket $B --query 'Rules[].ID'
aws s3 cp t.txt s3://$B/tmp/t.txt
aws s3api head-object --bucket $B --key tmp/t.txt --query Expiration
```

### Expected output

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

The `expiry-date` above is for an object created at 2026-10-03 01:00 JST (= 10-02 16:00 UTC). For an object created after 00:00 UTC on 10-03, it becomes `Mon, 05 Oct 2026 00:00:00 GMT` (the local silo run at 13:30 UTC returned exactly that).

### What you learned

- Lifecycle days are "counted from midnight UTC on the day after creation", so the date in the `Expiration` header is the creation date + N days, rounded
- Transitions to STANDARD_IA / ONEZONE_IA require **at least 30 days after creation**, and objects smaller than 128 KB are not transitioned by default
- The Intelligent-Tiering access tiers (Frequent / Infrequent / Archive Instant) are automatic, while the Archive / Deep Archive tiers are **opt-in**, and reading an object that has moved there requires `RestoreObject`
- `AbortIncompleteMultipartUpload` is a guard against "invisible garbage" that every bucket should have

### Cleanup

```bash
aws s3 rb s3://$B --force
rm -f lifecycle.json lifecycle-local.json itier.json t.txt
```

## Lab 4: Static site delivery with CloudFront + OAC

### Goal

Keep the bucket private and serve it only through CloudFront Origin Access Control (OAC).

### Prerequisites

Real AWS. CloudFront is a global service, so creation and deletion take a few minutes to about 15 minutes to propagate.

> **Requires a real AWS account (not verified locally).** On 2026-10-03, every step and the cleanup were sent to a local mock (moto 5.2.3 server) with AWS CLI 2.37.7 to confirm that the CLI accepts the arguments (`create-origin-access-control` shorthand, `dist.json`, `update-distribution` / `delete-*` with `--if-match`). Actual delivery through CloudFront and the 403 on direct access were not verified.

### Steps

```bash
B=${LAB}-l4
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION
echo '<h1>Hello from S3 via CloudFront</h1>' > index.html
aws s3 cp index.html s3://$B/index.html --content-type text/html

# 1. Create the OAC
OAC_ID=$(aws cloudfront create-origin-access-control --origin-access-control-config \
  "Name=${B}-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
  --query OriginAccessControl.Id --output text)

# 2. Create the distribution (using the CachingOptimized managed policy)
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

# 3. Use a bucket policy to allow access "only from this distribution"
cat > policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {"Sid": "AllowCloudFrontOAC", "Effect": "Allow", "Principal": {"Service": "cloudfront.amazonaws.com"}, "Action": "s3:GetObject", "Resource": "arn:aws:s3:::${B}/*", "Condition": {"StringEquals": {"AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}"}}}
  ]
}
EOF
aws s3api put-bucket-policy --bucket $B --policy file://policy.json

# 4. Wait for deployment to finish, then verify
aws cloudfront wait distribution-deployed --id $DIST_ID
curl -s https://$DIST_DOMAIN/
curl -s -o /dev/null -w '%{http_code}\n' https://$B.s3.$AWS_REGION.amazonaws.com/index.html
```

### Expected output

```text
E2ABCDEXAMPLE d111111abcdef8.cloudfront.net
<h1>Hello from S3 via CloudFront</h1>
403
```

### What you learned

- With OAC, CloudFront **signs origin requests with SigV4**. It is recommended over the legacy OAI and can also handle SSE-KMS encrypted objects (grant CloudFront `kms:Decrypt` in the KMS key policy)
- Block Public Access can stay fully ON (the principal is an AWS service and the statement is conditional, so it is not treated as public)
- The S3 "static website hosting" endpoint is HTTP-only and cannot be combined with OAC. Handle SPA routing with CloudFront custom error responses or CloudFront Functions

### Cleanup

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

## Lab 5: Event notifications → Lambda thumbnail generation

### Goal

When an image lands in `uploads/`, a Lambda function runs and writes a resized image to a separate bucket.

### Prerequisites

Real AWS (or LocalStack). Python 3.13 and pip. **Always use separate buckets for input and output** (writing to the same bucket makes the function retrigger on its own output, creating an infinite loop that runs up charges).

> **Requires a real AWS account (not verified locally).** On 2026-10-03, the S3 / IAM / Lambda commands and the cleanup were sent to a local mock (moto 5.2.3 server) with AWS CLI 2.37.7 to confirm that the CLI accepts the arguments, and the `pip install` in step 2 was confirmed to fetch the Python 3.13 x86_64 wheel (Pillow 12.2.0). `app.py` itself was run outside Lambda with a hand-made S3 event and wrote an 821-byte `thumbs/test.png.jpg`. Execution inside Lambda, the S3 → Lambda trigger, and CloudWatch Logs were not verified.

### Steps

```bash
SRC=${LAB}-l5-src
DST=${LAB}-l5-dst
for b in $SRC $DST; do
  aws s3api create-bucket --bucket $b --create-bucket-configuration LocationConstraint=$AWS_REGION
done

# 1. Lambda code
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

# 2. Bundle Pillow as a wheel built for Lambda (Amazon Linux, x86_64)
pip install --target l5/pkg --platform manylinux2014_x86_64 \
  --implementation cp --python-version 3.13 --only-binary=:all: pillow
(cd l5/pkg && zip -qr ../fn.zip .)

# 3. Execution role
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
sleep 10   # Wait for IAM propagation

# 4. Create the function
FN_ARN=$(aws lambda create-function --function-name ${LAB}-thumb \
  --runtime python3.13 --handler app.handler --role $ROLE_ARN \
  --zip-file fileb://l5/fn.zip --timeout 30 --memory-size 512 \
  --environment "Variables={DST_BUCKET=$DST}" --query FunctionArn --output text)
aws lambda wait function-active-v2 --function-name ${LAB}-thumb

# 5. Allow invocation from S3 and configure the notification
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

# 6. Generate a test image and upload it
# (build a 640x480 solid-color PNG using only the standard library)
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

### Expected output

```text
2026-10-03 01:20:00        821 test.png.jpg
... START RequestId: ...
... thumbnail written for s3://s3lab-111122223333-a1b2c3-l5-src/uploads/test.png
... END RequestId: ...
```

### What you learned

- S3 event notifications are **at-least-once** and occasionally arrive duplicated or out of order. Make processing idempotent (for example, derive the output key from the input key)
- Keys in events are URL-encoded (`unquote_plus` is required)
- If you need filters more complex than prefix / suffix, or multiple targets, enable `EventBridgeConfiguration` and route with EventBridge rules

### Cleanup

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

## Lab 6: Cross-Region Replication (CRR)

### Goal

Automatically replicate writes to a bucket in Tokyo (ap-northeast-1) to a bucket in Osaka (ap-northeast-3).

### Prerequisites

Real AWS. **Inter-Region data transfer charges** apply in proportion to the replicated volume (negligible here, since this lab moves a few KB).

> **Requires a real AWS account (not verified locally).** On 2026-10-03, every step and the cleanup were sent to a local mock (moto 5.2.3 server) with AWS CLI 2.37.7 to confirm that the CLI accepts the arguments (`repl.json` was accepted and read back by `get-bucket-replication`). Actual replication and the `PENDING` → `COMPLETED` / `REPLICA` status changes were not verified.

### Steps

```bash
SRC=${LAB}-l6-tokyo
DST=${LAB}-l6-osaka
aws s3api create-bucket --bucket $SRC --create-bucket-configuration LocationConstraint=ap-northeast-1
aws s3api create-bucket --bucket $DST --region ap-northeast-3 --create-bucket-configuration LocationConstraint=ap-northeast-3
# Replication requires versioning on both sides
aws s3api put-bucket-versioning --bucket $SRC --versioning-configuration Status=Enabled
aws s3api put-bucket-versioning --bucket $DST --region ap-northeast-3 --versioning-configuration Status=Enabled

# Replication role
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

# Write an object and watch its status
echo "replicate me" > r.txt && aws s3 cp r.txt s3://$SRC/r.txt
aws s3api head-object --bucket $SRC --key r.txt --query ReplicationStatus
sleep 30
aws s3api head-object --bucket $SRC --key r.txt --query ReplicationStatus
aws s3api head-object --bucket $DST --key r.txt --region ap-northeast-3 \
  --query '{Status: ReplicationStatus, Class: StorageClass, Version: VersionId}'
```

### Expected output

```text
"PENDING"
"COMPLETED"
{"Status": "REPLICA", "Class": "STANDARD_IA", "Version": "w8A... (same version ID as the source)"}
```

### What you learned

- Replication applies only to **objects written after it is configured**. Push existing objects through S3 Batch Replication (`S3ReplicateObject` in `s3control create-job`)
- The source moves from `PENDING` to `COMPLETED` / `FAILED`, and the destination shows `REPLICA`. Version IDs are preserved
- Most objects replicate within 15 minutes, but there is no SLA. If you need one, enable Replication Time Control (RTC, 99.99% within 15 minutes) (extra charge)
- You can change the storage class on the destination side, so DR copies can sit in a cheaper class

### Cleanup

```bash
aws s3api delete-bucket-replication --bucket $SRC
empty_versioned $SRC && aws s3api delete-bucket --bucket $SRC
AWS_REGION=ap-northeast-3 empty_versioned $DST && aws s3api delete-bucket --bucket $DST --region ap-northeast-3
aws iam delete-role-policy --role-name ${LAB}-l6-repl --policy-name repl
aws iam delete-role --role-name ${LAB}-l6-repl
rm -f trust.json repl-policy.json repl.json r.txt
```

## Lab 7: WORM protection with Object Lock

### Goal

Prevent deletion and overwriting of versions with a GOVERNANCE-mode retention period and a legal hold.

### Prerequisites

Real AWS or a MinIO-compatible server. **Never use COMPLIANCE mode** (until the retention date passes, not even the root user can delete the version, and the bucket cannot be deleted either). In this lab the retention date is set to "3 minutes from now".

> **Verified locally** on 2026-10-03 with `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, AWS CLI 2.37.7: all steps and the cleanup pass (including `sleep 180`). The `--bypass-governance-retention` delete in the comment also worked. Only the error on the rejected delete differs (see the expected output).

### Steps

```bash
B=${LAB}-l7
# Create with Object Lock enabled (versioning is enabled automatically too)
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION \
  --object-lock-enabled-for-bucket
aws s3api get-object-lock-configuration --bucket $B

echo "audit log" > audit.txt
VID=$(aws s3api put-object --bucket $B --key audit.txt --body audit.txt \
  --query VersionId --output text)

# Retain in GOVERNANCE mode for 3 minutes (macOS date; with GNU date use -d '+3 minutes')
UNTIL=$(date -u -v+3M +%Y-%m-%dT%H:%M:%SZ)
aws s3api put-object-retention --bucket $B --key audit.txt --version-id $VID \
  --retention "Mode=GOVERNANCE,RetainUntilDate=$UNTIL"
aws s3api get-object-retention --bucket $B --key audit.txt --version-id $VID

# Trying to delete the version is rejected
aws s3api delete-object --bucket $B --key audit.txt --version-id $VID

# With the s3:BypassGovernanceRetention permission you can bypass it explicitly (= what GOVERNANCE means)
# aws s3api delete-object --bucket $B --key audit.txt --version-id $VID --bypass-governance-retention

# Legal hold: a retention flag with no expiry
aws s3api put-object-legal-hold --bucket $B --key audit.txt --version-id $VID --legal-hold Status=ON
aws s3api get-object-legal-hold --bucket $B --key audit.txt --version-id $VID
```

### Expected output

```text
{"ObjectLockConfiguration": {"ObjectLockEnabled": "Enabled"}}
{"Retention": {"Mode": "GOVERNANCE", "RetainUntilDate": "2026-10-03T01:33:00+00:00"}}
aws: [ERROR]: An error occurred (AccessDenied) when calling the DeleteObject operation: Access Denied because object protected by object lock.
{"LegalHold": {"Status": "ON"}}
```

AWS CLI 2.37 prefixes error lines with `aws: [ERROR]:`. On the local silo server, the delete fails with `An error occurred (InvalidRequest) when calling the DeleteObject operation: Object is WORM protected and cannot be overwritten` instead, and the version IDs are UUIDs.

### What you learned

- Object Lock protects **individual versions**. A DELETE without a versionId only adds a delete marker, so it succeeds normally (the data stays protected)
- GOVERNANCE can be bypassed with a privilege (`s3:BypassGovernanceRetention`); COMPLIANCE cannot be bypassed by anyone
- A legal hold has no expiry. It can be turned ON / OFF independently of the retention period
- You can also enable it later on an existing bucket with `put-object-lock-configuration` (versioning must be enabled)

### Cleanup

```bash
aws s3api put-object-legal-hold --bucket $B --key audit.txt --version-id $VID --legal-hold Status=OFF
sleep 180   # Wait for the retention period to pass (or delete with --bypass-governance-retention)
empty_versioned $B && aws s3api delete-bucket --bucket $B
rm -f audit.txt
```

If you run `empty_versioned` before the retention date passes, it stops with `delete-objects: 1 object(s) could not be deleted` (that is what the `Errors` check in Lab 2 is for). Wait and run it again.

## Lab 8: Bucket policies and debugging 403s

### Goal

Trigger 403s on purpose and learn the procedure for isolating "which statement in which policy is the cause".

### Prerequisites

Real AWS. You will create one IAM role that can be assumed within your own account.

> **Requires a real AWS account (not verified locally).** On 2026-10-03, every step and the cleanup were sent to a local mock (moto 5.2.3 server) with AWS CLI 2.37.7 to confirm that the CLI accepts the arguments and that the `eval $(aws sts assume-role ... | awk ...)` line exports the three variables. The mock does not evaluate policies, so the 403s and their messages were not verified. The CLI-side formats in the expected output (`download failed: ...` / `aws: [ERROR]: ...`) were confirmed with AWS CLI 2.37.7.

### Steps

```bash
B=${LAB}-l8
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION
echo secret > s.txt && aws s3 cp s.txt s3://$B/team-a/s.txt

# 1. Create a role that allows only GetObject (no ListBucket)
aws iam create-role --role-name ${LAB}-l8-reader --assume-role-policy-document "{
  \"Version\": \"2012-10-17\", \"Statement\": [{\"Effect\": \"Allow\",
  \"Principal\": {\"AWS\": \"arn:aws:iam::${ACCOUNT_ID}:root\"}, \"Action\": \"sts:AssumeRole\"}]}" > /dev/null
aws iam put-role-policy --role-name ${LAB}-l8-reader --policy-name read --policy-document "{
  \"Version\": \"2012-10-17\", \"Statement\": [{\"Effect\": \"Allow\",
  \"Action\": \"s3:GetObject\", \"Resource\": \"arn:aws:s3:::$B/team-a/*\"}]}"
sleep 10

# 2. Assume the role and test
eval $(aws sts assume-role --role-arn arn:aws:iam::${ACCOUNT_ID}:role/${LAB}-l8-reader \
  --role-session-name lab8 --query 'Credentials.[AccessKeyId,SecretAccessKey,SessionToken]' --output text \
  | awk '{print "export AWS_ACCESS_KEY_ID="$1" AWS_SECRET_ACCESS_KEY="$2" AWS_SESSION_TOKEN="$3}')
aws sts get-caller-identity --query Arn
aws s3 cp s3://$B/team-a/s.txt -          # (a) Succeeds
aws s3 cp s3://$B/team-a/missing.txt -    # (b) Does not exist, yet returns 403 instead of 404
aws s3 cp s3://$B/team-b/x.txt -          # (c) 403 on a prefix outside the allowed one
aws s3 ls s3://$B/                        # (d) 403 because there is no ListBucket
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN

# 3. Explicit Deny in a bucket policy (deny HTTP + deny reads outside team-a)
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
  "http://$B.s3.$AWS_REGION.amazonaws.com/team-a/s.txt" | head -5   # (e) HTTP hits the explicit Deny
```

If `aws configure get` returns nothing (for example with SSO), run `eval $(aws configure export-credentials --format env)` first, then use `$AWS_ACCESS_KEY_ID` and friends, and add `-H "x-amz-security-token: $AWS_SESSION_TOKEN"`.

### Expected output

```text
"arn:aws:sts::111122223333:assumed-role/s3lab-...-l8-reader/lab8"
secret
download failed: s3://s3lab-...-l8/team-a/missing.txt to - An error occurred (403) when calling the HeadObject operation: Forbidden
download failed: s3://s3lab-...-l8/team-b/x.txt to - An error occurred (403) when calling the HeadObject operation: Forbidden
aws: [ERROR]: An error occurred (AccessDenied) when calling the ListObjectsV2 operation: User: arn:aws:sts::111122223333:assumed-role/s3lab-...-l8-reader/lab8 is not authorized to perform: s3:ListBucket on resource: "arn:aws:s3:::s3lab-...-l8" because no identity-based policy allows the s3:ListBucket action
<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>AccessDenied</Code><Message>User: ... is not authorized to perform: s3:GetObject on resource: "..." with an explicit deny in a resource-based policy</Message>...
```

### Isolating a 403

1. **Who** are you calling as: `aws sts get-caller-identity`. Mixing up profiles or environment variables is the most common cause
2. **Which API maps to which action**: `HeadObject` → `s3:GetObject`, `ListObjectsV2` → `s3:ListBucket` (on the bucket ARN, not `/*`)
3. **Read the error message**: within the same account, it states which kind of policy is the cause, such as "no identity-based policy allows", "explicit deny in a resource-based policy", or "explicit deny in a service control policy"
4. **404 turns into 403**: without `s3:ListBucket`, even a nonexistent key returns 403 (to prevent information leaks through existence checks)
5. **Easily overlooked sources of Deny**: SCPs / RCPs, VPC endpoint policies, access point policies, KMS key policies (SSE-KMS objects also need `kms:Decrypt`), Block Public Access, Object Ownership
6. **Simulation**: `aws iam simulate-principal-policy --policy-source-arn <role-arn> --action-names s3:GetObject --resource-arns arn:aws:s3:::bucket/key` evaluates identity-based policies only
7. **Check the records**: CloudTrail (with data events enabled) and server access logs record `errorCode=AccessDenied` and `x-amz-request-id`

### What you learned

- Evaluation is "explicit Deny > explicit Allow > implicit Deny". Within the same account, an Allow in either the identity-based or the resource-based policy is enough; cross-account access needs both
- A Deny on `aws:SecureTransport` is a standard guardrail every bucket should have

### Cleanup

```bash
aws s3api delete-bucket-policy --bucket $B
aws s3 rb s3://$B --force
aws iam delete-role-policy --role-name ${LAB}-l8-reader --policy-name read
aws iam delete-role --role-name ${LAB}-l8-reader
rm -f s.txt deny.json
```

## Lab 9: Manual multipart upload with s3api

### Goal

Run the multipart upload that `aws s3 cp` performs behind the scenes, one step at a time, using five APIs.

### Prerequisites

Real AWS or a MinIO-compatible server.

> **Verified locally** on 2026-10-03 with `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, AWS CLI 2.37.7: all steps and the cleanup pass (the composite CRC32 `...-3` and `COMPOSITE` were returned as expected).

### Steps

```bash
B=${LAB}-l9
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION

# Split a 12 MiB file into 5 MiB pieces (only the last part is 2 MiB)
dd if=/dev/urandom of=big.bin bs=1048576 count=12 2>/dev/null
split -b 5m big.bin part-
ls -l part-*

# 1. Initiate (specifying the checksum algorithm up front keeps later steps simple)
UPLOAD_ID=$(aws s3api create-multipart-upload --bucket $B --key big.bin \
  --checksum-algorithm CRC32 --query UploadId --output text)

# 2. Upload the parts in sequence (any order or in parallel also works)
n=1
for p in part-*; do
  aws s3api upload-part --bucket $B --key big.bin --upload-id "$UPLOAD_ID" \
    --part-number $n --body $p --checksum-algorithm CRC32 --query ETag --output text
  n=$((n+1))
done

# 3. Check progress
aws s3api list-multipart-uploads --bucket $B --query 'Uploads[].{Key: Key, Id: UploadId}'
aws s3api list-parts --bucket $B --key big.bin --upload-id "$UPLOAD_ID" \
  --query 'Parts[].{N: PartNumber, Size: Size, ETag: ETag}'

# 4. Assemble the part list and complete
aws s3api list-parts --bucket $B --key big.bin --upload-id "$UPLOAD_ID" \
  --query '{Parts: Parts[].{PartNumber: PartNumber, ETag: ETag, ChecksumCRC32: ChecksumCRC32}}' > parts.json
aws s3api complete-multipart-upload --bucket $B --key big.bin --upload-id "$UPLOAD_ID" \
  --multipart-upload file://parts.json

# 5. Verify the result
aws s3api head-object --bucket $B --key big.bin --checksum-mode ENABLED \
  --query '{Size: ContentLength, ETag: ETag, CRC32: ChecksumCRC32, Type: ChecksumType}'
aws s3api get-object-attributes --bucket $B --key big.bin --object-attributes ObjectParts \
  --query 'ObjectParts.TotalPartsCount'
aws s3 cp s3://$B/big.bin downloaded.bin && cmp big.bin downloaded.bin && echo "identical"

# Bonus: create an abandoned upload and abort it
ID2=$(aws s3api create-multipart-upload --bucket $B --key orphan.bin --query UploadId --output text)
aws s3api abort-multipart-upload --bucket $B --key orphan.bin --upload-id "$ID2"
```

### Expected output

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

With `--output text`, the ETag is printed with its surrounding double quotes as is (`"9b2c..."`).

### What you learned

- Parts are 5 MiB to 5 GiB (the last part may be smaller), with up to 10,000 parts and a maximum object size of 50 TB (48.8 TiB)
- A multipart ETag is "the MD5 of the concatenated per-part MD5s + `-<part count>`", not the MD5 of the whole file. Use flexible checksums to verify integrity
- Parts of uploads that are neither completed nor aborted **are billed while staying invisible**. Check with `ListMultipartUploads` and clean up automatically with the lifecycle `AbortIncompleteMultipartUpload` action (Lab 3)

### Cleanup

```bash
aws s3 rb s3://$B --force
rm -f big.bin downloaded.bin part-* parts.json
```

## Lab 10: Query S3 data and S3 Tables with Athena

### Goal

(A) Read a CSV in a regular bucket with SQL as an Athena external table. (B) Create an Iceberg table in an S3 Tables table bucket and INSERT / SELECT from Athena.

### Prerequisites

Real AWS. Athena bills by data scanned (KB-scale in this lab). S3 Tables bills for storage, requests, and maintenance (compaction).

> **Requires a real AWS account (not verified locally).** On 2026-10-03, the commands were sent to a local mock (moto 5.2.3 server) with AWS CLI 2.37.7 to confirm that the CLI accepts the arguments: the `athena` helper and the `s3tables` create / list / delete commands (including the `--metadata` schema) ran through, and `glue create-catalog` passed CLI validation (the mock does not implement it). The SQL results (DDL, `MSCK REPAIR`, `INSERT`, `$snapshots`) were not verified.

### Steps (A): General purpose bucket + external table

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

athena() {  # Small helper that submits SQL and prints the result
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

The `athena` helper writes `--query-execution-context` and its value as two separate expansions so that it also works in zsh (the macOS default), where unquoted expansions are not word-split and `${CTX:+--query-execution-context "$CTX"}` would reach the CLI as a single argument.

### Steps (B): S3 Tables

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

# Integration with AWS analytics services (once per Region). Does the same as "Enable integration" in the console, via the CLI
aws glue create-catalog --name s3tablescatalog --catalog-input "{
  \"FederatedCatalog\": {\"Identifier\": \"arn:aws:s3tables:${AWS_REGION}:${ACCOUNT_ID}:bucket/*\", \"ConnectionName\": \"aws:s3tables\"},
  \"CreateDatabaseDefaultPermissions\": [{\"Principal\": {\"DataLakePrincipalIdentifier\": \"IAM_ALLOWED_PRINCIPALS\"}, \"Permissions\": [\"ALL\"]}],
  \"CreateTableDefaultPermissions\": [{\"Principal\": {\"DataLakePrincipalIdentifier\": \"IAM_ALLOWED_PRINCIPALS\"}, \"Permissions\": [\"ALL\"]}]}"

# Aggregate from the external table in (A), write into S3 Tables, and read it back
CTX="Catalog=s3tablescatalog/$TB,Database=analytics"
athena "INSERT INTO daily_sales
  SELECT region, sum(amount), order_date FROM awsdatacatalog.s3lab.sales GROUP BY region, order_date"
athena "SELECT * FROM daily_sales ORDER BY dt, region"
athena "SELECT snapshot_id, operation FROM \"daily_sales\$snapshots\""
unset CTX
```

If `s3tablescatalog` already exists (integration already enabled in the console), `create-catalog` fails with `AlreadyExistsException`, which is fine.

### Expected output

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

### What you learned

- An external table just registers "an S3 path + a schema" in the catalog. Narrowing the range read with partitions (`dt=...`) is the key to cost and speed
- S3 Tables holds Iceberg tables **managed on the S3 side** and runs compaction and snapshot expiration automatically. Table bucket → namespace → table appears in Glue as "subcatalog → database → table"
- Because it is Iceberg, snapshot history (`$snapshots`) and time travel are available

### Cleanup

```bash
aws s3tables delete-table --table-bucket-arn $TB_ARN --namespace analytics --name daily_sales
aws s3tables delete-namespace --table-bucket-arn $TB_ARN --namespace analytics
aws s3tables delete-table-bucket --table-bucket-arn $TB_ARN
athena "DROP TABLE s3lab.sales"
athena "DROP DATABASE s3lab"
aws s3 rb s3://$B --force && aws s3 rb s3://$RES --force
rm -f sales.csv
# s3tablescatalog is shared with other table buckets, so keep it unless it was created only for this lab
```

## Lab 11: Store and search vectors with S3 Vectors

### Goal

Create a vector bucket and index, write vectors with metadata, and run (filtered) nearest-neighbor searches.

### Prerequisites

Real AWS (a Region where S3 Vectors is available). In production you would generate vectors with an embedding model such as one on Amazon Bedrock, but here we use hand-written 4-dimensional vectors to focus on the mechanism.

> **Requires a real AWS account (not verified locally).** On 2026-10-03, the commands were sent to a local mock (moto 5.2.3 server) with AWS CLI 2.37.7: `create-vector-bucket` / `create-index` / `put-vectors` / `get-vectors` / `delete-*` ran through, and `query-vectors` (including `--filter` and `--query-mode ENHANCED`) passed CLI validation (the mock does not implement it). The distances in the expected output were computed locally.

### Steps

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

# 1. Nearest-neighbor search without a filter (a "storage-like" query)
aws s3vectors query-vectors --vector-bucket-name $VB --index-name docs \
  --query-vector '{"float32": [0.85, 0.15, 0.05, 0.0]}' --top-k 3 \
  --return-distance --return-metadata --query 'vectors[].{key: key, d: distance, genre: metadata.genre}'

# 2. With a metadata filter
aws s3vectors query-vectors --vector-bucket-name $VB --index-name docs \
  --query-vector '{"float32": [0.85, 0.15, 0.05, 0.0]}' --top-k 3 \
  --filter '{"genre": {"$eq": "compute"}}' --return-distance \
  --query 'vectors[].{key: key, d: distance}'

# 3. Prefix match ($startsWith, added 2026-09) and a per-query mode setting
aws s3vectors query-vectors --vector-bucket-name $VB --index-name docs \
  --query-vector '{"float32": [0.85, 0.15, 0.05, 0.0]}' --top-k 3 \
  --filter '{"path": {"$startsWith": "/s3/"}}' --query-mode ENHANCED \
  --query 'vectors[].key'

aws s3vectors get-vectors --vector-bucket-name $VB --index-name docs --keys doc-1 --return-metadata
```

### Expected output

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

The distance is cosine distance (1 - cosine similarity), so smaller means closer. The values above are exact values computed locally; S3 Vectors uses approximate nearest neighbor (ANN) search, so the returned values may differ slightly in the decimal places.

### What you learned

- The structure is "vector bucket → index (dimension and distance metric fixed) → vectors (key + float32 array + metadata)"
- Metadata is filterable by default. Keys listed in `nonFilterableMetadataKeys` (such as body text) are return-only: they cannot be used in filters, but in exchange they can hold larger values
- Since 2026-09, `ENHANCED` mode (applies filters before the search) is available, so queries with highly selective filters are less likely to return too few results. Switch existing indexes with `UpdateIndexMode`
- It excels at holding large numbers of vectors at low cost. If you need high QPS and low latency, combine it with OpenSearch or similar

### Cleanup

```bash
aws s3vectors delete-index --vector-bucket-name $VB --index-name docs
aws s3vectors delete-vector-bucket --vector-bucket-name $VB
rm -f vectors.json
```

## Lab 12: Measure performance with s5cmd and warp

### Goal

Measure parallel transfers of many small files and throughput by object size, and experience the S3 performance fundamental that "parallelism is everything".

### Prerequisites

Real AWS (ideally from EC2 in the same Region; on a home connection the network becomes the bottleneck) or a MinIO-compatible server. **warp deletes everything in the target bucket before and after the benchmark**, so always use a dedicated empty bucket.

> **Verified locally** on 2026-10-03 with `docker.io/pgsty/silo:RELEASE.2026-09-16T00-00-00Z`, AWS CLI 2.37.7, s5cmd v2.3.0 (`peakcom/s5cmd`), and warp 1.3.1 (`minio/warp`): the AWS CLI / s5cmd steps, the local warp command, and the cleanup pass. The real AWS warp commands require a real AWS account (not verified locally).

### Steps: Upload comparison with 2,000 small files

```bash
B=${LAB}-l12
aws s3api create-bucket --bucket $B --create-bucket-configuration LocationConstraint=$AWS_REGION
mkdir -p small && for i in $(seq 1 2000); do head -c 16384 /dev/urandom > small/f$i.bin; done

# AWS CLI (default concurrency 10)
time aws s3 cp small s3://$B/cli/ --recursive --quiet

# Raise the AWS CLI concurrency (applies to the profile in use; add --profile minio locally)
aws configure set s3.max_concurrent_requests 64
time aws s3 cp small s3://$B/cli64/ --recursive --quiet
aws configure set s3.max_concurrent_requests 10

# s5cmd (256 workers by default)
time s5cmd cp 'small/*' s3://$B/s5cmd/
time s5cmd --numworkers 32 cp 'small/*' s3://$B/s5cmd32/

# One large file: vary the part parallelism (concurrency)
head -c $((512*1024*1024)) /dev/urandom > large.bin
time s5cmd cp --concurrency 5  large.bin s3://$B/large-c5.bin
time s5cmd cp --concurrency 32 large.bin s3://$B/large-c32.bin
```

For a local MinIO-compatible server, add `s5cmd --endpoint-url http://localhost:9000` and set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` to the `minioadmin` credentials.

`default.s3.max_concurrent_requests` always writes to the `[default]` profile, so it has no effect on runs with `--profile minio`. `s3.max_concurrent_requests` writes to the profile in use.

If you do not want to install s5cmd / warp, you can run them as containers. With `--network container:s3lab-minio`, `localhost:9000` inside the container reaches silo.

```bash
s5cmd() {
  docker run --rm --network container:s3lab-minio -v "$PWD:/w" -w /w \
    -e AWS_ACCESS_KEY_ID=minioadmin -e AWS_SECRET_ACCESS_KEY=minioadmin-change-me \
    docker.io/peakcom/s5cmd:latest --endpoint-url http://localhost:9000 "$@"
}
warp() { docker run --rm --network container:s3lab-minio docker.io/minio/warp:latest "$@"; }
```

### Steps: Generate load with warp

```bash
WB=${LAB}-l12-warp
aws s3api create-bucket --bucket $WB --create-bucket-configuration LocationConstraint=$AWS_REGION

eval $(aws configure export-credentials --format env)
# With temporary credentials (SSO / AssumeRole), warp reads the session token from WARP_SESSION_TOKEN (or --session-token)
export WARP_SESSION_TOKEN=${AWS_SESSION_TOKEN:-}
warp put   --host s3.$AWS_REGION.amazonaws.com --tls --region $AWS_REGION --bucket $WB \
  --access-key $AWS_ACCESS_KEY_ID --secret-key $AWS_SECRET_ACCESS_KEY \
  --obj.size 1MiB --concurrent 32 --duration 1m
warp mixed --host s3.$AWS_REGION.amazonaws.com --tls --region $AWS_REGION --bucket $WB \
  --access-key $AWS_ACCESS_KEY_ID --secret-key $AWS_SECRET_ACCESS_KEY \
  --obj.size 64KiB --concurrent 64 --duration 2m --autoterm

# Local (MinIO-compatible) case (without --bucket, warp creates and leaves behind warp-benchmark-bucket)
warp mixed --host localhost:9000 --access-key minioadmin --secret-key minioadmin-change-me \
  --bucket $WB --obj.size 1MiB --concurrent 16 --duration 1m
```

### Expected output

The numbers depend on your environment, so only the shape is shown.

```text
aws s3 cp (10 parallel)  real    1m10s
aws s3 cp (64 parallel)  real    0m15s
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

On a local server, the machine's CPU becomes the bottleneck, so the gap between parallelism settings is small (in the 2026-10-03 run, 2,000 files took about 5 s with the AWS CLI and about 3 s with s5cmd, and warp mixed reached a total of 225 MiB/s).

### What you learned

- Per-connection bandwidth and latency do not change much. **Throughput scales with the number of parallel connections** (file-level parallelism for small files, part / Range parallelism for large ones)
- S3 scales automatically from roughly 3,500 PUT / 5,500 GET requests per second per prefix. Sudden spikes can temporarily return `503 SlowDown`, so design on the assumption of retries with exponential backoff
- For small objects, request charges dominate. Note that even uploading 2,000 files a few times incurs PUT charges
- For large production transfers, AWS CRT-based transfers (`aws configure set default.s3.preferred_transfer_client crt`) and Mountpoint for Amazon S3 are also worth comparing

### Cleanup

```bash
aws s3 rb s3://$B --force
aws s3 rb s3://$WB --force
rm -rf small large.bin
```

## Final cleanup check for all labs

Finally, check in one pass that no resources carrying the lab name remain.

```bash
aws s3api list-buckets --query "Buckets[?starts_with(Name, '${LAB}')].Name"
aws s3api list-buckets --region ap-northeast-3 --query "Buckets[?starts_with(Name, '${LAB}')].Name"
aws iam list-roles --query "Roles[?starts_with(RoleName, '${LAB}')].RoleName"
aws lambda list-functions --query "Functions[?starts_with(FunctionName, '${LAB}')].FunctionName"
aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='s3 lab 4'].Id"
aws s3tables list-table-buckets --query "tableBuckets[?starts_with(name, '${LAB}')].name"
aws s3vectors list-vector-buckets --query "vectorBuckets[?starts_with(vectorBucketName, '${LAB}')].vectorBucketName"
docker rm -f s3lab-minio s3lab-localstack 2>/dev/null
rm -rf minio-data   # Data directory of the local silo server (on Linux, sudo may be needed)
```

If everything is empty (`[]`), you are done.

## References

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
- Uploading objects (50 TB maximum object size): <https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html>
- peak/s5cmd: <https://github.com/peak/s5cmd>
- minio/warp: <https://github.com/minio/warp>
- pgsty/silo (community fork of the MinIO server): <https://github.com/pgsty/silo>
- Background on the end of MinIO Docker image distribution (michelangelo-ai/michelangelo issue #672): <https://github.com/michelangelo-ai/michelangelo/issues/672>
- LocalStack image requires authentication from March 23, 2026 (testcontainers-rs-modules-community issue #465): <https://github.com/testcontainers/testcontainers-rs-modules-community/issues/465>
- AWS CLI: Configuration and credential file settings (endpoint_url / s3 settings): <https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html>
