import { TransactionRepo } from "./TransactionRepo.js";
import postgres from "postgres";
import {
	EthereumTransaction,
	EthereumTransactionHash,
} from "../domain/EthereumTransaction.js";

export class PostgresTransactionRepo implements TransactionRepo {
	private sql: postgres.Sql;

	constructor(sql: postgres.Sql) {
		this.sql = sql;
	}

	async setup(): Promise<void> {
		await this.sql`CREATE TABLE IF NOT EXISTS transactions (
                hash TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                from_address TEXT NULL,
                to_address TEXT NOT NULL,
                value BIGINT NOT NULL,
                nonce BIGINT NOT NULL,
                gas_limit BIGINT NOT NULL,
                block_number BIGINT,
                submitted_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            )`;
	}

	async get(
		hash: EthereumTransactionHash,
	): Promise<EthereumTransaction | null> {
		const rows = await this.sql`SELECT
                hash,
                status,
                from_address,
                to_address,
                value,
                nonce,
                gas_limit,
                block_number,
                submitted_at,
                updated_at
            FROM transactions
            WHERE hash = ${hash}`;
		if (rows.length === 0) {
			return null;
		}
		return {
			hash: rows[0].hash,
			status: rows[0].status,
			from: rows[0].from_address,
			to: rows[0].to_address,
			value: rows[0].value,
			nonce: rows[0].nonce,
			gasLimit: rows[0].gas_limit,
			blockNumber: rows[0].block_number,
			submittedAt: rows[0].submitted_at,
			updatedAt: rows[0].updated_at,
		};
	}

	async getAllPending(): Promise<EthereumTransaction[]> {
		const rows = await this.sql`SELECT
                hash,
                status,
                from_address,
                to_address,
                value,
                nonce,
                gas_limit,
                block_number,
                submitted_at,
                updated_at
            FROM transactions
            WHERE status = 'pending'`;
		return rows.map((row) => ({
			hash: row.hash,
			status: row.status,
			from: null,
			to: row.to_address,
			value: row.value,
			nonce: row.nonce,
			gasLimit: row.gas_limit,
			blockNumber: row.block_number,
			submittedAt: row.submitted_at,
			updatedAt: row.updated_at,
		}));
	}

	async create(transaction: EthereumTransaction): Promise<void> {
		await this.sql`INSERT INTO transactions (
            hash,
            status,
            from_address,
            to_address,
            value,
            nonce,
            gas_limit,
            block_number,
            submitted_at,
            updated_at
        ) VALUES (
            ${transaction.hash},
            ${transaction.status},
            ${transaction.from},
            ${transaction.to},
            ${transaction.value},
            ${transaction.nonce},
            ${transaction.gasLimit},
            ${transaction.blockNumber},
            ${transaction.submittedAt},
            ${transaction.updatedAt}
        )`;
	}

	async update(transaction: EthereumTransaction): Promise<void> {
		await this.sql`UPDATE transactions SET
            status = ${transaction.status},
            from_address = ${transaction.from},
            to_address = ${transaction.to},
            value = ${transaction.value},
            nonce = ${transaction.nonce},
            gas_limit = ${transaction.gasLimit},
            block_number = ${transaction.blockNumber},
            submitted_at = ${transaction.submittedAt},
            updated_at = ${transaction.updatedAt}
        WHERE hash = ${transaction.hash}`;
	}
}
