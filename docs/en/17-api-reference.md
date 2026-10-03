# The S3 API at a glance

_Last verified: 2026-10-03_

This chapter covers the S3 API **as a wire protocol**. First it explains what the CLI and SDKs actually send under the hood (endpoints, SigV4 signing, headers, error format). Then it lists **every operation** on the "Actions" page of the Amazon S3 API Reference, grouped by category, with a one-line description each. The operation lists were cross-checked against the Actions pages of the API Reference and the botocore service models bundled with AWS CLI v2.37.7 (`s3/2006-03-01`, `s3control/2018-08-20`, `s3tables/2018-05-10`, `s3vectors/2025-07-15`, `s3outposts/2017-07-25`, `s3files/2025-05-05`), and the names and counts match exactly. A machine-readable version is in `data/api.json`.

## 1. The S3 API families

Under the S3 name there are six separate APIs, each with its own protocol and endpoint.

| Service (CLI name)                   | Scope                                                                                                        | Protocol    | Signing service name                                                 | Example endpoint                                         | Operations |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| Amazon S3 (`s3api`)                  | Objects, general purpose / directory bucket configuration                                                    | REST + XML  | `s3` (the Zonal API for directory buckets uses `s3express` sessions) | `https://{bucket}.s3.{region}.amazonaws.com`             | 116        |
| Amazon S3 Control (`s3control`)      | Account-level settings, access points, Batch Operations, Access Grants, Storage Lens, MRAP, Outposts buckets | REST + XML  | `s3`                                                                 | `https://{account-id}.s3-control.{region}.amazonaws.com` | 97         |
| Amazon S3 Tables (`s3tables`)        | Table buckets, namespaces, Iceberg tables                                                                    | REST + JSON | `s3tables`                                                           | `https://s3tables.{region}.amazonaws.com`                | 49         |
| Amazon S3 Vectors (`s3vectors`)      | Vector buckets, indexes, vectors                                                                             | REST + JSON | `s3vectors`                                                          | `https://s3vectors.{region}.api.aws`                     | 21         |
| Amazon S3 on Outposts (`s3outposts`) | Endpoints on Outposts                                                                                        | REST + JSON | `s3-outposts`                                                        | `https://s3-outposts.{region}.amazonaws.com`             | 5          |
| Amazon S3 Files (`s3files`)          | Turns S3 buckets into mountable file systems                                                                 | REST + JSON | `s3files`                                                            | `https://s3files.{region}.api.aws`                       | 21         |

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

`aws s3` (the high-level commands: `cp` / `sync` / `ls` / `presign`) is not a separate API. It is a client-side wrapper that combines `s3api`-equivalent operations. For example, `aws s3 cp` automatically splits large files into `CreateMultipartUpload` → `UploadPart` × N → `CompleteMultipartUpload`.

## 2. Endpoints and addressing

### 2.1 General purpose buckets

| Style                     | URL                                                                          | Notes                                                                                                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Virtual-hosted-style      | `https://amzn-s3-demo-bucket.s3.ap-northeast-1.amazonaws.com/photos/cat.jpg` | Recommended. The bucket name goes in the hostname                                                                                                                     |
| Path-style                | `https://s3.ap-northeast-1.amazonaws.com/amzn-s3-demo-bucket/photos/cat.jpg` | For compatibility. AWS has announced its deprecation, so don't use it in new code. It is still used in cases such as bucket names that contain dots accessed over TLS |
| Dual-stack (IPv6)         | `https://amzn-s3-demo-bucket.s3.dualstack.ap-northeast-1.amazonaws.com`      | Supports both IPv4 and IPv6                                                                                                                                           |
| FIPS                      | `https://amzn-s3-demo-bucket.s3-fips.us-east-1.amazonaws.com`                | FIPS 140 validated endpoint (supported Regions only)                                                                                                                  |
| Transfer Acceleration     | `https://amzn-s3-demo-bucket.s3-accelerate.amazonaws.com`                    | Routed through CloudFront edges. Must be enabled with `PutBucketAccelerateConfiguration`                                                                              |
| Access point              | `https://{ap-name}-{account-id}.s3-accesspoint.{region}.amazonaws.com`       | Pass the ARN or alias to the SDK                                                                                                                                      |
| Multi-Region Access Point | `https://{mrap-alias}.accesspoint.s3-global.amazonaws.com`                   | Requires SigV4A (ECDSA) signing                                                                                                                                       |
| VPC interface endpoint    | `https://bucket.vpce-xxxx.s3.{region}.vpce.amazonaws.com`                    | Via PrivateLink                                                                                                                                                       |

The key (`photos/cat.jpg`) is sent as the path. Slashes are not encoded, but other reserved characters are URI-encoded. Operations that don't target a bucket, such as `ListBuckets`, go to `https://s3.{region}.amazonaws.com/`.

### 2.2 Directory buckets (S3 Express One Zone)

Directory buckets use two kinds of endpoints.

| Endpoint                 | URL format                                                  | APIs                                                                               |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Regional (control plane) | `https://s3express-control.{region}.amazonaws.com/{bucket}` | `CreateBucket` / `DeleteBucket` / `PutBucketPolicy` / `ListDirectoryBuckets`, etc. |
| Zonal (data plane)       | `https://{bucket}.s3express-{az-id}.{region}.amazonaws.com` | `CreateSession` / `GetObject` / `PutObject` / `RenameObject`, etc.                 |

Bucket names take the form `name--{az-id}--x-s3` (for example, `logs--apne1-az4--x-s3`). Zonal API requests are signed with **short-lived (5-minute) session credentials obtained from `CreateSession`**, and the token is sent in the `x-amz-s3session-token` header. The SDKs and CLI create and refresh sessions automatically, so you almost never need to do this by hand.

### 2.3 S3 Control / S3 Tables / S3 Vectors

```text
S3 Control : https://123456789012.s3-control.ap-northeast-1.amazonaws.com/v20180820/accesspoint/my-ap
             (the x-amz-account-id: 123456789012 header is also required)
S3 Tables  : https://s3tables.ap-northeast-1.amazonaws.com/buckets
S3 Vectors : https://s3vectors.ap-northeast-1.api.aws/QueryVectors
```

## 3. Walking through SigV4 signing by hand

Every request to S3 (except for anonymous access to public objects) is signed with AWS Signature Version 4. SigV2 has long been unavailable. This section uses the official test vector from the S3 Developer Guide (GET `/test.txt`, `Range: bytes=0-9`); we computed it in Node.js and confirmed it matches the official signature `f0e8bdb8...`.

### 3.1 Overall flow

```text
 1. CanonicalRequest  = METHOD \n URI \n QUERY \n HEADERS \n \n SIGNED_HEADERS \n HASHED_PAYLOAD
 2. StringToSign      = "AWS4-HMAC-SHA256" \n TIMESTAMP \n SCOPE \n Hex(SHA256(CanonicalRequest))
 3. SigningKey        = HMAC(HMAC(HMAC(HMAC("AWS4"+Secret, Date), Region), "s3"), "aws4_request")
 4. Signature         = Hex(HMAC(SigningKey, StringToSign))
 5. Authorization: AWS4-HMAC-SHA256 Credential=AKID/SCOPE, SignedHeaders=..., Signature=...
```

### 3.2 Step 1: Canonical Request

The test inputs are as follows.

| Item              | Value                                      |
| ----------------- | ------------------------------------------ |
| Access Key ID     | `AKIAIOSFODNN7EXAMPLE`                     |
| Secret Access Key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| Bucket / key      | `examplebucket` / `test.txt`               |
| Timestamp         | `20130524T000000Z`                         |
| Region / service  | `us-east-1` / `s3`                         |

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

Key rules:

- Line 1 is the HTTP method; line 2 is the URI-encoded path (S3 does not encode `/` in keys and **does not double-encode**)
- Line 3 is the query string. Sort by key name and join `key=value` pairs with `&`. Write valueless subresources with a trailing `=`, as in `versioning=`. Here it is an empty line
- Lowercase header names, trim leading and trailing whitespace from values, and sort by name. End with one blank line
- `SignedHeaders` lists the signed header names separated by `;`. `host` and `x-amz-*` must always be included
- The last line is the same value as `x-amz-content-sha256` (here, the SHA-256 of an empty body)

### 3.3 Step 2: String to Sign

```text
AWS4-HMAC-SHA256
20130524T000000Z
20130524/us-east-1/s3/aws4_request
7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972
```

Line 4 is the SHA-256 of the Canonical Request (lowercase hex). The `date/Region/service/aws4_request` on line 3 is called the **credential scope**.

### 3.4 Steps 3–4: Signing key and signature

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

The signing key is determined by the date, Region, and service, so you can cache and reuse it for requests on the same day.

### 3.5 Step 5: Authorization header

```http
GET /test.txt HTTP/1.1
Host: examplebucket.s3.amazonaws.com
Range: bytes=0-9
x-amz-content-sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
x-amz-date: 20130524T000000Z
Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41
```

With temporary credentials (STS / IAM roles), add the `x-amz-security-token` header and include it in the signed headers. If `x-amz-date` differs from the server's clock by more than 15 minutes, the server returns `RequestTimeTooSkewed`.

### 3.6 Payload handling: values of `x-amz-content-sha256`

Unlike other AWS services, S3 **requires the `x-amz-content-sha256` header**, and its value declares how the body is handled.

