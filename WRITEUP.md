# Seat Reservation at Scale — Engineering Write-up

## 1. Overview

This project implements a concurrency-safe seat reservation API using:

- TypeScript
- NestJS
- PostgreSQL
- TypeORM
- Docker
- Prometheus-style metrics
- Structured JSON request logging

The primary design goal is correctness under extreme concurrent traffic.

PostgreSQL is the source of truth for seat ownership and reservation consistency. Reservation decisions are made inside database transactions using row-level locks and database constraints rather than application-level "check then update" logic.

Live deployment:

https://seat-reservation-paytm.onrender.com

---

## 2. Architecture

The service has three main layers:

```text
HTTP Client
    |
    v
NestJS API
    |
    | database transaction
    v
PostgreSQL
```

PostgreSQL stores:

- Shows
- Seats
- Reservations
- Reservation-to-seat relationships
- Per-user/show concurrency lock rows

### `shows`

Stores the show, seat price in paise, and per-user reservation limit.

### `seats`

Each seat is a row containing the show, seat number, and status.

Seat status is one of:

- `available`
- `held`
- `confirmed`

The current reservation flow uses `confirmed` and `available`. There is no timed hold/expiry mechanism.

### `reservations`

Stores:

- show
- authenticated user
- idempotency key
- request hash
- total amount in paise
- status
- timestamps

There is a unique constraint on:

```text
(show_id, user_id, idempotency_key)
```

### `reservation_seats`

Join table between reservations and seats. This allows a reservation to contain multiple seats while preserving all-or-nothing behavior.

### `user_show_locks`

Contains one row per:

```text
(show_id, user_id)
```

This row is used as a database-backed serialization point for concurrent reservation attempts by the same user for the same show.

---

## 3. Reservation Transaction

The reservation operation is performed inside one PostgreSQL transaction.

```text
BEGIN
  |
  |-- verify show
  |-- normalize + sort requested seats
  |-- calculate request hash
  |-- create user/show lock row if necessary
  |-- SELECT user/show lock FOR UPDATE
  |-- check idempotency
  |-- enforce per-user limit
  |-- SELECT requested seats FOR UPDATE
  |-- verify all seats exist
  |-- verify all seats are available
  |-- create reservation
  |-- create reservation_seats rows
  |-- mark seats confirmed
  |
COMMIT
```

If any step fails, the entire transaction is rolled back.

This gives multi-seat reservations all-or-nothing semantics.

For example, if A12 is available but A13 is already confirmed, a request for `[A12, A13]` does not reserve A12. The entire request fails with `409 Conflict`.

---

## 4. Exact Atomic Decision Mechanism

The critical concurrency decision is made using PostgreSQL row-level locks.

Requested seats are selected with a pessimistic write lock:

```sql
SELECT ...
FROM seats
WHERE showId = $1
  AND seatNumber IN (...)
ORDER BY seatNumber ASC
FOR UPDATE;
```

Because the rows are locked until the transaction commits, another transaction cannot modify those same seat rows between checking availability and marking them confirmed.

The system therefore avoids an unsafe application-level pattern such as:

```text
if seat.available:
    update seat
```

The check and update happen inside one database transaction.

---

## 5. Preventing Double-Selling

Consider 500 concurrent requests for the same seat.

The first transaction obtains the row lock:

```text
Transaction A
    |
    +-- locks A12
    +-- sees available
    +-- creates reservation
    +-- marks A12 confirmed
    +-- COMMIT
```

Other transactions attempting to lock A12 wait.

After the first transaction commits, the next transaction obtains the lock and sees that A12 is already confirmed. It returns `409 Conflict` instead of creating another reservation.

There is no application-level mutex. The database row lock is the concurrency control mechanism.

---

## 6. Deterministic Lock Ordering

Multi-seat requests can deadlock if different transactions acquire locks in different orders:

```text
Transaction A: A1 -> A2
Transaction B: A2 -> A1
```

Requested seat numbers are therefore normalized and sorted before locking:

```text
["A2", "A1"]
        |
        v
["A1", "A2"]
```

All transactions acquire seat locks in the same deterministic order.

The same principle is used when locking seats during cancellation.

---

## 7. Per-User Reservation Limit

The default maximum is 4 seats per user per show.

A simple count followed by an update would be unsafe:

```text
Request A -> count = 3
Request B -> count = 3

Both requests think another seat is allowed.
```

Instead, the service uses the `user_show_locks` table.

For each reservation:

```sql
SELECT ...
FROM user_show_locks
WHERE showId = $1
  AND userId = $2
FOR UPDATE;
```

Concurrent reservation attempts from the same user for the same show therefore serialize.

The service counts the user's currently confirmed reservation seats and verifies:

