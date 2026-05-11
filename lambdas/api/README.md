# Lambdas

## API Lambda (`lambdas/api/`)

An HTTP API served by [Hono](https://hono.dev/) behind API Gateway. Currently has a single demo route that does nothing useful.

**When is it triggered?** Every HTTP request to your API Gateway URL hits this Lambda.

**What should it do?** Serve telemetry data to your frontend dashboard. You decide on the API shape, routes, and how to fetch/query the stored data.

**Logs:** AWS Console → CloudWatch → Log groups → `/aws/lambda/hackathon-api`

### Local Development

```bash
cd lambdas/api
pnpm dev
# API running at http://localhost:3000
```

### Deploy

```bash
# From repo root:
pnpm run apply
```

---

## IoT Processor Lambda (`lambdas/iot-processor/`)

A Lambda function triggered by the SQS queue. When the tracking box publishes data to IoT Core, the IoT Topic Rule forwards it to SQS, and SQS triggers this Lambda with batches of up to 10 messages.

**When is it triggered?** Automatically by SQS when messages arrive from IoT Core. Messages are batched (up to 10 at a time).

**What should it do?** Parse the incoming sensor data and store it somewhere useful so the API Lambda can serve it to the frontend.

**Logs:** AWS Console → CloudWatch → Log groups → `/aws/lambda/hackathon-iot-processor`

### Deploy

```bash
# From repo root:
pnpm run apply
```
