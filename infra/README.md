# Infrastructure (Terraform)

All AWS infrastructure is defined as code using [Terraform](https://www.terraform.io/). Terraform reads `.tf` files and creates/updates the corresponding AWS resources.

## What's Already Set Up

| Resource | File | Description |
|----------|------|-------------|
| **IoT Core** | `iot.tf` | An IoT "thing" and policy for the Raspberry Pi to connect via MQTT |
| **SQS Queue** | `lambda-iot-processor.tf` | A message queue that batches incoming IoT messages |
| **IoT Processor Lambda** | `lambda-iot-processor.tf` | A Lambda function triggered by the SQS queue (batches of 10 messages) |
| **API Lambda + API Gateway** | `lambda-api.tf` | A Lambda function behind an HTTP API Gateway to serve data to the frontend |
| **Frontend S3 Bucket** | `frontend.tf` | An S3 bucket configured for static website hosting |

## What You Need To Do

### 1. Deploy the infrastructure

Make sure you've exported your AWS profile:

```bash
export AWS_PROFILE=syn-hackathon-team-1
```

Initialize Terraform (downloads providers, connects to state bucket):

```bash
pnpm run tf:init
```

Build the lambdas and deploy everything:

```bash
pnpm run apply
```

This will output your **API URL** and **Frontend URL** — save these!

### 2. Add the IoT Topic Rule

Open `iot.tf` — you'll see a `TODO` comment. You need to add an IoT Topic Rule that routes MQTT messages to the SQS queue.

An IoT Topic Rule uses a SQL-like query to select messages from an MQTT topic, then forwards them to an AWS service. Here's what you need:

```hcl
resource "aws_iot_topic_rule" "your_rule_name" {
  name        = "your_rule_name"
  enabled     = true
  sql         = "SELECT * FROM 'your/mqtt/topic'"
  sql_version = "2016-03-23"

  sqs {
    queue_url  = aws_sqs_queue.telemetry_messages.url
    role_arn   = aws_iam_role.iot_topic_rule.arn
    use_base64 = false
  }
}
```

- The **SQL query** determines which MQTT topic to listen on.
- The **SQS action** sends the message to the queue, which triggers the IoT processor Lambda.
- The **IAM role** for the topic rule is already defined in `lambda-iot-processor.tf`.

After adding the rule, re-deploy:

```bash
pnpm run apply
```

### 3. Redeploy after code changes

Every time you change Lambda code or frontend code, rebuild and deploy:

```bash
pnpm run apply          # Deploys lambdas
pnpm run apply:frontend # Deploys frontend
```

## File Reference

| File | Purpose |
|------|---------|
| `main.tf` | Terraform configuration, backend state, AWS provider |
| `data.tf` | Data sources (current region, account ID) |
| `iot.tf` | IoT Core thing, policy, and topic rule (TODO) |
| `lambda-iot-processor.tf` | IoT processor Lambda, SQS queue, IAM roles |
| `lambda-api.tf` | API Lambda, API Gateway, IAM roles |
| `frontend.tf` | S3 bucket for the frontend SPA |
| `outputs.tf` | Prints useful URLs after deploy |
