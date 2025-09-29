import { Logger, ILogObj } from "tslog";
import { ApiError, Severity } from "./ApiError.js";
import { Request, Response } from "express";
import { slimError } from "../core.js";

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

		const error = slimError(err);

		if (err instanceof ApiError) {
			const [tsLogLevel, tsLogLevelName] = tsLogLevelAndNameFrom(
				err.severity,
			);

			this.logger.log(tsLogLevel, tsLogLevelName, err.message, error);
			res.status(err.httpStatusCode).json({ error: err.message });
		} else {
			this.logger.error("Unhandled error", { error });
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
