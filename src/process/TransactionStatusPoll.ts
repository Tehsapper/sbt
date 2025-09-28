import { TransactionChecker } from "../service/TransactionChecker.js";
import { Logger, ILogObj } from "tslog";

export class TransactionStatusPoll {
	private transactionChecker: TransactionChecker;
	private pollingIntervalMs: number;
	private logger: Logger<ILogObj>;
	private intervalHandle: NodeJS.Timeout | null = null;
	private isPolling: boolean = false;

	constructor(
		transactionChecker: TransactionChecker,
		pollingIntervalSeconds: number,
		logger: Logger<ILogObj> = new Logger({ name: "TransactionStatusPoll" }),
	) {
		this.transactionChecker = transactionChecker;
		this.pollingIntervalMs = pollingIntervalSeconds * 1000;
		this.logger = logger;
	}

	async start() {
		// to avoid stampede when several service instances start at the same time
		const startJitterMs = Math.floor(
			Math.random() * this.pollingIntervalMs,
		);
		this.logger.info(
			`Starting transaction status poll with ${this.pollingIntervalMs}ms interval in ${startJitterMs}ms`,
		);
		await this.sleep(startJitterMs);
		await this.poll();
		this.intervalHandle = setInterval(
			async () => await this.poll(),
			this.pollingIntervalMs,
		);
	}

	private sleep(ms: number) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	private async poll() {
		if (this.isPolling) {
			this.logger.warn(
				"Transaction status poll is already running, skipping",
			);
			return;
		}

		try {
			this.isPolling = true;
			await this.transactionChecker.updatePendingTransactions();
		} catch (error) {
			this.logger.error("Error updating pending transactions", { error });
		} finally {
			this.isPolling = false;
		}
	}

	stop() {
		if (this.intervalHandle) {
			clearInterval(this.intervalHandle);
			this.intervalHandle = null;
		}
	}
}
