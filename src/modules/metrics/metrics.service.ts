import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry } from 'prom-client';
import { DataSource } from 'typeorm';

@Injectable()
export class MetricsService {
  readonly registry: Registry;

  private readonly confirmedReservations: Counter<string>;
  private readonly declinedReservations: Counter<string>;
  private readonly availableSeats: Gauge<string>;

  constructor(private readonly dataSource: DataSource) {
    this.registry = new Registry();

    this.confirmedReservations = new Counter({
      name: 'reservations_confirmed_total',
      help: 'Total number of confirmed reservations',
      registers: [this.registry],
    });

    this.declinedReservations = new Counter({
      name: 'reservations_declined_total',
      help: 'Total number of declined reservation attempts',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.availableSeats = new Gauge({
      name: 'seats_available',
      help: 'Current number of available seats',
      registers: [this.registry],
    });
  }

  reservationConfirmed(): void {
    this.confirmedReservations.inc();
  }

  reservationDeclined(reason: string): void {
    this.declinedReservations.inc({ reason });
  }

  async updateAvailableSeats(): Promise<void> {
    const result = await this.dataSource.query(`
      SELECT COUNT(*)::int AS count
      FROM "seats"
      WHERE "status" = 'available'
    `);

    this.availableSeats.set(Number(result[0].count));
  }

  async getMetrics(): Promise<string> {
    await this.updateAvailableSeats();

    return this.registry.metrics();
  }
}
