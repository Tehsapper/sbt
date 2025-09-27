export type Config = {
	multiBaas: {
		apiKey: string;
		basePath: string;
	};
	txStatusPollingIntervalSeconds: number;
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
