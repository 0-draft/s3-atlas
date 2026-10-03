# Glossary

_Last verified: 2026-10-03_

This glossary lists terms used in and around S3 in alphabetical order (symbols and numbers first). Each term gets a 1–3 sentence explanation; see the individual chapters for details. Dates indicate when a feature was announced or became the default.

## How to read this glossary

- The "Related" column lists terms worth reading alongside the entry.
- API names are written in code format, such as `PutObject`.
- Unconfirmed items are marked "unverified".

## Symbols and numbers

| Term | Description | Related |
| --- | --- | --- |
| 11 nines (99.999999999%) | The annual object durability that S3 Standard and other classes are designed for. If you store 10 million objects, you can expect to lose one object every 10,000 years on average. | Durability |
| 3,500 / 5,500 | The minimum requests per second supported per prefix (3,500 for PUT/COPY/POST/DELETE, 5,500 for GET/HEAD). Total throughput scales linearly as you add prefixes. | Prefix, SlowDown |

## A

| Term | Description | Related |
| --- | --- | --- |
| ABAC (Attribute-Based Access Control) | An access model that grants permissions based on attributes such as tags. In S3 you can embed principal tags (`aws:PrincipalTag`) in ARNs, and since November 2025 you can also control access with general purpose bucket tags (`aws:ResourceTag`). | Session tags, PutBucketAbac |
| Abort Incomplete Multipart Upload | A lifecycle action that automatically aborts multipart uploads left incomplete after a set number of days. Until aborted, the uploaded parts keep incurring storage charges. | Multipart upload, Lifecycle |
| Access Analyzer for S3 | An IAM Access Analyzer feature that finds buckets shared with external accounts or the public. It also validates policies and analyzes unused access. | Block Public Access |
| Access Control List (ACL) | A legacy permission list attached to buckets and objects. New buckets created after April 2023 have ACLs disabled by default (Bucket owner enforced), and their use is not recommended. | Object Ownership |
| Access Grants | Grants access at the prefix level to IAM Identity Center users and groups or to IAM principals. Applications call `GetDataAccess` to receive temporary credentials. | Identity Center |
| Access Point | A named network endpoint attached to a bucket. Each one has its own policy and Block Public Access settings, and it can be restricted to access from a VPC only. | Multi-Region Access Point |
| Access Point alias | A bucket-name-compatible alias (`...-s3alias`) assigned automatically to each access point. It lets tools that require a bucket name access data through the access point. | Access Point |
| Account regional namespace | A namespace introduced in March 2026 that reserves bucket names with an account- and Region-specific suffix (for example, `-123456789012-us-east-1-an`) for your account. It prevents others from claiming your names first. | Bucket name |
| AllAccessDisabled | A 403 error indicating that all access to the target has been disabled. It is usually an account-level issue that requires contacting AWS Support. | AccessDenied |
| Amazon S3 Files | A service, generally available since April 2026, that mounts an S3 bucket as a file system. Built on Amazon EFS, it lets you access the same data through both file APIs and S3 APIs. | Mountpoint for Amazon S3 |
| Annotation (S3 annotations) | A feature that attaches up to 1,000 named payloads of 1 byte to 1 MiB each to an object. You can add or change them later with APIs such as `PutObjectAnnotation` and analyze them in the S3 Metadata annotation table. | Metadata, User-defined metadata |
| ARN (Amazon Resource Name) | A unique identifier for an AWS resource. S3 uses two forms, `arn:aws:s3:::bucket` (bucket) and `arn:aws:s3:::bucket/key` (object), with the Region and account omitted. | IAM |
| Archive Access tier | An optional S3 Intelligent-Tiering tier for objects not accessed for 90 days or more. Retrieval requires a restore. | Intelligent-Tiering |
| Archive Instant Access tier | The Intelligent-Tiering tier that objects move to automatically after 90 days without access. It provides millisecond access without a restore. | Intelligent-Tiering |
| AWS Backup for S3 | S3 backup through AWS Backup. It offers continuous backups (restore to any point within 35 days) and periodic snapshots, and it requires versioning. | PITR |
| AWS CRT (Common Runtime) | A high-performance foundation library for the AWS SDKs. It maximizes S3 throughput with automatic multipart splitting and parallel transfers. | Transfer Manager |

## B

