import express from "express";
import { ClaimController } from "./controller/ClaimController.js";
import { ErrorController } from "./controller/ErrorController.js";

export function makeRouter(
	claimController: ClaimController,
	errorController: ErrorController,
): express.Router {
	const router = express.Router();

	router.get("/status", (req, res) =>
		claimController.handleGetStatus(req, res),
	);
	router.post("/claim", (req, res) => claimController.handleClaim(req, res));

	router.all("*everything", (req, res) =>
		errorController.handleUnknownRoute(req, res),
	);

	return router;
}
