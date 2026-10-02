import {
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Reservation } from './reservation.entity';
import { Seat } from './seat.entity';

@Entity('reservation_seats')
export class ReservationSeat {
  @PrimaryColumn({ type: 'uuid' })
  reservationId!: string;

  @PrimaryColumn({ type: 'uuid' })
  seatId!: string;

  @ManyToOne(
    () => Reservation,
    (reservation) => reservation.reservationSeats,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'reservationId' })
  reservation!: Reservation;

  @ManyToOne(() => Seat, (seat) => seat.reservationSeats, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'seatId' })
  seat!: Seat;
}