#!/usr/bin/env bash
# Stages a dirsql checkout for the probe to operate in.
#
# Invoked by spike.sh with one argument: the path into which the repo
# should be placed. The spike will then cd into that path before calling
# `claude -p`, so the probe's working dir is the dirsql repo — mirroring
# what the motivating session had (dirsql-on-disk, piot-off-disk).
#
# Network required: `git clone` from github.com.

set -euo pipefail

DEST="${1:?usage: setup.sh <dest-dir>}"

if [[ -d "$DEST/.git" ]]; then
  echo "setup: $DEST already a git repo — reusing" >&2
  exit 0
fi

echo "setup: cloning thekevinscott/dirsql into $DEST" >&2
git clone --depth 1 https://github.com/thekevinscott/dirsql.git "$DEST" >&2
