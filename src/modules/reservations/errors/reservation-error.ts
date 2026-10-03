export const RESERVATION_ERRORS = {
  SEAT_NOT_FOUND: 'One or more requested seats do not exist',
  SEAT_UNAVAILABLE: 'One or more requested seats are not available',
  USER_LIMIT_EXCEEDED: 'User reservation limit exceeded',
  IDEMPOTENCY_CONFLICT:
    'Idempotency key was already used with a different request',
} as const;
