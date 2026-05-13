# Lambdas

Both lambdas are Node.js (TypeScript) projects that get bundled with esbuild and deployed as single-file Lambda functions via Terraform.

## IoT Processor Lambda (`iot-processor/`)

**File to edit:** [`iot-processor/src/index.ts`](iot-processor/src/index.ts)

**When is it triggered?** Automatically by SQS when messages arrive from IoT Core. Messages are batched (up to 10 at a time). Each SQS message body contains exactly one MQTT message from the tracking box.

**What does it do now?** Logs the incoming messages and does nothing else.

**What you need to build:**
- Parse the sensor data from each SQS message body (`record.body` is a JSON string)
- Store the data so the API Lambda can later retrieve and serve it to the frontend

**Storage:** You store data by INSERTing it into a shared Athena table. See [docs/athena-s3-tables-guide.md](../docs/athena-s3-tables-guide.md) for how to connect and write SQL.

**Tip:** If you need to add AWS SDK packages (e.g. `@aws-sdk/client-s3`), install them in `lambdas/iot-processor/` and add the corresponding IAM permissions in `infra/lambda-iot-processor.tf`.

**Logs:** [AWS Console](https://synadia.awsapps.com/start) → CloudWatch → Log groups → `/aws/lambda/hackathon-iot-processor`

---

## API Lambda (`api/`)

**File to edit:** [`api/src/app.ts`](api/src/app.ts)

**When is it triggered?** Every HTTP request to your API Gateway URL hits this Lambda.

**What does it do now?** Has a single `GET /api/hello` route that returns a JSON message. Nothing useful.

**What you need to build:**
- Add routes that your frontend will call to fetch telemetry data
- Read the stored data (written by the IoT Processor) and return it as JSON
- You decide on the API shape — what routes, what query parameters, what response format
- If you need new API Gateway routes, add them in `infra/lambda-api.tf` (see the existing route as an example)

**Data retrieval:** You read data by SELECTing from the shared Athena table. See [docs/athena-s3-tables-guide.md](../docs/athena-s3-tables-guide.md) for how to connect and query.

**Tip:** You can run the API locally for faster development:

```bash
cd lambdas/api
pnpm dev
# API running at http://localhost:3000
```

If you need AWS SDK packages, install them in `lambdas/api/` and add IAM permissions in `infra/lambda-api.tf`.

**Logs:** [AWS Console](https://synadia.awsapps.com/start) → CloudWatch → Log groups → `/aws/lambda/hackathon-api`

---

## Deploy

After changing any lambda code, rebuild and deploy from the repo root:

```bash
pnpm run apply
```

---

## A Note on Real-Time Data

Athena is great for storing and querying large amounts of data, but it's not real-time — each query takes 1-5 seconds, and INSERTed data takes a few more seconds to become visible in SELECTs. Combined with SQS batching, the total delay from sensor to dashboard can be 10-30 seconds.

If you want your dashboard to update in near real-time (a few seconds or less), you'll need an additional caching layer alongside Athena. Some ideas:

- **S3 JSON cache** — write a rolling JSON file per device to an S3 bucket, read it from the API Lambda. Simple but effective (~2-3s latency)
- **DynamoDB** — a fast key-value database with sub-10ms reads/writes. More setup, but truly real-time
- **Dual write** — write to both a fast cache (S3/DynamoDB) for the live view and Athena for historical queries

Talk to us if you want to go down this path — we can help you set it up.
