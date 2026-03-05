# Deployment (static hosting)

MosBot Dashboard is a static site. A common deployment model is **S3 + CloudFront**.

## CI deployment (GitHub Actions)

Typical workflow:

- Install dependencies
- Run tests
- Build (`npm run build`)
- Upload `dist/` to the bucket
- Invalidate CloudFront

## Manual deployment

Build locally:

```bash
npm run build
```

Sync to S3 (example):

```bash
aws s3 sync dist/ s3://YOUR-BUCKET-NAME/ --delete
```

Then invalidate CloudFront (example):

```bash
aws cloudfront create-invalidation --distribution-id YOUR_DISTRIBUTION_ID --paths "/*"
```
