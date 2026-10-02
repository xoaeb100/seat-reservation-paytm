import 'dotenv/config';
import { DataSource } from 'typeorm';

import { Show } from './entities/show.entity';
import { Seat } from './entities/seat.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationSeat } from './entities/reservation-seat.entity';
import { UserShowLock } from './entities/user-show-lock.entity';

export default new DataSource    ({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  entities: [
    Show,
    Seat,
    Reservation,
    ReservationSeat,
    UserShowLock,
  ],

  migrations: ['src/database/migrations/*{.ts,.js}'],
});