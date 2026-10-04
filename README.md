# Seat Reservation at Scale

A concurrency-safe seat reservation API built with NestJS,
PostgreSQL and TypeORM.

## Live API

https://seat-reservation-paytm.onrender.com

## Tech Stack

- Node.js / NestJS
- TypeScript
- PostgreSQL
- TypeORM
- Docker
- Prometheus metrics

## Running locally

docker compose up --build

## Health

GET /health/live
GET /health/ready

## Metrics

GET /metrics

## Authentication

Authorization: Bearer <token>

Admin:
ADMIN_TOKEN

Users:
user-<id>

## API

POST /shows
POST /shows/:id/reserve
POST /reservations/:id/cancel
GET /shows/:id