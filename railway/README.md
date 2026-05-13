# Railway Deployment Files

This folder contains Railway deployment configuration and examples.

## Files

| File | Purpose |
|------|---------|
| `RAILWAY_DEPLOY.md` | Full deployment guide with step-by-step instructions |
| `env.railway.example` | Environment variable template for Railway dashboard |
| `railway.toml` | Alternative Railway configuration (TOML format) |
| `Procfile` | Process definition for Railway/Heroku-style deployment |

## Main Configuration

The main `railway.json` is located in the **project root** (`/railway.json`) because Railway looks for it there by default.

## Quick Deploy

1. Push this repo to GitHub
2. Connect to Railway
3. Add MongoDB service
4. Set environment variables from `env.railway.example`
5. Deploy!

See `RAILWAY_DEPLOY.md` for detailed instructions.