```text
existing seats + requested seats <= per-user limit
```

The lock and count occur inside the same transaction, preventing concurrent requests from bypassing the limit.

---

## 8. Idempotency

Reservations support an idempotency key.

The database enforces uniqueness using:

```text
(show_id, user_id, idempotency_key)
```

A request hash is also stored.

The hash is calculated from the normalized seat list, so:

```text
["A1", "A2"]
```

and:

```text
["A2", "A1"]
```

represent the same request.

### Identical retry

If the same user sends the same show + idempotency key + request body again, the existing reservation is returned. The retry does not create another reservation.

### Same key, different body

If the same user sends:

```text
idempotency_key = abc
seats = ["A1"]
```

and another request sends:

```text
idempotency_key = abc
seats = ["A2"]
```

the request hash does not match, so the second request receives `409 Conflict`.

---

## 9. Concurrent Idempotency

The idempotency check is performed after acquiring the user/show lock.

For 500 concurrent identical requests:

```text
500 requests
same user
same show
same idempotency key
same seats
```

the first request creates the reservation. Subsequent requests see the existing reservation and return it.

Observed:

```text
500 requests
201: 500
unique reservation IDs: 1
```

All responses referred to the same reservation. This is intentional idempotent behavior.

---

## 10. Money Handling

Money is represented using integer paise.

```text
₹250.00 = 25000 paise
```

The API never uses floating-point numbers for monetary values.

For N seats:

```text
amount_paise = price_in_paise * number_of_seats
```

This avoids floating-point rounding problems.

---

## 11. Cancellation

Cancellation is transactional.

The service:

1. Locks the reservation row.
2. Verifies that the authenticated user owns it.
3. Verifies that it is still confirmed.
4. Locks all seats belonging to the reservation.
5. Marks the reservation cancelled.
6. Marks only those seats available.
7. Commits everything together.

The authenticated identity comes from the bearer token, not from the request body.

Cancellation and rebooking were tested concurrently:

```text
100/100 cancellation rounds
100/100 rebook operations
0 ownership failures
0 invariant failures
```

---

## 12. Database Constraints

Important constraints include:

- unique `(show_id, seat_number)`
- unique `(show_id, user_id, idempotency_key)`
- primary key on `(show_id, user_id)` for `user_show_locks`
- foreign keys between related entities
- composite primary key on `reservation_seats`
- integer constraints for monetary values and limits

Application validation and database constraints complement each other.

---

## 13. API Authentication

The API uses bearer-token authentication.

The authenticated user identity is derived from the token. The reservation request does not accept a `user_id`.

For example:

```text
Authorization: Bearer user-123
```

results in:

```text
userId = user-123
```

Administrative show creation uses a separate admin token.

---

## 14. Health Checks

Two health endpoints are provided:

```text
GET /health/live
GET /health/ready
```

### Liveness

Indicates that the application process is running.

### Readiness

Executes:

```sql
SELECT 1
```

against PostgreSQL.

If PostgreSQL is unavailable, readiness returns:

```text
503 Service Unavailable
```

The service therefore fails closed for readiness instead of claiming to be ready while its database dependency is unavailable.

---

## 15. Observability

The service exposes Prometheus-style metrics through:

```text
GET /metrics
```

Current metrics include:

```text
reservations_confirmed_total
reservations_declined_total{reason="..."}
seats_available
```

Decline reasons include:

```text
seat_unavailable
user_limit
idempotency_conflict
seat_not_found
```

The available-seat gauge is calculated directly from PostgreSQL when `/metrics` is requested, so it represents current database state rather than an application-maintained count.

Request logging uses structured JSON and includes:

- timestamp
- log level
- request ID
- HTTP method
- path
- status
- duration

A request ID is generated when one is not supplied and returned through:

```text
X-Request-ID
```

Secrets, authorization tokens, and request bodies are not logged.

---

## 16. Testing

Concurrency correctness was prioritized over unit-test quantity.

### Hot-seat test

500 concurrent users attempt to reserve the same seat.

Observed locally:

```text
201: 1
409: 499
5xx: 0
```

### Per-user limit

10 concurrent requests from one user against a show with a limit of 4:

```text
201: 4
409: 6
```

### Idempotency

500 concurrent requests with the same idempotency key:

```text
201: 500
unique reservation IDs: 1
```

### Idempotency conflict

500 requests using the same idempotency key but two different request bodies:

```text
201: 250
409: 250
unique reservations: 1
```

### Multi-seat concurrency

Competing requests:

```text
[A1, A2]
[A2, A3]
```

Observed:

```text
1 successful reservation
2 confirmed seats
0 partial reservations
```

### Deadlock attack

