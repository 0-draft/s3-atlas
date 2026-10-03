# Common misconceptions FAQ and quiz

_Last verified: 2026-10-03_

S3 has been around since 2006, so "common knowledge" based on old blog posts and past behavior still circulates. This chapter takes the misconceptions you hear most often in practice, one at a time, and corrects them against the current behavior. At the end, it explains how to use the quiz (`data/quiz.json`) to check your understanding.

## 0. Misconceptions at a glance

| # | Misconception | Reality (as of 2026-10) |
| --- | --- | --- |
| 1 | S3 is eventually consistent, so you may not be able to read right after writing | Strong read-after-write consistency (including LIST) since December 2020 |
| 2 | S3 has folders | General purpose buckets have a flat key space. Folders are just how prefixes are displayed |
| 3 | Keys are slow unless you randomize their beginnings | Since the 2018 improvements, 3,500/5,500 req/s per prefix. Randomizing is unnecessary; spreading load still helps |
| 4 | The maximum object size is 5 TB | 50 TB (48.8 TiB) since December 2025 |
| 5 | Objects are not encrypted unless you turn it on | All new objects are encrypted with SSE-S3 automatically since January 2023 |
| 6 | The first thing to do with a new bucket is set ACLs | Since April 2023, new buckets default to ACLs disabled (Bucket owner enforced) and BPA enabled |
| 7 | You can serve a static site over HTTPS from the website endpoint | The website endpoint is HTTP only. Use CloudFront for HTTPS |
| 8 | The ETag is the file's MD5 | Not an MD5 for multipart uploads or SSE-KMS |
| 9 | Objects in Glacier are readable right away | Everything except Instant Retrieval requires a restore |
| 10 | Lifecycle rules take effect the moment you set them | Evaluated asynchronously once a day. It can take several days |
| 11 | Turning off versioning removes old versions | You can only suspend it, and existing versions remain |
| 12 | Setting up replication also copies existing objects | New objects only. Use Batch Replication for existing ones |
| 13 | Deletes are always synced by replication | Delete marker replication depends on configuration; version-specific deletes are not replicated |
| 14 | When you get a 403, you only need to check the IAM policy | Many layers: bucket policy, BPA, KMS, VPCE, SCP/RCP, ACLs, and more |
| 15 | A missing key always returns 404 | Without `s3:ListBucket`, you get 403 |
| 16 | A presigned URL is valid for up to 7 days | If created with temporary credentials, their expiration is the limit |
| 17 | Intelligent-Tiering saves money on small files too | Objects under 128 KB are not monitored and always pay the Frequent Access rate |
| 18 | 503 SlowDown means S3 is having an outage | Usually throttling while S3 scales. Handle it with retries and by spreading load |
| 19 | One Zone-IA has low durability | Same 11 nines durability target, but data can be lost if the AZ is lost |
| 20 | A bucket name only needs to be unique within your account | In the global namespace it must be unique across the partition. Account regional namespaces exist since March 2026 |
| 21 | You are billed for every S3 403 error | 403s from outside your organization or account are not billed to the bucket owner |
| 22 | S3 cannot prevent concurrent write conflicts | Conditional writes (`If-None-Match` / `If-Match`) and conditional deletes exist |
| 23 | SSE-C is the most secure option | Key management is a heavy burden, and since April 2026 it is blocked by default for new buckets and others |
| 24 | You can create as many buckets as you like for free | Default quota is 10,000, and buckets beyond 2,000 are billed under `Global-Bucket-Hrs` |
| 25 | The total from `aws s3 ls --summarize` is your billed storage | It excludes noncurrent versions, incomplete MPUs, metadata, and more |
| 26 | Gateway endpoints work from on premises too | VPC only. On premises needs an interface endpoint |
| 27 | Event notifications arrive exactly once and in order | At-least-once. Duplicates and reordering happen |
| 28 | Only you can reuse a bucket name you deleted | In the global namespace, anyone can recreate it |

## 1. Consistency and namespace

### Q1. A GET right after a write can return stale data

