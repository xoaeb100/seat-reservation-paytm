const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SHOW_ID = process.env.SHOW_ID;
const SEAT = process.env.SEAT || 'A1';
const REQUEST_COUNT = Number(process.env.REQUEST_COUNT || 500);

const USER_ID = 'user-2';
const IDEMPOTENCY_KEY = 'same-key-attack-001';

if (!SHOW_ID) {
  console.error('Missing SHOW_ID');
  process.exit(1);
}

async function reserve(index) {
  const response = await fetch(`${BASE_URL}/shows/${SHOW_ID}/reserve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${USER_ID}`,
    },
    body: JSON.stringify({
      seats: [SEAT],
      idempotency_key: IDEMPOTENCY_KEY,
    }),
  });

  let body;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    index,
    status: response.status,
    body,
  };
}

async function getShow() {
  const response = await fetch(`${BASE_URL}/shows/${SHOW_ID}`);

  return response.json();
}

async function main() {
  console.log('========================================');
  console.log('IDEMPOTENCY CONCURRENCY ATTACK');
  console.log('========================================');
  console.log(`Base URL:       ${BASE_URL}`);
  console.log(`Show ID:        ${SHOW_ID}`);
  console.log(`User:           ${USER_ID}`);
  console.log(`Seat:           ${SEAT}`);
  console.log(`Idempotency:    ${IDEMPOTENCY_KEY}`);
  console.log(`Requests:       ${REQUEST_COUNT}`);
  console.log('');

  const start = Date.now();

  const results = await Promise.all(
    Array.from({ length: REQUEST_COUNT }, (_, index) => reserve(index)),
  );

  const duration = Date.now() - start;

  // Count HTTP statuses.
  const statusCounts = {};

  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  }

  // Collect reservation IDs returned by successful/idempotent requests.
  const reservationIds = results
    .map((result) => result.body?.id)
    .filter(Boolean);

  const uniqueReservationIds = new Set(reservationIds);

  console.log('RESULTS');
  console.log('----------------------------------------');

  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`${status}: ${count}`);
  }

  console.log('');

  console.log(`Unique reservation IDs returned: ${uniqueReservationIds.size}`);

  console.log(`Total reservation IDs returned: ${reservationIds.length}`);

  console.log(`Duration: ${duration} ms`);

  console.log('');

  // Fetch final database-backed API state.
  const show = await getShow();

  console.log('FINAL SHOW STATE');
  console.log('----------------------------------------');
  console.log(`Total:      ${show.total_seats}`);
  console.log(`Available:  ${show.available}`);
  console.log(`Held:       ${show.held}`);
  console.log(`Confirmed:  ${show.confirmed}`);

  const seat = show.seats.find((item) => item.seat === SEAT);

  console.log(`Seat ${SEAT}:    ${seat?.status || 'NOT FOUND'}`);

  console.log('');

  // Assertions.

  const noServerErrors =
    !statusCounts[500] &&
    !statusCounts[502] &&
    !statusCounts[503] &&
    !statusCounts[504];

  const exactlyOneReservation = uniqueReservationIds.size === 1;

  const seatConfirmed = seat?.status === 'confirmed';

  const invariant =
    show.available + show.held + show.confirmed === show.total_seats;

  console.log('========================================');
  console.log('CONCURRENCY ASSERTIONS');
  console.log('========================================');

  console.log(
    `Exactly 1 unique reservation: ${exactlyOneReservation ? 'PASS' : 'FAIL'}`,
  );

  console.log(
    `All successful retries returned same reservation: ${
      reservationIds.length === REQUEST_COUNT ? 'PASS' : 'FAIL'
    }`,
  );

  console.log(`0 server errors: ${noServerErrors ? 'PASS' : 'FAIL'}`);

  console.log(
    `${SEAT} confirmed exactly once: ${seatConfirmed ? 'PASS' : 'FAIL'}`,
  );

  console.log(`Seat invariant: ${invariant ? 'PASS' : 'FAIL'}`);

  console.log('');

  if (
    exactlyOneReservation &&
    reservationIds.length === REQUEST_COUNT &&
    noServerErrors &&
    seatConfirmed &&
    invariant
  ) {
    console.log('🔥 IDEMPOTENCY CONCURRENCY ATTACK: PASS');

    process.exit(0);
  }

  console.log('💀 IDEMPOTENCY CONCURRENCY ATTACK: FAIL');

  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