Competing requests intentionally use opposite seat ordering:

```text
[A1, A2]
[A2, A1]
```

Observed:

```text
201: 1
409: 499
5xx: 0
```

### Cancellation/rebooking race

100 rounds:

```text
100 successful cancellations
100 successful rebookings
0 ownership failures
0 invariant failures
```

---

## 17. Seat Invariant

The service maintains:

```text
available + held + confirmed = total_seats
```

The invariant was checked after concurrency attacks.

Example:

```text
Total:      20
Available:  18
Held:       0
Confirmed:  2

Invariant: PASS
```

The burst tests also perform final reconciliation.

---

## 18. Deployment

The service is containerized using Docker.

Local development uses Docker Compose with:

```text
NestJS API
    +
PostgreSQL 16
```

The production deployment uses:

```text
Render Web Service
        |
        | private database connection
        v
Render PostgreSQL
```

Database migrations run when the container starts.

Live service:

```text
https://seat-reservation-paytm.onrender.com
```

The deployed readiness endpoint was verified successfully:

```text
GET /health/ready

200 OK
{
  "status": "ready"
}
```

The public deployment was also exercised with the concurrency burst suite.

The application maintained reservation correctness and database invariants during the public tests. One HTTP 520 occurred during the 500-request hot-seat burst on the free hosting tier, while the reservation itself remained correctly single-winner. Other public concurrency scenarios completed successfully.

The free hosting tier is resource constrained, so higher-capacity infrastructure would be appropriate for sustained high traffic.

---

## 19. Consistency vs Availability

The system deliberately favors consistency and correctness over availability for reservation decisions.

PostgreSQL is required to determine:

- seat availability
- ownership
- idempotency
- per-user limits
- cancellation state

If the database is unavailable, the reservation operation cannot safely proceed.

The readiness endpoint therefore reports the service as unavailable when the database cannot be reached.

This is preferable to accepting reservations without a reliable source of truth and risking double-selling or inconsistent state.

---

## 20. Limitations

### Metrics are process-local

Prometheus counters are maintained in the application process.

The available-seat gauge is database-derived, but counters such as:

```text
reservations_confirmed_total
```

reset when the application process restarts.

A larger production deployment would use centralized metrics and aggregate metrics across instances.

### No timed holds

The system currently supports:

```text
available -> confirmed
confirmed -> available (through cancellation)
```

There is no temporary seat hold with an expiration time.

### Single-service deployment

The application is intentionally implemented as one NestJS service backed by PostgreSQL.

Additional services such as Redis or Kafka were avoided because they were not required for the assignment and would introduce additional operational complexity.

### Free deployment resources

The public deployment uses a free hosting tier. It demonstrates the API and correctness but is not representative of resources required for sustained production traffic.

---

## 21. What I Would Improve Next

If this were developed beyond the take-home assignment:

1. Centralized metrics for multi-instance deployments.
2. Distributed tracing.
3. Better production log aggregation and dashboards.
4. Rate limiting and abuse protection.
5. More comprehensive automated integration tests.
6. Database connection-pool tuning based on production load.
7. Timed seat holds if required by the product.
8. Horizontal API scaling with centralized observability.
9. Load testing against production-sized PostgreSQL infrastructure.
10. Automated deployment and rollback pipelines.

These are deliberately outside the core implementation because the assignment prioritizes reservation correctness under concurrency.

---

## 22. AI Collaboration

AI tools were used as an engineering pair programmer during development.

AI assisted with:

- architecture discussions
- identifying concurrency race conditions
- PostgreSQL locking strategies
- idempotency design
- test-case design
- failure-mode analysis
- implementation review
- deployment troubleshooting
- documentation

AI-generated suggestions were not treated as automatically correct.

Important concurrency behavior was independently implemented and verified through actual PostgreSQL-backed concurrency tests, including:

- 500-request hot-seat contention
- concurrent idempotency retries
- same-key/different-body conflicts
- per-user limit attacks
- multi-seat contention
- deterministic lock-order attacks
- cancellation/rebooking races
- final seat-count reconciliation

The final design decisions were made based on the assignment requirements and verified through the running application and database state.

---

## 23. Final Design Summary

The core design principle is:

> PostgreSQL decides who gets the seat.

The reservation path uses:

```text
transaction
    +
user/show serialization
    +
deterministic seat row locking
    +
database uniqueness constraints
    +
atomic reservation + seat updates
```

This avoids application-level race conditions and ensures that concurrent requests cannot double-sell a seat, bypass the per-user limit, or create duplicate reservations.

The system is intentionally small and boring:

```text
NestJS
   |
PostgreSQL
   |
Docker
```

The complexity is kept in the database transaction where concurrency correctness belongs.