Misconception. Since December 2020, S3 provides strong read-after-write consistency for all requests in all Regions, with no extra cost or performance penalty. GET, HEAD, and LIST after a new PUT, an overwriting PUT, or a DELETE all reflect the latest state.

There are some caveats.

- Concurrent writes to the same key follow "last writer wins," and there is no locking. Use conditional writes to prevent conflicts.
- Caching layers such as CloudFront are a separate matter and can return stale content.
- Changes to bucket configuration can take time to propagate, and there is no general guarantee in seconds. The docs give examples: a new or updated lifecycle configuration takes "a few minutes" to take effect, and after enabling versioning for the first time AWS recommends waiting 15 minutes before PUT / DELETE.

### Q2. S3 has directories (folders)

Misconception (for general purpose buckets). A general purpose bucket is a flat key-value store, and `photos/2026/a.jpg` is just one key named `photos/2026/a.jpg`. Console folders only display the result of a LIST that uses `/` as the delimiter.

The exception is S3 Express One Zone directory buckets, which have a hierarchical namespace where directories are real entities.

### Q3. You need random hashes at the start of keys to get good performance

Partly a misconception. Before the 2018 performance improvements, spreading out the beginnings of key names was recommended. Today S3 supports at least 3,500 write and 5,500 read requests per second per prefix, with no limit on the number of prefixes.

Randomizing itself is unnecessary, but avoiding extreme request concentration on a single prefix still helps. During sudden traffic spikes, 503 SlowDown can appear until internal partitioning catches up.

### Q4. A bucket name only needs to be unique within your own account

Misconception. In the traditional global namespace, a bucket name must be unique across all accounts in the partition (aws, aws-cn, aws-us-gov). If someone else uses it you get `BucketAlreadyExists`, and when you delete a bucket, a third party can claim its name.

With account regional namespaces, introduced in March 2026, you can reserve a name for yourself by adding a suffix specific to your account and Region, as in `mybucket-123456789012-us-east-1-an`.

## 2. Size and performance

### Q5. S3 objects are limited to 5 TB

Outdated. In December 2025 the maximum object size was raised to 50 TB. The multipart limits table in the User Guide lists it as 48.8 TiB. A single PUT is still limited to 5 GiB, and multipart uploads allow up to 10,000 parts of 5 MiB–5 GiB.

### Q6. Sending a large file in one PUT is fastest

Misconception. The official guideline is to consider multipart upload once objects exceed 100 MB. Sending parts in parallel raises throughput, and on failure you only resend the failed part. SDKs and the CLI built on AWS CRT split and parallelize automatically.

### Q7. 503 SlowDown means S3 is down, so all you can do is wait

Misconception. SlowDown is throttling that signals the request rate is too high, and it is part of S3's protection mechanism. You can resolve it with exponential backoff retries, spreading load across prefixes, and ramping traffic up gradually. Also, 5xx errors are not billed to the bucket owner.

## 3. Security and permissions

### Q8. Objects are not encrypted unless you configure it explicitly

Outdated. Since January 5, 2023, every new object uploaded to S3 is encrypted automatically with SSE-S3 (AES-256) at no extra cost. If you need stronger control (key policies, auditing), set SSE-KMS as the default encryption.

### Q9. SSE-C (customer-provided keys) is the most secure option

Easy to get wrong. With SSE-C, AWS does not hold the key, but you must send the key with every request, and if you lose it the data cannot be decrypted. Attackers with stolen credentials can also use it to re-encrypt and overwrite data with their own keys.

In November 2025, S3 added a bucket setting to block SSE-C (`BlockedEncryptionTypes`), and in April 2026 it began rolling out SSE-C disabled by default for new buckets and for existing buckets with no SSE-C objects. In most cases SSE-KMS is better for both operations and auditing.

### Q10. The first thing to do with a new bucket is set ACLs

Outdated. Since April 2023, new buckets default to Object Ownership = Bucket owner enforced (ACLs disabled) and all Block Public Access settings enabled. Control access with bucket policies, IAM, access points, and Access Grants.

