const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const SHOW_ID = 'ca9887c1-2353-4e12-91e9-0b2db3792db7';
const SEAT = process.env.SEAT || 'A3';
const REQUEST_COUNT = Number(process.env.REQUEST_COUNT || 500);

if (!SHOW_ID) {
  console.error('Missing SHOW_ID');
  process.exit(1);
}

async function reserve(index) {
  const response = await fetch(`${BASE_URL}/reserve/${SHOW_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer user-${index}`,
    },
    body: JSON.stringify({
      seats: [SEAT],
      idempotency_key: `concurrency-${index}`,
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

async function main() {
  console.log('========================================');
  console.log('HOT SEAT CONCURRENCY TEST');
  console.log('========================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Show ID:  ${SHOW_ID}`);
  console.log(`Seat:     ${SEAT}`);
  console.log(`Requests: ${REQUEST_COUNT}`);
  console.log('');

  const start = Date.now();

  const results = await Promise.all(
    Array.from({ length: REQUEST_COUNT }, (_, index) => reserve(index + 1)),
  );

  const duration = Date.now() - start;

  const statusCounts = {};

  for (const result of results) {
    statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  }

  console.log('RESULTS');
  console.log('----------------------------------------');

  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`${status}: ${count}`);
  }

  console.log('');
  console.log(`Duration: ${duration} ms`);
  console.log('');

  const successful = results.filter((result) => result.status === 201);

  const conflicts = results.filter((result) => result.status === 409);

  const serverErrors = results.filter((result) => result.status >= 500);

  console.log('========================================');
  console.log('CONCURRENCY ASSERTIONS');
  console.log('========================================');

  console.log(
    `Exactly 1 success: ${successful.length === 1 ? 'PASS' : 'FAIL'}`,
  );

  console.log(
    `499 conflicts: ${
      conflicts.length === REQUEST_COUNT - 1 ? 'PASS' : 'FAIL'
    }`,
  );

  console.log(
    `0 server errors: ${serverErrors.length === 0 ? 'PASS' : 'FAIL'}`,
  );

  if (successful.length === 1) {
    console.log('');
    console.log('Winning reservation:');
    console.log(JSON.stringify(successful[0].body, null, 2));
  }

  console.log('');

  if (
    successful.length === 1 &&
    conflicts.length === REQUEST_COUNT - 1 &&
    serverErrors.length === 0
  ) {
    console.log('🔥 CONCURRENCY TEST: PASS');
    process.exit(0);
  }

  console.log('❌ CONCURRENCY TEST: FAIL');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
