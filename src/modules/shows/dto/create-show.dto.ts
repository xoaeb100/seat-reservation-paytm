import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateShowDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  seats!: string[];

  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  price_in_paise!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  per_user_limit?: number;
}
