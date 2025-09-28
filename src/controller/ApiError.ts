export enum Severity {
	DEBUG,
	INFO,
	WARN,
	ERROR,
}

export class ApiError extends Error {
	httpStatusCode: number;
	severity: Severity;

	constructor(
		message: string,
		httpStatusCode: number,
		severity: Severity,
		cause?: unknown,
	) {
		super(message);
		this.cause = cause;
		this.httpStatusCode = httpStatusCode;
		this.severity = severity;
	}
}

export class BadRequestError extends ApiError {
	constructor(message: string, cause?: unknown) {
		super(message, 400, Severity.WARN, cause);
	}
}

export class UnauthorizedError extends ApiError {
	constructor(message: string, cause?: unknown) {
		super(message, 401, Severity.WARN, cause);
	}
}

export class NotFoundError extends ApiError {
	constructor(message: string, cause?: unknown) {
		super(message, 404, Severity.WARN, cause);
	}
}

export class InternalServerError extends ApiError {
	constructor(message: string, cause?: unknown) {
		super(message, 500, Severity.ERROR, cause);
	}
}
