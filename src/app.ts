import express from "express";
import dotenv from "dotenv";
import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { SbtMint } from "./mint.js";
import { configFromProcessEnv } from "./config.js";
import { ethers } from "ethers";
import { EthersSignatureVerifier } from "./SignatureVerifier.js";

dotenv.config({ path: ".env" });

const config = configFromProcessEnv();

const multiBaasConfig = new MultiBaas.Configuration({
	basePath: config.multiBaas.basePath,
	accessToken: config.multiBaas.apiKey,
});

const multiBaasContractsApi = new MultiBaas.ContractsApi(multiBaasConfig);
const multiBaasChainsApi = new MultiBaas.ChainsApi(multiBaasConfig);
const multiBaasTxManagerApi = new MultiBaas.TxmApi(multiBaasConfig);

// TODO: use MultiBaaS Cloud Wallet with a secure provider.
const wallet = new ethers.Wallet(config.wallet.privateKey);

const signatureVerifier = new EthersSignatureVerifier();
const sbtMint = new SbtMint(multiBaasContractsApi, multiBaasChainsApi, wallet);

const app = express();

app.use(express.json());

app.post("/claim", async (req, res) => {
	const to = req.query.to as string;
	if (!to) {
		res.status(400).json({ error: '"to" query parameter is required' });
		return;
	}
	const signature = req.query.signature as string;
	if (!signature) {
		res.status(400).json({
			error: '"signature" query parameter is required',
		});
		return;
	}
	const verified = await signatureVerifier.verify(to, signature, to);
	if (!verified) {
		res.status(401).json({ error: "Could not verify signature" });
		return;
	}
	try {
		const txHash = await sbtMint.startMinting(to);
		res.json({ txHash });
	} catch (error) {
		res.status(500).json({ error: "Failed to start minting" });
	}
});

app.listen(config.server.port, config.server.hostname, () => {
	console.log(
		`HTTP server is running on ${config.server.hostname}:${config.server.port}`,
	);
});

export default app;
