import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { ReserveSeatsDto } from './dto/reserve-seats.dto';
import { ReservationsService } from './reservations.service';

@Controller()
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @UseGuards(AuthGuard)
  @Post('shows/:id/reserve')
  @HttpCode(HttpStatus.CREATED)
  reserve(
    @Param('id') showId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ReserveSeatsDto,
  ) {
    return this.reservationsService.reserve(showId, user.id, dto);
  }
}