| Term | Description | Related |
| --- | --- | --- |
| Batch Operations | A managed feature that runs copy, tagging, restore, Lambda invocation, and other actions in bulk on billions of objects listed in a manifest (CSV or Inventory report). | Inventory |
| Batch Replication | Replicates existing objects, or objects that previously failed to replicate, after the fact with a Batch Operations job. | Replication |
| Block Public Access (BPA) | Four settings that block public access granted through ACLs or policies. You can set them at the account, bucket, or access point level, and all four are on by default for new buckets. | Public access |
| BlockedEncryptionTypes | A parameter in a bucket's default encryption configuration that rejects writes specifying SSE-C. Since April 2026, AWS has been rolling out SSE-C blocking by default for new buckets and others. | SSE-C |
| Bucket | The top-level container for objects. Types include general purpose buckets, directory buckets, table buckets, and vector buckets. | General purpose bucket |
| Bucket Key (S3 Bucket Keys) | An SSE-KMS feature that uses a short-lived bucket-level key to cut requests to KMS by up to 99%. It reduces KMS costs and throttling. | SSE-KMS |
| Bucket name | The name of a bucket. It must be 3–63 characters of lowercase letters, numbers, hyphens, and dots, and in the global namespace it must be unique within the partition. | Account regional namespace |
| Bucket owner enforced | An Object Ownership setting that disables ACLs and makes the bucket owner the owner of every object. This is the recommended setting. | Object Ownership |
| Bucket policy | A resource-based JSON policy attached to a bucket. Use it for cross-account access and conditional denies (such as enforcing TLS). | IAM policy |
| BucketAlreadyExists | A 409 error returned when another account already uses the bucket name you tried to create. If your own account owns it, you get `BucketAlreadyOwnedByYou` instead. | Bucket name |
| Byte-range fetch | Retrieving only part of an object with the `Range` header. Use it for parallel downloads or partial reads of large files. | GetObject |

## C

| Term | Description | Related |
| --- | --- | --- |
| Checksum (additional checksums) | Data integrity verification with CRC64NVME, CRC32, CRC32C, SHA-1, or SHA-256. The checksum can be computed at upload and stored with the object, and since 2025 the SDKs add a CRC checksum by default. | ETag |
| CloudFront | The AWS CDN. Placed in front of S3, it provides HTTPS, caching, and WAF. | OAC |
| CloudTrail data events | CloudTrail events that record object operations such as `GetObject` and `PutObject`. They are not recorded by default; you enable them for a fee. | Server access logging |
| Compliance mode | An Object Lock retention mode in which no one, including the root user, can delete the object or shorten the retention period. | Governance mode |
| Conditional delete | Deletes an object only if its ETag matches the `If-Match` header. It became available for general purpose buckets in September 2025. | Conditional write |
| Conditional write | Prevents overwrite conflicts with `If-None-Match: *` (write only if absent) or `If-Match: ETag` (write only if unchanged). A failed condition returns 412, and a conflict returns 409. | PreconditionFailed |
| Content-MD5 | A header carrying the Base64-encoded MD5 of the upload. If it does not match, the request is rejected with `BadDigest`. | Checksum |
| CopyObject | An API that copies an object within S3. A single request handles up to 5 GB; for larger objects use `UploadPartCopy`. | Multipart upload |
| CORS | A mechanism that lets browsers access resources from another origin. In S3 you configure CORS rules on the bucket. | Presigned URL |
| CreateSession | An API used with directory buckets to obtain short-lived session credentials. It lowers the latency of subsequent requests. | Directory bucket |
| Cross-Region Replication (CRR) | Asynchronously replicates objects to a bucket in a different Region. Use it for DR or to reduce latency. | SRR |
| CUR (Cost and Usage Report) | Detailed AWS billing data. For S3 you can analyze what drives costs by combining Usage Type and Operation. CUR 2.0 in Data Exports is now recommended. | Usage type |

## D

| Term | Description | Related |
| --- | --- | --- |
| Data perimeter | A boundary model that allows access only from trusted identities, resources, and networks. You combine `aws:PrincipalOrgID`, `aws:ResourceOrgID`, `aws:SourceVpce`, and similar keys in SCP, RCP, and VPC endpoint policies. | RCP, SCP |
| Deep Archive Access tier | An optional Intelligent-Tiering tier for objects not accessed for 180 days or more. Retrieval takes up to about 12 hours. | Intelligent-Tiering |
| Default encryption | The encryption setting applied automatically to objects written to a bucket. Since January 2023, all new objects are encrypted with at least SSE-S3. | SSE-S3 |
| Delete marker | A placeholder created when you delete an object in a versioning-enabled bucket without specifying a version ID. The data itself remains as a noncurrent version. | Versioning |
| DeleteObjects | A batch delete API that removes up to 1,000 objects in one request. | Lifecycle |
| Directory bucket | The bucket type used by S3 Express One Zone and similar classes. It sits in a single AZ (or Local Zone) and has a hierarchical namespace and session-based authentication. | Express One Zone |
| DSSE-KMS | Server-side encryption that applies two layers of encryption with KMS keys. It targets specific compliance requirements. | SSE-KMS |
| Durability | The likelihood that data is not lost. S3 Standard and other classes are designed for 99.999999999% (11 nines). | Availability |

