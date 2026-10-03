const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const SHOW_ID = 'b5521abf-ab9b-416f-9107-e697b248c2e5';

const REQUESTS_PER_GROUP = Number(process.env.REQUESTS_PER_GROUP || 250);

const USER_A = 'user-4';
const USER_B = 'user-6';

const SEATS_A = ['A1', 'A2'];
const SEATS_B = ['A2', 'A1'];

if (!SHOW_ID) {
  console.error('Missing SHOW_ID');
  process.exit(1);
}

async function reserve(userId, seats, index, group) {
  const response = await fetch(`${BASE_URL}/shows/${SHOW_ID}/reserve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userId}`,
    },
    body: JSON.stringify({
      seats,
      idempotency_key: `deadlock-${group}-${index}`,
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
    userId,
    seats,
    status: response.status,
    body,
  };
}

async function getShow() {
  const response = await fetch(`${BASE_URL}/shows/${SHOW_ID}`);

  return response.json();
}

async function main() {
  const totalRequests = REQUESTS_PER_GROUP * 2;

  console.log('========================================');
  console.log('DEADLOCK / LOCK ORDER ATTACK');
  console.log('========================================');

  console.log(`Base URL:     ${BASE_URL}`);
  console.log(`Show ID:      ${SHOW_ID}`);
  console.log('');

  console.log(`Group A: ${REQUESTS_PER_GROUP} → [A1,A2]`);

  console.log(`Group B: ${REQUESTS_PER_GROUP} → [A2,A1]`);

  console.log(`Total:   ${totalRequests}`);

  console.log('');

  const start = Date.now();

  const requests = [
    ...Array.from(
      {
        length: REQUESTS_PER_GROUP,
      },
      (_, index) => reserve(USER_A, SEATS_A, index, 'A'),
    ),

    ...Array.from(
      {
        length: REQUESTS_PER_GROUP,
      },
      (_, index) => reserve(USER_B, SEATS_B, index, 'B'),
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

  const groupA = results.filter((result) => result.group === 'A');

  const groupB = results.filter((result) => result.group === 'B');

  const successfulA = groupA.filter((result) => result.status === 201);

  const successfulB = groupB.filter((result) => result.status === 201);

  console.log('BY GROUP');
  console.log('----------------------------------------');

  console.log(`User A [A1,A2] → ${successfulA.length} successes`);

  console.log(`User B [A2,A1] → ${successfulB.length} successes`);

  console.log('');

  /*
   * A successful multi-seat request represents
   * one actual reservation because every request
   * has a unique idempotency key.
   */
  const reservationIds = results
    .filter((result) => result.status === 201)
    .map((result) => result.body?.id)
    .filter(Boolean);

  const uniqueReservationIds = new Set(reservationIds);

  console.log(
    `Unique successful reservation IDs: ${uniqueReservationIds.size}`,
  );

  console.log(`Duration: ${duration} ms`);

  console.log('');

  const show = await getShow();

  const seatA1 = show.seats.find((seat) => seat.seat === 'A1');

  const seatA2 = show.seats.find((seat) => seat.seat === 'A2');

  console.log('FINAL SHOW STATE');
  console.log('----------------------------------------');

  console.log(`Total:      ${show.total_seats}`);

  console.log(`Available:  ${show.available}`);

  console.log(`Held:       ${show.held}`);

  console.log(`Confirmed:  ${show.confirmed}`);

  console.log('');

  console.log(`A1: ${seatA1?.status}`);

  console.log(`A2: ${seatA2?.status}`);

  console.log('');

  /*
   * ASSERTIONS
   */

  const noServerErrors = !results.some(
    (result) => result.status >= 500 && result.status <= 599,
  );

  const exactlyOneWinningGroup =
    (successfulA.length > 0 && successfulB.length === 0) ||
    (successfulB.length > 0 && successfulA.length === 0);

  const exactlyOneReservation = uniqueReservationIds.size === 1;

  const bothSeatsConfirmed =
    seatA1?.status === 'confirmed' && seatA2?.status === 'confirmed';

  const invariant =
    show.available + show.held + show.confirmed === show.total_seats;

  console.log('========================================');

  console.log('CONCURRENCY ASSERTIONS');

  console.log('========================================');

  console.log(
    `Exactly one group won: ${exactlyOneWinningGroup ? 'PASS' : 'FAIL'}`,
  );

  console.log(
    `Exactly 1 reservation: ${exactlyOneReservation ? 'PASS' : 'FAIL'}`,
  );

  console.log(
    `Both requested seats confirmed: ${bothSeatsConfirmed ? 'PASS' : 'FAIL'}`,
  );

  console.log(`0 server errors: ${noServerErrors ? 'PASS' : 'FAIL'}`);

  console.log(`Seat invariant: ${invariant ? 'PASS' : 'FAIL'}`);

  console.log('');

  if (
    exactlyOneWinningGroup &&
    exactlyOneReservation &&
    bothSeatsConfirmed &&
    noServerErrors &&
    invariant
  ) {
    console.log('🔥 DEADLOCK / LOCK ORDER ATTACK: PASS');

    process.exit(0);
  }

  console.log('💀 DEADLOCK / LOCK ORDER ATTACK: FAIL');

  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
