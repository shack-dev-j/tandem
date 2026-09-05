#!/usr/bin/env bash
# Create the repo, push, and turn on GitHub Pages. Run after `gh auth login`.
set -euo pipefail

NAME="${1:-tandem}"
cd "$(dirname "$0")"

gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first."; exit 1; }
USER=$(gh api user --jq .login)

if gh repo view "$USER/$NAME" >/dev/null 2>&1; then
  echo "Repo exists, pushing to it."
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$USER/$NAME.git"
else
  gh repo create "$NAME" --public --source=. --remote=origin \
    --description "A homework and goal tracker for two people."
fi

# Stamp the build so a stale browser can notice it is stale.
printf "export const BUILD = '%s';\n" "$(date -u +%Y-%m-%dT%H:%MZ)" \
  > /tmp/tandem_build && \
  sed -i "s|^export const BUILD = .*|$(cat /tmp/tandem_build)|" assets/js/version.js && \
  git add assets/js/version.js && git commit -q -m "Stamp build" 2>/dev/null || true

git branch -M main
git push -u origin main

# Pages from the branch root: the site is already static, nothing to build.
gh api -X POST "repos/$USER/$NAME/pages" \
  -f 'source[branch]=main' -f 'source[path]=/' >/dev/null 2>&1 \
  || gh api -X PUT "repos/$USER/$NAME/pages" \
       -f 'source[branch]=main' -f 'source[path]=/' >/dev/null

echo
echo "Live in a minute or two at: https://$USER.github.io/$NAME/"
