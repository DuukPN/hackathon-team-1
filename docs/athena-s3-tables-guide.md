# Storing & Querying Telemetry Data

All teams share a single telemetry table hosted in a central AWS account. Your lambdas write to it (INSERT) and read from it (SELECT) using **Amazon Athena** — a serverless SQL engine that runs queries against the data stored in S3 Tables (Apache Iceberg format under the hood).

You don't manage any database or table yourself — it's already set up. You just need to connect and run SQL.

## How It Works

```
Your Lambda  →  STS AssumeRole  →  Shared Account Role  →  Athena  →  S3 Tables
```

Your lambda **assumes a role** in the shared account, then uses that role's credentials to run Athena queries. That's it — two SDK clients (`STS` + `Athena`), three steps.

## Setup

**Install the SDK packages** in your lambda directory:

```bash
pnpm add @aws-sdk/client-athena @aws-sdk/client-sts
```

**Environment variables** — these are already configured in your Terraform. Your lambda code reads them at runtime:

| Variable | Value |
|----------|-------|
| `SHARED_ROLE_ARN` | `arn:aws:iam::258975980862:role/hackathon-cross-account-writer` |
| `SHARED_ATHENA_OUTPUT_LOCATION` | `s3://hackathon-shared-athena-results-258975980862/query-results/` |
| `ATHENA_CATALOG` | `hackathon-shared-data` |
| `ATHENA_DATABASE` | `telemetry` |
| `TABLE_NAME` | `telemetry` |

**IAM** — your lambda role already has `sts:AssumeRole` permission on the shared role. No changes needed.

## The Code

### 1. Get an Athena client (with cross-account credentials)

You need to assume a role in the shared account before you can run queries. Use STS `AssumeRole` to get temporary credentials, then create an `AthenaClient` with those credentials.

```typescript
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
} from "@aws-sdk/client-athena";

const stsClient = new STSClient();

// Use AssumeRole to get temporary credentials for the shared account
// Then create an AthenaClient with those credentials
// Hint: cache the client and credentials to avoid calling STS on every invocation
```

> **Docs:** [AssumeRoleCommand](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sts/command/AssumeRoleCommand/), [AthenaClient](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/athena/)

### 2. Running queries

Athena is **asynchronous** — you don't get results immediately. The flow is:

1. **Start** the query with `StartQueryExecutionCommand` → get back a `QueryExecutionId`
2. **Poll** with `GetQueryExecutionCommand` until the state is `SUCCEEDED` (or `FAILED`)
3. **Fetch results** with `GetQueryResultsCommand`

```typescript
// Start a query
const { QueryExecutionId } = await client.send(
  new StartQueryExecutionCommand({
    QueryString: "YOUR SQL HERE",
    ResultConfiguration: { OutputLocation: SHARED_ATHENA_OUTPUT_LOCATION },
    WorkGroup: "primary",
  })
);

// Poll until done (queries take 1–5 seconds)
// Check QueryExecution.Status.State — loop until SUCCEEDED or FAILED

// Fetch results
const { ResultSet } = await client.send(
  new GetQueryResultsCommand({ QueryExecutionId })
);
// ResultSet.Rows contains the data
```

### 3. The SQL

The table lives in a federated catalog. The path format is:

```sql
"s3tablescatalog/<catalog_name>".<database>.<table>
```

**INSERT example:**
```sql
INSERT INTO "s3tablescatalog/hackathon-shared-data".telemetry.telemetry
(col1, col2, col3, ...)
VALUES ('value1', 123, 45.6), ('value2', 456, 78.9)
```

**SELECT example:**
```sql
SELECT col1, col2, col3
FROM "s3tablescatalog/hackathon-shared-data".telemetry.telemetry
WHERE col1 = 'some_value'
ORDER BY col2 ASC
```

You'll need to figure out the table's column names and types — try a `SELECT * ... LIMIT 5` to explore.

## Things That Will Bite You

**The table path must be quoted.** It contains a `/`, so double-quote it in your SQL:
```sql
-- Yes
FROM "s3tablescatalog/hackathon-shared-data".telemetry.telemetry

-- No (TABLE_NOT_FOUND)
FROM s3tablescatalog/hackathon-shared-data.telemetry.telemetry
```

**Don't set the catalog in `QueryExecutionContext`.** It doesn't work for cross-account S3 Tables. Always put the full path in the SQL itself.

**All result values are strings.** Athena returns everything as `VarCharValue`, even numbers. Convert them yourself.

**First page of results has a header row.** The first row contains column names, not data. Subsequent pages (via `NextToken`) don't have it.

**Results are paginated at 1000 rows.** Use `NextToken` to get more.

**Lambda timeout.** Queries take 1–5 seconds. Your lambda timeout should be **30 seconds** minimum.

**INSERT is eventually consistent.** Data may not appear in SELECT for a few seconds after INSERT completes.

## Debugging

If something goes wrong, check:

1. **CloudWatch Logs** — your lambda logs the error message from Athena
2. **Athena Console** — go to [AWS Console](https://synadia.awsapps.com/start) → Athena → Query history to see failed queries and their error messages
3. **Common errors:**
   - `TABLE_NOT_FOUND` — you forgot the double quotes around the catalog path
   - `Access Denied` — credentials expired or role assumption failed, check your `SHARED_ROLE_ARN`
   - `INTERNAL_ERROR_QUERY_ENGINE` — usually means the table path is wrong

## Further Reading

- [@aws-sdk/client-athena](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/athena/) — SDK docs
- [@aws-sdk/client-sts](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sts/) — SDK docs
- [Athena SQL Reference](https://docs.aws.amazon.com/athena/latest/ug/ddl-sql-reference.html)
- [S3 Tables + Athena](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-tables-integrating-athena.html)
