import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';

export class ReserveSeatsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  seats!: string[];

  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  idempotency_key!: string;
}
