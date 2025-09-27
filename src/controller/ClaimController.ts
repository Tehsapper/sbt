import { Request, Response } from "express";
import { SbtMint } from "../service/SbtMint.js";
import { Logger, ILogObj } from "tslog";
import { ethereumAddressFrom, validSignature } from "../core.js";

export class ClaimController {
	private sbtMint: SbtMint;
	private logger: Logger<ILogObj>;

	constructor(
		sbtMint: SbtMint,
		logger: Logger<ILogObj> = new Logger({
			name: "ClaimController",
		}),
	) {
		this.sbtMint = sbtMint;
		this.logger = logger;
	}

	async handleClaim(req: Request, res: Response): Promise<void> {
		const to = req.query.to as string;
		if (!to) {
			res.status(400).json({ error: '"to" query parameter is required' });
			return;
		}
		if (!ethereumAddressFrom(to)) {
			res.status(400).json({
				error: '"to" query parameter is not a valid Ethereum address',
			});
			return;
		}
		const signature = req.query.signature as string;
		if (!signature) {
			res.status(400).json({
				error: '"signature" query parameter is required',
			});
			return;
		}
		const verified = validSignature(to, signature, to);
		if (!verified) {
			this.logger.warn("Could not verify signature", { to, signature });
			res.status(401).json({ error: "Could not verify signature" });
			return;
		}
		try {
			const txHash = await this.sbtMint.startMinting(to);
			res.status(200).json({ txHash });
		} catch (error) {
			this.logger.error("Failed to start minting", { error });
			res.status(500).json({ error: "Failed to start minting" });
		}
	}
}