## E

| Term | Description | Related |
| --- | --- | --- |
| Early delete fee | A prorated charge for deleting, overwriting, or transitioning an object before the minimum storage duration: 30 days for IA classes, 90 days for Glacier Instant/Flexible Retrieval, and 180 days for Deep Archive. | Storage class |
| Endpoint | The URL you send S3 requests to. Variants include `bucket.s3.region.amazonaws.com` (virtual-hosted style), the website endpoint, FIPS, dual-stack, and access points. | Virtual-hosted style |
| ETag | The object's entity tag. For a single PUT with SSE-S3 or no encryption it is the MD5 of the content, but for multipart uploads or SSE-KMS it is not an MD5. | Checksum |
| Event Notifications | Sends notifications about object creation, deletion, restore, and other events to SNS, SQS, Lambda, or EventBridge. Delivery is at-least-once. | EventBridge |
| EventBridge integration | When enabled per bucket, sends all S3 events to Amazon EventBridge. It supports advanced filtering, multiple targets, and replay. | Event Notifications |
| Expedited retrieval | The fastest retrieval option from Glacier Flexible Retrieval (usually 1–5 minutes). Provisioned capacity guarantees its availability. | Restore |
| ExpectedBucketOwner | A request parameter that makes the request fail with 403 if the bucket owner's account ID does not match. It protects against bucket name takeover. | Bucket sniping |
| Expiration | A lifecycle action that expires objects after a set number of days. When versioning is enabled, it adds a delete marker. | Lifecycle |
| Expired object delete marker | A delete marker with no remaining noncurrent versions. Lifecycle rules can remove it automatically. | Delete marker |
| Express One Zone (S3 Express One Zone) | A high-performance storage class in a single AZ that delivers consistent single-digit millisecond latency. It uses directory buckets. | Directory bucket |

## F

| Term | Description | Related |
| --- | --- | --- |
| FIPS endpoint | An endpoint that uses FIPS 140 validated cryptographic modules (`s3-fips.region.amazonaws.com`). Used for US government requirements. | Endpoint |
| Folder | A display concept in the S3 console; underneath, it is a `/`-delimited prefix in the key name. General purpose buckets have no real directories. | Prefix |
| Frequent Access tier | The default Intelligent-Tiering tier, with the same price and performance as S3 Standard. | Intelligent-Tiering |

## G

| Term | Description | Related |
| --- | --- | --- |
| Gateway endpoint | A VPC endpoint for S3 and DynamoDB. It works by adding a route to the route table and costs nothing extra. | Interface endpoint |
| General purpose bucket | The original S3 bucket type. It supports nearly all features and storage classes, and by default you can create up to 10,000 per account. | Directory bucket |
| GetObject | An API that retrieves an object. It supports conditional headers, Range, version selection, and response header overrides. | HeadObject |
| Glacier Deep Archive | The lowest-cost archive storage class. Standard retrieval usually completes within 12 hours and Bulk within 48 hours. Minimum storage duration is 180 days. | Restore |
| Glacier Flexible Retrieval | An archive storage class with retrieval in minutes to hours (formerly S3 Glacier). Minimum storage duration is 90 days. | Restore |
| Glacier Instant Retrieval | An archive storage class with millisecond retrieval, for data accessed about once a quarter. Minimum storage duration is 90 days. | Standard-IA |
| Governance mode | An Object Lock retention mode in which users with the `s3:BypassGovernanceRetention` permission can remove or shorten retention. | Compliance mode |
| GuardDuty Malware Protection for S3 | A feature in which GuardDuty scans newly uploaded objects for malware and reports the result through tags and other means. | GuardDuty S3 Protection |
| GuardDuty S3 Protection | A GuardDuty feature that analyzes CloudTrail S3 data events to detect anomalous access and signs of exfiltration. | CloudTrail data events |

## H

| Term | Description | Related |
| --- | --- | --- |
| HeadBucket | An API that checks whether a bucket exists and whether you can access it. The response headers also reveal the Region. | HeadObject |
| HeadObject | An API that retrieves an object's metadata without the body. On error it returns only a generic status code. | GetObject |
| Hive-style partition | A partitioning convention that names prefixes in `key=value` form, such as `year=2026/month=10/`. Athena and Glue recognize it automatically. | Data lake |

## I

