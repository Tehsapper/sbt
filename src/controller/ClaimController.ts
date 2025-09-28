import { Request, Response } from "express";
import { SbtMint, SbtMintStateQueryError } from "../service/SbtMint.js";
import {
	ethereumAddressFrom,
	transactionHashFrom,
	validSignature,
} from "../core.js";
import {
	BadRequestError,
	InternalServerError,
	NotFoundError,
	UnauthorizedError,
} from "./ApiError.js";
import { getQueryParam } from "./validation.js";
import { maybeTokenData } from "../domain/MintedSbt.js";

export class ClaimController {
	private sbtMint: SbtMint;

	constructor(sbtMint: SbtMint) {
		this.sbtMint = sbtMint;
	}

	async handleGetStatus(req: Request, res: Response): Promise<void> {
		const txHash = getQueryParam(req, "txHash");
		if (!transactionHashFrom(txHash)) {
			throw new BadRequestError(
				`"txHash" query parameter is not a valid transaction hash`,
			);
		}
		try {
			const state = await this.sbtMint.getSbt(txHash);
			const tokenData = maybeTokenData(state.tokenUri);
			const result = Object.assign({}, state, tokenData);
			res.status(200).json(result);
		} catch (error) {
			if (error instanceof SbtMintStateQueryError) {
				throw new NotFoundError(
					`SBT state not found for tx hash: ${txHash}`,
					error,
				);
			}
			throw new InternalServerError(
				`Failed to get SBT state for tx hash: ${txHash}`,
				error,
			);
		}
	}

	async handleClaim(req: Request, res: Response): Promise<void> {
		const to = getQueryParam(req, "to");
		if (!ethereumAddressFrom(to)) {
			throw new BadRequestError(
				'"to" query parameter is not a valid Ethereum address',
			);
		}

		const signature = getQueryParam(req, "signature");
		if (!validSignature(to, signature, to)) {
			throw new UnauthorizedError("Could not verify signature");
		}

		try {
			const txHash = await this.sbtMint.startMinting(to);
			res.status(200).json({ txHash: txHash });
		} catch (error) {
			throw new InternalServerError("Failed to start minting", error);
		}
	}
}
