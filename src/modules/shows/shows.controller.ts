import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CreateShowDto } from './dto/create-show.dto';
import { ShowsService } from './shows.service';
import { AuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('shows')
export class ShowsController {
  constructor(private readonly showsService: ShowsService) {}

  @UseGuards(AuthGuard, AdminGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createShowDto: CreateShowDto) {
    return this.showsService.create(createShowDto);
  }
}
