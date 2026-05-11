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

Install Node.js (v22+) from [https://nodejs.org](https://nodejs.org) (all platforms), then:

```bash
npm install -g pnpm@10
```

### 2. Install Terraform

```bash
# macOS
brew install terraform

# Windows (with Chocolatey)
choco install terraform

# Linux
sudo apt-get update && sudo apt-get install -y gnupg software-properties-common
wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor | sudo tee /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
```

Or download directly from [https://developer.hashicorp.com/terraform/downloads](https://developer.hashicorp.com/terraform/downloads).

### 3. Install & Configure AWS CLI

```bash
# macOS
brew install awscli

# Windows — download the installer from:
# https://awscli.amazonaws.com/AWSCLIV2.msi

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install
```

Add this to `~/.aws/config` (macOS/Linux) or `C:\Users\<you>\.aws\config` (Windows):

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

You can also access the AWS Console in your browser at: [https://synadia.awsapps.com/start](https://synadia.awsapps.com/start)

**Before running any `terraform` or `aws` command, always export your profile:**

```bash
# macOS / Linux
export AWS_PROFILE=syn-hackathon-team-1

# Windows (PowerShell)
$env:AWS_PROFILE = "syn-hackathon-team-1"

# Windows (cmd)
set AWS_PROFILE=syn-hackathon-team-1
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
