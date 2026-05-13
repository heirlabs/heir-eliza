# Railway Deployment Guide for Alpha-TON

## Quick Start

### 1. Prerequisites
- Railway account (https://railway.app)
- GitHub repository connected to Railway
- MongoDB Atlas account OR use Railway's MongoDB plugin

### 2. Deploy to Railway

#### Option A: One-Click Deploy
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/elizaos)

#### Option B: Manual Setup

1. **Create a new Railway project**
   ```
   railway login
   railway init
   ```

2. **Add MongoDB Service**
   - In Railway dashboard, click "New" → "Database" → "MongoDB"
   - Or use MongoDB Atlas and set `MONGODB_URI` manually

3. **Link your GitHub repo**
   - Connect your repository in Railway dashboard
   - Railway will auto-detect the Dockerfile

4. **Set Environment Variables**
   In Railway dashboard → Your Service → Variables:
   
   ```
   MONGODB_URI=${{MongoDB.MONGO_URL}}  # If using Railway MongoDB
   MONGODB_DB_NAME=eliza
   OPENAI_API_KEY=sk-your-key
   NODE_ENV=production
   ```

5. **Deploy**
   - Push to your main branch, or
   - Click "Deploy" in Railway dashboard

### 3. Environment Variables

#### Required
| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://...` |
| `MONGODB_DB_NAME` | Database name | `eliza` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |

#### Optional
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `production` |
| `LOG_LEVEL` | Logging level | `info` |
| `AGENT_ID` | Agent identifier | `eliza-agent` |

### 4. Using Railway MongoDB

If using Railway's built-in MongoDB:

1. Add MongoDB service to your project
2. Use Railway's reference variables:
   ```
   MONGODB_URI=${{MongoDB.MONGO_URL}}
   ```
3. Railway automatically handles networking between services

### 5. Using MongoDB Atlas (Recommended for Production)

1. Create a MongoDB Atlas cluster (free tier available)
2. Get your connection string from Atlas dashboard
3. Set in Railway:
   ```
   MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/eliza?retryWrites=true&w=majority
   ```
4. Whitelist Railway IPs or use 0.0.0.0/0 (less secure)

### 6. Health Checks

The application exposes health endpoints:
- `/api/health` - Basic health check
- `/api/status` - Detailed status (if implemented)

Railway uses these for deployment verification.

### 7. Scaling

To scale your deployment:

1. **Horizontal Scaling**
   - Increase `numReplicas` in `railway.toml`
   - Or use Railway dashboard: Settings → Scaling

2. **Vertical Scaling**
   - Railway auto-scales resources
   - Set memory limits if needed in dashboard

### 8. Logs & Monitoring

- View logs: Railway dashboard → Deployments → Logs
- CLI: `railway logs`

### 9. Custom Domains

1. Railway dashboard → Settings → Domains
2. Add your custom domain
3. Configure DNS CNAME to Railway's provided URL

### 10. Troubleshooting

#### Build Failures
- Check Dockerfile syntax
- Ensure all dependencies are in package.json
- Review build logs in Railway dashboard

#### Connection Issues
- Verify MongoDB URI is correct
- Check Railway service networking
- Ensure environment variables are set

#### Memory Issues
- The default Dockerfile limits turbo concurrency
- Increase memory in Railway if builds fail

### 11. Local Testing Before Deploy

```bash
# Test with Docker locally
docker build -t alpha-ton .
docker run -p 3000:3000 \
  -e MONGODB_URI=mongodb://localhost:27017/eliza \
  -e OPENAI_API_KEY=sk-your-key \
  alpha-ton
```

### 12. CI/CD

Railway automatically deploys on push to main branch.

For staging environments:
1. Create a separate Railway project
2. Connect to a different branch (e.g., `develop`)

---

## Architecture on Railway

```
┌─────────────────────────────────────────────────────┐
│                   Railway Project                    │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────────┐    ┌──────────────────┐       │
│  │   ElizaOS App    │    │    MongoDB       │       │
│  │   (Dockerfile)   │◄──►│    (Plugin)      │       │
│  │   Port: 3000     │    │   Port: 27017    │       │
│  └──────────────────┘    └──────────────────┘       │
│           │                                          │
│           ▼                                          │
│  ┌──────────────────┐                               │
│  │  Public Domain   │                               │
│  │  *.railway.app   │                               │
│  └──────────────────┘                               │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Support

- Railway Docs: https://docs.railway.app
- ElizaOS Docs: https://elizaos.ai/docs
- Issues: https://github.com/your-repo/issues

