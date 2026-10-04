# Seat Reservation at Scale

A concurrency-safe seat reservation API built with NestJS, PostgreSQL, TypeORM and Docker.

## Architecture

PostgreSQL is the source of truth for seat ownership and reservation consistency.

Reservation transactions use:

- row-level `FOR UPDATE` locks on requested seats
- deterministic seat ordering to prevent deadlocks
- a per-user/show lock row to serialize concurrent requests
- a unique idempotency constraint
- all-or-nothing multi-seat reservations

## API

### Create show

POST `/shows`

Authorization: admin bearer token.

```json
{
  "name": "friday-night",
  "seats": ["A1", "A2", "A3"],
  "price_in_paise": 25000
}