### Q11. Fixing the IAM policy resolves any 403

Misconception. S3 authorization has many layers, and any of these can deny a request.

1. IAM policy (identity-based)
2. Bucket policy / access point policy
3. Block Public Access
4. ACLs and Object Ownership (objects owned by another account)
5. KMS key policy
6. VPC endpoint policy
7. SCP / RCP / permissions boundary / session policy
8. Requester Pays, Object Lock, archive state

For requests from the same account or the same organization, the error message includes the type of policy that denied the request (and, for explicit denies, often the policy ARN), so read the message first.

### Q12. Accessing a missing key always returns 404

Misconception. If the caller lacks `s3:ListBucket` on the bucket, S3 returns 403 so it does not reveal whether the key exists. If you get a 403 even though your permissions look correct, the key name may be wrong.

### Q13. Anyone can make a presigned URL valid for 7 days

Partly a misconception. The maximum expiration for a SigV4 presigned URL is 7 days (604,800 seconds), but the URL is bound by the permissions and expiration of the credentials used to create it. If you create it with temporary IAM role credentials, the URL stops working when the session expires. And if the creator lacks permission for the operation, the URL does not work.

### Q14. A bucket policy with `Principal: "*"` always makes the bucket public

Misconception. When Block Public Access is enabled, it blocks saving policies considered public and blocks public access granted by such policies. Conversely, a policy with conditions such as `aws:PrincipalOrgID` is not considered public. The recommended approach is to serve public content through CloudFront + OAC and keep the bucket private.

## 4. Storage classes and lifecycle

### Q15. Data in Glacier can be read with GET right away

It depends on the class. Glacier Instant Retrieval is readable in milliseconds as is. Glacier Flexible Retrieval, Glacier Deep Archive, and the Intelligent-Tiering Archive Access / Deep Archive Access tiers require `RestoreObject`, and a GET without a restore returns `InvalidObjectState`. Typical retrieval times: for Flexible, Expedited 1–5 minutes, Standard 3–5 hours, and Bulk 5–12 hours; for Deep Archive, Standard within 12 hours and Bulk within 48 hours.

### Q16. Putting everything in Intelligent-Tiering makes everything cheaper

Misconception. Objects under 128 KB are not monitored and always pay the Frequent Access tier rate (equivalent to Standard), with no monitoring fee. Objects of 128 KB or more incur monitoring and automation fees based on object count. If your access pattern is clear, transitioning directly to the right class with lifecycle rules can be cheaper.

### Q17. Lifecycle rules take effect as soon as you save them

Misconception. Rules are evaluated asynchronously once a day, and expiration dates are rounded to 00:00 UTC of the next day. Large buckets can take several days to finish processing. However, once an object becomes eligible for expiration, you are no longer charged for its storage.

Also, since September 2024, objects under 128 KB are excluded from transitions by default. To transition small objects too, specify them explicitly with a filter such as `ObjectSizeGreaterThan`.

### Q18. One Zone-IA is a low-durability storage class

Partly a misconception. One Zone-IA has the same 99.999999999% durability design target as other classes, but that applies within a single AZ. If the AZ is physically lost, data can be lost. Its availability target, 99.5%, is also lower than Standard's 99.99%. Use it for reproducible data or secondary copies.

## 5. Versioning, replication, and protection

### Q19. Disabling versioning removes old versions

Misconception. Once enabled, versioning can only be suspended; it cannot return to unversioned. Suspending it leaves existing versions in place, and they keep incurring charges. If you no longer need them, delete them with `NoncurrentVersionExpiration`.

### Q20. A DELETE in a versioning-enabled bucket destroys the data

Misconception. A DELETE without a version ID only creates a delete marker, and the data remains as a noncurrent version. Removing the delete marker restores it. To delete permanently, delete with a version ID or expire noncurrent versions with lifecycle rules.

### Q21. Setting up replication also copies existing objects

Misconception. Replication rules apply to objects written after the rule is set up. Use S3 Batch Replication for existing objects and objects that previously failed. Also, replicas are not chain-replicated to further buckets.

