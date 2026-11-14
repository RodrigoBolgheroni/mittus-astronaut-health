import { ValidationPipe } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { ApiError } from './api-error.js';

export class RequestValidationPipe extends ValidationPipe {
  constructor(expectedType: Type<unknown>) {
    super({
      expectedType,
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new ApiError(
          400,
          'VALIDATION_ERROR',
          'Invalid check-in data.',
          errors.flatMap((error) =>
            Object.values(error.constraints ?? {}).map((message) => ({
              field: error.property,
              message,
            })),
          ),
        ),
    });
  }
}
