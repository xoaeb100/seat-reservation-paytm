#!/usr/bin/env bash

set -u

BASE_URL="${1:-}"

if [ -z "$BASE_URL" ]; then
  echo "Usage: ./burst.sh <BASE_URL>"
  exit 1
fi

ADMIN_TOKEN="${ADMIN_TOKEN:-dev-admin-token}"

echo "========================================"
echo " SEAT RESERVATION BURST TEST"
echo "========================================"
echo
echo "BASE URL: $BASE_URL"
echo

export BASE_URL
export ADMIN_TOKEN

FAILED=0

create_show() {
  local SHOW_NAME="$1"

  echo "Creating test show: $SHOW_NAME"

  RESPONSE=$(curl -sS \
    -X POST \
    "$BASE_URL/shows" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "'"$SHOW_NAME"'",
      "seats": [
        "A1","A2","A3","A4","A5",
        "A6","A7","A8","A9","A10",
        "A11","A12","A13","A14","A15",
        "A16","A17","A18","A19","A20"
      ],
      "price_in_paise": 25000
    }')

  SHOW_ID=$(printf '%s' "$RESPONSE" | node -e "
    let data='';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => {
      try {
        const body = JSON.parse(data);
        if (!body.id) {
          console.error(JSON.stringify(body, null, 2));
          process.exit(1);
        }
        console.log(body.id);
      } catch (error) {
        console.error(data);
        process.exit(1);
      }
    });
  ")

  if [ $? -ne 0 ] || [ -z "$SHOW_ID" ]; then
    echo "❌ Failed to create show"
    echo "Response: $RESPONSE"
    exit 1
  fi

  echo "Show ID: $SHOW_ID"
  echo

  export SHOW_ID
}

run_test() {
  local NAME="$1"
  local SCRIPT="$2"

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

#
# 1. HOT SEAT
#
create_show "burst-hot-seat"

run_test \
  "Hot-seat concurrency" \
  "src/scripts/concurrency-test.js"

#
# 2. PER USER LIMIT
#
create_show "burst-user-limit"

run_test \
  "Per-user reservation limit" \
  "src/scripts/user-limit-test.js"

#
# 3. IDEMPOTENCY
#
create_show "burst-idempotency"

run_test \
  "Idempotency concurrency" \
  "src/scripts/idempotency-concurrency-test.js"

#
# 4. IDEMPOTENCY CONFLICT
#
create_show "burst-idempotency-conflict"

run_test \
  "Idempotency conflict" \
  "src/scripts/idempotency-conflict-test.js"

#
# 5. MULTI-SEAT ATOMICITY
#
create_show "burst-multi-seat"

run_test \
  "Multi-seat concurrency" \
  "src/scripts/multi-seat-concurrency-test.js"

#
# 6. DEADLOCK PREVENTION
#
create_show "burst-deadlock"

run_test \
  "Deadlock prevention" \
  "src/scripts/deadlock-concurrency-test.js"

#
# 7. CANCELLATION / REBOOKING
#
create_show "burst-cancellation"

run_test \
  "Cancellation / rebooking race" \
  "src/scripts/cancellation-race-test.js"

echo "========================================"
echo " FINAL RESULT"
echo "========================================"

if [ "$FAILED" -eq 0 ]; then
  echo "🔥 RESULT: PASS"
  exit 0
else
  echo "❌ RESULT: FAIL"
  exit 1
fi