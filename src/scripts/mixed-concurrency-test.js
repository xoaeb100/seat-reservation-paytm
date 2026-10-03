const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SHOW_ID = '516955af-7077-4673-a113-84cb77dcde47';

if (!SHOW_ID) {
  console.error('❌ SHOW_ID is required');
  process.exit(1);
}

const REQUESTS = Number(process.env.REQUESTS || 100);

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let body;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    status: response.status,
    body,
  };
}

function auth(userId) {
  return {
    Authorization: `Bearer ${userId}`,
  };
}

async function reserve(userId, seats, idempotencyKey) {
  return request(`/reserve/${SHOW_ID}`, {
    method: 'POST',
    headers: auth(userId),
    body: JSON.stringify({
      seats,
      idempotency_key: idempotencyKey,
    }),
  });
}

async function cancel(userId, reservationId) {
  return request(`/reserve/${reservationId}/cancel`, {
    method: 'POST',
    headers: auth(userId),
  });
}

async function getShow() {
  return request(`/shows/${SHOW_ID}`);
}

function countStatuses(results) {
  const counts = {};

  for (const result of results) {
    counts[result.status] = (counts[result.status] || 0) + 1;
  }

  return counts;
}

function assertNo5xx(results, name) {
  const errors = results.filter((r) => r.status >= 500);

  if (errors.length > 0) {
    throw new Error(`${name}: ${errors.length} requests returned 5xx`);
  }
}

async function attackHotSeat(seat, prefix) {
  console.log(`\n🔥 HOT SEAT ATTACK: ${seat}`);

  const results = await Promise.all(
    Array.from({ length: REQUESTS }, (_, i) =>
      reserve(`${prefix}-user-${i}`, [seat], `${prefix}-${i}`),
    ),
  );

  const counts = countStatuses(results);

  console.log(counts);

  assertNo5xx(results, `Hot seat ${seat}`);

  const successes = results.filter((r) => r.status === 201);

  if (successes.length !== 1) {
    throw new Error(
      `Hot seat ${seat}: expected exactly 1 success, got ${successes.length}`,
    );
  }

  console.log(`✅ ${seat}: exactly one winner`);
  return successes[0].body.id;
}

async function attackUserLimit() {
  console.log('\n🔥 PER-USER LIMIT ATTACK');

  const user = 'mixed-limit-user';

  const seats = ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'];

  const results = await Promise.all(
    seats.map((seat, i) => reserve(user, [seat], `mixed-limit-${i}`)),
  );

  const counts = countStatuses(results);

  console.log(counts);

  assertNo5xx(results, 'Per-user limit');

  const successes = results.filter((r) => r.status === 201);
  const conflicts = results.filter((r) => r.status === 409);

  if (successes.length !== 4 || conflicts.length !== 4) {
    throw new Error(
      `Expected 4 successes + 4 conflicts. ` +
        `Got ${successes.length} successes + ${conflicts.length} conflicts`,
    );
  }

  console.log('✅ Per-user limit: 4 successes / 4 conflicts');
}

async function attackIdempotency() {
  console.log('\n🔥 IDEMPOTENCY ATTACK');

  const user = 'mixed-idempotency-user';
  const key = 'mixed-idempotency-key';

  const results = await Promise.all(
    Array.from({ length: REQUESTS }, () => reserve(user, ['A11'], key)),
  );

  const counts = countStatuses(results);

  console.log(counts);

  assertNo5xx(results, 'Idempotency');

  const successes = results.filter((r) => r.status === 201);

  const reservationIds = new Set(successes.map((r) => r.body.id));

  if (successes.length !== REQUESTS) {
    throw new Error(
      `Expected ${REQUESTS} successful idempotent retries, got ${successes.length}`,
    );
  }

  if (reservationIds.size !== 1) {
    throw new Error(
      `Expected exactly 1 reservation ID, got ${reservationIds.size}`,
    );
  }

  console.log(`✅ ${REQUESTS} retries → 1 reservation`);
}

async function attackIdempotencyConflict() {
  console.log('\n🔥 IDEMPOTENCY CONFLICT ATTACK');

  const user = 'mixed-conflict-user';
  const key = 'mixed-conflict-key';

  const requests = [];

  for (let i = 0; i < 50; i++) {
    requests.push(reserve(user, ['A12'], key));

    requests.push(reserve(user, ['A13'], key));
  }

  const results = await Promise.all(requests);

  const counts = countStatuses(results);

  console.log(counts);

  assertNo5xx(results, 'Idempotency conflict');

  const successes = results.filter((r) => r.status === 201);

  const conflicts = results.filter((r) => r.status === 409);

  if (successes.length !== 50) {
    throw new Error(
      `Expected exactly 50 successful retries, got ${successes.length}`,
    );
  }

  if (conflicts.length !== 50) {
    throw new Error(`Expected exactly 50 conflicts, got ${conflicts.length}`);
  }

  const reservationIds = new Set(successes.map((r) => r.body.id));

  if (reservationIds.size !== 1) {
    throw new Error(`Expected 1 reservation, got ${reservationIds.size}`);
  }

  console.log('✅ Same key / different body handled correctly');
}

