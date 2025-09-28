import postgres from "postgres";
import { EthereumTransactionHash } from "../domain/EthereumTransaction.js";
import { SbtRepo } from "./SbtRepo.js";
import { MintedSbt } from "../domain/MintedSbt.js";

export class PostgresSbtRepo implements SbtRepo {
	private sql: postgres.Sql;

	constructor(sql: postgres.Sql) {
		this.sql = sql;
	}

	async setup(): Promise<void> {
		await this.sql`CREATE TABLE IF NOT EXISTS sbt (
                tx_hash TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                from_address TEXT NOT NULL,
                to_address TEXT NOT NULL,
                token_id BIGINT NULL,
                token_uri TEXT NULL,
                created_at TIMESTAMP NOT NULL,
                issued_at TIMESTAMP NULL,
                updated_at TIMESTAMP NOT NULL
            )`;
	}

	async get(txHash: EthereumTransactionHash): Promise<MintedSbt | null> {
		const rows = await this.sql`SELECT
                tx_hash,
                status,
                from_address,
                to_address,
                token_id,
                token_uri,
                created_at,
                issued_at,
                updated_at
            FROM sbt
            WHERE tx_hash = ${txHash}`;
		if (rows.length === 0) {
			return null;
		}
		return {
			txHash: rows[0].tx_hash,
			status: rows[0].status,
			from: rows[0].from_address,
			to: rows[0].to_address,
			tokenId: rows[0].token_id,
			tokenUri: rows[0].token_uri,
			createdAt: rows[0].created_at,
			issuedAt: rows[0].issued_at,
			updatedAt: rows[0].updated_at,
		};
	}

	async getAllPending(): Promise<MintedSbt[]> {
		const rows = await this.sql`SELECT
                tx_hash,
                status,
                from_address,
                to_address,
                token_id,
                token_uri,
                created_at,
                issued_at,
                updated_at
            FROM sbt
            WHERE status = 'pending'`;
		return rows.map((row) => ({
			txHash: row.tx_hash,
			status: row.status,
			from: row.from_address,
			to: row.to_address,
			tokenId: row.token_id,
			tokenUri: row.token_uri,
			createdAt: row.created_at,
			issuedAt: row.issued_at,
			updatedAt: row.updated_at,
		}));
	}

	async create(sbt: MintedSbt): Promise<void> {
		await this.sql`INSERT INTO sbt (
            tx_hash,
            status,
            from_address,
            to_address,
            token_id,
            token_uri,
            created_at,
            issued_at,
            updated_at
        ) VALUES (
            ${sbt.txHash},
            ${sbt.status},
            ${sbt.from},
            ${sbt.to},
            ${sbt.tokenId},
            ${sbt.tokenUri},
            ${sbt.createdAt},
            ${sbt.issuedAt},
            ${sbt.updatedAt}
        )`;
	}

	async update(sbt: MintedSbt): Promise<void> {
		await this.sql`UPDATE sbt SET
            status = ${sbt.status},
            from_address = ${sbt.from},
            to_address = ${sbt.to},
            token_id = ${sbt.tokenId},
            token_uri = ${sbt.tokenUri},
            created_at = ${sbt.createdAt},
            issued_at = ${sbt.issuedAt},
            updated_at = ${sbt.updatedAt}
        WHERE tx_hash = ${sbt.txHash}`;
	}
}
