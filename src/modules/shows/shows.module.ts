import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Show } from '../../database/entities/show.entity';
import { Seat } from '../../database/entities/seat.entity';
import { ShowsController } from './shows.controller';
import { ShowsService } from './shows.service';

@Module({
  imports: [TypeOrmModule.forFeature([Show, Seat])],
  controllers: [ShowsController],
  providers: [ShowsService],
})
export class ShowsModule {}
