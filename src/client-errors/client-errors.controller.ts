import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Logger,
    Post,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';

class ClientErrorDto {
    @IsString()
    @MaxLength(2000)
    message!: string;

    @IsOptional()
    @IsString()
    @MaxLength(10000)
    stack?: string;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    url?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    source?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    userAgent?: string;
}

@Controller('client-errors')
export class ClientErrorsController {
    private readonly logger = new Logger('FrontendErrors');

    @Post()
    @HttpCode(HttpStatus.NO_CONTENT)
    report(@Body() error: ClientErrorDto) {
        this.logger.error(
            JSON.stringify({
                timestamp: new Date().toISOString(),
                ...error,
            }),
        );
    }
}