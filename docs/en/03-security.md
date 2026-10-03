# The complete guide to Amazon S3 security

_Last verified: 2026-10-03_

This document explains Amazon S3 security in depth, down to why it behaves the way it does. In a single file it covers the authorization evaluation logic, public access controls, encryption, network boundaries, auditing and detection, common incident patterns, and a set of ready-to-use policies.

Dated facts (for example, "SSE-C disabled by default in 2026-04") were checked against the official AWS documentation, What's New, and the AWS News Blog as of 2026-10-03. Anything that could not be confirmed is explicitly marked "unverified".

## Contents

- Chapter 1 The shared responsibility model and S3
- Chapter 2 Authorization evaluation logic (most important)
- Chapter 3 Object Ownership and disabling ACLs
- Chapter 4 Block Public Access
- Chapter 5 Encryption (at rest / in transit)
- Chapter 6 Access Points / Multi-Region Access Points / Access Grants
- Chapter 7 Presigned URLs / POST policies / CORS
- Chapter 8 Object Lock and MFA Delete
- Chapter 9 Network boundaries: VPC endpoints and data perimeters
- Chapter 10 Logging, monitoring, and detection
- Chapter 11 Common incident patterns
- Chapter 12 Ready-to-use policies (17 policies)
- Chapter 13 Security checklist
- References

## 1. The shared responsibility model and S3

Under the AWS Shared Responsibility Model, AWS is responsible for security **of** the cloud and the customer is responsible for security **in** the cloud. Because S3 is a managed, abstracted service, the customer's responsibility comes down almost entirely to configuring data and access controls.

| Area             | AWS responsibility                                                                                     | Customer responsibility                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Physical         | Data centers, disk disposal, power, physical access                                                    | None                                                                     |
| Infrastructure   | The S3 fleet, network, hypervisor, durability (designed for 11 nines)                                  | None                                                                     |
| Service defaults | SSE-S3 default encryption, BPA enabled by default, ACLs disabled by default, SSE-C disabled by default | Do not loosen the defaults / audit them                                  |
| Access control   | Correctness of the evaluation engine                                                                   | Designing IAM / bucket policies / SCPs / RCPs / endpoint policies        |
| Encryption keys  | SSE-S3 key management, KMS HSMs                                                                        | KMS key policies, rotation, choice of CMK, storing SSE-C keys            |
| Data protection  | Redundancy                                                                                             | Versioning, Object Lock, replication, backups                            |
| Auditing         | CloudTrail / log delivery infrastructure                                                               | Enabling CloudTrail data events, preserving and analyzing logs           |
| Application      | None                                                                                                   | Preventing application vulnerabilities such as SSRF and credential leaks |

The key point: **since 2018, AWS has gradually built secure-by-default settings into S3**. Many historical incidents happened because the defaults at the time were permissive, or because the customer explicitly loosened them.

| Date       | Change to defaults                                                                          |
| ---------- | ------------------------------------------------------------------------------------------- |
| 2018-11    | S3 Block Public Access launched                                                             |
| 2023-01-05 | SSE-S3 applied by default to new objects in all buckets                                     |
| 2023-04    | New buckets default to BPA enabled + ACLs disabled (Object Ownership = BucketOwnerEnforced) |
| 2025-11    | BPA can be enforced at the organization level with AWS Organizations S3 policies            |
| 2026-03    | Account regional namespaces (bucketsquatting mitigation)                                    |
| 2026-04    | SSE-C disabled by default for new buckets and others                                        |

## 2. Authorization evaluation logic (most important)

### 2.1 All policy types that can affect an S3 request

A single S3 request can be subject to all of the following policies at once.

| Policy type                            | Attached to                               | Role                                            | Can it grant Allow?                |
| -------------------------------------- | ----------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| SCP (Service Control Policy)           | Organizations root / OU / account         | **Upper bound** on the principal side           | No (filter only)                   |
| RCP (Resource Control Policy, 2024-11) | Organizations root / OU / account         | **Upper bound** on the resource side            | No (filter only)                   |
| IAM identity-based policy              | IAM user / role / group                   | Grants permissions                              | Yes                                |
| Permissions boundary                   | IAM user / role                           | Upper bound on identity-based permissions       | No                                 |
| Session policy                         | Passed at AssumeRole / GetFederationToken | Upper bound on the session                      | No                                 |
| Bucket policy                          | Bucket                                    | Resource-based permission grants                | Yes                                |
| Access point policy                    | Access point                              | Permission grants via the access point          | Yes (ANDed with the bucket policy) |
| VPC endpoint policy                    | Gateway / Interface endpoint              | Upper bound for traffic through the endpoint    | No (filter)                        |
| ACL (legacy)                           | Bucket / object                           | Resource-based permission grants                | Yes (only when ACLs are enabled)   |
| KMS key policy                         | KMS key                                   | Whether the key can be used for SSE-KMS objects | Yes (on the KMS side)              |
| Block Public Access                    | Org / account / bucket / AP               | Neutralizes public grants                       | No                                 |

RCPs launched in 2024-11 as a new AWS Organizations policy type, supported by S3, STS, KMS, SQS, Secrets Manager, and others (re:Post notes that ECR and OpenSearch Serverless were added later). An SCP caps what principals in your organization can do; an RCP caps what **anyone (including external principals)** can do to resources in your organization. Like SCPs, RCPs do not apply to service-linked roles (SLRs).

### 2.2 Basic evaluation principles

1. The default is implicit deny.
2. Any applicable explicit Deny in any policy results in denial (explicit deny wins).
3. SCPs / RCPs / permissions boundaries / session policies / VPCE policies are filters. They do not grant Allow, but the request fails unless they allow it.
4. Within the same account, an Allow in **either** the identity-based policy **or** the resource-based policy is sufficient (with exceptions, described below).
5. Cross-account, you need an Allow in **both** the identity-based policy of the requesting account **and** the bucket policy (or ACL) on the resource side.
6. Reading and writing SSE-KMS objects requires, in addition to S3 permissions, KMS-side permissions (key policy + IAM) such as `kms:Decrypt` / `kms:GenerateDataKey`.

### 2.3 Evaluation flowchart (same account)

```mermaid
flowchart TD
    A["Request received"] --> B{"Explicit Deny in any policy?"}
    B -- "Yes" --> DENY["Deny (403)"]
    B -- "No" --> C{"SCP allows?"}
    C -- "No" --> DENY
    C -- "Yes" --> D{"RCP allows?"}
    D -- "No" --> DENY
    D -- "Yes" --> E{"If via VPCE, VPCE policy allows?"}
    E -- "No" --> DENY
    E -- "Yes" --> F{"If via access point, AP policy allows?"}
    F -- "No" --> DENY
    F -- "Yes" --> G{"Resource-based policy/ACL allows?"}
    G -- "Yes" --> ALLOW["Allow (see 2.5 for session/boundary exceptions)"]
    G -- "No" --> H{"Identity-based policy allows?"}
    H -- "No" --> DENY
    H -- "Yes" --> I{"Permissions boundary allows?"}
    I -- "No" --> DENY
    I -- "Yes" --> J{"Session policy allows?"}
    J -- "No" --> DENY
    J -- "Yes" --> ALLOW
```