| Value                                                      | Meaning                                                          | Typical use                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| SHA-256 of the body (hex)                                  | Single-chunk signed payload                                      | Small PUTs, XML configuration APIs                              |
| `UNSIGNED-PAYLOAD`                                         | Body is not included in the signature (TLS guarantees integrity) | Large uploads, presigned URLs (always this)                     |
| `STREAMING-AWS4-HMAC-SHA256-PAYLOAD`                       | Split with `aws-chunked`, with a chained signature on each chunk | Streams whose hash can't be precomputed                         |
| `STREAMING-AWS4-HMAC-SHA256-PAYLOAD-TRAILER`               | The above, plus a signed trailer (checksum) at the end           | Signed streams + flexible checksums                             |
| `STREAMING-UNSIGNED-PAYLOAD-TRAILER`                       | Chunks are unsigned; only the checksum is sent in a trailer      | Default for PutObject / UploadPart in current SDKs (over HTTPS) |
| `STREAMING-AWS4-ECDSA-P256-SHA256-PAYLOAD` / `...-TRAILER` | Chunk signing with SigV4A (for MRAP)                             | Multi-Region Access Points                                      |

A bucket policy can use the `s3:x-amz-content-sha256` condition key to, for example, deny UNSIGNED-PAYLOAD (this is why the CDK `BucketDeployment` has a `signContent` option).

### 3.7 Structure of chunk signing (aws-chunked)

With `STREAMING-AWS4-HMAC-SHA256-PAYLOAD`, a **seed signature** is first computed from the headers alone (it goes in the Authorization header), and each chunk's signature is chained by including the previous signature.

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

The String to Sign for a chunk signature looks like this.

```text
AWS4-HMAC-SHA256-PAYLOAD
<timestamp>
<scope>
<previous-signature>
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
<Hex(SHA256(chunk-data))>
```

- Every chunk except the last must be at least 8 KB (64 KB or more recommended)
- Terminate by sending a zero-length chunk
- `x-amz-decoded-content-length` is the length of the original data; `Content-Length` is the transmitted length including chunk metadata (omit it when using `Transfer-Encoding`)

### 3.8 Trailing checksums

A mechanism for sending a flexible checksum (CRC32 / CRC32C / CRC64NVME / SHA-1 / SHA-256, etc.) after the body has been read. This is the SDK default behavior.

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

The signed variant (`...-PAYLOAD-TRAILER`) adds a final `x-amz-trailer-signature:<sig>` line. S3 computes the same checksum on the server side and rejects the write with a `BadDigest`-type error if they don't match.

### 3.9 Presigned URLs (query string authentication)

The signature goes in the query string instead of a header. The URL carries `X-Amz-Algorithm` / `X-Amz-Credential` / `X-Amz-Date` / `X-Amz-Expires` (up to 604800 seconds = 7 days) / `X-Amz-SignedHeaders` / `X-Amz-Signature`. The payload is always treated as `UNSIGNED-PAYLOAD`. The effective lifetime is the shorter of the URL's Expires and the remaining lifetime of the credentials used to sign it (a URL signed with an IAM role's temporary credentials expires within hours).

```text
https://examplebucket.s3.amazonaws.com/test.txt
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256
  &X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request
  &X-Amz-Date=20130524T000000Z
  &X-Amz-Expires=86400
  &X-Amz-SignedHeaders=host
  &X-Amz-Signature=<64 hex>
```

## 4. Headers, errors, and request IDs

### 4.1 Common `x-amz-*` headers

