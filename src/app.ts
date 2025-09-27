import express from "express";
import dotenv from "dotenv";
import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { SbtMintImpl } from "./service/SbtMint.js";
import { configFromProcessEnv } from "./config.js";
import { ethers } from "ethers";
import { EthersSignatureVerifier } from "./service/SignatureVerifier.js";
import { ClaimController } from "./controller/ClaimController.js";
import { TransactionCheckerImpl } from "./service/TransactionChecker.js";
import { InMemoryTransactionRepo } from "./repo/InMemoryTransactionRepo.js";
import { Logger } from "tslog";

dotenv.config({ path: ".env" });

const config = configFromProcessEnv();

const logger = new Logger({
	name: "app",
});

const multiBaasConfig = new MultiBaas.Configuration({
	basePath: config.multiBaas.basePath,
	accessToken: config.multiBaas.apiKey,
});

const multiBaasContractsApi = new MultiBaas.ContractsApi(multiBaasConfig);
const multiBaasChainsApi = new MultiBaas.ChainsApi(multiBaasConfig);

// TODO: use MultiBaaS Cloud Wallet with a secure provider.
const wallet = new ethers.Wallet(config.wallet.privateKey);

const transactionRepo = new InMemoryTransactionRepo();

const signatureVerifier = new EthersSignatureVerifier();
const sbtMint = new SbtMintImpl(
	multiBaasContractsApi,
	multiBaasChainsApi,
	transactionRepo,
	wallet,
);
const transactionChecker = new TransactionCheckerImpl(
	transactionRepo,
	multiBaasChainsApi,
);

// TODO: consider using other means to track transaction status:
// - use MultiBaaS webhooks
// - some kind of (cron?) job or scheduler library
// - k8s cronjob or AWS Lambda function
setInterval(async () => {
	try {
		await transactionChecker.updatePendingTransactions();
	} catch (error) {
		logger.error("Error updating pending transactions", error);
	}
}, config.txStatusPollingIntervalSeconds * 1000);

const claimController = new ClaimController(sbtMint, signatureVerifier);

const app = express();

app.use(express.json());

app.post("/claim", (req, res) => claimController.handleClaim(req, res));

app.listen(config.server.port, config.server.hostname, () => {
	logger.info(
		`HTTP server is running on ${config.server.hostname}:${config.server.port}`,
	);
});

export default app;