| Term | Description | Related |
| --- | --- | --- |
| IAM policy | An identity-based policy attached to IAM users and roles. Within the same account, access is allowed if either the IAM policy or the bucket policy allows it and nothing denies it. | Bucket policy |
| Iceberg (Apache Iceberg) | An open table format for large-scale analytics. S3 Tables supports it natively. | S3 Tables |
| Infrequent Access tier | The Intelligent-Tiering tier that objects move to automatically after 30 days without access. | Intelligent-Tiering |
| Intelligent-Tiering | A storage class that automatically moves objects between tiers based on access patterns. It has no retrieval fees but charges a per-object monitoring fee (objects under 128 KB are excluded). | Storage class |
| Interface endpoint | An S3 VPC endpoint powered by AWS PrivateLink. It has private IPs and can also be used from on premises over Direct Connect or VPN (paid). | Gateway endpoint |
| Inventory (S3 Inventory) | Outputs a daily or weekly list of the objects in a bucket and their metadata as CSV, ORC, or Parquet. Use it as an alternative to LIST. | Batch Operations |
| InvalidObjectState | A 403 error returned when you GET an archived object that has not been restored. | Restore |

## K

| Term | Description | Related |
| --- | --- | --- |
| Key (object key) | The name that uniquely identifies an object within a bucket. Up to 1,024 bytes (UTF-8). | Prefix |
| KMS key | An encryption key managed in AWS KMS. SSE-KMS uses either the AWS managed key (`aws/s3`) or a customer managed key; cross-account access requires the latter. | SSE-KMS |

## L

| Term | Description | Related |
| --- | --- | --- |
| Legal hold | An Object Lock feature that prevents deletion of an object version with no expiration. You remove it with the `s3:PutObjectLegalHold` permission. | Object Lock |
| Lifecycle configuration | A set of rules that automates storage class transitions and expiration of objects. Rules are evaluated asynchronously once a day. | Transition |
| ListObjectsV2 | An API that lists objects in a bucket, up to 1,000 at a time. You can narrow results hierarchically with `prefix` and `delimiter`. | Inventory |
| ListObjectVersions | An API that lists all versions and delete markers. | Versioning |

## M

| Term | Description | Related |
| --- | --- | --- |
| Macie | A service that uses machine learning and pattern matching to find sensitive data (such as personal information) in S3. | GuardDuty |
| Manifest | The list of objects a Batch Operations job processes. You provide it as a CSV or an S3 Inventory report, or have it generated when you create the job. | Batch Operations |
| Metadata (S3 Metadata) | Automatically maintains a bucket's object information as Iceberg tables in S3 Tables (journal, live inventory, annotation) that you can query with SQL. | S3 Tables |
| MFA Delete | A setting that requires MFA to permanently delete versions or change the versioning state. Only the root user can enable it, and it cannot be used with lifecycle rules. | Versioning |
| Mountpoint for Amazon S3 | An open source client that mounts an S3 bucket as a local file system. It is optimized for sequential reads of large files. | Amazon S3 Files |
| Multi-Region Access Point (MRAP) | Serves buckets in multiple Regions through one global endpoint. It routes to the nearest Region and supports failover control. | CRR |
| Multipart upload (MPU) | Uploads a large object in parallel parts. Parts are 5 MiB–5 GiB, up to 10,000 parts. | UploadPart |

## N

| Term | Description | Related |
| --- | --- | --- |
| NoSuchKey | A 404 error returned when you GET a key that does not exist. If the caller lacks `s3:ListBucket`, the response is 403 instead. | AccessDenied |
| Noncurrent version | In a versioning-enabled bucket, a version that is no longer the latest because it was overwritten or deleted. It keeps incurring storage charges. | NoncurrentVersionExpiration |
| NoncurrentVersionExpiration | A lifecycle action that permanently deletes versions a set number of days after they become noncurrent. `NewerNoncurrentVersions` sets how many to keep. | Lifecycle |

## O

| Term | Description | Related |
| --- | --- | --- |
| OAC (Origin Access Control) | Lets CloudFront access an S3 origin with SigV4-signed requests. You can serve content while keeping the bucket private, and it supports SSE-KMS. | OAI |
| OAI (Origin Access Identity) | The older method of restricting access from CloudFront to S3. OAC is recommended for new setups. | OAC |
| Object | The unit of data stored in S3. It consists of the data, key, metadata, version ID, and more. The maximum size has been 50 TB (48.8 TiB) since December 2025. | Key |
| Object Lambda | Transforms data with Lambda on GET and other requests before returning it (S3 Object Lambda). As of 2025-11-07, available only to existing customers and select APN partners; no new capabilities are planned. | Access Point |
| Object Lock | Prevents deletion or overwriting of object versions under a WORM (Write Once Read Many) model. It offers retention periods (Governance / Compliance) and legal holds. | WORM |
| Object Ownership | A bucket setting that determines object ownership and how ACLs are handled. There are three options: Bucket owner enforced, Bucket owner preferred, and Object writer. | ACL |
| Object tag | A key-value pair attached to an object (up to 10). Usable in lifecycle filters and permission conditions. | Lifecycle |
| One Zone-IA | An infrequent access storage class stored in a single AZ. It is cheaper, but data can be lost if the AZ is lost. | Standard-IA |
| Outposts (S3 on Outposts) | Brings the S3 API to on-premises AWS Outposts. | Directory bucket |

