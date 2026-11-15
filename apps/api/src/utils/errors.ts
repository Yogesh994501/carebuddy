import { Response } from 'express';

export class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function sendError(res: Response, statusCode: number, code: string, message: string) {
  return res.status(statusCode).json({
    error: {
      code,
      message
    }
  });
}