### 2.4 Evaluation flowchart (cross-account)

```mermaid
flowchart TD
    A["Principal in account A accesses a bucket in account B"] --> B{"Explicit Deny anywhere?"}
    B -- "Yes" --> DENY["Deny"]
    B -- "No" --> C{"Account A SCP allows?"}
    C -- "No" --> DENY
    C -- "Yes" --> D{"Account B RCP allows?"}
    D -- "No" --> DENY
    D -- "Yes" --> E{"Account A IAM policy (+boundary/session) allows?"}
    E -- "No" --> DENY
    E -- "Yes" --> F{"Account B bucket policy/ACL allows A's principal?"}
    F -- "No" --> DENY
    F -- "Yes" --> G{"If SSE-KMS, account B KMS key policy allows kms:Decrypt for A?"}
    G -- "No" --> DENY
    G -- "Yes" --> ALLOW["Allow"]
```

### 2.5 Fine-grained exceptions within the same account

In IAM evaluation logic, the interaction between same-account resource-based policies and permissions boundaries / session policies has the following nuances (from the IAM User Guide, "Policy evaluation logic").

| Principal specified in the resource-based policy | Implicit deny from permissions boundary                 | Implicit deny from session policy |
| ------------------------------------------------ | ------------------------------------------------------- | --------------------------------- |
| IAM user ARN                                     | Not restricted (the resource policy Allow takes effect) | N/A                               |
| IAM role ARN                                     | Restricted                                              | Restricted                        |
| Role session ARN (assumed-role)                  | Not restricted                                          | Not restricted                    |

In practice, remember this: "If you want a boundary to reliably apply even within the same account, specify the role ARN in the resource policy."

### 2.6 S3-specific: the three contexts (legacy, with ACLs enabled)

For buckets with ACLs enabled, S3 historically evaluated requests in the following three contexts.

```text
+-------------------+     +---------------------+     +----------------------+
| 1. User context   | --> | 2. Bucket context   | --> | 3. Object context    |
| Parent account's  |     | Bucket owner's      |     | Object owner's       |
| IAM policies      |     | bucket policy/ACL   |     | object ACL           |
+-------------------+     +---------------------+     +----------------------+
```

When the object owner differs from the bucket owner (for example, an object uploaded cross-account without an ACL), a classic problem arose: even the bucket owner could not read the object. Setting Object Ownership = BucketOwnerEnforced disables ACLs and makes the bucket owner the owner of every object, which eliminates the context 3 problem.

### 2.7 Evaluation through access points

Requests made through an access point need permission from **both the access point policy and the bucket policy**. To avoid rewriting the bucket policy every time, the standard practice is to use a bucket policy that delegates access control to access points (policy example 12.11).

### 2.8 Common causes of 403 errors