### Q22. Replication can replace backups

Be careful. Replication copies changes as they are, so logical corruption and malicious overwrites are replicated too. Version-specific deletes are not replicated by design, but for ransomware protection, combine Object Lock, isolated copies in a separate account, and AWS Backup (continuous backups that restore to any point within 35 days).

### Q23. Object Lock can easily be removed later

It depends on the mode. In Governance mode, users with the `s3:BypassGovernanceRetention` permission can remove or shorten retention. In Compliance mode, no one, including the root user, can shorten the retention period, and the object cannot be deleted until it expires. When testing, use a short retention period or Governance mode.

## 6. Cost and operations

### Q24. Every request that fails with 403 is billed

Outdated. Today, `AccessDenied` (403) requests from outside the bucket owner's individual account or organization are not billed to the bucket owner. 5xx errors are not billed either.

### Q25. Buckets are free no matter how many you create

Misconception. The default quota is 10,000 buckets per account (raisable on request). Billing data has two Usage Types, `Global-Bucket-Hrs-FreeTier` (free tier for up to 2,000 buckets) and `Global-Bucket-Hrs` (buckets beyond the free tier), so buckets beyond 2,000 are billed.

### Q26. The total from `aws s3 ls --recursive --summarize` matches your billed storage

Misconception. This command counts only current versions. Billing also includes noncurrent versions, parts of incomplete multipart uploads, per-object Glacier metadata, and more. For accurate figures, use S3 Storage Lens, the CloudWatch `BucketSizeBytes` metric, or S3 Inventory.

### Q27. Comparing ETags verifies that files are identical

A misconception, with conditions. For a single PUT with SSE-S3 or no encryption, the ETag is the MD5, but for multipart uploads it takes the form "MD5 of the concatenated part MD5s - part count," and with SSE-KMS / SSE-C it is not an MD5. For integrity verification, use additional checksums such as CRC64NVME, CRC32C, or SHA-256.

### Q28. S3 cannot prevent conflicts from concurrent writes to the same key

Outdated. In 2024, conditional writes became available for general purpose buckets (`If-None-Match: *` for "create only if absent" and `If-Match: <ETag>` for "update only if unchanged"), and in September 2025 conditional deletes with `If-Match` were added. A failed condition returns 412 Precondition Failed, and a conflict from a concurrent operation returns 409 Conflict.

## 7. Other common misconceptions

### Q29. S3 Transfer Acceleration always makes transfers faster and is always billed

Misconception. Transfer Acceleration speeds up long-distance transfers through CloudFront edge locations, and it helps little when the client is close to the bucket's Region. AWS states that it does not charge the acceleration fee when a transfer is not faster than a regular one. You can check the benefit in advance with the official speed comparison tool. It also cannot be used when the bucket name contains a dot (`.`).

### Q30. Creating a gateway VPC endpoint blocks all S3 access from outside the VPC

Misconception. A gateway endpoint only provides a path from inside the VPC to S3; it does not stop S3 access over the internet. To deny access from outside the VPC, write a Deny in the bucket policy with a condition on `aws:SourceVpce` or `aws:SourceVpc`. Note that such a Deny also blocks operations over the internet, including from the console.

### Q31. Gateway endpoints work from on premises too

Misconception. Gateway endpoints work only for resources inside the VPC, not for on-premises networks behind Direct Connect or VPN. To connect privately from on premises, use an interface endpoint (PrivateLink, paid).

### Q32. S3 event notifications always arrive exactly once and in order

Misconception. S3 Event Notifications uses at-least-once delivery, and events are occasionally duplicated or reordered. Use the `sequencer` value in each event to determine the order of events for the same key. The standard practice is to make processing idempotent and put SQS with a DLQ in between.

### Q33. Enabling CloudTrail records every object read and write

Misconception. By default CloudTrail records management events (bucket creation, policy changes, and so on); data events such as `GetObject` and `PutObject` need extra configuration (paid). Server access logs are a lower-cost alternative, but their delivery is best effort and completeness is not guaranteed.

