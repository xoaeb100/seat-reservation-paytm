#!/usr/bin/env bash

set -u

BASE_URL="${1:-}"

if [ -z "$BASE_URL" ]; then
  echo "Usage: ./burst.sh <BASE_URL>"
  exit 1
fi

echo "========================================"
echo " SEAT RESERVATION BURST TEST"
echo "========================================"
echo
echo "BASE URL: $BASE_URL"
echo

export BASE_URL="$BASE_URL"

FAILED=0

run_test() {
  NAME="$1"
  SCRIPT="$2"

  echo "----------------------------------------"
  echo "$NAME"
  echo "----------------------------------------"

  if node "$SCRIPT"; then
    echo "Result: PASS"
  else
    echo "Result: FAIL"
    FAILED=1
  fi

  echo
}

run_test "Hot-seat concurrency" \
  "src/scripts/concurrency-test.js"

run_test "Per-user reservation limit" \
  "src/scripts/user-limit-test.js"

run_test "Idempotency concurrency" \
  "src/scripts/idempotency-concurrency-test.js"

run_test "Idempotency conflict" \
  "src/scripts/idempotency-conflict-test.js"

run_test "Multi-seat concurrency" \
  "src/scripts/multi-seat-concurrency-test.js"

run_test "Deadlock prevention" \
  "src/scripts/deadlock-concurrency-test.js"

run_test "Cancellation / rebooking race" \
  "src/scripts/cancellation-race-test.js"

echo "========================================"
echo " FINAL RESULT"
echo "========================================"

if [ "$FAILED" -eq 0 ]; then
  echo "RESULT: PASS"
  exit 0
else
  echo "RESULT: FAIL"
  exit 1
fi