## P

| Term | Description | Related |
| --- | --- | --- |
| Part | A unit of a multipart upload. Each has a part number from 1 to 10,000, and every part except the last must be at least 5 MiB. | Multipart upload |
| Path-style URL | A URL of the form `s3.region.amazonaws.com/bucket/key`. Buckets created after September 30, 2020 do not support it; virtual-hosted style is recommended. | Virtual-hosted style |
| PermanentRedirect | A 301 error returned when you send a request to an endpoint in a different Region from the bucket. | Endpoint |
| PITR (Point-in-time restore) | Restoring S3 data to its state at any point within the last 35 days using AWS Backup continuous backups. | AWS Backup for S3 |
| Prefix | The string at the beginning of a key. It is the unit for request rate scaling, lifecycle rules, permissions, and LIST. | Folder |
| Presigned POST | A signed policy for uploading directly from a browser form. Conditions such as `content-length-range` can limit size and Content-Type. | Presigned URL |
| Presigned URL | A URL that grants a specific operation for a limited time using the creator's permissions. With SigV4 the maximum is 7 days, but if created with temporary credentials, their expiration is the limit. | SigV4 |
| Principal | The entity a policy allows or denies (IAM user, role, account, service, or `*`). | Bucket policy |
| Public access | Permissions granted to anonymous users (`Principal: "*"`) and similar. Block Public Access blocks it across the board. | BPA |
| PutBucketAbac | An API that enables ABAC on a general purpose bucket. Once enabled, you manage bucket tags with `TagResource` / `UntagResource`. | ABAC |
| PutObject | An API that uploads an object. Up to 5 GiB in a single request. | Multipart upload |

## R

| Term | Description | Related |
| --- | --- | --- |
| RCP (Resource Control Policy) | An AWS Organizations policy that applies organization-wide guardrails to resources such as S3 buckets. Introduced in November 2024, it is used to restrict access from external principals, among other things. | SCP, Data perimeter |
| Read-after-write consistency | A read right after a write returns the latest data. Since December 2020, S3 provides strong consistency in all Regions (including LIST). | Strong consistency |
| Reduced Redundancy Storage (RRS) | A legacy storage class with lower durability. It is no longer recommended, and Standard is often cheaper. | Storage class |
| Replica modification sync | A setting that syncs metadata changed on replicas (tags, ACLs, Object Lock settings) back to the source. Used for bidirectional replication. | Replication |
| Replication | Automatically and asynchronously copies objects between buckets (CRR, SRR). Both source and destination need versioning. | Batch Replication |
| Replication Time Control (RTC) | A replication option with an SLA to replicate 99.99% of new objects within 15 minutes. It includes metrics and notifications. | Replication |
| Request rate | Requests per second. It scales automatically per prefix, and sudden spikes can temporarily return 503 SlowDown. | SlowDown |
| Requester Pays | A bucket setting that bills request and data transfer charges to the requester. Requesters must include `x-amz-request-payer: requester`. | Billing |
| Restore (RestoreObject) | Creates a temporary readable copy of an archived object. You choose the Expedited, Standard, or Bulk retrieval speed. | Glacier |
| Retention period | The Object Lock retention deadline. Until it passes, the version cannot be deleted or overwritten. | Object Lock |
| Routing rules | Rules for conditional redirects in static website hosting. | Website endpoint |

## S