### Q34. A Deny in a bucket policy can lock out even the root user, so it is safe

Partly a misconception. You can indeed lock everyone out with a bad bucket policy, but the root user of the same account can delete the bucket policy to recover (there is an official procedure). If your organization also wants to restrict actions by root or account administrators, add SCPs / RCPs.

### Q35. S3 Express One Zone is a faster S3 Standard that works the same way

Misconception. S3 Express One Zone uses a different bucket type, the directory bucket, and lives in a single AZ. It behaves differently, with session-based authentication (`CreateSession`) and a hierarchical namespace, and it does not support every general purpose bucket feature. Because the AZ could be lost, use it mainly for reproducible data, temporary data, training caches, and similar workloads.

### Q36. With Requester Pays enabled, you pay nothing no matter who accesses the bucket

Misconception. With Requester Pays, the requester pays request and data transfer charges, but the bucket owner still pays for storage. Anonymous access is not allowed on Requester Pays buckets, and requesters must authenticate and include `x-amz-request-payer: requester`.

### Q37. Only you can reuse the name of a bucket you deleted

Misconception (in the global namespace). When you delete a bucket, its name becomes available for anyone to create again. If the old bucket name remains in app configuration, IaC, DNS CNAMEs, or public documentation, a third party could create a bucket with the same name to receive your data or serve fake content. Countermeasures: remove references first, pin the expected account with the `ExpectedBucketOwner` parameter or the `aws:ResourceAccount` condition, and use account regional namespaces.

### Q38. S3 Storage Lens is a paid service, so it is better not to use it

Misconception. Storage Lens has free metrics (focused on usage) and paid advanced metrics and recommendations. The free dashboard alone shows storage per bucket, the share of noncurrent versions, the size of incomplete multipart uploads, and other information useful for investigating unexpected bills.

### Q39. Clicking "Create folder" in the console adds storage for the folder on top of the objects inside it

Mostly a misconception. "Create folder" in the console only creates a zero-byte object whose key ends in `/`, so it uses almost no storage (you pay for one PUT request). This zero-byte object is also why a folder still appears after you delete every object inside it.

## 8. Quiz

`data/quiz.json` contains 40 four-choice questions. The web app defaults to English and can switch to Japanese, so each question has both English and Japanese text.

### 8.1 Data format

| Field | Type | Description |
| --- | --- | --- |
| `id` | String | Unique ID (`q01`–`q40`) |
| `question` | `{ en, ja }` | Question text |
| `choices` | `{ en: [4], ja: [4] }` | Choices, in the same order in both languages |
| `answer` | Number (0–3) | Index of the correct choice |
| `explanation` | `{ en, ja }` | Explanation |
| `difficulty` | `easy` / `medium` / `hard` | Difficulty |
| `topic` | `{ en, ja }` | Topic |

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

### 8.2 Coverage

| Topic | Approx. questions | Matching chapter content |
| --- | --- | --- |
| Basics (consistency, namespace, limits) | 8 | Buckets, keys, object size, consistency |
| Security (BPA, ACLs, encryption, policies) | 10 | Permission evaluation, KMS, presigned URLs |
| Storage classes and lifecycle | 7 | Minimum storage duration, restore, 128 KB rule |
| Protection (versioning, Object Lock, replication, Backup) | 7 | DR and ransomware protection |
| Performance, operations, and cost | 8 | Request rates, errors, billing |

### 8.3 Validation

```bash
node -e 'const q=require("./data/quiz.json"); console.log(q.length, q.every(x => x.choices.en.length===4 && x.choices.ja.length===4 && x.answer>=0 && x.answer<=3))'
```

### 8.4 Question list

See `data/quiz.json` for each question's answer and explanation. This list shows only the question text, topic, and difficulty.

