import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Show } from './entities/show.entity';
import { Seat } from './entities/seat.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationSeat } from './entities/reservation-seat.entity';
import { UserShowLock } from './entities/user-show-lock.entity';
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: Number(configService.getOrThrow<string>('DB_PORT')),
        database: configService.getOrThrow<string>('DB_NAME'),
        username: configService.getOrThrow<string>('DB_USER'),
        password: configService.getOrThrow<string>('DB_PASSWORD'),

        entities: [Show, Seat, Reservation, ReservationSeat, UserShowLock],
        synchronize: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
