# Deploy: Bump Image Version

Use this checklist whenever you want to deploy a new app version.

## 1) Build and push a new image tag (local machine)

```bash
cd /Users/gershon/Desktop/playground/cal.com-with-polls
git switch polls-v1
git pull --ff-only

# commit your changes first
git add .
git commit -m "chore: bump deploy version"
git push
```

### 1a) Clean up local build artifacts before building

Do this before a new Docker build, especially if the previous build failed with disk-space errors or if local caches got large.

```bash
rm -rf apps/web/.next .turbo artifacts out
```

Optional Docker cleanup on your local machine:

```bash
docker builder prune -a -f
docker image prune -a -f
docker system prune -a -f
```

### 1b) If you changed Prisma schema, commit the migration too

Before building, make sure schema changes include a migration and generated client updates.

```bash
# if schema.prisma changed
mkdir -p packages/prisma/migrations/<timestamp>_<name>
# add your migration.sql there if not already created

yarn prisma generate

git add packages/prisma/schema.prisma packages/prisma/migrations packages/prisma/generated packages/prisma/zod packages/prisma/enums
```

### 1c) Build and push

```bash
# Use this as your new default command:
export TAG=polls-v14
export CACHE_REF=ghcr.io/gimelg/calcom-custom:buildcache-polls-v1
docker buildx build --platform linux/amd64 \
  --cache-from type=registry,ref=$CACHE_REF \
  --cache-to type=registry,ref=$CACHE_REF,mode=max \
  -t ghcr.io/gimelg/calcom-custom:$TAG \
  --push .
# Then keep a separate “clean” command for occasional use:
docker buildx build --platform linux/amd64 --pull --no-cache \
  -t ghcr.io/gimelg/calcom-custom:$TAG \
  --push .

# pick a new tag every time
#export TAG=polls-v5

#docker buildx build --platform linux/amd64 --no-cache --pull \
#  -t ghcr.io/gimelg/calcom-custom:$TAG \
#  --push .
#```
#Optional sanity check:
#```bash
#docker run --rm --platform linux/amd64 ghcr.io/gimelg/calcom-custom:$TAG yarn -v
#```

## 2) Deploy on VPS

Update `docker-compose.yml` image tag:

```yaml
services:
  calcom:
    image: ghcr.io/gimelg/calcom-custom:polls-v5
```

Then run:

```bash
docker compose pull
docker compose up -d --force-recreate
```

### 2a) Run Prisma migrations on VPS if needed

If the release includes a new migration, run it inside the updated app container before validating the app:

```bash
docker compose exec calcom yarn prisma migrate deploy
```

Then check logs:

```bash
docker logs --tail=120 calcom
```

## 3) Rollback (if needed)

Set image back to the previous tag in `docker-compose.yml`, then:

```bash
docker compose pull
docker compose up -d --force-recreate
```

## 4) Free up Docker disk space (safe cleanup)

Run this on the VPS before/after deploy when disk gets tight:

```bash
# inspect usage
docker system df
docker images "ghcr.io/gimelg/calcom-custom"

# optional: list all images with IDs and size
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}"

# optional: delete specific image(s) by ID
docker rmi <IMAGE_ID>
docker rmi <ID1> <ID2> <ID3>

# safe cleanup (keeps named volumes)
docker container prune -f
docker image prune -f
docker builder prune -f
docker network prune -f
```

Optional (recommended): remove very old custom image tags manually, but keep the current tag and at least one rollback tag:

```bash
docker images "ghcr.io/gimelg/calcom-custom"
# example
docker rmi ghcr.io/gimelg/calcom-custom:polls-v1
docker rmi ghcr.io/gimelg/calcom-custom:polls-v2
```

## 5) Sync fork with upstream (keep polls feature on top)

Use this before building a new deploy image so your fork stays current with `calcom/cal.com`
while preserving your `polls-v1` commits on top.

```bash
./scripts/sync-upstream.sh
```

What it does:

- Ensures `upstream` remote exists (defaults to `git@github.com:calcom/cal.com.git`)
- Fetches `upstream` and `origin`
- Rebases `polls-v1` onto `upstream/main`
- Runs `yarn type-check:ci --force`
- Runs `TZ=UTC yarn test`

Useful options:

```bash
# sync and auto-push rewritten branch to origin
./scripts/sync-upstream.sh --push

# skip full tests (faster sync)
./scripts/sync-upstream.sh --skip-tests

# show all options
./scripts/sync-upstream.sh --help
```

About `--push`:

- It pushes with `git push --force-with-lease origin <branch>`
- Use it after successful rebase/checks when you want the script to publish automatically
- Without `--push`, the script stops after checks and you can push manually

If rebase conflicts occur:

```bash
git add <resolved-files>
git rebase --continue

# or abort
git rebase --abort
```

## Notes

- Never use `docker compose down -v`.
- Never run `docker volume prune` on this server.
- Reuse existing volumes: `calcom_database-data` and `calcom_redis-data`.