async function attackMultiSeat() {
  console.log('\n🔥 MULTI-SEAT COLLISION ATTACK');

  const requests = [];

  for (let i = 0; i < 50; i++) {
    requests.push(reserve(`multi-a-${i}`, ['A14', 'A15'], `multi-a-${i}`));

    requests.push(reserve(`multi-b-${i}`, ['A15', 'A16'], `multi-b-${i}`));
  }

  const results = await Promise.all(requests);

  const counts = countStatuses(results);

  console.log(counts);

  assertNo5xx(results, 'Multi-seat');

  const successes = results.filter((r) => r.status === 201);

  if (successes.length !== 1) {
    throw new Error(
      `Expected exactly 1 successful multi-seat reservation, got ${successes.length}`,
    );
  }

  console.log('✅ Exactly one overlapping multi-seat reservation won');
}

async function attackCancellation() {
  console.log('\n🔥 CANCELLATION / REBOOKING ATTACK');

  const initial = await reserve(
    'mixed-cancel-A',
    ['A17'],
    'mixed-cancel-initial',
  );

  if (initial.status !== 201) {
    throw new Error(`Initial A17 reservation failed: ${initial.status}`);
  }

  const reservationId = initial.body.id;

  const [cancelResult, rebookResult] = await Promise.all([
    cancel('mixed-cancel-A', reservationId),

    reserve('mixed-cancel-B', ['A17'], 'mixed-cancel-rebook'),
  ]);

  console.log({
    cancel: cancelResult.status,
    rebook: rebookResult.status,
  });

  if (cancelResult.status >= 500 || rebookResult.status >= 500) {
    throw new Error('Cancellation/rebooking produced a 5xx');
  }

  if (cancelResult.status !== 200) {
    throw new Error(`Expected cancellation 200, got ${cancelResult.status}`);
  }

  if (![201, 409].includes(rebookResult.status)) {
    throw new Error(`Unexpected rebook status ${rebookResult.status}`);
  }

  /*
   * If B won, clean up B so the final show is clean.
   */
  if (rebookResult.status === 201) {
    const cleanup = await cancel('mixed-cancel-B', rebookResult.body.id);

    if (cleanup.status !== 200) {
      throw new Error(`Failed to cleanup B reservation: ${cleanup.status}`);
    }
  }

  console.log('✅ Cancellation/rebooking race handled correctly');
}

async function finalReconciliation() {
  console.log('\n========================================');
  console.log('FINAL RECONCILIATION');
  console.log('========================================');

  const result = await getShow();

  if (result.status !== 200) {
    throw new Error(`GET /shows failed: ${result.status}`);
  }

  const show = result.body;

  const invariant =
    show.available + show.held + show.confirmed === show.total_seats;

  console.log({
    total: show.total_seats,
    available: show.available,
    held: show.held,
    confirmed: show.confirmed,
  });

  console.log(`Invariant: ${invariant ? 'PASS' : 'FAIL'}`);

  if (!invariant) {
    throw new Error('Seat invariant FAILED');
  }

  const seatMap = {};

  for (const seat of show.seats) {
    seatMap[seat.seat] = seat.status;
  }

  console.log('\nFinal seat states:');

  for (const seat of [
    'A1',
    'A2',
    'A3',
    'A4',
    'A5',
    'A6',
    'A7',
    'A8',
    'A9',
    'A10',
    'A11',
    'A12',
    'A13',
    'A14',
    'A15',
    'A16',
    'A17',
  ]) {
    console.log(`${seat}: ${seatMap[seat]}`);
  }

  return invariant;
}

async function main() {
  try {
    console.log('========================================');
    console.log('MIXED CONCURRENCY ATTACK');
    console.log('========================================');
    console.log(`Base URL: ${BASE_URL}`);
    console.log(`Show ID:  ${SHOW_ID}`);
    console.log(`Requests per hot-seat attack: ${REQUESTS}`);

    /*
     * Each attack uses independent seats/users.
     */
    await attackHotSeat('A1', 'hot-a1');

    await attackHotSeat('A2', 'hot-a2');

    await attackUserLimit();

    await attackIdempotency();

    await attackIdempotencyConflict();

    await attackMultiSeat();

    await attackCancellation();

    const invariant = await finalReconciliation();

    if (!invariant) {
      throw new Error('Final invariant failed');
    }

    console.log('');
    console.log('========================================');
    console.log('🔥 MIXED CONCURRENCY ATTACK: PASS');
    console.log('========================================');
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('❌ MIXED CONCURRENCY ATTACK: FAIL');
    console.error('========================================');
    console.error(error.message);
    process.exit(1);
  }
}

main();
