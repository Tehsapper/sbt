import { TransactionRepo } from "./TransactionRepo.js";
import { TransactionState } from "../core.js";
import postgres from "postgres";

export class PostgresTransactionRepo implements TransactionRepo {
	private sql: postgres.Sql;

	constructor(sql: postgres.Sql) {
		this.sql = sql;
	}

	async setup(): Promise<void> {
		await this
			.sql`CREATE TABLE IF NOT EXISTS transactions (hash TEXT PRIMARY KEY, status TEXT, submission_time TIMESTAMP)`;
	}

	async get(hash: string): Promise<TransactionState> {
		const rows = await this
			.sql`SELECT hash, status, submission_time FROM transactions WHERE hash = ${hash}`;
		if (rows.length === 0) {
			throw new Error(`Transaction ${hash} not found`);
		}
		return {
			hash: rows[0].hash,
			status: rows[0].status,
			submissionTime: rows[0].submission_time,
		};
	}

	async getAllPending(): Promise<TransactionState[]> {
		const rows = await this
			.sql`SELECT hash, status, submission_time FROM transactions WHERE status = 'pending'`;
		return rows.map((row) => ({
			hash: row.hash,
			status: row.status,
			submissionTime: row.submission_time,
		}));
	}

	async create(transaction: TransactionState): Promise<void> {
		await this.sql`INSERT INTO transactions (hash, status, submission_time)
            VALUES (${transaction.hash}, ${transaction.status}, ${transaction.submissionTime})`;
	}

	async update(transaction: TransactionState): Promise<void> {
		await this.sql`UPDATE transactions SET
            status = ${transaction.status},
            submission_time = ${transaction.submissionTime}
        WHERE hash = ${transaction.hash}`;
	}
}
