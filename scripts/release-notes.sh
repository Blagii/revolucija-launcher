#!/usr/bin/env bash
# Generiše Markdown release notes iz git tagova: od poslednjeg taga do HEAD-a.
# Upotreba: scripts/release-notes.sh [od_taga]
set -euo pipefail

if [[ $# -ge 1 ]]; then
  FROM="$1"
else
  FROM=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
fi

RANGE="HEAD"
if [[ -n "${FROM}" ]]; then
  RANGE="${FROM}..HEAD"
fi

{
  echo "## Šta je novo"
  echo
  git log "${RANGE}" --no-merges --pretty='- %s (`%h`)'
  echo
  if [[ -n "${FROM}" ]]; then
    REPO=$(git remote get-url origin 2>/dev/null | sed -E 's#(git@|https://)github.com[:/]##; s#\.git$##' || true)
    if [[ -n "${REPO}" ]]; then
      echo "**Puna lista:** https://${REPO}/compare/${FROM}...HEAD"
    fi
  fi
} 
