# Frontend

An empty React SPA with Tailwind CSS. Your job is to build a real-time telemetry dashboard.

## Development

```bash
cd frontend
pnpm dev
# Opens at http://localhost:5173
```

## Deploy to S3

Build and push to the S3 bucket:

```bash
# From repo root:
pnpm run apply:frontend
```

After deploying, your frontend is available at the URL printed by `terraform output` (the `frontend_url`).

## API Connection

Set the `VITE_API_URL` environment variable to point to your API Gateway URL:

```bash
VITE_API_URL=https://your-api-id.execute-api.eu-west-1.amazonaws.com pnpm dev
```

Or create a `.env` file in the `frontend/` directory:

```
VITE_API_URL=https://your-api-id.execute-api.eu-west-1.amazonaws.com
```
