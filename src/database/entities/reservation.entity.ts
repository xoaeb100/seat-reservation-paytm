import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Show } from './show.entity';
import { ReservationSeat } from './reservation-seat.entity';
import { ReservationStatus } from '../enums/reservation-status.enum';

@Entity('reservations')
@Index(
  ['showId', 'userId', 'idempotencyKey'],
  { unique: true },
)
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  showId!: string;

  @ManyToOne(() => Show, (show) => show.reservations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'showId' })
  show!: Show;

  @Column({ type: 'varchar', length: 255 })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  idempotencyKey!: string;

  @Column({ type: 'varchar', length: 64 })
  requestHash!: string;

  @Column({ type: 'integer' })
  amountPaise!: number;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.CONFIRMED,
  })
  status!: ReservationStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @OneToMany(
    () => ReservationSeat,
    (reservationSeat) => reservationSeat.reservation,
  )
  reservationSeats!: ReservationSeat[];
}