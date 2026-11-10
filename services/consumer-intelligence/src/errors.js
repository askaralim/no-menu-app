export class ServiceError extends Error {
  constructor(status, code, message = code, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}
export function fail(status, code, details) { throw new ServiceError(status, code, code, details) }
