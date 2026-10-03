const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SHOW_ID = '0bf16c34-71f9-483f-b598-fb323da2656e';
const SEAT = process.env.SEAT || 'A1';
const ROUNDS = Number(process.env.ROUNDS || 100);

if (!SHOW_ID) {
  console.error('❌ SHOW_ID is required');
  process.exit(1);
}

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

async function getShow() {
  return request(`/shows/${SHOW_ID}`);
}

async function reserve(userId, idempotencyKey) {
  return request(`/shows/${SHOW_ID}/reserve`, {
    method: 'POST',
    headers: auth(userId),
    body: JSON.stringify({
      seats: [SEAT],
      idempotency_key: idempotencyKey,
    }),
  });
}

async function cancel(userId, reservationId) {
  return request(`/reservations/${reservationId}/cancel`, {
    method: 'POST',
    headers: auth(userId),
  });
}

async function assertSeatState(expectedStatus, context) {
  const result = await getShow();

  if (result.status !== 200) {
    throw new Error(`${context}: GET /shows failed with ${result.status}`);
  }

  const seat = result.body.seats.find((s) => s.seat === SEAT);

  if (!seat) {
    throw new Error(`${context}: seat ${SEAT} not found`);
  }

  if (seat.status !== expectedStatus) {
    throw new Error(
      `${context}: expected ${SEAT}=${expectedStatus}, got ${seat.status}`,
    );
  }

  const { total_seats, available, held, confirmed } = result.body;

  if (available + held + confirmed !== total_seats) {
    throw new Error(
      `${context}: INVARIANT FAILED: ` +
        `${available} + ${held} + ${confirmed} != ${total_seats}`,
    );
  }

  return result.body;
}

