import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Show } from './show.entity';
import { ReservationSeat } from './reservation-seat.entity';
import { SeatStatus } from '../enums/seat-status.enum';

@Entity('seats')
@Index(['showId', 'seatNumber'], { unique: true })
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  showId!: string;

  @ManyToOne(() => Show, (show) => show.seats, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'showId' })
  show!: Show;

  @Column({ type: 'varchar', length: 50 })
  seatNumber!: string;

  @Column({
    type: 'enum',
    enum: SeatStatus,
    default: SeatStatus.AVAILABLE,
  })
  status!: SeatStatus;

  @OneToMany(
    () => ReservationSeat,
    (reservationSeat) => reservationSeat.seat,
  )
  reservationSeats!: ReservationSeat[];
}