# 🏎️ Synadia Hackathon — Team 1

**AWS Account ID:** `803146828605`

Welcome to the Synadia IoT Hackathon! Today you'll build a real-time telemetry system for race cars. Tomorrow you'll install your sensors on real cars at Circuit Zandvoort and watch your dashboard come alive from the pit lane.

## The Challenge

Build an end-to-end IoT pipeline:

1. **Tracking Box** (Raspberry Pi) — Read GPS and sensor data from a hardware module, publish it to AWS IoT Core over MQTT
2. **IoT Processor** (Lambda) — Receive the data from IoT Core via SQS, process and store it
3. **API** (Lambda + API Gateway) — Serve the stored telemetry data to the frontend
4. **Dashboard** (React SPA) — Visualize the live telemetry data in a browser

The infrastructure (Lambdas, SQS, IoT Core, S3, API Gateway) is already defined in Terraform — you just need to deploy it and write the application code.

## Architecture

```
Raspberry Pi → MQTT → AWS IoT Core → SQS Queue → IoT Processor Lambda → Storage
                                                                            ↓
                           Browser ← S3 SPA ← API Gateway ← API Lambda ← reads
```

## Prerequisites

### 1. Install Node.js and pnpm

```bash
# Install Node.js (v22+) — https://nodejs.org
# Then install pnpm:
npm install -g pnpm@10
```

### 2. Install Terraform

```bash
# macOS
brew install terraform
```

### 3. Install & Configure AWS CLI

```bash
# macOS
brew install awscli
```

Add this to `~/.aws/config`:

```ini
[sso-session synadia]
sso_start_url = https://synadia.awsapps.com/start
sso_region = eu-west-1
sso_registration_scopes = sso:account:access

[profile syn-hackathon-team-1]
sso_session = synadia
sso_account_id = 803146828605
sso_role_name = hackathon-participant
region = eu-west-1
```

Then log in:

```bash
aws sso login --sso-session synadia
```

**Before running any `terraform` or `aws` command, always export your profile:**

```bash
export AWS_PROFILE=syn-hackathon-team-1
```

Verify it works:

```bash
aws sts get-caller-identity
```

### 4. Install Dependencies

```bash
pnpm install
```

## Project Structure

| Directory | What | README |
|-----------|------|--------|
| `infra/` | Terraform infrastructure definitions | [infra/README.md](infra/README.md) |
| `tracking-box/` | Raspberry Pi Python code for sensor reading | [tracking-box/README.md](tracking-box/README.md) |
| `lambdas/iot-processor/` | Lambda that processes incoming IoT data | [lambdas/README.md](lambdas/README.md) |
| `lambdas/api/` | Lambda API that serves data to the frontend | [lambdas/README.md](lambdas/README.md) |
| `frontend/` | React dashboard SPA | [frontend/README.md](frontend/README.md) |

## Quick Start

Start in this order:

1. **[infra/README.md](infra/README.md)** — Deploy all AWS infrastructure
2. **[tracking-box/README.md](tracking-box/README.md)** — Set up the Pi and get data flowing
3. **[lambdas/README.md](lambdas/README.md)** — Implement the data pipeline
4. **[frontend/README.md](frontend/README.md)** — Build your dashboard

## Useful Commands

```bash
pnpm build              # Build all lambdas + frontend
pnpm run apply          # Build + terraform apply (deploys everything)
pnpm run apply:frontend # Build + deploy frontend to S3
pnpm run aws:login      # Re-authenticate with AWS SSO

pnpm run pi:deploy      # Deploy code to the Pi
pnpm run pi:status      # Check if the tracking box is running
pnpm run pi:stop        # Stop the tracking box
pnpm run pi:gps         # Configure GPS module
```

Good luck! 🏁
