import express from "express";
import dotenv from "dotenv";
import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { SbtMint } from "./mint";
import { configFromProcessEnv } from "./config";
import { ethers } from "ethers";

dotenv.config({ path: ".env" });

const config = configFromProcessEnv();

const multiBaasConfig = new MultiBaas.Configuration({
	basePath: config.multiBaas.basePath,
	accessToken: config.multiBaas.apiKey,
});

const multiBaasContractsApi = new MultiBaas.ContractsApi(multiBaasConfig);
const multiBaasChainsApi = new MultiBaas.ChainsApi(multiBaasConfig);

const wallet = new ethers.Wallet(config.wallet.privateKey);

const sbtMint = new SbtMint(multiBaasContractsApi, multiBaasChainsApi, wallet);

const app = express();

app.use(express.json());

app.post("/mint", async (req, res) => {
	const to = req.body.to as string;
	const txHash = await sbtMint.startMinting(to);
	res.send(txHash);
});

app.listen(config.server.port, config.server.hostname, () => {
	console.log(
		`HTTP server is running on ${config.server.hostname}:${config.server.port}`,
	);
});

export default app;
