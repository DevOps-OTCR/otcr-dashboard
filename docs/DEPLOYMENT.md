# OTCR Dashboard - Production Deployment Guide

## 🚀 Quick Start for Production Launch

This guide will help you deploy the OTCR Dashboard to production professionally.

---

## Prerequisites

### Required Services
1. **Database**: PostgreSQL 14+ (Neon, AWS RDS, or self-hosted)
2. **Cache**: Redis 6+ (Redis Cloud, AWS ElastiCache, or self-hosted)
3. **Authentication**: Google OAuth credentials (production)
4. **Email**: Resend API key
5. **File Storage**: Cloudflare R2 (or AWS S3)
6. **Hosting**: Vercel, AWS, or self-hosted

---

## Step 1: Environment Configuration

### Frontend (.env.production)
```bash
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
NEXTAUTH_SECRET=your-production-secret
NEXTAUTH_URL=https://yourdomain.com
```

### Backend (.env)
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/otcr_dashboard

# Redis
REDIS_URL=redis://your-redis-host:6379

# Notifications
RESEND_API_KEY=re_xxxxx
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxxxx

# Storage
R2_ACCOUNT_ID=xxxxx
R2_ACCESS_KEY_ID=xxxxx
R2_SECRET_ACCESS_KEY=xxxxx
R2_BUCKET_NAME=otcr-prod

# App Config
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://yourdomain.com
```

---

## Step 2: Database Setup

### Option A: Using Neon (Recommended - Free Tier Available)
1. Go to https://neon.tech
2. Create a new project
3. Copy the connection string
4. Update `DATABASE_URL` in backend `.env`

### Option B: Self-Hosted PostgreSQL
```bash
# Run migrations
cd backend
npm run prisma:migrate
npm run prisma:generate
npm run prisma:seed  # Optional: load initial data
```

---

## Step 3: Build for Production

### Frontend Build
```bash
cd frontend
npm run build
npm run start  # Test production build locally
```

### Backend Build
```bash
cd backend
npm run build
npm run start:prod  # Test production build locally
```

---

## Step 4: Deployment Options

### Option A: Vercel (Recommended for Frontend)

#### Frontend to Vercel
```bash
cd frontend
npm install -g vercel
vercel --prod
```

**Configure in Vercel Dashboard:**
- Add environment variables from `.env.production`
- Set build command: `npm run build`
- Set output directory: `.next`
- Enable automatic deployments from `main` branch

#### Backend to Railway/Render
```bash
# Railway
npm install -g @railway/cli
railway login
railway up
```

Or deploy to **Render.com**:
1. Connect your GitHub repo
2. Select `backend` directory
3. Build command: `npm install && npm run build`
4. Start command: `npm run start:prod`
5. Add all environment variables

---

### Option B: Docker Deployment (Self-Hosted)

Create `docker-compose.prod.yml`:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: otcr_dashboard
      POSTGRES_USER: otcr
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    depends_on:
      - postgres
      - redis
    ports:
      - "4000:4000"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    environment:
      - NEXT_PUBLIC_API_URL=https://api.yourdomain.com
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
```

Deploy:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

### Option C: AWS Deployment

#### Frontend to AWS Amplify
1. Connect GitHub repository
2. Select `frontend` directory
3. Configure build settings:
   - Build command: `npm run build`
   - Output directory: `.next`
4. Add environment variables

#### Backend to AWS Elastic Beanstalk
```bash
eb init
eb create production
eb deploy
```

---

## Step 5: DNS & SSL Configuration

### Domain Setup
1. Point your domain to the hosting provider
2. Configure DNS records:
   ```
   A     @        -> Your-Frontend-IP
   CNAME api      -> Your-Backend-URL
   CNAME www      -> Your-Frontend-URL
   ```

### SSL Certificate
- **Vercel/Netlify**: Automatic SSL
- **AWS**: Use ACM (AWS Certificate Manager)
- **Self-hosted**: Use Let's Encrypt with Nginx

---

## Step 6: Security Checklist

- [ ] All `.env` files are in `.gitignore`
- [ ] Production environment variables are set
- [ ] CORS is configured for your domain only
- [ ] Database has strong password
- [ ] Redis is password-protected
- [ ] Google OAuth and NextAuth production credentials are set
- [ ] API rate limiting is enabled
- [ ] SSL/HTTPS is enforced
- [ ] Security headers are configured
- [ ] File upload size limits are set
- [ ] Input validation is working

---

## Step 7: Monitoring & Maintenance

### Recommended Tools
- **Error Tracking**: Sentry.io
- **Uptime Monitoring**: UptimeRobot or Pingdom
- **Performance**: Vercel Analytics or Google Analytics
- **Logs**: LogRocket or DataDog

### Health Checks
- Frontend: `https://yourdomain.com`
- Backend: `https://api.yourdomain.com/auth/health`

---

## Performance Optimization

### Frontend
```bash
# Analyze bundle size
npm run build
npm run analyze  # If you add the analyzer
```

### Backend
- Enable Redis caching for frequent queries
- Configure connection pooling (Prisma)
- Set up CDN for static assets (Cloudflare)

---

## Backup Strategy

### Database Backups
```bash
# Automated daily backups
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Environment Backups
- Store production `.env` files securely (1Password, AWS Secrets Manager)
- Keep encrypted backups of OAuth and NextAuth secrets

---

## Rollback Plan

### Quick Rollback
```bash
# Vercel
vercel rollback

# Railway
railway rollback

# Docker
docker-compose down
git checkout previous-tag
docker-compose up -d
```

---

## Cost Estimation (Monthly)

### Free Tier Setup
- **Frontend**: Vercel Free ($0)
- **Backend**: Render Free ($0)
- **Database**: Neon Free ($0)
- **Redis**: Redis Cloud Free ($0)
- **Auth**: Google OAuth (free) + NextAuth (free)
- **Email**: Resend Free (100 emails/day - $0)
- **Total**: $0/month

### Production Setup
- **Frontend**: Vercel Pro ($20)
- **Backend**: Render Starter ($7)
- **Database**: Neon Scale ($19)
- **Redis**: Redis Cloud ($5)
- **Auth**: Google OAuth (free)
- **Email**: Resend Pro ($20)
- **Storage**: Cloudflare R2 ($0.015/GB)
- **Total**: ~$96-120/month

---

## Support & Troubleshooting

### Common Issues

**Frontend won't build:**
```bash
rm -rf .next node_modules
npm install
npm run build
```

**Database connection fails:**
- Check DATABASE_URL format
- Verify network access (whitelist IPs)
- Test connection: `psql $DATABASE_URL`

**Redis connection timeout:**
- Verify REDIS_URL
- Check Redis is running: `redis-cli ping`

**NextAuth / Google OAuth authentication errors:**
- Verify GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and NEXTAUTH_SECRET
- Check authorized redirect URIs in Google Cloud Console (e.g. https://yourdomain.com/api/auth/callback/google)
- Ensure HTTPS is enabled

---

## Next Steps

1. Set up monitoring and alerts
2. Configure automated backups
3. Enable CDN for static assets
4. Set up CI/CD pipeline
5. Create staging environment
6. Document API endpoints
7. Set up load testing

---

## Contact

For deployment support or questions, contact your development team.

**Last Updated**: February 2026
