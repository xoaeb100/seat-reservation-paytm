import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Seat } from './seat.entity';
import { Reservation } from './reservation.entity';

@Entity('shows')
export class Show {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'integer' })
  priceInPaise!: number;

  @Column({ type: 'integer', default: 4 })
  perUserLimit!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => Seat, (seat) => seat.show)
  seats!: Seat[];

  @OneToMany(() => Reservation, (reservation) => reservation.show)
  reservations!: Reservation[];
}