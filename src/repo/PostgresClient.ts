import postgres from "postgres";
import { PostgresConfig } from "../config";
import { ILogObj, Logger } from "tslog";

export function makePostgresClient(
	config: PostgresConfig,
	logger: Logger<ILogObj>,
): postgres.Sql {
	const db = postgres({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.database,
		onnotice: (notice) => {
			logger.warn(notice.message, { notice });
		},
	});

	return db;
}
