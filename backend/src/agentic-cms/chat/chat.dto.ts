import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChatDto {
  @IsString()
  projectId!: string;

  @IsOptional()
  @IsString()
  sprintId?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u)
  deliverableId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message!: string;
}
