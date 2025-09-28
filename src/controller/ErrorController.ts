import { Logger, ILogObj } from "tslog";
import { ApiError, Severity } from "./ApiError.js";
import { Request, Response } from "express";
import { isAxiosError } from "axios";

export class ErrorController {
	private logger: Logger<ILogObj>;

	constructor(logger: Logger<ILogObj>) {
		this.logger = logger;
	}

	handleUnknownRoute(req: Request, res: Response) {
		this.logger.warn("Unknown route", {
			path: req.path,
			method: req.method,
		});
		res.status(404).json({ error: "Not found" });
	}

	handleError(err: any, req: any, res: any, next: any) {
		if (res.headersSent) {
			return next(err);
		}

		if (err instanceof ApiError) {
			const [tsLogLevel, tsLogLevelName] = tsLogLevelAndNameFrom(
				err.severity,
			);
			const extra = Object.assign(
				{},
				err.cause && { cause: slimCause(err.cause) },
			);

			this.logger.log(tsLogLevel, tsLogLevelName, err.message, extra);
			res.status(err.httpStatusCode).json({ error: err.message });
		} else {
			this.logger.error("Unhandled error", { error: err });
			res.status(500).json({ error: "Internal server error" });
		}
	}
}

function tsLogLevelAndNameFrom(severity: Severity): [number, string] {
	switch (severity) {
		case Severity.DEBUG:
			return [2, "DEBUG"];
		case Severity.INFO:
			return [3, "INFO"];
		case Severity.WARN:
			return [4, "WARN"];
		case Severity.ERROR:
			return [5, "ERROR"];
	}
}

function slimCause(cause: unknown, depth: number = 0): any {
	if (!cause) return cause;
	if (depth > 1) return undefined;
	if (isAxiosError(cause)) {
		return {
			status: cause.response?.status,
			body: cause.response?.data,
		};
	}
	if (typeof cause === "object") {
		const errorObj: any = cause as any;
		if (errorObj.cause)
			errorObj.cause = slimCause(errorObj.cause, depth + 1);
		return errorObj;
	}
	return cause;
}