| Symptom                                       | Typical cause                                                      | How to check                                     |
| --------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ |
| GetObject returns 403 within the same account | Explicit Deny (for example, an aws:SourceVpce condition)           | errorMessage in CloudTrail, IAM Policy Simulator |
| 403 cross-account                             | Missing Allow on one side                                          | Check the policies in both accounts              |
| 403 only for SSE-KMS objects                  | Insufficient KMS key policy                                        | kms.amazonaws.com events in CloudTrail           |
| 403 only for ListBucket                       | Resource does not include the bucket ARN (without the trailing /*) | The policy's Resource                            |
| Sudden 403 across the organization            | An SCP / RCP was added                                             | List of policies in Organizations                |
| SSE-C upload returns 403                      | SSE-C blocked by default since 2026-04                             | BlockedEncryptionTypes in GetBucketEncryption    |

Since 2024-08, S3 AccessDenied messages for same-account requests include the type of policy that denied the request (for example, `explicit deny in a service control policy`), the reason, and the requesting principal. In 2026-08 this was extended so that, for same-account and same-organization requests, the message also includes **the ARN of the denying policy** (SCP / RCP / identity / session / boundary), which makes troubleshooting much easier.

## 3. Object Ownership and disabling ACLs

### 3.1 The three settings

| Setting              | ACLs                                                                          | Object owner                                             | Recommendation                     |
| -------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- |
| BucketOwnerEnforced  | Disabled (PUTs with ACLs other than `bucket-owner-full-control` are rejected) | Always the bucket owner                                  | Recommended; default since 2023-04 |
| BucketOwnerPreferred | Enabled                                                                       | Bucket owner if `bucket-owner-full-control` is specified | Migration period only              |
| ObjectWriter         | Enabled                                                                       | The uploading account                                    | Legacy                             |

Since 2023-04, new buckets default to BPA enabled and BucketOwnerEnforced. Use cases that still need ACLs are limited (for example, log delivery from some older AWS services, or the legacy method for CloudFront standard logs).

### 3.2 Migrating to disabled ACLs

1. Use S3 Inventory or Storage Lens to confirm that no access depends on ACLs (the `aclRequired` field in server access logs is useful).
2. Port the permissions granted by ACLs to the bucket policy.
3. Cross-account writes that required `bucket-owner-full-control` no longer need it under BucketOwnerEnforced (the bucket owner becomes the owner even without an ACL).
4. Change Object Ownership to BucketOwnerEnforced.

```bash
# Check the current setting
aws s3api get-bucket-ownership-controls --bucket amzn-s3-demo-bucket

# Disable ACLs
aws s3api put-bucket-ownership-controls \
  --bucket amzn-s3-demo-bucket \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
```

## 4. Block Public Access

### 4.1 The four settings

| Setting               | Target | Effect                                                                                                                                                                      |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BlockPublicAcls       | ACL    | Rejects PUTs that grant public ACLs (does not change existing ACLs)                                                                                                         |
| IgnorePublicAcls      | ACL    | Ignores existing public ACLs                                                                                                                                                |
| BlockPublicPolicy     | Policy | Rejects setting public bucket / access point policies                                                                                                                       |
| RestrictPublicBuckets | Policy | Restricts access to buckets with public policies to AWS service principals and authorized users within the bucket owner's account (ignores public and cross-account access) |

The "Block" settings **reject new configurations**, while the "Ignore / Restrict" settings **neutralize existing configurations**.

### 4.2 Levels and precedence

```mermaid
flowchart LR
    ORG["Organizations S3 policy (2025-11 onward)"] --> ACC["Account-level BPA"]
    ACC --> BKT["Bucket-level BPA"]
    BKT --> AP["Access point BPA"]
    AP --> EFF["Effective setting = the most restrictive"]
```

- Organization level: since 2025-11, BPA can be enforced with an AWS Organizations **S3 policy** (policy type). Set `s3_attributes.public_access_block_configuration` to `@@assign: "all"` or `"none"` to turn all four settings on or off together. It can be attached to the root, OUs, or accounts, and new member accounts inherit it automatically. To manage BPA per account, disable the organization-level S3 policy type.
- Account level: `s3control put-public-access-block`.
- Bucket level: `s3api put-public-access-block`. New buckets have all four enabled by default.
- Access point: can be set only at creation (cannot be changed later).

S3 applies **the most restrictive** of the bucket, account, and organization settings.

### 4.3 How "public" is determined

S3 considers a policy public when its Principal is `*` (or all AWS users) and it lacks a condition that narrows access to fixed values, such as the following.

| Example conditions that keep a policy non-public | Description                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| `aws:SourceVpce` / `aws:SourceVpc`               | Limits to specific VPCs / VPCEs                                      |
| `aws:SourceIp` (fixed CIDR)                      | Limits to specific IPs (broad ranges such as 0.0.0.0/1 do not count) |
| `aws:PrincipalOrgID` / `aws:PrincipalAccount`    | Limits to a specific organization / account                          |
| `aws:SourceArn` / `aws:SourceAccount`            | Limits to specific AWS service resources (such as CloudFront OAC)    |

Note that conditions containing wildcards or policy variables are not treated as fixed values for the public determination.

### 4.4 CLI examples

```bash
# Enable all four at the account level
aws s3control put-public-access-block \
  --account-id 111122223333 \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Check whether a bucket is public
aws s3api get-bucket-policy-status --bucket amzn-s3-demo-bucket
```

A JSON example of an organization-level S3 policy (BPA).

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

`S3_POLICY` is listed as an accepted enum value for both `enable-policy-type --policy-type` and `create-policy --type` in the AWS CLI v2 help (`aws organizations enable-policy-type help` / `create-policy help`, checked on 2.37.7) and in the CLI reference. Older CLI versions may not include it; if you get an error, update the CLI.

## 5. Encryption

### 5.1 Overview

```mermaid
flowchart TD
    E["S3 encryption"] --> T["In transit"]
    E --> R["At rest"]
    T --> T1["TLS 1.2 or later (enforce with aws:SecureTransport / s3:TlsVersion)"]
    R --> SSE["Server-side"]
    R --> CSE["Client-side (S3 Encryption Client)"]
    SSE --> S3["SSE-S3 (default, AES-256)"]
    SSE --> KMS["SSE-KMS (+ S3 Bucket Keys)"]
    SSE --> DSSE["DSSE-KMS (dual-layer encryption)"]
    SSE --> SSEC["SSE-C (disabled by default from 2026-04)"]
```

### 5.2 Comparison of server-side encryption options

| Method                             | Where the key lives                  | Key access control                              | Auditing                 | Cost                              | Main use                                                           |
| ---------------------------------- | ------------------------------------ | ----------------------------------------------- | ------------------------ | --------------------------------- | ------------------------------------------------------------------ |
| SSE-S3                             | Managed by S3                        | S3 permissions only                             | None (no key usage logs) | Free                              | Default. Baseline at-rest encryption                               |
| SSE-KMS (AWS managed key `aws/s3`) | KMS                                  | Key policy cannot be changed                    | KMS calls in CloudTrail  | KMS request charges               | Not usable cross-account, so generally not recommended             |
| SSE-KMS (customer managed key)     | KMS                                  | Fine-grained control with key policies / grants | CloudTrail               | Monthly key fee + request charges | Regulatory compliance, separation of duties, cross-account         |
| DSSE-KMS                           | KMS                                  | Same as above                                   | CloudTrail               | Higher than SSE-KMS               | Dual-layer encryption requirements such as CNSSP 15                |
| SSE-C                              | Customer sends it with every request | Whoever knows the key                           | None                     | Free                              | Blocked by default since 2026-04. Not recommended for new adoption |
| CSE                                | Customer                             | Customer                                        | Customer                 | Customer                          | When you do not want S3 to see plaintext                           |

### 5.3 SSE-S3 becomes the default (2023-01)

Since 2023-01-05, all new objects are encrypted with SSE-S3 even if the customer specifies nothing. If the bucket already has a default encryption setting (such as SSE-KMS), that setting takes precedence. In other words, objects uploaded since 2023 are, in principle, never unencrypted (older objects uploaded before then may remain).

### 5.4 SSE-KMS and S3 Bucket Keys

SSE-KMS fetches a data key from KMS for each object, so high volumes of PUT/GET requests can hit KMS request quotas and costs. Enabling S3 Bucket Keys lets S3 reuse a short-lived, bucket-level intermediate key, reducing requests to KMS by up to 99%.

```text
Without Bucket Key:  Object --(every time)--> KMS GenerateDataKey/Decrypt
With Bucket Key:     Object --> Bucket-level key (cached in S3 for a period) --(rarely)--> KMS
```

Caveats:

- With Bucket Keys enabled, the KMS encryption context is the bucket ARN rather than the object ARN. If your key policy restricts `kms:EncryptionContext:aws:s3:arn` to object ARNs, you need to update it.
- The number of KMS events in CloudTrail drops (audit granularity becomes coarser).

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

Introduced in 2023-06, DSSE-KMS applies two independent layers of AES-256 encryption using KMS keys. It targets dual-layer encryption requirements such as the US CNSSP 15. Specify `x-amz-server-side-encryption: aws:kms:dsse`. S3 Bucket Keys cannot be used with DSSE-KMS.

### 5.6 SSE-C and the 2026-04 default disablement

SSE-C has existed since 2014-06. The customer sends a 256-bit key in an HTTPS header with every request. S3 does not store the key; it keeps only an HMAC of the key.

As announced in advance on the AWS Storage Blog, **the following changes rolled out progressively from 2026-04-06 across 37 Regions (including China and GovCloud)**.

- New writes using SSE-C are blocked by default on all new general purpose buckets.
- In accounts with no SSE-C encrypted objects, SSE-C was also blocked on existing buckets.
- In accounts that have SSE-C objects, existing bucket settings were not changed.
- The FAQ notes that new buckets have SSE-C disabled by default in all Regions except Middle East (Bahrain) and Middle East (UAE).

When SSE-C is blocked, `PutObject` / `CopyObject` / `PostObject` / multipart uploads / replication that specify SSE-C fail with HTTP 403 `AccessDenied`. Existing SSE-C objects can still be read with GetObject / HeadObject if the correct SSE-C headers are supplied.

Configure this with the `BlockedEncryptionTypes` parameter of `PutBucketEncryption` (requires the `s3:PutEncryptionConfiguration` permission).

```bash
# Block SSE-C
aws s3api put-bucket-encryption \
  --bucket amzn-s3-demo-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "BlockedEncryptionTypes": { "EncryptionType": ["SSE-C"] }
    }]
  }'

# Explicitly allow SSE-C (only if absolutely necessary)
aws s3api put-bucket-encryption \
  --bucket amzn-s3-demo-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "BlockedEncryptionTypes": { "EncryptionType": ["NONE"] }
    }]
  }'
```

For background: in 2025-01 the AWS Security Blog reported an increase in activity where valid stolen credentials were used to run large numbers of SSE-C `CopyObject` calls that re-encrypted customer data under the attacker's key, and recommended blocking SSE-C unless an application needs it (Halcyon reported the same technique at the same time; see 11.4). However, the AWS Storage Blog notice of the 2026-04 default change (2025-11-19), the What's New post, and the FAQ do not mention this attack. The reasons AWS gives are that "there was no longer a practical security benefit to use SSE-C" after AWS KMS launched, that "Most modern workloads do not use SSE-C encryption because it lacks the flexibility of SSE-KMS", and "to streamline the encryption options that customers need to consider".

### 5.7 Changing the encryption type after the fact: UpdateObjectEncryption (2026-01)

The `UpdateObjectEncryption` API, introduced in 2026-01, changes the SSE type of existing encrypted objects **without moving (copying) the data**. It covers changing from SSE-S3 to SSE-KMS, switching customer managed keys, and applying S3 Bucket Keys. With S3 Batch Operations, a single job can apply it to up to 20 billion objects. Previously, re-encryption required CopyObject, with side effects such as resetting storage class transition timers.

### 5.8 Client-side encryption

Use the Amazon S3 Encryption Client (Java / Python / Go / .NET / C++, and others) to encrypt data on the client before upload. To S3 the data is just an opaque ciphertext blob, so server-side processing such as S3 Select or Object Lambda is meaningless.

Security bulletin AWS-2025-032 (CVE-2025-14759 to 14764), published on 2025-12-17, disclosed that configurations storing the encrypted data key (EDK) in an "instruction file" were vulnerable to an Invisible Salamanders attack (EDK substitution). As a fix, key commitment was introduced, with a minor version that supports it for reads only and a new major version (V4 for Java and others) that supports both reads and writes. If you use CSE, migrating to the latest major version is recommended.

### 5.9 Encryption in transit: TLS

- S3 endpoints offer HTTPS (TLS), and AWS has announced a policy of TLS 1.2 as the minimum version across all services (FIPS endpoints in 2021, with TLS 1.0/1.1 progressively retired on other endpoints).
- Even so, an endpoint may still accept plain HTTP access, so the standard practice is to Deny `aws:SecureTransport = false` in the bucket policy (Security Hub S3.5).
- To require a newer TLS version, use the `s3:TlsVersion` condition key (Deny below 1.2 or 1.3 with `NumericLessThan`). Control Tower also has an RCP control that requires TLS 1.3 or later (CT.S3.PV.3).

## 6. Access Points / Multi-Region Access Points / Access Grants

### 6.1 S3 Access Points (general purpose buckets)

An access point is a named entry point to a bucket, each with its own policy, network restriction (VPC-only), and BPA settings. It solves the problem of a single bucket policy growing too large (20 KB limit) by splitting access into per-application entry points.

```text
                    +--> AP: analytics-ap (VPC-only, read prefix=analytics/*)
Applications -----> +--> AP: ingest-ap    (write only)
                    +--> AP: partner-ap   (limited to the partner account)
                              |
                              v
                       amzn-s3-demo-bucket (bucket policy delegates to APs)
```

ARN format: `arn:aws:s3:ap-northeast-1:111122223333:accesspoint/analytics-ap`. Object ARNs are `.../accesspoint/analytics-ap/object/key`.

```bash
aws s3control create-access-point \
  --account-id 111122223333 \
  --name analytics-ap \
  --bucket amzn-s3-demo-bucket \
  --vpc-configuration VpcId=vpc-0abc1234def567890
```

### 6.2 Access points for directory buckets (2025)

In 2025-05, access points became available for S3 Express One Zone (directory buckets).

- Names use the format `accesspointname--zoneID--xa-s3`.
- An access point scope can restrict prefixes and API operations (the total length of all prefixes must be under 256 bytes).
- They can be restricted to a VPC.
- Directory buckets primarily use session-based authorization via `CreateSession` (`s3express:CreateSession`), so policies are written differently than for general purpose buckets.

### 6.3 Multi-Region Access Points (MRAP)

An MRAP groups buckets in multiple Regions behind a single global endpoint (`xxxx.mrap.accesspoint.s3-global.amazonaws.com`) and routes requests to the nearest Region over the AWS Global Accelerator infrastructure.

| Item                 | Details                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| Signing              | Requires SigV4A (multi-Region asymmetric signing)                          |
| Failover             | Active-active or active-passive (manual switchover with failover controls) |
| BPA                  | BPA per MRAP (cannot be changed after creation) - Security Hub S3.24       |
| Data synchronization | The MRAP itself does not replicate. Configure CRR separately               |
| Pricing              | Data routing charges + acceleration charges (when over the internet)       |

### 6.4 S3 Access Grants

Introduced in 2023-11. Grants READ / WRITE / READWRITE on S3 prefixes to IAM Identity Center users and groups (corporate directories such as Entra ID / Okta) or to IAM principals.

```mermaid
sequenceDiagram
    participant U as App / user
    participant AG as S3 Access Grants instance
    participant STS as IAM role (for location registration)
    participant S3 as S3
    U->>AG: GetDataAccess (target=s3://bucket/prefix/*, permission=READ)
    AG->>AG: Match grants (user/group → location)
    AG->>STS: Assume the role tied to the location
    AG-->>U: Temporary credentials (scoped down)
    U->>S3: GetObject with the temporary credentials
```

This is useful when expressing thousands to tens of thousands of user × prefix combinations in IAM policies would become unmanageable. CloudTrail records which directory user made the access.

## 7. Presigned URLs / POST policies / CORS

### 7.1 Presigned URLs

A presigned URL delegates a specific operation, with the creator's permissions and for a limited time, to anyone who holds the URL. It uses SigV4 query string authentication (`X-Amz-Algorithm`, `X-Amz-Credential`, `X-Amz-Date`, `X-Amz-Expires`, `X-Amz-SignedHeaders`, `X-Amz-Signature`).

| Credentials used to create it                | Maximum validity                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| Long-term access keys of an IAM user (SigV4) | Up to 7 days (604800 seconds)                                                  |
| Temporary credentials of an IAM role         | Until the role session expires (expires first even if a longer Expires is set) |
| EC2 instance profile                         | Validity of the role credentials (usually around 6 hours)                      |
| STS temporary credentials                    | Validity of the temporary credentials                                          |
| Console                                      | 1 minute to 12 hours                                                           |

Important caveats:

- The URL is evaluated with the creator's permissions. If the creator loses permissions, the URL stops working. If the credentials expire, are deleted, or are deactivated, the URL becomes invalid even before the specified expiration.
- It is a bearer token that anyone holding the URL can use. Watch for leaks through logs and the Referer header.
- If you need to share for longer than 7 days, consider CloudFront signed URLs / signed cookies.
- Bucket policies can restrict the signature age (`s3:signatureAge`), the authentication method (`s3:authType = REST-QUERY-STRING`), and the signature version (`s3:signatureversion`) (policy example 12.13).

```bash
# Presigned URL for GET, valid for 1 hour
aws s3 presign s3://amzn-s3-demo-bucket/report.pdf --expires-in 3600
```

### 7.2 POST policies (browser-based uploads)

This method lets an HTML form upload directly to S3. The server builds a policy document (JSON), Base64-encodes it, and signs it with SigV4. The policy can enforce the expiration, bucket, key prefix, Content-Type, maximum size (`content-length-range`), and more.

```json
{
  "expiration": "2026-10-03T12:00:00.000Z",
  "conditions": [
    { "bucket": "amzn-s3-demo-bucket" },
    ["starts-with", "$key", "uploads/user-42/"],
    { "acl": "private" },
    ["starts-with", "$Content-Type", "image/"],
    ["content-length-range", 1, 10485760],
    { "x-amz-server-side-encryption": "aws:kms" },
    { "x-amz-algorithm": "AWS4-HMAC-SHA256" },
    { "x-amz-credential": "AKIAIOSFODNN7EXAMPLE/20261003/ap-northeast-1/s3/aws4_request" },
    { "x-amz-date": "20261003T000000Z" }
  ]
}
```

Compared with a presigned PUT URL, the advantage of a POST policy is that S3 enforces the maximum size through `content-length-range`.

### 7.3 CORS

CORS relaxes the browser's same-origin policy; it is **not an authorization mechanism**. Configuring CORS does not grant permissions, and tightening CORS does not stop access from curl.

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

Combining `"AllowedOrigins": ["*"]` with presigned URLs is not dangerous in itself, but it allows browser access from unintended origins, so pin origins whenever possible.

## 8. Object Lock and MFA Delete

### 8.1 Object Lock concepts

Object Lock provides WORM (write once, read many) storage and has a third-party assessment (Cohasset Associates) against requirements such as SEC 17a-4(f), FINRA 4511, and CFTC 1.31. It requires versioning, and locks apply **per object version**.

| Mechanism                   | Details                                                                                                                                                                                             | Who can remove it                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Retention (governance mode) | Prohibits deletion, overwrite, and configuration changes until the retention date                                                                                                                   | `s3:BypassGovernanceRetention` permission + the `x-amz-bypass-governance-retention: true` header                   |
| Retention (compliance mode) | No one can delete until the retention date. The period cannot be shortened and the mode cannot be changed                                                                                           | No one (not root, not AWS Support. Only closing the account)                                                       |
| Legal hold                  | Retention with no expiration. Stays in effect until removed                                                                                                                                         | Anyone with the `s3:PutObjectLegalHold` permission                                                                 |
| Default retention           | The bucket's default retention setting (applied automatically to new objects)                                                                                                                       | `s3:PutBucketObjectLockConfiguration`                                                                              |
| Event hold (2026-09)        | Variable retention whose period starts from a future event (contract end, audit completion, and so on). Protected while on hold; after release, the object is kept as WORM for the specified period | Dedicated IAM / bucket policy condition keys control who can set or release it and the minimum and maximum periods |

```mermaid
stateDiagram-v2
    [*] --> Unlocked
    Unlocked --> Governance: PutObjectRetention (GOVERNANCE)
    Unlocked --> Compliance: PutObjectRetention (COMPLIANCE)
    Governance --> Compliance: Mode can be strengthened
    Governance --> Unlocked: Released with bypass permission / retention expires
    Compliance --> Unlocked: Only when retention expires
    Unlocked --> LegalHold: PutObjectLegalHold ON
    LegalHold --> Unlocked: PutObjectLegalHold OFF
```

Caveats:

- Object Lock can now be enabled on existing buckets as well (with `PutObjectLockConfiguration` after enabling versioning); previously it was available only at bucket creation. Once enabled, it cannot be disabled, and versioning cannot be suspended.
- A legal hold stops protecting the object the moment it is released, whereas the event hold added in 2026-09 keeps the object for a specified period after release. This meets event-based retention requirements (for example, 7 years after a contract ends) without over-retaining data. It can also be applied with Batch Operations or bucket defaults, and it is covered by the Cohasset Associates assessment.
- What gets locked is the version. A DELETE on a key (without a version ID) succeeds because it only creates a delete marker. The locked version itself is not removed.
- If you mistakenly set compliance mode for a long period, there is no way to stop the storage charges. Test with short periods and governance mode.

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

An add-on to the versioning configuration that requires MFA for the following operations.

- Changing the versioning state (changing to Suspended)
- Permanently deleting an object version

Constraints:

- Only the root user can enable or disable it, and only through the CLI / API (not the console).
- It cannot be combined with Lifecycle expiration (you cannot set a Lifecycle configuration on a bucket with MFA Delete enabled).
- Because of the operational burden, many organizations use Object Lock + Deny statements in SCPs / RCPs instead.

```bash
aws s3api put-bucket-versioning \
  --bucket amzn-s3-demo-bucket \
  --versioning-configuration Status=Enabled,MFADelete=Enabled \
  --mfa "arn:aws:iam::111122223333:mfa/root-account-mfa-device 123456"
```

## 9. Network boundaries: VPC endpoints and data perimeters

### 9.1 Gateway endpoints vs interface endpoints

| Item                          | Gateway endpoint                             | Interface endpoint (PrivateLink)                                                                                                                              |
| ----------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How it works                  | Adds a prefix list (pl-xxxx) to route tables | Creates ENIs (private IPs) in the VPC                                                                                                                         |
| Pricing                       | Free                                         | Hourly charge + data processing charge                                                                                                                        |
| From on-premises / other VPCs | Not usable (VPC only)                        | Usable over Direct Connect / VPN / peering                                                                                                                    |
| DNS                           | Keeps the public DNS names                   | Endpoint-specific DNS, or enable private DNS                                                                                                                  |
| Region                        | Same Region only                             | Same Region, and since 2025-11 also S3 in another Region of the same partition via cross-Region PrivateLink (requires the `vpce:AllowMultiRegion` permission) |
| Policy                        | Endpoint policy supported                    | Endpoint policy supported                                                                                                                                     |
| Condition keys                | `aws:SourceVpce`, `aws:SourceVpc`            | `aws:SourceVpce`, `aws:SourceVpc`                                                                                                                             |

```text
[EC2 in VPC] --(route: pl-xxxx)--> [Gateway VPCE] ----> S3 (same Region)
[On-prem]   --(DX/VPN)--> [Interface VPCE ENI 10.0.1.23] ----> S3
```

For requests through a VPC endpoint, the source IP is a private IP, so **the `aws:SourceIp` condition does not work**. To allow access through a VPCE, use `aws:SourceVpce` / `aws:SourceVpc`.

### 9.2 Using endpoint policies to keep traffic within your organization's buckets

A VPC endpoint policy sets the upper bound on which S3 resources can be accessed from the VPC. To prevent data exfiltration, the standard practice is to limit access to your organization's buckets with `aws:ResourceOrgID` (policy example 12.9). Add exceptions when you need access to AWS-owned buckets, such as Amazon Linux package repositories or ECR layer storage.

### 9.3 Data perimeters

An AWS data perimeter is built by combining the following three boundaries across three dimensions: identity, resource, and network.

| Boundary                | Meaning                                                                                         | Main implementation         | Main condition keys                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Only trusted identities | Only your organization's principals (and AWS services) can access your organization's resources | RCPs, bucket policies       | `aws:PrincipalOrgID`, `aws:PrincipalIsAWSService`, `aws:SourceOrgID`   |
| Only trusted resources  | Your organization's principals can access only your organization's resources                    | SCPs, VPCE policies         | `aws:ResourceOrgID`                                                    |
| Only expected networks  | Access only from your corporate network / VPCs                                                  | RCPs, SCPs, bucket policies | `aws:SourceIp`, `aws:SourceVpc`, `aws:SourceVpce`, `aws:ViaAWSService` |

```mermaid
flowchart LR
    subgraph ORG["Your organization (o-exampleorgid)"]
        P["Principal"]
        R["S3 bucket"]
        N["Corporate network / VPC"]
    end
    X["External principal"] -. "RCP: denied by aws:PrincipalOrgID" .-> R
    P -. "SCP/VPCE: external buckets denied by aws:ResourceOrgID" .-> XR["External bucket"]
    I["Stolen credentials on the internet"] -. "denied by aws:SourceIp / aws:SourceVpc" .-> R
    P --> R
    N --> R
```

Before RCPs, you had to write the same Deny statement in every bucket policy. RCPs impose a resource-side upper bound across the whole organization at once, so even if a developer accidentally writes a cross-account Allow in a bucket policy, the bucket is not opened outside the organization. However, RCPs do not apply to SLRs, and access by AWS service principals (such as CloudTrail log delivery) must be excluded with `aws:PrincipalIsAWSService`.

## 10. Logging, monitoring, and detection

### 10.1 Server access logs vs CloudTrail data events

| Item               | S3 server access logs                                                                                               | CloudTrail data events                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Pricing            | Log delivery itself is free (storage charges only)                                                                  | Charged per 100,000 data events                                                        |
| Delivery guarantee | Best effort (logs may be missing or delayed)                                                                        | Highly reliable (usually within about 5 minutes)                                       |
| Format             | Space-delimited text                                                                                                | JSON                                                                                   |
| What is recorded   | Authentication failures, anonymous access, lifecycle transitions, HTTP status, `aclRequired`, TLS version, and more | IAM principal details, request parameters, `tlsDetails`, organization-wide aggregation |
| Granularity        | Per bucket                                                                                                          | Advanced event selectors specify bucket / prefix / read or write type                  |
| Destination        | A separate bucket in the same Region, owned by the same account, is recommended                                     | S3 / CloudWatch Logs / CloudTrail Lake                                                 |
| Main use           | Low-cost analysis of high-volume access, billing investigations                                                     | Security auditing, forensics, detection                                                |

```bash
# CloudTrail: record only write data events for a specific bucket
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

# Server access logs
aws s3api put-bucket-logging --bucket amzn-s3-demo-bucket \
  --bucket-logging-status '{
    "LoggingEnabled": {
      "TargetBucket": "amzn-s3-demo-logs",
      "TargetPrefix": "s3-access/amzn-s3-demo-bucket/",
      "TargetObjectKeyFormat": {"PartitionedPrefix": {"PartitionDateSource": "EventTime"}}
    }
  }'
```

Do not use the monitored bucket itself as the log destination, because that creates an infinite loop. On the log destination bucket, use the bucket policy to allow writes from the `logging.s3.amazonaws.com` service principal (the recommended method once ACLs are disabled).

### 10.2 GuardDuty S3 Protection and Malware Protection for S3

| Feature                             | Details                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GuardDuty S3 Protection             | Analyzes CloudTrail S3 data events (without requiring you to configure a trail) and detects anomalous API patterns (mass GetObject from suspicious IPs, disabling BPA, disabling logging, and so on). Example finding types: `Exfiltration:S3/AnomalousBehavior`, `Policy:S3/BucketBlockPublicAccessDisabled`, `Stealth:S3/ServerAccessLoggingDisabled` |
| Malware Protection for S3 (2024-06) | Scans newly uploaded objects. Can be used on its own without enabling GuardDuty itself. Results are published to EventBridge, and optionally a `GuardDutyMalwareScanStatus` tag (`NO_THREATS_FOUND` / `THREATS_FOUND` / `UNSUPPORTED` / `ACCESS_DENIED` / `FAILED`) is added                                                                            |

With TBAC (tag-based access control) on these tags, you can build a bucket where only objects that were scanned and found clean can be read (policy example 12.14). Objects can have at most 10 tags, so an object that already has 10 tags cannot be tagged.

### 10.3 Amazon Macie

Macie analyzes data in S3 with machine learning and pattern matching to detect sensitive data such as PII, credentials, and financial information.

- Automated sensitive data discovery: continuously samples buckets across the organization.
- Sensitive data discovery jobs: scan specific buckets in full or on a schedule.
- Also provides an inventory of bucket security posture (public access, encryption, sharing).

### 10.4 IAM Access Analyzer for S3

| Feature                            | Details                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External access findings           | Analyzes bucket policies / ACLs / access point policies with automated reasoning and detects buckets accessible from outside the zone of trust (account / organization) |
| Internal access findings (2025-06) | Detects which users / roles in the organization can access resources such as S3, by evaluating identity policies, resource policies, SCPs, and RCPs together            |
| Policy validation                  | Grammar and best practice checks while authoring policies                                                                                                               |
| Custom policy checks               | Determines in CI whether a policy grants new access                                                                                                                     |

From the "IAM Access Analyzer for S3" view in the S3 console, you can list public / shared buckets and apply BPA in bulk.

### 10.5 Security Hub CSPM S3 controls

| ID    | Details                                 |
| ----- | --------------------------------------- |
| S3.1  | Account-level BPA is enabled            |
| S3.2  | Prohibit public read access             |
| S3.3  | Prohibit public write access            |
| S3.5  | Require TLS (SecureTransport)           |
| S3.6  | Restrict grants to other accounts       |
| S3.7  | Cross-Region replication                |
| S3.8  | Bucket-level BPA                        |
| S3.9  | Server access logging enabled           |
| S3.10 | Lifecycle on versioning-enabled buckets |
| S3.11 | Event notifications enabled             |
| S3.12 | Do not manage user access with ACLs     |
| S3.13 | Lifecycle configuration                 |
| S3.14 | Versioning enabled                      |
| S3.15 | Object Lock enabled                     |
| S3.17 | Encryption at rest with KMS keys        |
| S3.19 | BPA on access points                    |
| S3.20 | MFA Delete enabled                      |
| S3.22 | Logging of object-level write events    |
| S3.23 | Logging of object-level read events     |
| S3.24 | BPA on MRAPs                            |
| S3.25 | Lifecycle on directory buckets          |

(S3.4 / S3.16 / S3.18 / S3.21 are unassigned or retired. Based on the list in the Security Hub CSPM documentation as of 2026-10.)

### 10.6 Example monitoring architecture

```mermaid
flowchart LR
    S3["S3 buckets"] -->|Data events| CT["CloudTrail (organization trail)"]
    S3 -->|Access logs| LOG["Bucket in the log archive account (Object Lock)"]
    CT --> LOG
    CT --> GD["GuardDuty S3 Protection"]
    S3 -->|New objects| MP["Malware Protection for S3"]
    S3 --> MAC["Macie"]
    S3 --> AA["IAM Access Analyzer"]
    S3 --> CFG["AWS Config"]
    GD --> SH["Security Hub"]
    MAC --> SH
    AA --> SH
    CFG --> SH
    MP --> EB["EventBridge"]
    SH --> EB
    EB --> SNS["SNS / tickets / auto-remediation Lambda"]
```

## 11. Common incident patterns

### 11.1 Leaks from public buckets

Around 2017 to 2019, security researchers such as UpGuard reported many cases where large volumes of data from major companies and government bodies were viewable in publicly readable S3 buckets. Typical causes:

- READ granted through ACLs to `AllUsers` / `AuthenticatedUsers` (which means "any AWS account", not "your own users").
- Bucket policies with `"Principal": "*"` and no conditions.
- Sensitive files placed in a bucket made public for a static website.

The mitigations are now defaults: new buckets have BPA enabled and ACLs disabled. Use account- and organization-level BPA to lock down every account except those allowed to publish content.

### 11.2 Capital One (2019): over-privileged role + SSRF

The facts (based on public reporting, court records, and the OCC announcement):

- Capital One disclosed the breach on 2019-07-29. Credit card application data for about 100 million people in the US and about 6 million in Canada, roughly 106 million records in total, was exfiltrated.
- The attacker (a former AWS employee) exploited an SSRF (Server-Side Request Forgery) caused by a misconfigured WAF that Capital One ran on AWS, and obtained temporary credentials for the IAM role attached to that WAF from the EC2 instance metadata service (IMDSv1).
- Because that role had broad S3 List / Get permissions, the attacker could download data from many buckets. The key point is that **this was not a public bucket incident; it was an "excessive permissions + credential theft" incident against private buckets**.
- In 2020-08, the US Office of the Comptroller of the Currency (OCC) imposed an $80 million civil money penalty. The attacker was convicted in 2022-06.

Lessons and S3-side mitigations:

| Lesson                                           | Mitigation                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IMDSv1 is vulnerable to SSRF                     | Enforce IMDSv2 (on the EC2 side)                                                                                                                                     |
| The role was over-privileged                     | Least privilege, IAM Access Analyzer unused access findings                                                                                                          |
| Stolen temporary credentials worked from outside | Network boundaries: Deny with `aws:SourceVpc` / `aws:SourceIp` / `aws:ViaAWSService`, GuardDuty `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration` findings |
| Mass GetObject went unnoticed                    | CloudTrail data events, GuardDuty S3 Protection anomaly detection                                                                                                    |

### 11.3 Bucketsquatting / re-registering abandoned buckets

General purpose bucket names have historically been globally unique, and **anyone can re-register a deleted bucket name**. Bucketsquatting exploits this.

- Since around 2019, Ian Mckay (onecloudplease.com) and others raised the issue as "bucketsquatting".
- In 2024, Aqua Security reported "Shadow Resources": AWS services automatically created buckets with predictable names (account ID + Region), and by creating those buckets first, an attacker could take over resources in other accounts (AWS has fixed this).
- In 2025-02, watchTowr Labs reported re-registering about 150 abandoned buckets that were referenced for software distribution, CloudFormation templates, VM images, and so on, for about $400, and receiving more than 8 million requests in two months (from government agencies, Fortune 500 companies, and others). AWS blocked re-creation of those bucket names.

**Account regional namespaces (2026-03)**. AWS introduced an opt-in namespace for general purpose buckets.

- Bucket names use the format `<prefix>-<12-digit account ID>-<Region>-an` (for example, `mybucket-123456789012-us-east-1-an`).
- Only the owning account can create names with that suffix, and other accounts cannot claim them even after deletion.
- Create the bucket with the `x-amz-bucket-namespace: account-regional` header on `CreateBucket`. In the CLI, use `--bucket-namespace account-regional`.
- The new condition key `s3:x-amz-bucket-namespace` lets SCPs / IAM prohibit creating buckets outside the account regional namespace (policy example 12.12).
- It is not the default (opt-in). Existing buckets do not need to migrate, but to protect them, create new buckets and migrate with S3 Replication or similar.
- Trade-offs that have been pointed out: knowing the account ID and Region makes bucket names easier to guess (Pwned Labs), and because names are tied to a Region, the logical name is not the same across Regions in a multi-Region setup (Authress).

```bash
aws s3api create-bucket \
  --bucket mybucket-111122223333-ap-northeast-1-an \
  --bucket-namespace account-regional \
  --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1
```

`--create-bucket-configuration` is included because of the general rule for CreateBucket outside us-east-1.

### 11.4 Ransomware abusing SSE-C

On 2025-01-13, the security vendor Halcyon reported on its blog a technique by a threat actor it named "Codefinger": using publicly disclosed or compromised AWS keys to encrypt victims' objects with the attacker's SSE-C key, setting a Lifecycle rule to delete the files within 7 days, and demanding a ransom. S3 does not store SSE-C keys and CloudTrail records only an HMAC of the key, so the data cannot be decrypted without the attacker's key. AWS itself confirmed the activity in the AWS Security Blog on 2025-01-15: its CIRT had detected an increase in SSE-C `CopyObject` calls re-encrypting customer data, and it stressed that this was misuse of valid credentials, not a vulnerability in an AWS service. Mitigations (matching the AWS Security Blog recommendations): block SSE-C (the default since 2026-04), retire long-term access keys in favor of short-term credentials, keep data recovery options such as versioning, and monitor with CloudTrail and similar tools. Object Lock and SCP restrictions on dangerous operations such as `s3:PutLifecycleConfiguration` also help.

### 11.5 Other common patterns

| Pattern                              | Details                                  | Mitigation                                                                                                     |
| ------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Access keys leaked to GitHub         | Long-term keys committed to a repository | IAM Identity Center / roles, secret scanning, AWS automatic detection (the AWSCompromisedKeyQuarantine policy) |
| Presigned URLs leaked through logs   | URLs remain in CDN / proxy logs          | Short expirations, create with role credentials                                                                |
| Misunderstanding CORS                | Believing CORS provides protection       | Understand that CORS is not authorization                                                                      |
| Subdomain takeover                   | A CNAME still points to a deleted bucket | DNS inventory, account regional namespaces                                                                     |
| Covering tracks by disabling logging | `PutBucketLogging` / `StopLogging`       | Prohibit with SCPs, GuardDuty `Stealth:` findings                                                              |
| "Authenticated Users" ACL            | Grants access to all AWS users           | Disable ACLs                                                                                                   |

## 12. Ready-to-use policies

All of the following are working examples of bucket policies (some are RCPs / SCPs / VPCE policies). Replace `amzn-s3-demo-bucket`, `111122223333`, `o-exampleorgid`, and similar values.

### 12.1 Deny non-TLS access (aws:SecureTransport)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::amzn-s3-demo-bucket", "arn:aws:s3:::amzn-s3-demo-bucket/*"],
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

### 12.2 Deny TLS versions below 1.2 (s3:TlsVersion)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOldTLS",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::amzn-s3-demo-bucket", "arn:aws:s3:::amzn-s3-demo-bucket/*"],
      "Condition": {
        "NumericLessThan": { "s3:TlsVersion": "1.2" }
      }
    }
  ]
}
```

### 12.3 Enforce encryption with a specific KMS key

Even if default encryption is SSE-KMS, an object is encrypted with SSE-S3 if the client explicitly specifies SSE-S3. To enforce a specific key, add this policy.

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

`IfExists` is used to allow PUTs that omit the header and are therefore encrypted with the default encryption (this key). To make the header mandatory, Deny `"s3:x-amz-server-side-encryption": "true"` with a `Null` condition.

### 12.4 Deny uploads without an encryption header (legacy compatibility)

Since 2023-01, SSE-S3 is applied by default, so this policy is less necessary. Use it when audit requirements demand that clients explicitly specify encryption.

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

### 12.5 Allow access only through a specific VPC endpoint

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyNotFromVPCE",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::amzn-s3-demo-bucket", "arn:aws:s3:::amzn-s3-demo-bucket/*"],
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

This policy also blocks console operations. Exclude a break-glass role so administrators are not locked out.

### 12.6 Allow only principals in your organization (aws:PrincipalOrgID)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideOrg",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::amzn-s3-demo-bucket", "arn:aws:s3:::amzn-s3-demo-bucket/*"],
      "Condition": {
        "StringNotEqualsIfExists": { "aws:PrincipalOrgID": "o-exampleorgid" },
        "BoolIfExists": { "aws:PrincipalIsAWSService": "false" }
      }
    }
  ]
}
```

`aws:PrincipalIsAWSService` excludes AWS service principals (for example, `logging.s3.amazonaws.com`, `cloudtrail.amazonaws.com`) so that their access is not broken.

### 12.7 Allow reads only from CloudFront OAC

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

OAC (Origin Access Control) is the successor to the legacy OAI and supports SSE-KMS objects, all Regions, and PUT/DELETE. For SSE-KMS, also allow `kms:Decrypt` for `cloudfront.amazonaws.com` in the KMS key policy with the same condition. The bucket can keep BPA enabled (with the `AWS:SourceArn` condition, the policy is not considered public).

### 12.8 Cross-account reads (role specified)

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

Account 444455556666 must also allow the same Action / Resource in the IAM policy of the `PartnerReader` role. For SSE-KMS, also grant `kms:Decrypt` in the KMS key policy (the AWS managed key `aws/s3` cannot be used cross-account, so a customer managed key is required).

### 12.9 VPC endpoint policy: only your organization's buckets

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
      "Resource": ["arn:aws:s3:::EXAMPLE-AMAZON-LINUX-REPO-BUCKET/*"]
    }
  ]
}
```

The actual names of AWS-owned buckets, such as Amazon Linux package repositories, vary by Region and distribution, so a placeholder is used here. Check the real names in the Amazon Linux documentation / re:Post.

### 12.10 IP address restriction (VPCE traffic handled separately)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideCorpNetwork",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::amzn-s3-demo-bucket", "arn:aws:s3:::amzn-s3-demo-bucket/*"],
      "Condition": {
        "NotIpAddress": { "aws:SourceIp": ["203.0.113.0/24", "198.51.100.10/32"] },
        "Null": { "aws:SourceVpce": "true" },
        "BoolIfExists": { "aws:ViaAWSService": "false" }
      }
    }
  ]
}
```

`Null: aws:SourceVpce = true` applies the IP condition only to requests that do not go through a VPCE. `aws:ViaAWSService` excludes forward access sessions in which services such as Athena or Glue call S3 on the user's behalf.

### 12.11 Delegate access control to access points

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DelegateToAccessPoints",
      "Effect": "Allow",
      "Principal": { "AWS": "*" },
      "Action": "*",
      "Resource": ["arn:aws:s3:::amzn-s3-demo-bucket", "arn:aws:s3:::amzn-s3-demo-bucket/*"],
      "Condition": {
        "StringEquals": { "s3:DataAccessPointAccount": "111122223333" }
      }
    }
  ]
}
```

This means: "For requests through access points owned by this account, leave the decision to the access point policy." The principal is `Principal: *`, but because of the condition the policy is not considered public.

### 12.12 SCP: prohibit creating buckets outside the account regional namespace

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

The condition key name, and the fact that this policy denies any CreateBucket request whose `x-amz-bucket-namespace` header is not `account-regional` or is missing, are stated in the policy examples in the S3 User Guide (Namespaces for general purpose buckets).

### 12.13 Restrict presigned URL signature age and method

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

`s3:signatureAge` is in milliseconds (600000 = 10 minutes). This denies presigned URLs signed more than 10 minutes ago.

### 12.14 Restrict reads based on GuardDuty malware scan results (TBAC)

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

Multiple keys in a single `StringNotEquals` are evaluated with AND, so the request is denied when the tag is not NO_THREATS_FOUND and the principal is also not the GuardDuty role.

### 12.15 Legacy: require bucket-owner-full-control for cross-account writes

Not needed with Object Ownership = BucketOwnerEnforced. For older buckets that still have ACLs enabled.

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

### 12.16 RCP: organization-wide S3 data perimeter

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

In RCPs, `Principal` must be `"*"`, and `Effect` is normally Deny (you cannot write Allow statements other than RCPFullAWSAccess). If some buckets are intentionally shared externally, create exceptions with `aws:ResourceTag` or similar.

### 12.17 SCP: prohibit dangerous S3 configuration changes

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

## 13. Security checklist

### 13.1 Organization / account level

- [ ] Enforce BPA at the organization level with an Organizations S3 policy (exception OU only for publishing accounts)
- [ ] Enable account-level BPA in all accounts (Security Hub S3.1)
- [ ] Data perimeter with `aws:PrincipalOrgID` + `aws:SecureTransport` in an RCP
- [ ] Restrict BPA changes, log tampering, and dangerous encryption changes with SCPs
- [ ] Enforce `s3:x-amz-bucket-namespace = account-regional` for new buckets with an SCP (bucketsquatting mitigation)
- [ ] Retire long-term access keys and move to IAM Identity Center / roles
- [ ] Enforce IMDSv2 on all EC2 instances
- [ ] Organization CloudTrail + S3 data events (at least for sensitive buckets)
- [ ] Enable GuardDuty (S3 Protection) in all accounts and all Regions
- [ ] Macie automated sensitive data discovery
- [ ] IAM Access Analyzer (external access + internal access)
- [ ] Security Hub CSPM FSBP standard

### 13.2 Bucket level

- [ ] Object Ownership = BucketOwnerEnforced (ACLs disabled, S3.12)
- [ ] Bucket-level BPA enabled (S3.8)
- [ ] `aws:SecureTransport` Deny (S3.5), and `s3:TlsVersion` if needed
- [ ] Default encryption: SSE-KMS (CMK) + Bucket Keys for sensitive data (S3.17)
- [ ] Confirm SSE-C is blocked (`get-bucket-encryption`)
- [ ] Versioning enabled (S3.14) + Lifecycle for noncurrent versions (S3.10)
- [ ] Object Lock (S3.15) / AWS Backup / CRR (S3.7) for critical data
- [ ] Access logs or CloudTrail data events (S3.9 / S3.22 / S3.23)
- [ ] Minimize cross-account grants in bucket policies (S3.6)
- [ ] VPCE / IP restrictions as needed
- [ ] Malware Protection for S3 + TBAC on buckets that accept uploads
- [ ] CORS limited to specific origins
- [ ] Issue presigned URLs with short lifetimes and role credentials

### 13.3 Operations

- [ ] Inventory DNS records / code / documents that reference deleted bucket names
- [ ] Turn Access Denied troubleshooting into a runbook (CloudTrail errorMessage → policy type)
- [ ] Incident procedure: deactivate access keys, Deny everything with a bucket policy, recover from Object Lock / versions

## References

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
