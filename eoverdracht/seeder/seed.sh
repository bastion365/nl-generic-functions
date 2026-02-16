#!/bin/sh
set -e

PKG_ROOT="/seeder/packages"
LC_ALL=C

put_resource() {
  file="$1"

  type="$(jq -r '.resourceType // empty' "$file")"
  id="$(jq -r '.id // empty' "$file")"

  if [ -z "$type" ] || [ -z "$id" ]; then
    echo "Skipping $(basename "$file") (missing resourceType or id)"
    return
  fi

  echo "PUT $type/$id"

  curl -sf -X PUT \
    -H "Content-Type: application/fhir+json" \
    --data-binary @"$file" \
    "$FHIR_BASE_URL/$type/$id"
}

echo "Waiting for FHIR server to start..."
until curl -s ${FHIR_BASE_URL}/metadata > /dev/null; do
  sleep 3
done

for pkg in "$PKG_ROOT"/*.tgz; do
  [ -e "$pkg" ] || continue

  echo "Installing package $(basename "$pkg")"

  rm -rf /tmp/pkg
  mkdir -p /tmp/pkg
  tar -xzf "$pkg" -C /tmp/pkg

  PKG_DIR="/tmp/pkg/package"
  if [ ! -d "$PKG_DIR" ]; then
    echo "No 'package/' directory found in $pkg"
    exit 1
  fi

  #
  # Load in dependency-safe order
  #
  for type in CodeSystem ValueSet StructureDefinition ConceptMap; do
    find "$PKG_DIR" -type f -name '*.json' | while read -r file; do
      rt="$(jq -r '.resourceType // empty' "$file")"
      if [ "$rt" = "$type" ]; then
        put_resource "$file"
      fi
    done
  done

done

echo "Seeding FHIR data..."
found=0
for file in /seeder/data/*.json; do
  [ -f "$file" ] || continue
  found=1

  echo "Uploading $file..."
  curl -sf -X POST \
    -H "Content-Type: application/fhir+json" \
    --data-binary @"$file" \
    "$FHIR_BASE_URL"
done

if [ "$found" -eq 0 ]; then
  echo "No JSON files found in /seeder/data"
fi