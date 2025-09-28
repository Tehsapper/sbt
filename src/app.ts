import express from "express";
import dotenv from "dotenv";
import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { SbtMintImpl } from "./service/SbtMint.js";
import { configFromProcessEnv } from "./config.js";
import { ethers } from "ethers";
import { ClaimController } from "./controller/ClaimController.js";
import { TransactionCheckerImpl } from "./service/TransactionChecker.js";
import { PostgresTransactionRepo } from "./repo/PostgresTransactionRepo.js";
import { ILogObj, Logger } from "tslog";
import { SystemClock } from "./service/Clock.js";
import { TransactionStatusPoll } from "./process/TransactionStatusPoll.js";
import prexit from "prexit";
import { makePostgresClient } from "./repo/PostgresClient.js";
import { ErrorController } from "./controller/ErrorController.js";
import { makeRouter } from "./routes.js";

dotenv.config({ path: ".env" });

const config = configFromProcessEnv();

const logger = new Logger<ILogObj>({
	name: "app",
});

function makeLogger(name: string) {
	return logger.getSubLogger({ name });
}

const multiBaasConfig = new MultiBaas.Configuration({
	basePath: config.multiBaas.basePath,
	accessToken: config.multiBaas.apiKey,
});

const multiBaasContractsApi = new MultiBaas.ContractsApi(multiBaasConfig);
const multiBaasChainsApi = new MultiBaas.ChainsApi(multiBaasConfig);

// TODO: consider using MultiBaaS Cloud Wallet with a secure provider.
const wallet = new ethers.Wallet(config.wallet.privateKey);

const db = makePostgresClient(config.postgres, makeLogger("postgres"));

const transactionRepo = new PostgresTransactionRepo(db);
await transactionRepo.setup();

const clock = new SystemClock();

const sbtMint = new SbtMintImpl(
	multiBaasContractsApi,
	multiBaasChainsApi,
	transactionRepo,
	clock,
	wallet,
	makeLogger("SbtMint"),
);
const transactionChecker = new TransactionCheckerImpl(
	transactionRepo,
	multiBaasChainsApi,
	clock,
	config.discardedTxGracePeriodSeconds,
	makeLogger("TransactionChecker"),
);

// TODO: consider using other means to track transaction status:
// - use MultiBaaS webhooks to avoid polling
// - some kind of (cron?) job or scheduler library
// - k8s cronjob or AWS Lambda function
const transactionStatusPoll = new TransactionStatusPoll(
	transactionChecker,
	config.txStatusPollingIntervalSeconds,
	makeLogger("TransactionStatusPoll"),
);

const claimController = new ClaimController(sbtMint);
const errorController = new ErrorController(makeLogger("ErrorController"));

const app = express();

app.use(express.json());

const router = makeRouter(claimController, errorController);
app.use(router);

app.use((err: any, req: any, res: any, next: any) =>
	errorController.handleError(err, req, res, next),
);

const server = app.listen(config.server.port, config.server.hostname, () => {
	logger.info(
		`HTTP server is running on ${config.server.hostname}:${config.server.port}`,
	);
});

transactionStatusPoll.start();

prexit(async () => {
	logger.info("Shutting down...");
	transactionStatusPoll.stop();

	// express does not allow to specify timeout, so we race here.
	await Promise.race([
		new Promise((r) => server.close(r)),
		new Promise((r) => setTimeout(r, 10_000)),
	]);

	await db.end({ timeout: 10 });
	logger.info("Shutdown complete");
});
