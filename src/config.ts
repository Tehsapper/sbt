export type Config = {
	multiBaas: {
		apiKey: string;
		basePath: string;
	};
	txStatusPollingIntervalSeconds: number;
	postgres: {
		host: string;
		port: number;
		user: string;
		password: string;
		database: string;
	};
	server: {
		hostname: string;
		port: number;
	};
	wallet: {
		privateKey: string;
	};
};

function fromProcessEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Environment variable ${name} is not set`);
	}
	return value;
}

export function configFromProcessEnv(): Config {
	const config = {
		multiBaas: {
			apiKey: fromProcessEnv("MULTIBAAS_API_KEY"),
			basePath: fromProcessEnv("MULTIBAAS_BASE_PATH"),
		},
		txStatusPollingIntervalSeconds: parseInt(
			fromProcessEnv("TX_STATUS_POLLING_INTERVAL_SECONDS"),
		),
		postgres: {
			host: fromProcessEnv("POSTGRES_HOST"),
			port: parseInt(fromProcessEnv("POSTGRES_PORT")),
			user: fromProcessEnv("POSTGRES_USER"),
			password: fromProcessEnv("POSTGRES_PASSWORD"),
			database: fromProcessEnv("POSTGRES_DATABASE"),
		},
		server: {
			hostname: fromProcessEnv("SERVER_HOSTNAME"),
			port: parseInt(fromProcessEnv("SERVER_PORT")),
		},
		wallet: {
			privateKey: fromProcessEnv("WALLET_PRIVATE_KEY"),
		},
	};
	return config;
}
