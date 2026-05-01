export class HttpError extends Error {
  statusCode: number;
  headers?: Record<string, string>;

  constructor(statusCode: number, message: string, headers?: Record<string, string>) {
    super(message);
    this.statusCode = statusCode;
    if (headers) {
      this.headers = headers;
    }
    this.name = 'HttpError';
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
