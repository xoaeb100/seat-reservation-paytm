import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash } from 'crypto';

import { Reservation } from '../../database/entities/reservation.entity';
import { ReservationSeat } from '../../database/entities/reservation-seat.entity';
import { Seat } from '../../database/entities/seat.entity';
import { Show } from '../../database/entities/show.entity';
import { UserShowLock } from '../../database/entities/user-show-lock.entity';
import { ReservationStatus } from '../../database/enums/reservation-status.enum';
import { SeatStatus } from '../../database/enums/seat-status.enum';
import { DataSource, EntityManager } from 'typeorm';
import { ReserveSeatsDto } from './dto/reserve-seats.dto';
import { RESERVATION_ERRORS } from './errors/reservation-error';
import { validate as isUUID } from 'uuid';

@Injectable()
export class ReservationsService {
  constructor(private readonly dataSource: DataSource) {}

  async reserve(showId: string, userId: string, dto: ReserveSeatsDto) {
    if (!isUUID(showId)) {
      throw new BadRequestException('Invalid show ID');
    }

    return this.dataSource.transaction(async (manager) => {
      /*
       * 1. Verify that the show exists.
       */
      const show = await manager.findOne(Show, {
        where: { id: showId },
      });

      if (!show) {
        throw new NotFoundException('Show not found');
      }

      /*
       * 2. Normalize and deterministically sort the requested seats.
       *
       * Sorting is important for deadlock prevention when multiple
       * transactions request the same seats in different orders.
       */
      const seatNumbers = dto.seats.map((seat) => seat.trim()).sort();

      /*
       * 3. Build a deterministic request hash.
       *
       * ["A1", "A2"] and ["A2", "A1"] represent the same
       * reservation request, so we hash the normalized form.
       */
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ seats: seatNumbers }))
        .digest('hex');

      /*
       * 4. Serialize all reservations for this user + show.
       *
       * The row may not exist yet, so INSERT ... ON CONFLICT
       * safely creates it exactly once.
       */
      await manager.query(
        `
        INSERT INTO "user_show_locks" ("showId", "userId")
        VALUES ($1, $2)
        ON CONFLICT ("showId", "userId") DO NOTHING
        `,
        [showId, userId],
      );

      /*
       * This SELECT ... FOR UPDATE is the important part.
       *
       * Concurrent reservations from the same user for the same
       * show must wait for one another.
       */
      await manager.query(
        `
        SELECT "showId", "userId"
        FROM "user_show_locks"
        WHERE "showId" = $1
          AND "userId" = $2
        FOR UPDATE
        `,
        [showId, userId],
      );

      /*
       * 5. Check idempotency AFTER acquiring the user/show lock.
       *
       * This also solves the concurrent same-key case:
       * request #2 waits for request #1, then sees its reservation.
       */
      const existingReservation = await manager.findOne(Reservation, {
        where: {
          showId,
          userId,
          idempotencyKey: dto.idempotency_key,
        },
      });

      if (existingReservation) {
        if (existingReservation.requestHash !== requestHash) {
          throw new ConflictException(RESERVATION_ERRORS.IDEMPOTENCY_CONFLICT);
        }

        return this.getReservationResponse(manager, existingReservation.id);
      }

      /*
       * 6. Count seats already reserved by this user for this show.
       *
       * We count reservation_seats rather than reservations because
       * one reservation may contain multiple seats.
       */
      const result = await manager.query(
        `
        SELECT COUNT(*)::int AS "count"
        FROM "reservation_seats" rs
        INNER JOIN "reservations" r
          ON r."id" = rs."reservationId"
        WHERE r."showId" = $1
          AND r."userId" = $2
          AND r."status" = 'confirmed'
        `,
        [showId, userId],
      );

      const existingSeatCount = Number(result[0].count);

      if (existingSeatCount + seatNumbers.length > show.perUserLimit) {
        throw new ConflictException(RESERVATION_ERRORS.USER_LIMIT_EXCEEDED);
      }

      /*
       * 7. Lock ALL requested seats in deterministic order.
       *
       * PostgreSQL now prevents another transaction from changing
       * these seat rows until this transaction finishes.
       */
      const seats = await manager
        .createQueryBuilder(Seat, 'seat')
        .setLock('pessimistic_write')
        .where('seat.showId = :showId', { showId })
        .andWhere('seat.seatNumber IN (:...seatNumbers)', {
          seatNumbers,
        })
        .orderBy('seat.seatNumber', 'ASC')
        .getMany();

      /*
       * 8. Make sure every requested seat actually exists.
       */
      if (seats.length !== seatNumbers.length) {
        throw new ConflictException(RESERVATION_ERRORS.SEAT_NOT_FOUND);
      }

      /*
       * 9. Make sure every seat is available.
       *
       * Because the rows are locked, nobody can sneak in between
       * this check and the update below.
       */
      const unavailableSeat = seats.find(
        (seat) => seat.status !== SeatStatus.AVAILABLE,
      );

      if (unavailableSeat) {
        throw new ConflictException(RESERVATION_ERRORS.SEAT_UNAVAILABLE);
      }

      /*
       * 10. Create the reservation.
       */
      const reservation = manager.create(Reservation, {
        showId,
        userId,
        idempotencyKey: dto.idempotency_key,
        requestHash,
        amountPaise: show.priceInPaise * seatNumbers.length,
        status: ReservationStatus.CONFIRMED,
        cancelledAt: null,
      });

      const savedReservation = await manager.save(Reservation, reservation);

      /*
       * 11. Create the reservation -> seat relationships.
       */
      const reservationSeats = seats.map((seat) =>
        manager.create(ReservationSeat, {
          reservationId: savedReservation.id,
          seatId: seat.id,
        }),
      );

      await manager.save(ReservationSeat, reservationSeats);

      /*
       * 12. Mark all seats as confirmed.
       */
      await manager
        .createQueryBuilder()
        .update(Seat)
        .set({
          status: SeatStatus.CONFIRMED,
        })
        .whereInIds(seats.map((seat) => seat.id))
        .execute();

      /*
       * 13. Return the reservation.
       *
       * Everything above is part of the same transaction.
       */
      return this.getReservationResponse(manager, savedReservation.id);
    });
  }

  private async getReservationResponse(
    manager: EntityManager,
    reservationId: string,
  ) {
    const reservation = await manager.findOne(Reservation, {
      where: { id: reservationId },
      relations: {
        reservationSeats: {
          seat: true,
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    return {
      id: reservation.id,
      show_id: reservation.showId,
      user_id: reservation.userId,
      seats: reservation.reservationSeats
        .map(
          (reservationSeat: ReservationSeat) => reservationSeat.seat.seatNumber,
        )
        .sort(),
      amount_paise: reservation.amountPaise,
      status: reservation.status,
      idempotency_key: reservation.idempotencyKey,
      created_at: reservation.createdAt,
    };
  }
}
