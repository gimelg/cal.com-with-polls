#!/usr/bin/env bash

set -euo pipefail

BRANCH="polls-v1"
UPSTREAM_REMOTE="upstream"
UPSTREAM_URL="git@github.com:calcom/cal.com.git"
UPSTREAM_BRANCH="main"
RUN_TYPECHECK=1
RUN_TESTS=1
PUSH=0
ALLOW_DIRTY=0

usage() {
  cat <<'EOF'
Sync your fork branch on top of upstream/main.

Usage:
  ./scripts/sync-upstream.sh [options]

Options:
  -b, --branch <name>            Branch to sync (default: polls-v1)
  -r, --upstream-remote <name>   Upstream remote name (default: upstream)
  -u, --upstream-url <url>       Upstream remote URL (default: git@github.com:calcom/cal.com.git)
  -m, --upstream-branch <name>   Upstream branch (default: main)
      --skip-typecheck           Skip yarn type-check:ci --force
      --skip-tests               Skip TZ=UTC yarn test
      --push                     Push with --force-with-lease after successful rebase/checks
      --allow-dirty              Allow running with local uncommitted changes
  -h, --help                     Show this help

Examples:
  ./scripts/sync-upstream.sh
  ./scripts/sync-upstream.sh --branch polls-v1 --push
  ./scripts/sync-upstream.sh --skip-tests
EOF
}

log() {
  printf "\n[%s] %s\n" "sync-upstream" "$1"
}

run() {
  log "$*"
  "$@"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--branch)
      BRANCH="$2"
      shift 2
      ;;
    -r|--upstream-remote)
      UPSTREAM_REMOTE="$2"
      shift 2
      ;;
    -u|--upstream-url)
      UPSTREAM_URL="$2"
      shift 2
      ;;
    -m|--upstream-branch)
      UPSTREAM_BRANCH="$2"
      shift 2
      ;;
    --skip-typecheck)
      RUN_TYPECHECK=0
      shift
      ;;
    --skip-tests)
      RUN_TESTS=0
      shift
      ;;
    --push)
      PUSH=1
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: this script must run inside a git repository."
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ "$ALLOW_DIRTY" -ne 1 ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Error: working tree is not clean. Commit/stash changes or use --allow-dirty."
    exit 1
  fi
fi

if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
  EXISTING_UPSTREAM_URL="$(git remote get-url "$UPSTREAM_REMOTE")"
  if [[ "$EXISTING_UPSTREAM_URL" != "$UPSTREAM_URL" ]]; then
    log "Remote '$UPSTREAM_REMOTE' already exists with URL: $EXISTING_UPSTREAM_URL"
    log "Keeping existing remote URL (requested: $UPSTREAM_URL)"
  fi
else
  run git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
fi

run git fetch "$UPSTREAM_REMOTE" --prune --tags
run git fetch origin --prune --tags

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  run git checkout "$BRANCH"
elif git show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  run git checkout -b "$BRANCH" "origin/$BRANCH"
else
  echo "Error: branch '$BRANCH' not found locally or on origin."
  exit 1
fi

set +e
git rebase "$UPSTREAM_REMOTE/$UPSTREAM_BRANCH"
REBASE_EXIT_CODE=$?
set -e

if [[ "$REBASE_EXIT_CODE" -ne 0 ]]; then
  echo
  echo "Rebase stopped (likely conflicts)."
  echo "Resolve conflicts, then run:"
  echo "  git add <resolved-files>"
  echo "  git rebase --continue"
  echo
  echo "Or abort with:"
  echo "  git rebase --abort"
  exit "$REBASE_EXIT_CODE"
fi

if [[ "$RUN_TYPECHECK" -eq 1 ]]; then
  run yarn type-check:ci --force
fi

if [[ "$RUN_TESTS" -eq 1 ]]; then
  run env TZ=UTC yarn test
fi

if [[ "$PUSH" -eq 1 ]]; then
  run git push --force-with-lease origin "$BRANCH"
  log "Sync complete and pushed: origin/$BRANCH"
else
  log "Sync complete. To push: git push --force-with-lease origin $BRANCH"
fi
