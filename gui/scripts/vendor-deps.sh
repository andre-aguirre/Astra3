#!/usr/bin/env bash
# ============================================================
# Astra3: vendor renderer dependencies locally
# ============================================================
# Re-downloads the files the app loads from renderer/vendor/ (React,
# ReactDOM, 3Dmol.js) and the Astra3 Engine's runtime (engine/pyodide/),
# so the packaged app needs no network access to show its own interface.
# The shipped files are already in place, and a file that already matches
# its SHA-256 below is left alone, so this needs no network unless a file
# is missing or changed. Every download is checked against the SHA-256 of
# the file that ships before it replaces anything, so a changed upstream
# file stops the script instead of changing the app.
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p renderer/vendor

# sha256c: reads "<sha256>  <file>" lines on stdin and checks them (extra args go to the tool).
sha256c() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 -c "$@" -
  else sha256sum -c "$@" -; fi
}

# fetch <url> <sha256> <file>: leaves <file> alone when it already has that
# SHA-256; otherwise downloads to <file>.download and moves it into place only
# if it matches, so a failed check never replaces the shipped file.
fetch() {
  if [[ -f "$3" ]] && echo "$2  $3" | sha256c --status 2>/dev/null; then
    echo "$3: already in place"
    return
  fi
  curl -fsSL "$1" -o "$3.download"
  if ! echo "$2  $3.download" | sha256c; then
    rm -f "$3.download"
    echo "$1 is not the pinned file; $3 was not changed." >&2
    exit 1
  fi
  mv "$3.download" "$3"
}

echo "Fetching React 18.3.1 (UMD, production)..."
fetch "https://unpkg.com/react@18.3.1/umd/react.production.min.js" \
  d949f1c3687aedadcedac85261865f29b17cd273997e7f6b2bfc53b2f9d4c4dd renderer/vendor/react.production.min.js

echo "Fetching ReactDOM 18.3.1 (UMD, production)..."
fetch "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js" \
  35f4f974f4b2bcd44da73963347f8952e341f83909e4498227d4e26b98f66f0d renderer/vendor/react-dom.production.min.js

echo "Fetching 3Dmol.js..."
# BSD-3-Clause (University of Pittsburgh and contributors). 3Dmol.org/build
# serves its newest build, and the shipped file (a 2.5-series build that
# matches no npm release) is no longer what it serves, so when the shipped
# file is missing or changed this check stops the script. To move to a
# release, fetch e.g. https://cdn.jsdelivr.net/npm/3dmol@2.5.5/build/3Dmol-min.js,
# re-check the viewer and Astra3 Engine images, then put its URL and SHA-256 here.
fetch "https://3Dmol.org/build/3Dmol-min.js" \
  e5b7daf4264660c6514ce0474e2d7b8dc582fb7186fa5def60b6be553b87ea4a renderer/vendor/3Dmol-min.js

# ------------------------------------------------------------
# Fonts are NOT downloaded by this script. Inter, Nunito, and IBM Plex
# Mono (regular/medium/semibold) are committed directly into
# renderer/vendor/ as real .woff2 files, the same way any other
# project asset is versioned -- there is nothing for this script to
# fetch. This used to download Inter from rsms.me and Nunito/IBM Plex
# Mono from Google Fonts' CSS2 API (fonts.googleapis.com, which
# redirects the actual .woff2 payload to fonts.gstatic.com) at vendor
# time, which meant `npm run vendor` -- and by extension a machine
# that ran it as part of first-time setup -- could fail outright with
# "curl: (28) Failed to connect to fonts.googleapis.com port 443" on
# a network with no outbound access, exactly the situation Astra3.app
# itself is built to run in. Fonts don't change on every vendor run
# the way the upstream JS libraries above might; there's no ongoing
# reason to re-fetch them from a font CDN each time, so committing the
# actual files removes that failure mode entirely rather than working
# around it.
#
# If Astra3 ever needs a different weight or a new typeface, add the
# real .woff2 file(s) to renderer/vendor/ directly (check licensing
# and update gui/THIRD_PARTY_NOTICES.txt the same way the existing
# fonts are documented there) and add the matching @font-face rule in
# index.html; there is no download step to update here.
# ------------------------------------------------------------

# ------------------------------------------------------------
# The Astra3 Engine's Python runtime (engine/pyodide). Committed with the
# source like the fonts; this re-fetches it. Pinned to Pyodide 314.0.7 and
# checked against these SHA-256 sums (NumPy's is the one in Pyodide's own
# pyodide-lock.json), so a changed upstream file stops the script instead
# of changing the engine. MPL-2.0; see THIRD_PARTY_NOTICES.txt.
# ------------------------------------------------------------
PYODIDE_VERSION="314.0.7"
NUMPY_WHEEL="numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl"
PYODIDE_SUMS="3141b814715a72e59b51b1b18b9ceae5bf19f7c852417e431bb0a34feadf825c  pyodide.js
6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109  pyodide.mjs
f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635  pyodide.asm.mjs
cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6  pyodide.asm.wasm
fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a  python_stdlib.zip
5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010  pyodide-lock.json
40ca48e43ce4ddc68412d5b7a7ca9e2477cd4f0e672277ae468ac2245717079b  package.json
a292c1f5d7d8a2208cd5e94fc467604c131cabcd2fc14fed6eefde121e7fabdf  ${NUMPY_WHEEL}"
echo "Fetching Pyodide ${PYODIDE_VERSION} (the Astra3 Engine's Python)..."
if [[ -d engine/pyodide ]] && (cd engine/pyodide && echo "$PYODIDE_SUMS" | sha256c --status 2>/dev/null); then
  echo "engine/pyodide: already in place"
else
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/pyodide/pyodide/releases/download/${PYODIDE_VERSION}/pyodide-core-${PYODIDE_VERSION}.tar.bz2" -o "$tmp/core.tar.bz2"
  tar -xjf "$tmp/core.tar.bz2" -C "$tmp"
  curl -fsSL "https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/${NUMPY_WHEEL}" -o "$tmp/pyodide/${NUMPY_WHEEL}"
  mkdir -p engine/pyodide
  (cd "$tmp/pyodide" && echo "$PYODIDE_SUMS" | sha256c)
  for f in pyodide.js pyodide.mjs pyodide.asm.mjs pyodide.asm.wasm python_stdlib.zip pyodide-lock.json package.json "${NUMPY_WHEEL}"; do
    cp "$tmp/pyodide/$f" "engine/pyodide/$f"
  done
  rm -rf "$tmp"
fi

echo ""
echo "Done. renderer/vendor/ now contains:"
ls -la renderer/vendor/
echo ""
echo "index.html's <script>/@font-face rules already point at these"
echo "local files -- no further changes needed. Astra3.app will now"
echo "work fully offline."