| Term | Description | Related |
| --- | --- | --- |
| S3 Tables (table bucket) | A dedicated bucket type for storing and managing Apache Iceberg tables. It handles compaction and snapshot management automatically. | Iceberg |
| S3 Vectors (vector bucket) | A dedicated bucket type for storing vector embeddings and running similarity search. You manage data per vector index. | RAG |
| SCP (Service Control Policy) | An AWS Organizations policy that sets the maximum permissions available to principals in an account. | RCP |
| Server access logging | Delivers requests to a bucket as log files in another bucket. Delivery is best effort, and the feature is free (storage is billed separately). | CloudTrail data events |
| Server-side encryption (SSE) | S3 encrypts data at rest. Options are SSE-S3, SSE-KMS, DSSE-KMS, and SSE-C. | Default encryption |
| Session tags | Tags passed during `AssumeRole`. Policies can reference them as `aws:PrincipalTag`, which enables multi-tenant ABAC. | ABAC |
| SigV4 (Signature Version 4) | The signing method for AWS API requests. SigV2 is deprecated for S3, and new Regions and features support SigV4 only. | Presigned URL |
| SignatureDoesNotMatch | A 403 error returned when the computed signature does not match the server's. Causes include a wrong key, modified headers, or encoding differences. | SigV4 |
| SlowDown | A 503 error returned when the request rate is too high. Retry with exponential backoff and spread requests across prefixes. | Request rate |
| SRR (Same-Region Replication) | Replication to another bucket in the same Region. Used for log aggregation and copies between accounts. | CRR |
| SSE-C | S3 encrypts data with a key the customer supplies on every request. AWS does not store the key. Since April 2026, blocking by default has been rolling out for new buckets and others. | BlockedEncryptionTypes |
| SSE-KMS | Encryption with an AWS KMS key. Key policies and CloudTrail provide access control and auditing. | Bucket Key |
| SSE-S3 | Encryption with keys managed by S3 (AES-256). The default for all new objects. | Default encryption |
| Standard (S3 Standard) | The default storage class for frequently accessed data. Data is stored across three or more AZs. | Storage class |
| Standard-IA | A storage class for infrequent access. Storage is cheaper, but it has retrieval fees and a minimum billing of 30 days and 128 KB. | One Zone-IA |
| Static website hosting | Serves a bucket as an HTTP website. The website endpoint does not support HTTPS, so put CloudFront in front of it in production. | Website endpoint |
| Storage class | A combination of durability, availability, price, and retrieval characteristics. You set it per object. | Lifecycle |
| Storage Class Analysis | Analyzes access patterns per prefix or tag and suggests when to transition to Standard-IA. | Lifecycle |
| Storage Lens | A dashboard of organization-wide S3 metrics for usage, activity, cost optimization, and data protection. It offers free metrics and advanced metrics. | Usage type |
| Strong consistency | Every read and LIST reflects the latest state immediately after a write, overwrite, or delete. S3 provides it at no extra cost. | Read-after-write consistency |

## T

| Term | Description | Related |
| --- | --- | --- |
| TagStorage | The Usage Type for object tag storage charges (`TagStorage-TagHrs`). | Object tag |
| Transfer Acceleration | Speeds up long-distance uploads and downloads through CloudFront edge locations. You are not charged for transfers that were not faster. | Endpoint |
| Transfer Manager | A high-level SDK transfer API. It handles multipart splitting, parallelism, and retries automatically. | AWS CRT |
| Transition | A lifecycle action that moves an object to another storage class. Objects cannot move up to a higher class (waterfall model). | Lifecycle |

## U

| Term | Description | Related |
| --- | --- | --- |
| UploadPart | An API that sends one part of a multipart upload. You pass the ETag from its response when completing the upload. | Multipart upload |
| UploadPartCopy | An API that copies part of an existing object as a part. Used for copies larger than 5 GB. | CopyObject |
| Usage type | The kind of usage in billing data, such as `TimedStorage-ByteHrs` (Standard storage), `Requests-Tier1` (PUT, LIST, and similar), and `DataTransfer-Out-Bytes` (internet transfer). | CUR |
| User-defined metadata | User-defined metadata starting with `x-amz-meta-`. Up to 2 KB in total. Changing it requires copying the object again. | Annotation |

## V

| Term | Description | Related |
| --- | --- | --- |
| Version ID | A unique ID assigned to each version of an object in a versioning-enabled bucket. `null` when versioning is disabled. | Versioning |
| Versioning | Keeps every version of the same key. Once enabled, it cannot be turned off, only suspended. | Delete marker |
| Virtual-hosted style | A URL of the form `bucket.s3.region.amazonaws.com/key`. The recommended addressing style. | Path-style URL |
| VPC endpoint policy | A policy attached to a VPC endpoint. It restricts which buckets and actions are reachable through that endpoint. | Gateway endpoint |

## W

| Term | Description | Related |
| --- | --- | --- |
| Website endpoint | The endpoint for static website hosting (`bucket.s3-website-region.amazonaws.com` and similar). HTTP only; it supports index documents and redirects. | Static website hosting |
| Well-Architected Framework | A collection of AWS design principles organized into six pillars: security, reliability, performance efficiency, cost optimization, operational excellence, and sustainability. | — |
| WORM | Write Once Read Many. A storage model in which data cannot be changed or deleted once written; S3 implements it with Object Lock. | Object Lock |
| WriteGetObjectResponse | The API an S3 Object Lambda function uses to return transformed results to the caller. | Object Lambda |

## X

