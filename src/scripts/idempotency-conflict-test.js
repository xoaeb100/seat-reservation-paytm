const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SHOW_ID = process.env.SHOW_ID;
const REQUESTS_PER_SEAT = Number(process.env.REQUESTS_PER_SEAT || 250);

const USER_ID = 'user-3';
const IDEMPOTENCY_KEY = 'same-conflicting-key-001';

const SEAT_A = process.env.SEAT_A || 'A1';
const SEAT_B = process.env.SEAT_B || 'A2';

if (!SHOW_ID) {
  console.error('Missing SHOW_ID');
  process.exit(1);
}

async function reserve(seat, index, group) {
  const response = await fetch(`${BASE_URL}/shows/${SHOW_ID}/reserve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${USER_ID}`,
    },
    body: JSON.stringify({
      seats: [seat],
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
    group,
    seat,
    status: response.status,
    body,
  };
}

async function getShow() {
  const response = await fetch(`${BASE_URL}/shows/${SHOW_ID}`);

  return response.json();
}

async function main() {
  const totalRequests = REQUESTS_PER_SEAT * 2;

  console.log('========================================');
  console.log('IDEMPOTENCY CONFLICT ATTACK');
  console.log('========================================');
  console.log(`Base URL:        ${BASE_URL}`);
  console.log(`Show ID:         ${SHOW_ID}`);
  console.log(`User:            ${USER_ID}`);
  console.log(`Idempotency:     ${IDEMPOTENCY_KEY}`);
  console.log(`Request group A: ${REQUESTS_PER_SEAT} → ${SEAT_A}`);
  console.log(`Request group B: ${REQUESTS_PER_SEAT} → ${SEAT_B}`);
  console.log(`Total requests:  ${totalRequests}`);
  console.log('');

  const start = Date.now();

  // Start both conflicting groups at the same time.
  const requests = [
    ...Array.from({ length: REQUESTS_PER_SEAT }, (_, index) =>
      reserve(SEAT_A, index, 'A'),
    ),
    ...Array.from({ length: REQUESTS_PER_SEAT }, (_, index) =>
      reserve(SEAT_B, index, 'B'),
    ),
  ];

  const results = await Promise.all(requests);

  const duration = Date.now() - start;

  console.log('RESULTS');
  console.log('----------------------------------------');

  const statusCounts = {};

  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  }

  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`${status}: ${count}`);
  }

  console.log('');

  // Split results by requested body.
  const groupA = results.filter((result) => result.group === 'A');

  const groupB = results.filter((result) => result.group === 'B');

  const countStatus = (items, status) =>
    items.filter((item) => item.status === status).length;

  console.log('BY REQUEST BODY');
  console.log('----------------------------------------');

  console.log(
    `${SEAT_A}: 201=${countStatus(groupA, 201)}, 409=${countStatus(groupA, 409)}`,
  );

  console.log(
    `${SEAT_B}: 201=${countStatus(groupB, 201)}, 409=${countStatus(groupB, 409)}`,
  );

  console.log('');

  // Collect reservation IDs.
  const reservationIds = results
    .map((result) => result.body?.id)
    .filter(Boolean);

  const uniqueReservationIds = new Set(reservationIds);

  console.log(`Unique reservation IDs returned: ${uniqueReservationIds.size}`);

  console.log(`Total reservation IDs returned: ${reservationIds.length}`);

  console.log(`Duration: ${duration} ms`);
  console.log('');

  // Fetch final state.
  const show = await getShow();

  const seatA = show.seats.find((seat) => seat.seat === SEAT_A);

  const seatB = show.seats.find((seat) => seat.seat === SEAT_B);

  console.log('FINAL SHOW STATE');
  console.log('----------------------------------------');
  console.log(`Total:      ${show.total_seats}`);
  console.log(`Available:  ${show.available}`);
  console.log(`Held:       ${show.held}`);
  console.log(`Confirmed:  ${show.confirmed}`);
  console.log(`${SEAT_A}:        ${seatA?.status || 'NOT FOUND'}`);
  console.log(`${SEAT_B}:        ${seatB?.status || 'NOT FOUND'}`);

  console.log('');

  /*
   * Exactly ONE body should win.
   *
   * Therefore:
   *
   * Winner group:
   *   1 × 201
   *   remaining requests → 409
   *
   * Losing group:
   *   all requests → 409
   *
   * The winner could be either A or B.
   */

  const successfulGroups = [
    {
      group: 'A',
      count: countStatus(groupA, 201),
    },
    {
      group: 'B',
      count: countStatus(groupB, 201),
    },
  ].filter((item) => item.count > 0);
  const exactlyOneWinner =
    successfulGroups.length === 1 &&
    successfulGroups[0].count === REQUESTS_PER_SEAT;

  const allRequestsHandled = results.length === totalRequests;

  const noServerErrors = !results.some(
    (result) => result.status >= 500 && result.status <= 599,
  );

  const exactlyOneReservation = uniqueReservationIds.size === 1;

  const exactlyOneConfirmedSeat = show.confirmed === 1;

  const invariant =
    show.available + show.held + show.confirmed === show.total_seats;

  console.log('========================================');
  console.log('CONCURRENCY ASSERTIONS');
  console.log('========================================');
  const groupASuccesses = countStatus(groupA, 201);
  const groupBSuccesses = countStatus(groupB, 201);

  const groupAConflicts = countStatus(groupA, 409);
  const groupBConflicts = countStatus(groupB, 409);

  const exactlyOneBodyWon =
    (groupASuccesses === REQUESTS_PER_SEAT &&
      groupBConflicts === REQUESTS_PER_SEAT) ||
    (groupBSuccesses === REQUESTS_PER_SEAT &&
      groupAConflicts === REQUESTS_PER_SEAT);

  console.log(
    `Exactly one request body won: ${exactlyOneBodyWon ? 'PASS' : 'FAIL'}`,
  );

  console.log(
    `All requests received responses: ${allRequestsHandled ? 'PASS' : 'FAIL'}`,
  );

  console.log(`0 server errors: ${noServerErrors ? 'PASS' : 'FAIL'}`);

  console.log(
    `Exactly 1 unique reservation: ${exactlyOneReservation ? 'PASS' : 'FAIL'}`,
  );

  console.log(
    `Exactly 1 confirmed seat: ${exactlyOneConfirmedSeat ? 'PASS' : 'FAIL'}`,
  );

  console.log(`Seat invariant: ${invariant ? 'PASS' : 'FAIL'}`);

  console.log('');

  if (
    exactlyOneWinner &&
    allRequestsHandled &&
    noServerErrors &&
    exactlyOneReservation &&
    exactlyOneConfirmedSeat &&
    invariant
  ) {
    console.log('🔥 IDEMPOTENCY CONFLICT ATTACK: PASS');

    process.exit(0);
  }

  console.log('💀 IDEMPOTENCY CONFLICT ATTACK: FAIL');

  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
