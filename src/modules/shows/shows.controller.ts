import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { CreateShowDto } from './dto/create-show.dto';
import { ShowsService } from './shows.service';

@Controller('shows')
export class ShowsController {
  constructor(private readonly showsService: ShowsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createShowDto: CreateShowDto) {
    return this.showsService.create(createShowDto);
  }
}