| Term | Description | Related |
| --- | --- | --- |
| `x-amz-bucket-region` | A header returned in `HeadBucket` and other responses that indicates the bucket's Region. | PermanentRedirect |
| `x-amz-restore` | A header returned by `HeadObject` showing restore status. `ongoing-request` and `expiry-date` show progress and expiration. | Restore |
| `x-amz-server-side-encryption` | A header that reports or specifies an object's encryption method (`AES256`, `aws:kms`, `aws:kms:dsse`). | SSE |

## Related services and concepts (A–Z)

These are not S3 features themselves, but related services and general concepts that come up often when using S3.

| Term | Description | Related |
| --- | --- | --- |
| Amazon Athena | A serverless query service that runs standard SQL directly on data in S3. It charges by data scanned, so Parquet and partitioning matter. | Glue Data Catalog |
| AssumeRole | The STS API that returns temporary credentials for an IAM role. You can attach session tags and session policies. | Session tags |
| At-least-once delivery | A delivery guarantee in which messages arrive at least once but may be duplicated. S3 Event Notifications works this way, so make processing idempotent. | Event Notifications |
| Availability | The fraction of time a service is usable. S3 Standard is designed for 99.99% availability, and the SLA is defined separately. | Durability |
| Availability Zone (AZ) | A physically separate group of data centers within a Region. Standard and other classes store data across three or more AZs. | One Zone-IA |
| AWS DataSync | A managed service that transfers and syncs large amounts of data quickly between S3 and on premises or other clouds. | Transfer Acceleration |
| AWS Glue Data Catalog | A metadata catalog that holds schemas and partition information for data in S3. Athena and EMR read from it. | Athena |
| AWS Lake Formation | A service that centrally manages data lake permissions (database, table, column, row). Use it instead of direct S3 permissions. | Data lake |
| AWS Snowball | A service that moves petabytes of data to S3 on physical devices. Use it when network transfer is impractical. | DataSync |
| AWS Storage Gateway | A hybrid storage service for using S3 from on premises over NFS, SMB, or iSCSI (for example, S3 File Gateway). | Amazon S3 Files |
| Bulk retrieval | The lowest-cost Glacier retrieval option. Usually 5–12 hours for Flexible Retrieval and within 48 hours for Deep Archive. | Restore |
| Cache-Control | An HTTP header, storable as object metadata, that controls how long browsers and CloudFront cache content. | CloudFront |
| Canned ACL | Predefined ACLs such as `private`, `public-read`, and `bucket-owner-full-control`. In buckets with Bucket owner enforced, specifying anything other than `bucket-owner-full-control` is rejected. | ACL |
| Content-Type | Metadata indicating an object's media type. If it is wrong, browsers do not display the object correctly. | User-defined metadata |
| Control Tower Log Archive | A dedicated account and S3 bucket created by AWS Control Tower to aggregate the organization's CloudTrail and Config logs. | Object Lock |
| Cross-account access | Access from a principal in another account. In general, both the caller's IAM policy and your bucket policy must allow it. | Bucket policy |
| Data Exports (CUR 2.0) | Exports AWS billing data to S3. You can select columns with SQL, which makes analysis in Athena easy. | CUR |
| Data lake | An architecture that stores raw through processed data in S3 in separate zones and serves it to multiple analytics engines. | Iceberg |
| Default root object | The object CloudFront returns for requests to the root (`/`), such as `index.html`. It does not apply to subdirectories. | Static website hosting |
| Dual-stack endpoint | An S3 endpoint that supports both IPv4 and IPv6 (`s3.dualstack.region.amazonaws.com`). | Endpoint |
| Exponential backoff | A technique that increases the wait time exponentially with each retry. The standard response to 503 SlowDown and 500 InternalError. | SlowDown |
| Idempotency | The property that running the same operation repeatedly produces the same result. The basis for handling duplicates in event-driven processing. | At-least-once delivery |
| Index document | The object returned for requests to a directory in static website hosting, such as `index.html`. | Website endpoint |
| Lambda recursive loop detection | A Lambda feature that detects and stops the same event cycling between Lambda and services such as S3. It assumes your design already separates input and output buckets. | Event Notifications |
| Optimistic locking | A concurrency control that writes with the ETag read earlier in `If-Match` and fails if the object has changed. S3 conditional writes make this possible. | Conditional write |
| Parquet | A columnar file format. It compresses well and reduces the data scanned by Athena and similar engines. | Data lake |
| PrivateLink | AWS private connectivity technology. S3 interface endpoints use it. | Interface endpoint |
| Provisioned capacity unit | A unit that reserves Expedited retrieval capacity for Glacier Flexible Retrieval. It guarantees Expedited retrievals even during high demand. | Expedited retrieval |
| Region | A geographic AWS location. A bucket belongs to one Region at creation and cannot be moved later. | Endpoint |
| RPO / RTO | Recovery point objective (how much data you can afford to lose) and recovery time objective (how quickly you must recover). The basis for designing backup and replication. | CRR |
| Sequencer | A value in S3 events used to determine the order of events for the same key. | Event Notifications |
| Signed cookies / signed URLs (CloudFront) | Time-limited access issued by CloudFront. It is separate from S3 presigned URLs and is signed with a key pair. | Presigned URL |
| Small object overhead | This guide's umbrella term for how objects under 128 KB are treated, such as minimum billing sizes and exclusion from monitoring. Bundling small files usually pays off. | Standard-IA |
| STS (Security Token Service) | A service that issues temporary security credentials. Used for assuming roles and federation. | AssumeRole |
| TLS | A protocol for encrypting traffic. In S3 you enforce HTTPS with `aws:SecureTransport` and require a minimum version with the `s3:TlsVersion` condition. | Bucket policy |
| Unicode normalization | Converting visually identical characters to the same byte sequence (NFC, NFD). S3 compares keys as bytes, so different normalization produces different keys. | Key |
| WAF (AWS WAF) | A web application firewall. Attach it to CloudFront to protect S3 content delivery. | CloudFront |