| ID | Topic | Difficulty | Question |
| --- | --- | --- | --- |
| q01 | Consistency | easy | You overwrite an existing object with a successful PUT and immediately issue a GET for the same key from another client. What does S3 return? |
| q02 | Limits | easy | As of 2026, what is the maximum size of a single S3 object? |
| q03 | Limits | easy | What is the largest object you can upload with a single PutObject request? |
| q04 | Multipart upload | easy | In a multipart upload, what is the minimum size of each part except the last one? |
| q05 | Multipart upload | easy | What is the maximum number of parts in a single multipart upload? |
| q06 | Performance | medium | At minimum, how many GET/HEAD requests per second does S3 support per partitioned prefix? |
| q07 | Encryption | easy | You upload a new object to a bucket without specifying any encryption settings. How is it stored? |
| q08 | Access control | easy | What is the default S3 Object Ownership setting for newly created general purpose buckets? |
| q09 | Architecture | easy | You want to serve a static website from S3 over HTTPS with a custom domain. What is the recommended approach? |
| q10 | Troubleshooting | medium | A user with s3:GetObject but without s3:ListBucket requests a key that does not exist. Which HTTP status is returned? |
| q11 | Presigned URLs | medium | A presigned URL is generated with a 7-day expiry using temporary role credentials that expire in 1 hour. What happens after 1 hour? |
| q12 | Troubleshooting | hard | In which case does S3 return only a generic 'Access Denied' message instead of the enhanced message that names the policy type? |
| q13 | Encryption | medium | Which KMS permission does a caller need to download an object encrypted with SSE-KMS? |
| q14 | Encryption | hard | For a multipart upload of an SSE-KMS object, which pair of KMS permissions is required? |
| q15 | Encryption | medium | What is the main benefit of enabling S3 Bucket Keys for SSE-KMS? |
| q16 | Access control | medium | What does an AWS Organizations resource control policy (RCP) do for S3? |
| q17 | Conditional requests | medium | You send PutObject with the header If-None-Match: * and an object with that key already exists. What happens? |
| q18 | Conditional requests | hard | A conditional CompleteMultipartUpload returns 409 Conflict because a concurrent delete succeeded first. What must you do? |
| q19 | Storage classes | medium | What is the minimum storage duration charge for S3 Glacier Deep Archive? |
| q20 | Cost | medium | How are 40 KB objects stored in S3 Standard-IA billed? |
| q21 | Storage classes | medium | How does S3 Intelligent-Tiering handle objects smaller than 128 KB? |
| q22 | Lifecycle | hard | A lifecycle rule transitions all objects to Glacier Flexible Retrieval after 30 days, but 50 KB objects created in 2026 are not transitioned. Why? |
| q23 | Storage classes | medium | You GET an object stored in Glacier Flexible Retrieval without restoring it first. Which error do you get? |
| q24 | Storage classes | medium | Which retrieval option is NOT available for S3 Glacier Deep Archive? |
| q25 | Versioning | easy | After enabling versioning on a bucket, which state changes are possible? |
| q26 | Versioning | easy | In a versioning-enabled bucket, what does DeleteObject without a version ID do? |
| q27 | Replication | medium | You add a replication rule to a bucket that already contains 10 million objects. How do you replicate those existing objects? |
| q28 | Data protection | medium | Under Object Lock compliance mode, who can shorten the retention period of a locked object version? |
| q29 | Data protection | medium | With AWS Backup continuous backups for S3, how far back can you restore to any point in time? |
| q30 | Versioning | hard | Which statement about MFA Delete is correct? |
| q31 | Performance | easy | Your application receives many 503 SlowDown errors. Which is the best response? |
| q32 | Cost | medium | Are bucket owners billed for requests that fail with HTTP 503 Slow Down? |
| q33 | Cost | hard | An unknown external account sends millions of unauthorized requests that receive 403 AccessDenied. Who pays for them? |
| q34 | Cost | medium | In your bill, the usage type TimedStorage-ByteHrs suddenly increased. What does it measure? |
| q35 | Cost | medium | Which requests are counted in the Requests-Tier1 usage type for S3 Standard? |
| q36 | Events | hard | You want S3 Event Notifications delivered directly to an SQS FIFO queue. What happens? |
| q37 | Networking | easy | EC2 instances in a private subnet download terabytes from S3 in the same Region through a NAT gateway. What change reduces cost most simply? |
| q38 | Data integrity | medium | An object was uploaded with multipart upload using SSE-S3. Its ETag looks like "...-12". What is true? |
| q39 | Buckets | hard | With S3 account regional namespaces (introduced in 2026), what does a bucket name look like? |
| q40 | Architecture | easy | Which design is an S3 anti-pattern? |