async function main() {
  console.log('========================================');
  console.log('CANCELLATION / REBOOKING RACE');
  console.log('========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Show ID:  ${SHOW_ID}`);
  console.log(`Seat:     ${SEAT}`);
  console.log(`Rounds:   ${ROUNDS}`);
  console.log('');

  let cancelSuccess = 0;
  let cancelConflict = 0;
  let cancelErrors = 0;

  let rebookSuccess = 0;
  let rebookConflict = 0;
  let rebookErrors = 0;

  let cleanupSuccess = 0;
  let cleanupErrors = 0;

  let invariantFailures = 0;
  let ownershipFailures = 0;

  for (let round = 1; round <= ROUNDS; round++) {
    const userA = `user-A-${round}`;
    const userB = `user-B-${round}`;

    /*
     * ---------------------------------------------------------
     * 1. Make sure the seat is available before starting.
     * ---------------------------------------------------------
     */
    try {
      await assertSeatState('available', `Round ${round} before start`);
    } catch (error) {
      console.error(`❌ Round ${round}: seat not clean before start`);
      console.error(error.message);
      process.exit(1);
    }

    /*
     * ---------------------------------------------------------
     * 2. User A gets the seat.
     * ---------------------------------------------------------
     */
    const initialReservation = await reserve(
      userA,
      `cancel-race-initial-${round}`,
    );

    if (initialReservation.status !== 201) {
      console.error(
        `❌ Round ${round}: initial reservation failed`,
        initialReservation,
      );
      process.exit(1);
    }

    const reservationA = initialReservation.body.id;

    /*
     * Verify A actually owns the seat before starting the race.
     */
    try {
      await assertSeatState(
        'confirmed',
        `Round ${round} after initial reservation`,
      );
    } catch (error) {
      console.error(`❌ Round ${round}: initial state invalid`);
      console.error(error.message);
      process.exit(1);
    }

    /*
     * ---------------------------------------------------------
     * 3. THE ACTUAL RACE
     *
     * A tries to cancel.
     * B simultaneously tries to reserve the same seat.
     * ---------------------------------------------------------
     */
    const [cancelResult, rebookResult] = await Promise.all([
      cancel(userA, reservationA),
      reserve(userB, `cancel-race-rebook-${round}`),
    ]);

    /*
     * Track cancellation result.
     */
    if (cancelResult.status === 200) {
      cancelSuccess++;
    } else if (cancelResult.status === 409) {
      cancelConflict++;
    } else {
      cancelErrors++;
    }

    /*
     * Track rebooking result.
     */
    if (rebookResult.status === 201) {
      rebookSuccess++;
    } else if (rebookResult.status === 409) {
      rebookConflict++;
    } else {
      rebookErrors++;
    }

    /*
     * Any 5xx / unexpected status is a serious failure.
     */
    if (
      cancelResult.status >= 500 ||
      rebookResult.status >= 500 ||
      ![200, 409].includes(cancelResult.status) ||
      ![201, 409].includes(rebookResult.status)
    ) {
      console.error(`❌ Round ${round}: unexpected response`);
      console.error({
        cancelResult,
        rebookResult,
      });

      process.exit(1);
    }

    /*
     * ---------------------------------------------------------
     * 4. Determine who owns the seat after the race.
     * ---------------------------------------------------------
     */
    const showAfterRace = await getShow();

    if (showAfterRace.status !== 200) {
      console.error(`❌ Round ${round}: failed to fetch show after race`);
      process.exit(1);
    }

    const seatAfterRace = showAfterRace.body.seats.find(
      (seat) => seat.seat === SEAT,
    );

    /*
     * If B successfully rebooked, B owns the seat.
     *
     * If B got 409, A's cancellation should have eventually
     * released the seat.
     */
    if (rebookResult.status === 201) {
      if (seatAfterRace.status !== 'confirmed') {
        ownershipFailures++;

        console.error(
          `❌ Round ${round}: B succeeded but seat is not confirmed`,
        );

        console.error({
          cancelResult,
          rebookResult,
          show: showAfterRace.body,
        });

        process.exit(1);
      }

      /*
       * -------------------------------------------------------
       * 5. CLEAN UP B's reservation.
       *
       * This is what allows the next round to reuse A1.
       * -------------------------------------------------------
       */
      const cleanupResult = await cancel(userB, rebookResult.body.id);

      if (cleanupResult.status !== 200) {
        cleanupErrors++;

        console.error(`❌ Round ${round}: failed to clean up B reservation`);

        console.error(cleanupResult);
        process.exit(1);
      }

      cleanupSuccess++;
    } else {
      /*
       * B lost the race.
       *
       * Since A's cancellation also completed successfully,
       * the seat should now be available.
       */
      if (seatAfterRace.status !== 'available') {
        ownershipFailures++;

        console.error(`❌ Round ${round}: B lost but seat remains unavailable`);

        console.error({
          cancelResult,
          rebookResult,
          show: showAfterRace.body,
        });

        process.exit(1);
      }
    }

    /*
     * ---------------------------------------------------------
     * 6. Final reconciliation for this round.
     * ---------------------------------------------------------
     */
    try {
      await assertSeatState('available', `Round ${round} final cleanup`);
    } catch (error) {
      invariantFailures++;

      console.error(`❌ Round ${round}: final reconciliation failed`);

      console.error(error.message);
      process.exit(1);
    }

    if (round % 10 === 0 || round === ROUNDS) {
      console.log(`✅ Completed ${round}/${ROUNDS} rounds`);
    }
  }

  console.log('');
  console.log('========================================');
  console.log('RESULT');
  console.log('========================================');

  console.log(`Rounds:              ${ROUNDS}`);
  console.log(`Cancel 200:          ${cancelSuccess}`);
  console.log(`Cancel 409:          ${cancelConflict}`);
  console.log(`Cancel errors:       ${cancelErrors}`);
  console.log(`Rebook 201:          ${rebookSuccess}`);
  console.log(`Rebook 409:          ${rebookConflict}`);
  console.log(`Rebook errors:       ${rebookErrors}`);
  console.log(`Cleanup successful:  ${cleanupSuccess}`);
  console.log(`Cleanup errors:      ${cleanupErrors}`);
  console.log(`Ownership failures:  ${ownershipFailures}`);
  console.log(`Invariant failures:  ${invariantFailures}`);

  const finalShow = await getShow();

  console.log('');
  console.log('========================================');
  console.log('FINAL SHOW STATE');
  console.log('========================================');

  console.log({
    total: finalShow.body.total_seats,
    available: finalShow.body.available,
    held: finalShow.body.held,
    confirmed: finalShow.body.confirmed,
  });

  const invariant =
    finalShow.body.available +
      finalShow.body.held +
      finalShow.body.confirmed ===
    finalShow.body.total_seats;

  console.log('');
  console.log(
    `Seat ${SEAT}:`,
    finalShow.body.seats.find((s) => s.seat === SEAT)?.status,
  );

  console.log(`Invariant: ${invariant ? 'PASS' : 'FAIL'}`);

  /*
   * Final expected state:
   *
   * - A1 available
   * - no errors
   * - invariant holds
   */
  if (
    cancelErrors === 0 &&
    rebookErrors === 0 &&
    cleanupErrors === 0 &&
    ownershipFailures === 0 &&
    invariantFailures === 0 &&
    invariant &&
    finalShow.body.seats.find((s) => s.seat === SEAT)?.status === 'available'
  ) {
    console.log('');
    console.log('🔥 CANCELLATION / REBOOKING RACE: PASS');
    process.exit(0);
  }

  console.log('');
  console.log('❌ CANCELLATION / REBOOKING RACE: FAIL');
  process.exit(1);
}

main().catch((error) => {
  console.error('');
  console.error('💥 TEST CRASHED');
  console.error(error);
  process.exit(1);
});
