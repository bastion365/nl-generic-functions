#!/bin/bash
echo "Waiting for admin directory to start..."
until curl -s ${ADMIN_DIRECTORY_BASE_URL}/metadata > /dev/null; do
  sleep 3
done

echo "Seeding FHIR data..."
for file in /seed/admin-directory/*.json; do
  echo "Uploading $file..."
  curl -s -X POST -H "Content-Type: application/fhir+json" \
    -d @"$file" ${ADMIN_DIRECTORY_BASE_URL}
done

if [[ -n "${LRZA_MOCK_BASE_URL}" ]]; then
  echo "Waiting for LRZa mock to start..."
  until curl -s ${LRZA_MOCK_BASE_URL}/metadata > /dev/null; do
    sleep 3
  done

  echo "Seeding FHIR data..."
  for file in /seed/lrza-mock/*.json; do
    echo "Uploading $file..."
    curl -s -X POST -H "Content-Type: application/fhir+json" \
      -d @"$file" ${LRZA_MOCK_BASE_URL}
  done

  echo "LRZa mock seeded."
else
  echo "Skip seeding LRZa mock (no base URL set)."
fi