## 9. Why misconceptions arise: a timeline of changes

Most S3 misconceptions are information that used to be true. When you read a blog post or book, check when it was written against this timeline.

| Date | Change | Outdated "common knowledge" it affects |
| --- | --- | --- |
| July 2018 | Major request performance increase (3,500/5,500 req/s per prefix) | "Use random hashes at the start of keys" |
| September 2020 | Path-style URLs not supported for buckets created after 2020-09-30 | "`s3.amazonaws.com/bucket/key` works for everything" |
| December 2020 | Strong read-after-write consistency (including LIST) | "Stale data is returned right after an overwrite" |
| January 2023 | All new objects encrypted automatically with SSE-S3 | "Objects are not encrypted by default" |
| April 2023 | BPA enabled and ACLs disabled by default for new buckets | "Set ACLs first" |
| 2024 | 403s from outside the organization or account no longer billed to the bucket owner | "Even 403 attack requests are billed" |
| August / November 2024 | Conditional writes (`If-None-Match`, then `If-Match`) | "You cannot do optimistic locking in S3" |
| September 2024 | Objects under 128 KB excluded from lifecycle transitions by default | "All objects are transitioned" |
| November 2024 | AWS Organizations RCPs | "Bucket policies are the only defense against external principals" |
| September 2025 | Conditional deletes for general purpose buckets | "Delete conflicts cannot be prevented" |
| November 2025 | ABAC for general purpose buckets, SSE-C blocking setting | "Bucket tags are only for cost allocation" |
| December 2025 | Maximum object size of 50 TB | "The maximum is 5 TB" |
| March 2026 | Account regional namespaces | "Bucket names are strictly first come, first served" |
| April 2026 | SSE-C disabled by default rollout, Amazon S3 Files GA | "SSE-C is always available," "S3 cannot be used as a file system" |

The months above are based on What's New and blog announcement dates. Conditional writes were announced on 2024-08-20 (`If-None-Match`) and 2024-11-25 (`If-Match`).

## 10. Self-assessment checklist

If you cannot immediately answer "yes" to each item, reread the relevant chapter.

1. When you get a 403, you can tell from the error message which policy type caused it.
2. You can explain the difference in Resource ARNs between `s3:ListBucket` and `s3:GetObject` (bucket ARN versus object ARN).
3. You know how to check the size of noncurrent versions and incomplete multipart uploads in your buckets.
4. You can state the minimum storage duration and minimum billable size for each storage class.
5. You can build a setup that serves content through CloudFront + OAC while keeping the bucket private.
6. You can explain the difference between a 412 and a 409 from a conditional write.
7. For ransomware, you have a copy that survives even if your production account is fully compromised.
8. You can explain what the Usage Types `TimedStorage-ByteHrs`, `Requests-Tier1`, and `DataTransfer-Out-Bytes` mean.
9. You can explain how replication handles existing objects and deletes.
10. You know the defaults that changed in 2023 and later (encryption, BPA, ACLs) and the 2025–2026 changes (50 TB, ABAC, namespaces, SSE-C).

## 11. Tips for using the quiz

- Start with only the `easy` questions, and move on to `medium` and `hard` once you get them all right.
- For questions you miss, use the `topic` to find and reread the matching chapter (security, storage classes, troubleshooting, and so on).
- The explanations include related limits and exceptions (for example, the 128 KB rule and how 403s from outside the organization are handled), so read them even for questions you got right.
- The choices are in the same order in English and Japanese, so the `answer` index stays valid when you switch languages.

## References

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
