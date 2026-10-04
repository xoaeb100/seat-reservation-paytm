const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SHOW_ID = process.env.SHOW_ID;
const REQUEST_COUNT = Number(process.env.REQUEST_COUNT || 10);

const USER_ID = 'user-1';

if (!SHOW_ID) {
  console.error('Missing SHOW_ID');
  process.exit(1);
}

async function reserve(index) {
  const seat = `A${index + 1}`;

  const response = await fetch(`${BASE_URL}/shows/${SHOW_ID}/reserve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${USER_ID}`,
    },
    body: JSON.stringify({
      seats: [seat],
      idempotency_key: `limit-attack-${index}`,
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
  console.log('========================================');
  console.log('PER-USER LIMIT CONCURRENCY ATTACK');
  console.log('========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Show ID:  ${SHOW_ID}`);
  console.log(`User:     ${USER_ID}`);
  console.log(`Requests: ${REQUEST_COUNT}`);
  console.log('');

  const start = Date.now();

  const results = await Promise.all(
    Array.from({ length: REQUEST_COUNT }, (_, index) => reserve(index)),
  );

  const duration = Date.now() - start;

  const counts = {};

  for (const result of results) {
    counts[result.status] = (counts[result.status] || 0) + 1;
  }

  console.log('RESULTS');
  console.log('----------------------------------------');

  for (const [status, count] of Object.entries(counts)) {
    console.log(`${status}: ${count}`);
  }

  console.log('');
  console.log(`Duration: ${duration} ms`);
  console.log('');

  const show = await getShow();

  console.log('FINAL SHOW STATE');
  console.log('----------------------------------------');
  console.log(`Total:      ${show.total_seats}`);
  console.log(`Available:  ${show.available}`);
  console.log(`Held:       ${show.held}`);
  console.log(`Confirmed:  ${show.confirmed}`);

  console.log('');

  const invariant =
    show.available + show.held + show.confirmed === show.total_seats;

  const exactlyFour = show.confirmed === 4;

  console.log('========================================');
  console.log('CONCURRENCY ASSERTIONS');
  console.log('========================================');

  console.log(
    `Exactly 4 successful reservations: ${exactlyFour ? 'PASS' : 'FAIL'}`,
  );

  console.log(`0 server errors: ${!counts[500] ? 'PASS' : 'FAIL'}`);

  console.log(`Seat invariant: ${invariant ? 'PASS' : 'FAIL'}`);

  console.log('');

  if (exactlyFour && !counts[500] && invariant) {
    console.log('🔥 USER LIMIT ATTACK: PASS');
    process.exit(0);
  }

  console.log('💀 USER LIMIT ATTACK: FAIL');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
