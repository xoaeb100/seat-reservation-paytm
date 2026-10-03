import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { Show } from '../../database/entities/show.entity';
import { Seat } from '../../database/entities/seat.entity';
import { SeatStatus } from '../../database/enums/seat-status.enum';
import { CreateShowDto } from './dto/create-show.dto';

@Injectable()
export class ShowsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(dto: CreateShowDto) {
    const seatNumbers = dto.seats.map((seat) => seat.trim());

    if (seatNumbers.some((seat) => seat.length === 0)) {
      throw new BadRequestException('Seat names cannot be empty');
    }

    const uniqueSeatNumbers = new Set(seatNumbers);

    if (uniqueSeatNumbers.size !== seatNumbers.length) {
      throw new BadRequestException('Duplicate seat names are not allowed');
    }

    return this.dataSource.transaction(async (manager) => {
      const show = manager.create(Show, {
        name: dto.name.trim(),
        priceInPaise: dto.price_in_paise,
        perUserLimit: dto.per_user_limit ?? 4,
      });

      const savedShow = await manager.save(Show, show);

      const seats = seatNumbers.map((seatNumber) =>
        manager.create(Seat, {
          showId: savedShow.id,
          seatNumber,
          status: SeatStatus.AVAILABLE,
        }),
      );

      await manager.save(Seat, seats);

      return {
        id: savedShow.id,
        name: savedShow.name,
        price_in_paise: savedShow.priceInPaise,
        per_user_limit: savedShow.perUserLimit,
        seats: seats.map((seat) => ({
          seat: seat.seatNumber,
          status: seat.status,
        })),
      };
    });
  }

  async getById(showId: string) {
    const rows = await this.dataSource.query(
      `
    SELECT
      "id",
      "seatNumber",
      "status"
    FROM "seats"
    WHERE "showId" = $1
    ORDER BY "seatNumber" ASC
    `,
      [showId],
    );

    if (rows.length === 0) {
      const showExists = await this.dataSource.query(
        `
      SELECT "id"
      FROM "shows"
      WHERE "id" = $1
      `,
        [showId],
      );

      if (showExists.length === 0) {
        throw new NotFoundException('Show not found');
      }
    }

    const counts = {
      available: 0,
      held: 0,
      confirmed: 0,
    };

    for (const seat of rows) {
      counts[seat.status as keyof typeof counts]++;
    }

    return {
      id: showId,
      total_seats: rows.length,
      available: counts.available,
      held: counts.held,
      confirmed: counts.confirmed,
      seats: rows.map((seat) => ({
        seat: seat.seatNumber,
        status: seat.status,
      })),
    };
  }
}
