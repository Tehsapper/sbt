import { Request } from "express";
import { BadRequestError } from "./ApiError.js";

export function getQueryParam(req: Request, name: string): string {
	const value = req.query[name];
	if (typeof value !== "string") {
		throw new BadRequestError(
			`single "${name}" query parameter must be provided`,
		);
	}
	return value;
}