| Header                                                                  | Direction | Meaning                                                                                         |
| ----------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `x-amz-date`                                                            | Req       | Signing time (ISO 8601 basic, UTC)                                                              |
| `x-amz-content-sha256`                                                  | Req       | Payload hash / signing mode (see 3.6)                                                           |
| `x-amz-security-token`                                                  | Req       | Session token for STS temporary credentials                                                     |
| `x-amz-s3session-token`                                                 | Req       | CreateSession token for directory buckets                                                       |
| `x-amz-expected-bucket-owner`                                           | Req       | Account ID of the bucket owner. Returns 403 on mismatch (protects against bucket name takeover) |
| `x-amz-request-payer: requester`                                        | Req       | Agrees to pay charges when accessing a Requester Pays bucket                                    |
| `x-amz-server-side-encryption`                                          | Req / Res | `AES256` / `aws:kms` / `aws:kms:dsse`                                                           |
| `x-amz-server-side-encryption-aws-kms-key-id`                           | Req / Res | Key ARN for SSE-KMS                                                                             |
| `x-amz-server-side-encryption-customer-algorithm` / `-key` / `-key-MD5` | Req       | SSE-C key (SSE-C is blocked by default on new buckets)                                          |
| `x-amz-storage-class`                                                   | Req / Res | `STANDARD` / `INTELLIGENT_TIERING` / `GLACIER_IR`, etc.                                         |
| `x-amz-meta-*`                                                          | Req / Res | User-defined metadata (up to 2 KB total)                                                        |
| `x-amz-tagging`                                                         | Req       | Adds tags on PUT in `k=v&k2=v2` form                                                            |
| `x-amz-acl` / `x-amz-grant-*`                                           | Req       | Canned ACL / explicit grants (not usable with BucketOwnerEnforced)                              |
| `x-amz-copy-source` / `x-amz-copy-source-range`                         | Req       | Source for CopyObject / UploadPartCopy                                                          |
| `x-amz-checksum-{crc32,crc32c,crc64nvme,sha1,sha256}`                   | Req / Res | Flexible checksums                                                                              |
| `x-amz-sdk-checksum-algorithm` / `x-amz-trailer`                        | Req       | Checksum algorithm / trailer declaration                                                        |
| `x-amz-object-lock-mode` / `-retain-until-date` / `-legal-hold`         | Req / Res | Object Lock                                                                                     |
| `x-amz-bypass-governance-retention`                                     | Req       | Bypasses GOVERNANCE-mode retention (requires permission)                                        |
| `x-amz-mfa`                                                             | Req       | Serial number + code for MFA Delete                                                             |
| `x-amz-website-redirect-location`                                       | Req       | Redirect target on the website endpoint                                                         |
| `If-Match` / `If-None-Match`                                            | Req       | Conditional reads and writes (`If-None-Match: *` makes a PUT that won't overwrite)              |
| `x-amz-version-id`                                                      | Res       | Version ID written or read                                                                      |
| `x-amz-delete-marker`                                                   | Res       | Whether the object is a delete marker                                                           |
| `x-amz-bucket-region`                                                   | Res       | The bucket's Region (returned by HeadBucket and 301 responses)                                  |
| `x-amz-request-id` / `x-amz-id-2`                                       | Res       | Request ID / extended request ID (required for support cases)                                   |

### 4.2 Error response format

`s3` / `s3control` return errors as XML; `s3tables` / `s3vectors` return JSON. S3 XML errors look like this (`HEAD` requests have no body, so you can only go by the status code).

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

| HTTP | Example codes                                                                                             | Typical cause                                                                      |
| ---- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 301  | `PermanentRedirect`                                                                                       | Sent to an endpoint in another Region. Check `x-amz-bucket-region`                 |
| 304  | (no body)                                                                                                 | Not modified per `If-None-Match` / `If-Modified-Since`                             |
| 400  | `InvalidArgument` / `InvalidRequest` / `EntityTooSmall` / `AuthorizationHeaderMalformed`                  | Invalid parameters, a part under 5 MiB, wrong Region in the scope                  |
| 403  | `AccessDenied` / `SignatureDoesNotMatch` / `InvalidAccessKeyId` / `RequestTimeTooSkewed` / `ExpiredToken` | Insufficient permissions, signature computation error, clock skew, expired token   |
| 404  | `NoSuchBucket` / `NoSuchKey` / `NoSuchUpload` / `NoSuchVersion`                                           | Does not exist (but without `s3:ListBucket` permission you get 403 instead of 404) |
| 405  | `MethodNotAllowed`                                                                                        | For example, a GET on a delete marker                                              |
| 409  | `BucketAlreadyExists` / `BucketNotEmpty` / `OperationAborted` / `ConditionalRequestConflict`              | Name collision, deleting a non-empty bucket, concurrent updates                    |
| 412  | `PreconditionFailed`                                                                                      | `If-Match` / `If-None-Match` did not match                                         |
| 416  | `InvalidRange`                                                                                            | Range is outside the object size                                                   |
| 500  | `InternalError`                                                                                           | Retryable                                                                          |
| 503  | `SlowDown` / `ServiceUnavailable`                                                                         | Per-prefix request rate exceeded. Retry with exponential backoff                   |

The `SignatureDoesNotMatch` error XML includes the `StringToSign` and `CanonicalRequest` that S3 computed, so when debugging your own implementation, the fastest approach is to diff them line by line against your values.

### 4.3 Getting the request ID

```bash
# CLI: x-amz-request-id / x-amz-id-2 appear at the end of the --debug output
aws s3api head-object --bucket amzn-s3-demo-bucket --key a.txt --debug 2>&1 | grep -iE 'x-amz-(request-id|id-2)'

# curl: -i shows the response headers
curl -sI https://amzn-s3-demo-bucket.s3.ap-northeast-1.amazonaws.com/public.txt | grep -i x-amz
```

The same request ID is recorded in server access logs and CloudTrail data events, so it also works as a key for correlating logs.

## 5. All Amazon S3 operations (data plane + bucket configuration) (116)

`s3` (API version `2006-03-01`, protocol `rest-xml`) handles almost all object reads and writes and bucket configuration. Bucket configuration is distinctive in that the target is switched by a **subresource (query string)** such as `?versioning` or `?lifecycle`: the same `PUT /{Bucket}` is a different API depending on the query. The Path column shows the service model's `requestUri` as is (in actual requests with virtual-hosted-style addressing, the `/{Bucket}` part moves into the hostname).

The four deprecated operations (`GetBucketLifecycle` / `PutBucketLifecycle` / `GetBucketNotification` / `PutBucketNotification`) are still listed in the API Reference, so they are included here.

### 5.1 Object operations

| Operation             | Method / Path                                | Description                                                                                                   |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `CopyObject`          | `PUT /{Bucket}/{Key+}`                       | Copies an object server-side within S3 (up to 5 GB in a single request)                                       |
| `DeleteObject`        | `DELETE /{Bucket}/{Key+}`                    | Deletes an object. With versioning enabled, creates a delete marker (specify versionId to delete permanently) |
| `DeleteObjects`       | `POST /{Bucket}?delete`                      | Deletes up to 1,000 keys in one request                                                                       |
| `GetObject`           | `GET /{Bucket}/{Key+}`                       | Retrieves the object body and metadata. Supports Range and conditional GET                                    |
| `GetObjectAttributes` | `GET /{Bucket}/{Key+}?attributes`            | Retrieves ETag, checksums, part info, size, storage class, etc. without returning the body                    |
| `GetObjectTorrent`    | `GET /{Bucket}/{Key+}?torrent`               | Returns a BitTorrent file for the object (legacy feature)                                                     |
| `HeadObject`          | `HEAD /{Bucket}/{Key+}`                      | Retrieves only the object's metadata, without the body                                                        |
| `ListObjects`         | `GET /{Bucket}`                              | Lists up to 1,000 objects in a bucket (legacy; use V2 for new code)                                           |
| `ListObjectsV2`       | `GET /{Bucket}?list-type=2`                  | Lists objects in a bucket, up to 1,000 at a time (paginate with continuation-token)                           |
| `PutObject`           | `PUT /{Bucket}/{Key+}`                       | Writes an object to a bucket (up to 5 GB in a single PUT; multipart recommended above 100 MB)                 |
| `RenameObject`        | `PUT /{Bucket}/{Key+}?renameObject`          | Atomically renames an object within an S3 Express One Zone directory bucket                                   |
| `RestoreObject`       | `POST /{Bucket}/{Key+}?restore`              | Restores a temporary copy of an object archived in a Glacier storage class                                    |
| `SelectObjectContent` | `POST /{Bucket}/{Key+}?select&select-type=2` | Runs SQL against a CSV / JSON / Parquet object and filters server-side (no longer offered to new customers)   |

### 5.2 Multipart upload

| Operation                 | Method / Path                   | Description                                                            |
| ------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `AbortMultipartUpload`    | `DELETE /{Bucket}/{Key+}`       | Aborts a multipart upload and discards the uploaded parts              |
| `CompleteMultipartUpload` | `POST /{Bucket}/{Key+}`         | Assembles the object from the given part list and completes the upload |
| `CreateMultipartUpload`   | `POST /{Bucket}/{Key+}?uploads` | Starts a multipart upload and returns an UploadId                      |
| `ListMultipartUploads`    | `GET /{Bucket}?uploads`         | Lists in-progress (incomplete) multipart uploads                       |
| `ListParts`               | `GET /{Bucket}/{Key+}`          | Lists the uploaded parts for a given UploadId                          |
| `UploadPart`              | `PUT /{Bucket}/{Key+}`          | Uploads one part (5 MiB–5 GiB; only the last part may be smaller)      |
| `UploadPartCopy`          | `PUT /{Bucket}/{Key+}`          | Copies a byte range of an existing object as a part                    |

### 5.3 Buckets

| Operation           | Method / Path            | Description                                                                                             |
| ------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `CreateBucket`      | `PUT /{Bucket}`          | Creates a bucket (general purpose / directory bucket)                                                   |
| `DeleteBucket`      | `DELETE /{Bucket}`       | Deletes an empty bucket                                                                                 |
| `GetBucketLocation` | `GET /{Bucket}?location` | Returns the bucket's Region (HeadBucket is recommended for new code)                                    |
| `HeadBucket`        | `HEAD /{Bucket}`         | Checks that the bucket exists and that you have access (also returns the Region in x-amz-bucket-region) |
| `ListBuckets`       | `GET /`                  | Lists the general purpose buckets owned by the caller                                                   |

### 5.4 Directory buckets / CreateSession

| Operation              | Method / Path           | Description                                                                    |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `CreateSession`        | `GET /{Bucket}?session` | Issues short-lived session credentials for a directory bucket's Zonal endpoint |
| `ListDirectoryBuckets` | `GET /`                 | Lists the directory buckets owned by the caller                                |

### 5.5 Versioning

| Operation             | Method / Path              | Description                                                          |
| --------------------- | -------------------------- | -------------------------------------------------------------------- |
| `GetBucketVersioning` | `GET /{Bucket}?versioning` | Retrieves the versioning state and MFA Delete state                  |
| `ListObjectVersions`  | `GET /{Bucket}?versions`   | Lists all versions and delete markers                                |
| `PutBucketVersioning` | `PUT /{Bucket}?versioning` | Sets versioning to Enabled / Suspended (MFA Delete is also set here) |

### 5.6 Lifecycle

| Operation                         | Method / Path                | Description                                                                                      |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `DeleteBucketLifecycle`           | `DELETE /{Bucket}?lifecycle` | Deletes the lifecycle configuration                                                              |
| `GetBucketLifecycle`              | `GET /{Bucket}?lifecycle`    | Legacy API for getting lifecycle configuration (deprecated; use GetBucketLifecycleConfiguration) |
| `GetBucketLifecycleConfiguration` | `GET /{Bucket}?lifecycle`    | Retrieves the lifecycle configuration                                                            |
| `PutBucketLifecycle`              | `PUT /{Bucket}?lifecycle`    | Legacy API for setting lifecycle configuration (deprecated; use PutBucketLifecycleConfiguration) |
| `PutBucketLifecycleConfiguration` | `PUT /{Bucket}?lifecycle`    | Creates or replaces lifecycle rules (transitions, expiration, cleanup of incomplete MPUs, etc.)  |

### 5.7 Replication

| Operation                 | Method / Path                  | Description                                                                                         |
| ------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `DeleteBucketReplication` | `DELETE /{Bucket}?replication` | Deletes the replication configuration                                                               |
| `GetBucketReplication`    | `GET /{Bucket}?replication`    | Retrieves the replication configuration                                                             |
| `PutBucketReplication`    | `PUT /{Bucket}?replication`    | Creates or replaces the replication configuration (CRR / SRR, RTC, delete marker replication, etc.) |

### 5.8 Event notifications

| Operation                            | Method / Path                | Description                                                       |
| ------------------------------------ | ---------------------------- | ----------------------------------------------------------------- |
| `GetBucketNotification`              | `GET /{Bucket}?notification` | Legacy API for getting notification configuration (deprecated)    |
| `GetBucketNotificationConfiguration` | `GET /{Bucket}?notification` | Retrieves the event notification configuration                    |
| `PutBucketNotification`              | `PUT /{Bucket}?notification` | Legacy API for setting notification configuration (deprecated)    |
| `PutBucketNotificationConfiguration` | `PUT /{Bucket}?notification` | Configures event notifications (SNS / SQS / Lambda / EventBridge) |

### 5.9 Encryption

| Operation                | Method / Path                     | Description                                                                                                         |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DeleteBucketEncryption` | `DELETE /{Bucket}?encryption`     | Resets default encryption to SSE-S3                                                                                 |
| `GetBucketEncryption`    | `GET /{Bucket}?encryption`        | Retrieves the default encryption configuration                                                                      |
| `PutBucketEncryption`    | `PUT /{Bucket}?encryption`        | Sets default encryption (SSE-S3 / SSE-KMS / DSSE-KMS) and S3 Bucket Keys. Can also block encryption types           |
| `UpdateObjectEncryption` | `PUT /{Bucket}/{Key+}?encryption` | Updates an existing object's SSE type (SSE-S3 → SSE-KMS, KMS key change, applying a Bucket Key) without moving data |

### 5.10 Policies / ACLs / Ownership / Block Public Access / ABAC

| Operation                       | Method / Path                        | Description                                                                             |
| ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| `DeleteBucketOwnershipControls` | `DELETE /{Bucket}?ownershipControls` | Deletes the Object Ownership setting                                                    |
| `DeleteBucketPolicy`            | `DELETE /{Bucket}?policy`            | Deletes the bucket policy                                                               |
| `DeletePublicAccessBlock`       | `DELETE /{Bucket}?publicAccessBlock` | Deletes the bucket-level Block Public Access configuration                              |
| `GetBucketAbac`                 | `GET /{Bucket}?abac`                 | Retrieves the ABAC status of a general purpose bucket                                   |
| `GetBucketAcl`                  | `GET /{Bucket}?acl`                  | Retrieves the bucket ACL                                                                |
| `GetBucketOwnershipControls`    | `GET /{Bucket}?ownershipControls`    | Retrieves the Object Ownership setting                                                  |
| `GetBucketPolicy`               | `GET /{Bucket}?policy`               | Retrieves the bucket policy                                                             |
| `GetBucketPolicyStatus`         | `GET /{Bucket}?policyStatus`         | Returns whether the bucket policy is considered public                                  |
| `GetObjectAcl`                  | `GET /{Bucket}/{Key+}?acl`           | Retrieves the object ACL                                                                |
| `GetPublicAccessBlock`          | `GET /{Bucket}?publicAccessBlock`    | Retrieves the bucket-level Block Public Access configuration                            |
| `PutBucketAbac`                 | `PUT /{Bucket}?abac`                 | Sets ABAC (tag-based access control) for a general purpose bucket to Enabled / Disabled |
| `PutBucketAcl`                  | `PUT /{Bucket}?acl`                  | Sets the bucket ACL (not allowed when Object Ownership is BucketOwnerEnforced)          |
| `PutBucketOwnershipControls`    | `PUT /{Bucket}?ownershipControls`    | Sets Object Ownership (BucketOwnerEnforced, etc.)                                       |
| `PutBucketPolicy`               | `PUT /{Bucket}?policy`               | Sets the bucket policy (JSON)                                                           |
| `PutObjectAcl`                  | `PUT /{Bucket}/{Key+}?acl`           | Sets the object ACL                                                                     |
| `PutPublicAccessBlock`          | `PUT /{Bucket}?publicAccessBlock`    | Creates or modifies the four bucket-level Block Public Access settings                  |

### 5.11 Analytics / Inventory / Metrics

| Operation                            | Method / Path                | Description                                                            |
| ------------------------------------ | ---------------------------- | ---------------------------------------------------------------------- |
| `DeleteBucketAnalyticsConfiguration` | `DELETE /{Bucket}?analytics` | Deletes a Storage Class Analysis configuration                         |
| `DeleteBucketInventoryConfiguration` | `DELETE /{Bucket}?inventory` | Deletes an S3 Inventory configuration                                  |
| `DeleteBucketMetricsConfiguration`   | `DELETE /{Bucket}?metrics`   | Deletes a request metrics configuration                                |
| `GetBucketAnalyticsConfiguration`    | `GET /{Bucket}?analytics`    | Retrieves a Storage Class Analysis configuration by ID                 |
| `GetBucketInventoryConfiguration`    | `GET /{Bucket}?inventory`    | Retrieves an S3 Inventory configuration by ID                          |
| `GetBucketMetricsConfiguration`      | `GET /{Bucket}?metrics`      | Retrieves a request metrics configuration by ID                        |
| `ListBucketAnalyticsConfigurations`  | `GET /{Bucket}?analytics`    | Lists Storage Class Analysis configurations                            |
| `ListBucketInventoryConfigurations`  | `GET /{Bucket}?inventory`    | Lists S3 Inventory configurations                                      |
| `ListBucketMetricsConfigurations`    | `GET /{Bucket}?metrics`      | Lists request metrics configurations                                   |
| `PutBucketAnalyticsConfiguration`    | `PUT /{Bucket}?analytics`    | Adds or replaces a Storage Class Analysis configuration                |
| `PutBucketInventoryConfiguration`    | `PUT /{Bucket}?inventory`    | Adds or replaces an S3 Inventory report configuration                  |
| `PutBucketMetricsConfiguration`      | `PUT /{Bucket}?metrics`      | Adds or replaces a filter configuration for CloudWatch request metrics |

### 5.12 Intelligent-Tiering configuration

| Operation                                     | Method / Path                          | Description                                                                           |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `DeleteBucketIntelligentTieringConfiguration` | `DELETE /{Bucket}?intelligent-tiering` | Deletes an Intelligent-Tiering configuration                                          |
| `GetBucketIntelligentTieringConfiguration`    | `GET /{Bucket}?intelligent-tiering`    | Retrieves an Intelligent-Tiering configuration by ID                                  |
| `ListBucketIntelligentTieringConfigurations`  | `GET /{Bucket}?intelligent-tiering`    | Lists Intelligent-Tiering configurations                                              |
| `PutBucketIntelligentTieringConfiguration`    | `PUT /{Bucket}?intelligent-tiering`    | Configures automatic movement to the Intelligent-Tiering Archive / Deep Archive tiers |

### 5.13 Static website

| Operation             | Method / Path              | Description                                                                  |
| --------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `DeleteBucketWebsite` | `DELETE /{Bucket}?website` | Deletes the website configuration                                            |
| `GetBucketWebsite`    | `GET /{Bucket}?website`    | Retrieves the website configuration                                          |
| `PutBucketWebsite`    | `PUT /{Bucket}?website`    | Configures static website hosting (index / error documents / redirect rules) |

### 5.14 CORS

| Operation          | Method / Path           | Description              |
| ------------------ | ----------------------- | ------------------------ |
| `DeleteBucketCors` | `DELETE /{Bucket}?cors` | Deletes the CORS rules   |
| `GetBucketCors`    | `GET /{Bucket}?cors`    | Retrieves the CORS rules |
| `PutBucketCors`    | `PUT /{Bucket}?cors`    | Sets the CORS rules      |

### 5.15 Object Lock

| Operation                    | Method / Path                     | Description                                                                         |
| ---------------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| `GetObjectLegalHold`         | `GET /{Bucket}/{Key+}?legal-hold` | Retrieves the legal hold status                                                     |
| `GetObjectLockConfiguration` | `GET /{Bucket}?object-lock`       | Retrieves the Object Lock configuration                                             |
| `GetObjectRetention`         | `GET /{Bucket}/{Key+}?retention`  | Retrieves the retention settings of an object version                               |
| `PutObjectLegalHold`         | `PUT /{Bucket}/{Key+}?legal-hold` | Turns a legal hold on or off for an object version                                  |
| `PutObjectLockConfiguration` | `PUT /{Bucket}?object-lock`       | Configures Object Lock and default retention (GOVERNANCE / COMPLIANCE) for a bucket |
| `PutObjectRetention`         | `PUT /{Bucket}/{Key+}?retention`  | Sets a retention period (Retain Until Date) on an object version                    |

### 5.16 Tagging

| Operation             | Method / Path                     | Description                                                  |
| --------------------- | --------------------------------- | ------------------------------------------------------------ |
| `DeleteBucketTagging` | `DELETE /{Bucket}?tagging`        | Deletes bucket tags (use UntagResource when ABAC is enabled) |
| `DeleteObjectTagging` | `DELETE /{Bucket}/{Key+}?tagging` | Removes the entire tag set from an object                    |
| `GetBucketTagging`    | `GET /{Bucket}?tagging`           | Retrieves bucket tags                                        |
| `GetObjectTagging`    | `GET /{Bucket}/{Key+}?tagging`    | Retrieves an object's tag set                                |
| `PutBucketTagging`    | `PUT /{Bucket}?tagging`           | Sets bucket tags (use TagResource when ABAC is enabled)      |
| `PutObjectTagging`    | `PUT /{Bucket}/{Key+}?tagging`    | Replaces an object's tag set (up to 10 tags)                 |

### 5.17 S3 Metadata configuration

| Operation                                          | Method / Path                            | Description                                                                                         |
| -------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `CreateBucketMetadataConfiguration`                | `POST /{Bucket}?metadataConfiguration`   | Creates an S3 Metadata V2 configuration (journal table + live inventory table)                      |
| `CreateBucketMetadataTableConfiguration`           | `POST /{Bucket}?metadataTable`           | Creates a V1 S3 Metadata configuration (deprecated; use V2)                                         |
| `DeleteBucketMetadataConfiguration`                | `DELETE /{Bucket}?metadataConfiguration` | Deletes an S3 Metadata configuration (works for both V1 and V2)                                     |
| `DeleteBucketMetadataTableConfiguration`           | `DELETE /{Bucket}?metadataTable`         | Deletes a V1 S3 Metadata configuration (deprecated)                                                 |
| `GetBucketMetadataConfiguration`                   | `GET /{Bucket}?metadataConfiguration`    | Retrieves the S3 Metadata V2 configuration                                                          |
| `GetBucketMetadataTableConfiguration`              | `GET /{Bucket}?metadataTable`            | Retrieves the V1 S3 Metadata configuration (deprecated)                                             |
| `UpdateBucketMetadataAnnotationTableConfiguration` | `PUT /{Bucket}?metadataAnnotationTable`  | Enables or disables the annotation table (an Iceberg table of annotations) and updates its IAM role |
| `UpdateBucketMetadataInventoryTableConfiguration`  | `PUT /{Bucket}?metadataInventoryTable`   | Enables or disables the live inventory table                                                        |
| `UpdateBucketMetadataJournalTableConfiguration`    | `PUT /{Bucket}?metadataJournalTable`     | Enables or disables record expiration for the journal table                                         |

### 5.18 Object annotations

| Operation                | Method / Path                        | Description                                                                                    |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `DeleteObjectAnnotation` | `DELETE /{Bucket}/{Key+}?annotation` | Deletes one annotation from an object (conditional delete possible with x-amz-object-if-match) |
| `GetObjectAnnotation`    | `GET /{Bucket}/{Key+}?annotation`    | Retrieves one annotation on an object                                                          |
| `ListObjectAnnotations`  | `GET /{Bucket}/{Key+}?annotation`    | Lists the annotations on an object (can filter by prefix)                                      |
| `PutObjectAnnotation`    | `PUT /{Bucket}/{Key+}?annotation`    | Attaches a named annotation of 1 B–1 MiB to an object (or version) (up to 1,000 per object)    |

### 5.19 Object Lambda

| Operation                | Method / Path                  | Description                                                                           |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| `WriteGetObjectResponse` | `POST /WriteGetObjectResponse` | Returns a transformed response from an Object Lambda function to the GetObject caller |

### 5.20 Transfer Acceleration

| Operation                          | Method / Path              | Description                                       |
| ---------------------------------- | -------------------------- | ------------------------------------------------- |
| `GetBucketAccelerateConfiguration` | `GET /{Bucket}?accelerate` | Retrieves the Transfer Acceleration status        |
| `PutBucketAccelerateConfiguration` | `PUT /{Bucket}?accelerate` | Sets Transfer Acceleration to Enabled / Suspended |

### 5.21 Server access logging

| Operation          | Method / Path           | Description                                              |
| ------------------ | ----------------------- | -------------------------------------------------------- |
| `GetBucketLogging` | `GET /{Bucket}?logging` | Retrieves the server access logging configuration        |
| `PutBucketLogging` | `PUT /{Bucket}?logging` | Sets the target bucket and prefix for server access logs |

### 5.22 Requester Pays

| Operation                 | Method / Path                  | Description                                |
| ------------------------- | ------------------------------ | ------------------------------------------ |
| `GetBucketRequestPayment` | `GET /{Bucket}?requestPayment` | Retrieves the Requester Pays configuration |
| `PutBucketRequestPayment` | `PUT /{Bucket}?requestPayment` | Configures Requester Pays                  |

## 6. All Amazon S3 Control operations (97)

`s3control` (API version `2018-08-20`, `rest-xml`) is the **account-level control plane**. The endpoint is `https://{AccountId}.s3-control.{Region}.amazonaws.com`, and almost every request needs the `x-amz-account-id` header. The SigV4 signing service name is `s3`. Note that operations with `Bucket` in the name (`CreateBucket`, `GetBucketPolicy`, etc.) are **only for S3 on Outposts buckets**; for regular general purpose buckets, use the same-named APIs in `s3`.

### 6.1 Access points

| Operation                             | Method / Path                                    | Description                                                                              |
| ------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `CreateAccessPoint`                   | `PUT /v20180820/accesspoint/{name}`              | Creates an access point and attaches it to a bucket (general purpose / directory bucket) |
| `DeleteAccessPoint`                   | `DELETE /v20180820/accesspoint/{name}`           | Deletes an access point                                                                  |
| `DeleteAccessPointPolicy`             | `DELETE /v20180820/accesspoint/{name}/policy`    | Deletes an access point policy                                                           |
| `DeleteAccessPointScope`              | `DELETE /v20180820/accesspoint/{name}/scope`     | Deletes the scope of an access point for a directory bucket                              |
| `GetAccessPoint`                      | `GET /v20180820/accesspoint/{name}`              | Retrieves an access point's configuration                                                |
| `GetAccessPointPolicy`                | `GET /v20180820/accesspoint/{name}/policy`       | Retrieves an access point policy                                                         |
| `GetAccessPointPolicyStatus`          | `GET /v20180820/accesspoint/{name}/policyStatus` | Determines whether an access point policy is public                                      |
| `GetAccessPointScope`                 | `GET /v20180820/accesspoint/{name}/scope`        | Retrieves the scope of an access point for a directory bucket                            |
| `ListAccessPoints`                    | `GET /v20180820/accesspoint`                     | Lists access points for general purpose buckets                                          |
| `ListAccessPointsForDirectoryBuckets` | `GET /v20180820/accesspointfordirectory`         | Lists access points for directory buckets                                                |
| `PutAccessPointPolicy`                | `PUT /v20180820/accesspoint/{name}/policy`       | Sets an access point policy                                                              |
| `PutAccessPointScope`                 | `PUT /v20180820/accesspoint/{name}/scope`        | Sets the scope (prefixes / allowed APIs) of an access point for a directory bucket       |

### 6.2 Object Lambda

| Operation                                    | Method / Path                                                    | Description                                                            |
| -------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `CreateAccessPointForObjectLambda`           | `PUT /v20180820/accesspointforobjectlambda/{name}`               | Creates an Object Lambda access point                                  |
| `DeleteAccessPointForObjectLambda`           | `DELETE /v20180820/accesspointforobjectlambda/{name}`            | Deletes an Object Lambda access point                                  |
| `DeleteAccessPointPolicyForObjectLambda`     | `DELETE /v20180820/accesspointforobjectlambda/{name}/policy`     | Deletes an Object Lambda access point's policy                         |
| `GetAccessPointConfigurationForObjectLambda` | `GET /v20180820/accesspointforobjectlambda/{name}/configuration` | Retrieves an Object Lambda access point's transformation configuration |
| `GetAccessPointForObjectLambda`              | `GET /v20180820/accesspointforobjectlambda/{name}`               | Retrieves Object Lambda access point information                       |
| `GetAccessPointPolicyForObjectLambda`        | `GET /v20180820/accesspointforobjectlambda/{name}/policy`        | Retrieves an Object Lambda access point's policy                       |
| `GetAccessPointPolicyStatusForObjectLambda`  | `GET /v20180820/accesspointforobjectlambda/{name}/policyStatus`  | Retrieves whether an Object Lambda access point policy is public       |
| `ListAccessPointsForObjectLambda`            | `GET /v20180820/accesspointforobjectlambda`                      | Lists Object Lambda access points                                      |
| `PutAccessPointConfigurationForObjectLambda` | `PUT /v20180820/accesspointforobjectlambda/{name}/configuration` | Replaces an Object Lambda access point's transformation configuration  |
| `PutAccessPointPolicyForObjectLambda`        | `PUT /v20180820/accesspointforobjectlambda/{name}/policy`        | Sets an Object Lambda access point's policy                            |

### 6.3 Multi-Region Access Points

| Operation                                 | Method / Path                                         | Description                                                      |
| ----------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| `CreateMultiRegionAccessPoint`            | `POST /v20180820/async-requests/mrap/create`          | Creates a Multi-Region Access Point (asynchronous)               |
| `DeleteMultiRegionAccessPoint`            | `POST /v20180820/async-requests/mrap/delete`          | Deletes a Multi-Region Access Point (asynchronous)               |
| `DescribeMultiRegionAccessPointOperation` | `GET /v20180820/async-requests/mrap/{request_token+}` | Retrieves the status of an asynchronous MRAP operation           |
| `GetMultiRegionAccessPoint`               | `GET /v20180820/mrap/instances/{name+}`               | Retrieves an MRAP's configuration                                |
| `GetMultiRegionAccessPointPolicy`         | `GET /v20180820/mrap/instances/{name+}/policy`        | Retrieves an MRAP's policy                                       |
| `GetMultiRegionAccessPointPolicyStatus`   | `GET /v20180820/mrap/instances/{name+}/policystatus`  | Retrieves whether an MRAP policy is public                       |
| `GetMultiRegionAccessPointRoutes`         | `GET /v20180820/mrap/instances/{mrap+}/routes`        | Retrieves an MRAP's routing (which Regions are active / passive) |
| `ListMultiRegionAccessPoints`             | `GET /v20180820/mrap/instances`                       | Lists MRAPs                                                      |
| `PutMultiRegionAccessPointPolicy`         | `POST /v20180820/async-requests/mrap/put-policy`      | Sets an MRAP's policy (asynchronous)                             |
| `SubmitMultiRegionAccessPointRoutes`      | `PATCH /v20180820/mrap/instances/{mrap+}/routes`      | Updates an MRAP's routing (failover)                             |

### 6.4 Batch Operations

| Operation           | Method / Path                         | Description                                                   |
| ------------------- | ------------------------------------- | ------------------------------------------------------------- |
| `CreateJob`         | `POST /v20180820/jobs`                | Creates an S3 Batch Operations job                            |
| `DeleteJobTagging`  | `DELETE /v20180820/jobs/{id}/tagging` | Deletes a job's tags                                          |
| `DescribeJob`       | `GET /v20180820/jobs/{id}`            | Retrieves a job's configuration and status                    |
| `GetJobTagging`     | `GET /v20180820/jobs/{id}/tagging`    | Retrieves a job's tags                                        |
| `ListJobs`          | `GET /v20180820/jobs`                 | Lists jobs (including those finished within the last 90 days) |
| `PutJobTagging`     | `PUT /v20180820/jobs/{id}/tagging`    | Sets a job's tags                                             |
| `UpdateJobPriority` | `POST /v20180820/jobs/{id}/priority`  | Changes a job's priority                                      |
| `UpdateJobStatus`   | `POST /v20180820/jobs/{id}/status`    | Confirms (Ready) or cancels a job                             |

### 6.5 Access Grants

| Operation                                  | Method / Path                                           | Description                                                                            |
| ------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AssociateAccessGrantsIdentityCenter`      | `POST /v20180820/accessgrantsinstance/identitycenter`   | Associates an Access Grants instance with IAM Identity Center                          |
| `CreateAccessGrant`                        | `POST /v20180820/accessgrantsinstance/grant`            | Grants READ / WRITE / READWRITE to a grantee (IAM or Identity Center users and groups) |
| `CreateAccessGrantsInstance`               | `POST /v20180820/accessgrantsinstance`                  | Creates an S3 Access Grants instance                                                   |
| `CreateAccessGrantsLocation`               | `POST /v20180820/accessgrantsinstance/location`         | Registers an S3 location (bucket / prefix) with an IAM role                            |
| `DeleteAccessGrant`                        | `DELETE /v20180820/accessgrantsinstance/grant/{id}`     | Deletes an access grant                                                                |
| `DeleteAccessGrantsInstance`               | `DELETE /v20180820/accessgrantsinstance`                | Deletes an Access Grants instance                                                      |
| `DeleteAccessGrantsInstanceResourcePolicy` | `DELETE /v20180820/accessgrantsinstance/resourcepolicy` | Deletes an Access Grants instance's resource policy                                    |
| `DeleteAccessGrantsLocation`               | `DELETE /v20180820/accessgrantsinstance/location/{id}`  | Deregisters a registered location                                                      |
| `DissociateAccessGrantsIdentityCenter`     | `DELETE /v20180820/accessgrantsinstance/identitycenter` | Removes the association with IAM Identity Center                                       |
| `GetAccessGrant`                           | `GET /v20180820/accessgrantsinstance/grant/{id}`        | Retrieves the details of an access grant                                               |
| `GetAccessGrantsInstance`                  | `GET /v20180820/accessgrantsinstance`                   | Retrieves the Access Grants instance for the Region                                    |
| `GetAccessGrantsInstanceForPrefix`         | `GET /v20180820/accessgrantsinstance/prefix`            | Retrieves the Access Grants instance that contains the given prefix                    |
| `GetAccessGrantsInstanceResourcePolicy`    | `GET /v20180820/accessgrantsinstance/resourcepolicy`    | Retrieves an Access Grants instance's resource policy                                  |
| `GetAccessGrantsLocation`                  | `GET /v20180820/accessgrantsinstance/location/{id}`     | Retrieves the details of a registered location                                         |
| `GetDataAccess`                            | `GET /v20180820/accessgrantsinstance/dataaccess`        | Vends temporary credentials (STS tokens) based on a grant                              |
| `ListAccessGrants`                         | `GET /v20180820/accessgrantsinstance/grants`            | Lists access grants                                                                    |
| `ListAccessGrantsInstances`                | `GET /v20180820/accessgrantsinstances`                  | Lists Access Grants instances                                                          |
| `ListAccessGrantsLocations`                | `GET /v20180820/accessgrantsinstance/locations`         | Lists registered locations                                                             |
| `ListCallerAccessGrants`                   | `GET /v20180820/accessgrantsinstance/caller/grants`     | Lists the access grants that apply to the caller                                       |
| `PutAccessGrantsInstanceResourcePolicy`    | `PUT /v20180820/accessgrantsinstance/resourcepolicy`    | Sets an Access Grants instance's resource policy                                       |
| `UpdateAccessGrantsLocation`               | `PUT /v20180820/accessgrantsinstance/location/{id}`     | Changes the IAM role of a registered location                                          |

### 6.6 Storage Lens

| Operation                               | Method / Path                                           | Description                                                                        |
| --------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `CreateStorageLensGroup`                | `POST /v20180820/storagelensgroup`                      | Creates a Storage Lens group (a set of objects grouped by prefix, tag, size, etc.) |
| `DeleteStorageLensConfiguration`        | `DELETE /v20180820/storagelens/{storagelensid}`         | Deletes a Storage Lens configuration                                               |
| `DeleteStorageLensConfigurationTagging` | `DELETE /v20180820/storagelens/{storagelensid}/tagging` | Deletes a Storage Lens configuration's tags                                        |
| `DeleteStorageLensGroup`                | `DELETE /v20180820/storagelensgroup/{name}`             | Deletes a Storage Lens group                                                       |
| `GetStorageLensConfiguration`           | `GET /v20180820/storagelens/{storagelensid}`            | Retrieves a Storage Lens configuration                                             |
| `GetStorageLensConfigurationTagging`    | `GET /v20180820/storagelens/{storagelensid}/tagging`    | Retrieves a Storage Lens configuration's tags                                      |
| `GetStorageLensGroup`                   | `GET /v20180820/storagelensgroup/{name}`                | Retrieves a Storage Lens group                                                     |
| `ListStorageLensConfigurations`         | `GET /v20180820/storagelens`                            | Lists Storage Lens configurations                                                  |
| `ListStorageLensGroups`                 | `GET /v20180820/storagelensgroup`                       | Lists Storage Lens groups                                                          |
| `PutStorageLensConfiguration`           | `PUT /v20180820/storagelens/{storagelensid}`            | Creates or replaces a Storage Lens dashboard configuration                         |
| `PutStorageLensConfigurationTagging`    | `PUT /v20180820/storagelens/{storagelensid}/tagging`    | Sets a Storage Lens configuration's tags                                           |
| `UpdateStorageLensGroup`                | `PUT /v20180820/storagelensgroup/{name}`                | Updates a Storage Lens group                                                       |

### 6.7 Account settings

| Operation                 | Method / Path                                       | Description                                 |
| ------------------------- | --------------------------------------------------- | ------------------------------------------- |
| `DeletePublicAccessBlock` | `DELETE /v20180820/configuration/publicAccessBlock` | Deletes account-level Block Public Access   |
| `GetPublicAccessBlock`    | `GET /v20180820/configuration/publicAccessBlock`    | Retrieves account-level Block Public Access |
| `PutPublicAccessBlock`    | `PUT /v20180820/configuration/publicAccessBlock`    | Sets account-level Block Public Access      |

### 6.8 Tagging

| Operation             | Method / Path                           | Description                                                                                     |
| --------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ListTagsForResource` | `GET /v20180820/tags/{resourceArn+}`    | Lists the tags on an S3 resource                                                                |
| `TagResource`         | `POST /v20180820/tags/{resourceArn+}`   | Adds tags to an S3 resource (general purpose buckets, Storage Lens groups, Access Grants, etc.) |
| `UntagResource`       | `DELETE /v20180820/tags/{resourceArn+}` | Removes tags from an S3 resource                                                                |

### 6.9 S3 on Outposts buckets (via Control)

| Operation                            | Method / Path                                            | Description                                              |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| `CreateBucket`                       | `PUT /v20180820/bucket/{name}`                           | Creates an Outposts bucket                               |
| `DeleteBucket`                       | `DELETE /v20180820/bucket/{name}`                        | Deletes an Outposts bucket                               |
| `DeleteBucketLifecycleConfiguration` | `DELETE /v20180820/bucket/{name}/lifecycleconfiguration` | Deletes an Outposts bucket's lifecycle configuration     |
| `DeleteBucketPolicy`                 | `DELETE /v20180820/bucket/{name}/policy`                 | Deletes an Outposts bucket's policy                      |
| `DeleteBucketReplication`            | `DELETE /v20180820/bucket/{name}/replication`            | Deletes an Outposts bucket's replication configuration   |
| `DeleteBucketTagging`                | `DELETE /v20180820/bucket/{name}/tagging`                | Deletes an Outposts bucket's tags                        |
| `GetBucket`                          | `GET /v20180820/bucket/{name}`                           | Retrieves an Outposts bucket                             |
| `GetBucketLifecycleConfiguration`    | `GET /v20180820/bucket/{name}/lifecycleconfiguration`    | Retrieves an Outposts bucket's lifecycle configuration   |
| `GetBucketPolicy`                    | `GET /v20180820/bucket/{name}/policy`                    | Retrieves an Outposts bucket's policy                    |
| `GetBucketReplication`               | `GET /v20180820/bucket/{name}/replication`               | Retrieves an Outposts bucket's replication configuration |
| `GetBucketTagging`                   | `GET /v20180820/bucket/{name}/tagging`                   | Retrieves an Outposts bucket's tags                      |
| `GetBucketVersioning`                | `GET /v20180820/bucket/{name}/versioning`                | Retrieves an Outposts bucket's versioning state          |
| `ListRegionalBuckets`                | `GET /v20180820/bucket`                                  | Lists the buckets on an Outpost                          |
| `PutBucketLifecycleConfiguration`    | `PUT /v20180820/bucket/{name}/lifecycleconfiguration`    | Sets an Outposts bucket's lifecycle configuration        |
| `PutBucketPolicy`                    | `PUT /v20180820/bucket/{name}/policy`                    | Sets an Outposts bucket's policy                         |
| `PutBucketReplication`               | `PUT /v20180820/bucket/{name}/replication`               | Sets an Outposts bucket's replication configuration      |
| `PutBucketTagging`                   | `PUT /v20180820/bucket/{name}/tagging`                   | Sets an Outposts bucket's tags                           |
| `PutBucketVersioning`                | `PUT /v20180820/bucket/{name}/versioning`                | Sets an Outposts bucket's versioning                     |

## 7. All Amazon S3 Tables operations (49)

`s3tables` (API version `2018-05-10`, `rest-json`) is the management API for **table buckets**, which store Apache Iceberg tables. The endpoint is `https://s3tables.{Region}.amazonaws.com` and the signing service name is `s3tables`. Reading and writing table contents (Parquet data files and Iceberg metadata) goes through the Iceberg REST Catalog endpoint or engines such as Athena and Spark; the APIs here cover the containers, policies, and operational settings.

### 7.1 Table buckets

| Operation                 | Method / Path                             | Description                     |
| ------------------------- | ----------------------------------------- | ------------------------------- |
| `CreateTableBucket`       | `PUT /buckets`                            | Creates a table bucket          |
| `DeleteTableBucket`       | `DELETE /buckets/{tableBucketARN}`        | Deletes a table bucket          |
| `DeleteTableBucketPolicy` | `DELETE /buckets/{tableBucketARN}/policy` | Deletes a table bucket policy   |
| `GetTableBucket`          | `GET /buckets/{tableBucketARN}`           | Retrieves table bucket details  |
| `GetTableBucketPolicy`    | `GET /buckets/{tableBucketARN}/policy`    | Retrieves a table bucket policy |
| `ListTableBuckets`        | `GET /buckets`                            | Lists table buckets             |
| `PutTableBucketPolicy`    | `PUT /buckets/{tableBucketARN}/policy`    | Sets a table bucket policy      |

### 7.2 Namespaces

| Operation         | Method / Path                                     | Description                                                       |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| `CreateNamespace` | `PUT /namespaces/{tableBucketARN}`                | Creates a namespace (a logical group of tables) in a table bucket |
| `DeleteNamespace` | `DELETE /namespaces/{tableBucketARN}/{namespace}` | Deletes a namespace                                               |
| `GetNamespace`    | `GET /namespaces/{tableBucketARN}/{namespace}`    | Retrieves namespace details                                       |
| `ListNamespaces`  | `GET /namespaces/{tableBucketARN}`                | Lists namespaces                                                  |

### 7.3 Tables

| Operation                     | Method / Path                                                       | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `CreateTable`                 | `PUT /tables/{tableBucketARN}/{namespace}`                          | Creates an Iceberg table in a namespace                             |
| `DeleteTable`                 | `DELETE /tables/{tableBucketARN}/{namespace}/{name}`                | Deletes a table                                                     |
| `DeleteTablePolicy`           | `DELETE /tables/{tableBucketARN}/{namespace}/{name}/policy`         | Deletes a table policy                                              |
| `GetTable`                    | `GET /get-table`                                                    | Retrieves table details                                             |
| `GetTableMetadataLocation`    | `GET /tables/{tableBucketARN}/{namespace}/{name}/metadata-location` | Retrieves the location of the table's current Iceberg metadata file |
| `GetTablePolicy`              | `GET /tables/{tableBucketARN}/{namespace}/{name}/policy`            | Retrieves a table policy                                            |
| `ListTables`                  | `GET /tables/{tableBucketARN}`                                      | Lists tables                                                        |
| `PutTablePolicy`              | `PUT /tables/{tableBucketARN}/{namespace}/{name}/policy`            | Sets a table policy                                                 |
| `RenameTable`                 | `PUT /tables/{tableBucketARN}/{namespace}/{name}/rename`            | Renames a table or moves it to another namespace                    |
| `UpdateTableMetadataLocation` | `PUT /tables/{tableBucketARN}/{namespace}/{name}/metadata-location` | Updates the location of the Iceberg metadata file (commit)          |

### 7.4 Maintenance

| Operation                                | Method / Path                                                            | Description                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `GetTableBucketMaintenanceConfiguration` | `GET /buckets/{tableBucketARN}/maintenance`                              | Retrieves a table bucket's maintenance configuration                    |
| `GetTableMaintenanceConfiguration`       | `GET /tables/{tableBucketARN}/{namespace}/{name}/maintenance`            | Retrieves a table's maintenance configuration                           |
| `GetTableMaintenanceJobStatus`           | `GET /tables/{tableBucketARN}/{namespace}/{name}/maintenance-job-status` | Retrieves the status of a table's maintenance jobs                      |
| `PutTableBucketMaintenanceConfiguration` | `PUT /buckets/{tableBucketARN}/maintenance/{type}`                       | Configures table bucket maintenance (such as unreferenced file removal) |
| `PutTableMaintenanceConfiguration`       | `PUT /tables/{tableBucketARN}/{namespace}/{name}/maintenance/{type}`     | Configures table maintenance (compaction / snapshot management)         |

### 7.5 Encryption

| Operation                     | Method / Path                                                | Description                                                 |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| `DeleteTableBucketEncryption` | `DELETE /buckets/{tableBucketARN}/encryption`                | Deletes a table bucket's encryption configuration           |
| `GetTableBucketEncryption`    | `GET /buckets/{tableBucketARN}/encryption`                   | Retrieves a table bucket's encryption configuration         |
| `GetTableEncryption`          | `GET /tables/{tableBucketARN}/{namespace}/{name}/encryption` | Retrieves a table's encryption configuration                |
| `PutTableBucketEncryption`    | `PUT /buckets/{tableBucketARN}/encryption`                   | Sets a table bucket's default encryption (SSE-S3 / SSE-KMS) |

### 7.6 Replication

| Operation                      | Method / Path                      | Description                                            |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------ |
| `DeleteTableBucketReplication` | `DELETE /table-bucket-replication` | Deletes a table bucket's replication configuration     |
| `DeleteTableReplication`       | `DELETE /table-replication`        | Deletes a table-level replication configuration        |
| `GetTableBucketReplication`    | `GET /table-bucket-replication`    | Retrieves a table bucket's replication configuration   |
| `GetTableReplication`          | `GET /table-replication`           | Retrieves a table-level replication configuration      |
| `GetTableReplicationStatus`    | `GET /replication-status`          | Retrieves a table's replication status per destination |
| `PutTableBucketReplication`    | `PUT /table-bucket-replication`    | Configures replication at the table bucket level       |
| `PutTableReplication`          | `PUT /table-replication`           | Configures replication at the table level              |

### 7.7 Storage classes

| Operation                    | Method / Path                                                   | Description                                                         |
| ---------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| `GetTableBucketStorageClass` | `GET /buckets/{tableBucketARN}/storage-class`                   | Retrieves a table bucket's storage class setting                    |
| `GetTableStorageClass`       | `GET /tables/{tableBucketARN}/{namespace}/{name}/storage-class` | Retrieves a table's storage class setting                           |
| `PutTableBucketStorageClass` | `PUT /buckets/{tableBucketARN}/storage-class`                   | Sets a table bucket's default storage class (applies to new tables) |

### 7.8 Record expiration

| Operation                               | Method / Path                             | Description                                                                  |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------- |
| `GetTableRecordExpirationConfiguration` | `GET /table-record-expiration`            | Retrieves a table's record expiration configuration                          |
| `GetTableRecordExpirationJobStatus`     | `GET /table-record-expiration-job-status` | Retrieves the status and statistics of the most recent record expiration job |
| `PutTableRecordExpirationConfiguration` | `PUT /table-record-expiration`            | Configures record expiration for a table (automatic deletion after N days)   |

### 7.9 Metrics

| Operation                               | Method / Path                              | Description                                      |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `DeleteTableBucketMetricsConfiguration` | `DELETE /buckets/{tableBucketARN}/metrics` | Deletes a table bucket's metrics configuration   |
| `GetTableBucketMetricsConfiguration`    | `GET /buckets/{tableBucketARN}/metrics`    | Retrieves a table bucket's metrics configuration |
| `PutTableBucketMetricsConfiguration`    | `PUT /buckets/{tableBucketARN}/metrics`    | Sets a table bucket's metrics configuration      |

### 7.10 Tagging

| Operation             | Method / Path               | Description                             |
| --------------------- | --------------------------- | --------------------------------------- |
| `ListTagsForResource` | `GET /tag/{resourceArn}`    | Lists the tags on an S3 Tables resource |
| `TagResource`         | `POST /tag/{resourceArn}`   | Adds tags to an S3 Tables resource      |
| `UntagResource`       | `DELETE /tag/{resourceArn}` | Removes tags from an S3 Tables resource |

## 8. All Amazon S3 Vectors operations (21)

`s3vectors` (API version `2025-07-15`, `rest-json`) handles vector buckets, vector indexes, and vectors. The endpoint is `https://s3vectors.{Region}.api.aws` (a dual-stack domain) and the signing service name is `s3vectors`. Apart from the tagging operations, every call is RPC-style: a JSON body sent to `POST /<OperationName>`. Index modes were introduced in September 2026 (`CLASSIC` = metadata filtering during search, `ENHANCED` = filtering before search); `CLASSIC` can only be specified for indexes in vector buckets created before 2026-09-30.

### 8.1 Vector buckets

| Operation                         | Method / Path                           | Description                                                                |
| --------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `CreateVectorBucket`              | `POST /CreateVectorBucket`              | Creates a vector bucket                                                    |
| `DeleteVectorBucket`              | `POST /DeleteVectorBucket`              | Deletes a vector bucket (must be empty)                                    |
| `DeleteVectorBucketPolicy`        | `POST /DeleteVectorBucketPolicy`        | Deletes a vector bucket policy                                             |
| `GetVectorBucket`                 | `POST /GetVectorBucket`                 | Retrieves a vector bucket's attributes                                     |
| `GetVectorBucketPolicy`           | `POST /GetVectorBucketPolicy`           | Retrieves a vector bucket policy                                           |
| `ListVectorBuckets`               | `POST /ListVectorBuckets`               | Lists vector buckets                                                       |
| `PutVectorBucketDefaultIndexMode` | `POST /PutVectorBucketDefaultIndexMode` | Sets the default mode (CLASSIC / ENHANCED) for indexes created from now on |
| `PutVectorBucketPolicy`           | `POST /PutVectorBucketPolicy`           | Sets a vector bucket policy                                                |

### 8.2 Vector indexes

| Operation         | Method / Path           | Description                                                                      |
| ----------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `CreateIndex`     | `POST /CreateIndex`     | Creates a vector index (dimension and distance metric: cosine / euclidean)       |
| `DeleteIndex`     | `POST /DeleteIndex`     | Deletes a vector index                                                           |
| `GetIndex`        | `POST /GetIndex`        | Retrieves an index's attributes                                                  |
| `ListIndexes`     | `POST /ListIndexes`     | Lists indexes                                                                    |
| `UpdateIndexMode` | `POST /UpdateIndexMode` | Changes the mode of an existing index (ENHANCED = filters applied before search) |

### 8.3 Vectors

| Operation       | Method / Path         | Description                                                                                      |
| --------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| `DeleteVectors` | `POST /DeleteVectors` | Deletes vectors by key                                                                           |
| `GetVectors`    | `POST /GetVectors`    | Retrieves vectors by key                                                                         |
| `ListVectors`   | `POST /ListVectors`   | Lists vectors in an index (can be parallelized by specifying segments)                           |
| `PutVectors`    | `POST /PutVectors`    | Writes up to 500 vectors (key + float32 array + metadata)                                        |
| `QueryVectors`  | `POST /QueryVectors`  | Runs an approximate nearest neighbor (ANN) search with a query vector. Supports metadata filters |

### 8.4 Tagging

| Operation             | Method / Path                | Description                              |
| --------------------- | ---------------------------- | ---------------------------------------- |
| `ListTagsForResource` | `GET /tags/{resourceArn}`    | Lists the tags on an S3 Vectors resource |
| `TagResource`         | `POST /tags/{resourceArn}`   | Adds tags to an S3 Vectors resource      |
| `UntagResource`       | `DELETE /tags/{resourceArn}` | Removes tags from an S3 Vectors resource |

## 9. S3 on Outposts and S3 Files operations

In addition to the four families above, the Actions pages of the API Reference also list **S3 on Outposts** (`s3outposts`, endpoint management only) and **S3 Files** (`s3files`, a new service that mounts S3 buckets as EFS-based file systems). `data/api.json` includes both as `s3outposts` and `s3files` (309 operations in total).

### 9.1 S3 on Outposts (s3outposts)

| Operation             | Method / Path                         | Description                                                               |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| `CreateEndpoint`      | `POST /S3Outposts/CreateEndpoint`     | Creates an endpoint on an Outpost (the entry point for access from a VPC) |
| `DeleteEndpoint`      | `DELETE /S3Outposts/DeleteEndpoint`   | Deletes an endpoint                                                       |
| `ListEndpoints`       | `GET /S3Outposts/ListEndpoints`       | Lists an Outpost's endpoints                                              |
| `ListOutpostsWithS3`  | `GET /S3Outposts/ListOutpostsWithS3`  | Lists Outposts that have S3 on Outposts capacity                          |
| `ListSharedEndpoints` | `GET /S3Outposts/ListSharedEndpoints` | Lists endpoints of Outposts shared through RAM                            |

### 9.2 S3 Files (s3files)

| Operation                         | Method / Path                                                    | Description                                                                              |
| --------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `CreateAccessPoint`               | `PUT /access-points`                                             | Creates a file system access point that enforces a POSIX user / root directory           |
| `CreateFileSystem`                | `PUT /file-systems`                                              | Creates an S3 file system scoped to a bucket (or prefix)                                 |
| `CreateMountTarget`               | `PUT /mount-targets`                                             | Creates a mount target (the NFS endpoint that clients mount) in an AZ / VPC              |
| `DeleteAccessPoint`               | `DELETE /access-points/{accessPointId}`                          | Deletes a file system access point                                                       |
| `DeleteFileSystem`                | `DELETE /file-systems/{fileSystemId}`                            | Deletes an S3 file system                                                                |
| `DeleteFileSystemPolicy`          | `DELETE /file-systems/{fileSystemId}/policy`                     | Deletes a file system's resource policy                                                  |
| `DeleteMountTarget`               | `DELETE /mount-targets/{mountTargetId}`                          | Deletes a mount target                                                                   |
| `GetAccessPoint`                  | `GET /access-points/{accessPointId}`                             | Retrieves a file system access point                                                     |
| `GetFileSystem`                   | `GET /file-systems/{fileSystemId}`                               | Retrieves an S3 file system's status and configuration                                   |
| `GetFileSystemPolicy`             | `GET /file-systems/{fileSystemId}/policy`                        | Retrieves a file system's resource policy                                                |
| `GetMountTarget`                  | `GET /mount-targets/{mountTargetId}`                             | Retrieves mount target details                                                           |
| `GetSynchronizationConfiguration` | `GET /file-systems/{fileSystemId}/synchronization-configuration` | Retrieves the synchronization configuration                                              |
| `ListAccessPoints`                | `GET /access-points`                                             | Lists file system access points                                                          |
| `ListFileSystems`                 | `GET /file-systems`                                              | Lists S3 file systems                                                                    |
| `ListMountTargets`                | `GET /mount-targets`                                             | Lists mount targets                                                                      |
| `ListTagsForResource`             | `GET /resource-tags/{resourceId}`                                | Lists the tags on an S3 Files resource                                                   |
| `PutFileSystemPolicy`             | `PUT /file-systems/{fileSystemId}/policy`                        | Sets a file system's IAM resource policy                                                 |
| `PutSynchronizationConfiguration` | `PUT /file-systems/{fileSystemId}/synchronization-configuration` | Creates or updates the synchronization configuration with S3 (import / expiration rules) |
| `TagResource`                     | `POST /resource-tags/{resourceId}`                               | Adds tags to an S3 Files resource                                                        |
| `UntagResource`                   | `DELETE /resource-tags/{resourceId}`                             | Removes tags from an S3 Files resource                                                   |
| `UpdateMountTarget`               | `PUT /mount-targets/{mountTargetId}`                             | Updates a mount target's security groups                                                 |

## 10. Three representative operations in raw HTTP

The following examples only illustrate the shape; signatures and IDs are made up. `Authorization` would contain a value built with the steps in section 3.

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

Adding `If-None-Match: *` makes this a conditional write that fails with 412 if the same key already exists. On a bucket without versioning, `x-amz-version-id` is not returned (the version is effectively `null`).

### 10.2 GetObject (Range + conditional)

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

Adding `response-*` query parameters such as `response-content-disposition` overrides the returned headers (a standard trick for changing the download filename of a presigned URL).

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

- With `delimiter=/`, "folder" equivalents are grouped into `CommonPrefixes` (S3 has no folders as real entities)
- If `IsTruncated=true`, fetch the next page by adding `continuation-token=<NextContinuationToken>`
- General purpose buckets return keys in UTF-8 binary order. Directory buckets do not guarantee any order

## 11. Calling S3 directly with curl `--aws-sigv4`

curl 7.75 and later can compute SigV4 signatures itself with `--aws-sigv4`. With a local curl 8.7.1, we confirmed that it adds `x-amz-content-sha256` automatically when the `s3` service is specified, and uses your value instead if you pass that header yourself.

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

# PutObject (body sent unsigned)
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

# S3 Vectors (JSON API): the service name is s3vectors
curl -sS --aws-sigv4 "aws:amz:${AWS_REGION}:s3vectors" \
  --user "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}" \
  -H "x-amz-security-token: ${AWS_SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{}' "https://s3vectors.${AWS_REGION}.api.aws/ListVectorBuckets"
```

- With long-term access keys, remove the `x-amz-security-token` line (sending an empty token results in `InvalidToken`)
- `aws configure export-credentials --format env` exports temporary credentials from SSO or a role as environment variables
- Adding `-v` shows the `Authorization` header curl built; comparing it with the manual calculation in section 3 deepens your understanding

## 12. Key points for mapping to the SDK / CLI

| What you see                        | What actually happens                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aws s3 cp big.iso s3://b/`         | `CreateMultipartUpload` + parallel `UploadPart` + `CompleteMultipartUpload` (default 8 MiB threshold, 8 MiB parts)                                                                                                  |
| `aws s3 sync`                       | Diff with `ListObjectsV2` → `PutObject` / `CopyObject` / `DeleteObject`                                                                                                                                             |
| `aws s3 rm --recursive`             | `ListObjectsV2` + `DeleteObjects` (1,000 at a time)                                                                                                                                                                 |
| `aws s3 presign`                    | Computes the signed URL entirely on the client. No API call is made                                                                                                                                                 |
| `aws s3 mb` / `rb`                  | `CreateBucket` / `DeleteBucket`                                                                                                                                                                                     |
| SDK paginators                      | Iterate `continuation-token` / `key-marker` / `NextToken` automatically                                                                                                                                             |
| SDK waiters (`bucket-exists`, etc.) | Poll `HeadBucket` / `HeadObject`                                                                                                                                                                                    |
| IAM action names                    | Mostly the same as API names, with exceptions (`ListObjectsV2` → `s3:ListBucket`, `HeadObject` → `s3:GetObject`, `PutBucketLifecycleConfiguration` → `s3:PutLifecycleConfiguration`, `UploadPart` → `s3:PutObject`) |

## References

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
- Uploading objects (size limits): <https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html>
- Amazon S3 multipart upload limits: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html>
- botocore service models (bundled with AWS CLI v2 at `awscli/botocore/data/{s3,s3control,s3tables,s3vectors,s3outposts,s3files}`): <https://github.com/boto/botocore/tree/develop/botocore/data>
- curl `--aws-sigv4`: <https://curl.se/docs/manpage.html#--aws-sigv4>
