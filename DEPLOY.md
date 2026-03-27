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

# pick a new tag every time
export TAG=polls-v5

docker buildx build --platform linux/amd64 --no-cache --pull \
  -t ghcr.io/gimelg/calcom-custom:$TAG \
  --push .
```

Optional sanity check:

```bash
docker run --rm --platform linux/amd64 ghcr.io/gimelg/calcom-custom:$TAG yarn -v
```

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

# safe cleanup (keeps named volumes)
- List images with IDs and size:
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}"
- Delete one image by ID:
docker rmi <IMAGE_ID>
- Delete multiple at once:
docker rmi <ID1> <ID2> <ID3>
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

## Notes

- Never use `docker compose down -v`.
- Never run `docker volume prune` on this server.
- Reuse existing volumes: `calcom_database-data` and `calcom_redis-data`.
