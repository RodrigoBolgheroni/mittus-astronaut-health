import { HttpException } from '@nestjs/common';

export class ApiError extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    details?: { field: string; message: string }[],
  ) {
    super(
      { statusCode: status, code, message, ...(details ? { details } : {}) },
      status,
    );
  }
}