## Commonly confused pairs

| A | B | Difference |
| --- | --- | --- |
| Durability | Availability | Durability is whether data is lost; availability is whether you can access it right now. Note that One Zone-IA is designed for 11 nines of durability but can still lose data if the AZ is lost. |
| Bucket policy | IAM policy | The former is attached to a resource and specifies a Principal. The latter is attached to a principal and has no Principal element. |
| SCP | RCP | An SCP caps what your organization's principals can do; an RCP caps who can do what to your organization's resources. |
| Access Point | Access Grants | The former is an endpoint combining network and policy controls; the latter grants prefix-level access to identities (IdP users and groups). |
| OAC | OAI | Both restrict access from CloudFront to S3. OAC is the newer method and supports SSE-KMS and all Regions. |
| Presigned URL (S3) | Signed URL (CloudFront) | The former is SigV4-signed with IAM credentials; the latter is signed with a key from a CloudFront key group. |
| Expiration | NoncurrentVersionExpiration | The former expires current versions (adding a delete marker if versioning is enabled); the latter permanently deletes noncurrent versions. |
| Governance mode | Compliance mode | The former can be lifted with a special permission; in the latter, no one can lift or shorten retention. |
| Glacier Instant Retrieval | Glacier Flexible Retrieval | The former is readable in milliseconds (no restore); the latter requires a restore (minutes to hours). |
| SRR | CRR | Within the same Region versus across Regions. |
| Gateway endpoint | Interface endpoint | The former uses route tables, is free, and works only within the VPC; the latter uses ENIs, is paid, and also works from on premises. |
| ETag | Checksum | An ETag is an identifier that is not always an MD5; an additional checksum is an integrity value computed with an algorithm you explicitly choose. |
| Server access logging | CloudTrail data events | The former is best-effort log files; the latter is structured API call events that integrate with other services and are easier to analyze in CloudTrail Lake. |
| Directory bucket | General purpose bucket | The former is single-AZ with a hierarchical namespace and session authentication; the latter is the original type with full feature support. |
| Folder | Prefix | A folder is a console display concept; underneath, it is a prefix (the leading part of the key string). |

## Abbreviations

| Abbreviation | Full name |
| --- | --- |
| ABAC | Attribute-Based Access Control |
| ACL | Access Control List |
| AZ | Availability Zone |
| BPA | Block Public Access |
| CRR | Cross-Region Replication |
| CUR | Cost and Usage Report |
| DSSE-KMS | Dual-layer Server-Side Encryption with AWS KMS keys |
| GDA | Glacier Deep Archive (Usage Type abbreviation) |
| GIR | Glacier Instant Retrieval (Usage Type abbreviation) |
| INT | Intelligent-Tiering (Usage Type abbreviation) |
| MPU | Multipart Upload |
| MRAP | Multi-Region Access Point |
| OAC | Origin Access Control |
| OAI | Origin Access Identity |
| PITR | Point-In-Time Restore |
| RCP | Resource Control Policy |
| RTC | Replication Time Control |
| SCP | Service Control Policy |
| SIA | Standard-Infrequent Access (Usage Type abbreviation) |
| SRR | Same-Region Replication |
| SSE | Server-Side Encryption |
| VPCE | VPC Endpoint |
| WORM | Write Once Read Many |
| XZ | S3 Express One Zone (Usage Type abbreviation) |
| ZIA | One Zone-Infrequent Access (Usage Type abbreviation) |

## References

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
- Amazon S3 Object Lambda availability change: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/amazons3-ol-change.html>
