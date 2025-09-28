# SBT Mint

A Node.js backend application to mint soul-bound tokens for Mizuhiki suite on Japan Smart Chain.

It utilizes MultiBaaS platform for Etherium blockchain interop. It uses Postgres for state storage.

## Building

1. Ensure you have Node.js installed
2. Run
   ```shell
   npm install
   npm run build
   ```

## Testing

```shell
npm run test
```

## Running

1. Obtain the following as environment variables:
   - MultiBaaS deployment URL
   - MultiBaaS API key 
   - Etherium wallet private key

### Docker Compose

2. Ensure host machine has Docker daemon and Docker Compose CLI available
3. Copy env file example for Docker Compose and exclude it from Git to avoid exposing secrets:
   ```shell
   echo ".env.docker-compose" >> ".git/info/exclude"
   cp ".env.docker-compose.example" ".env.docker-compose"
   ```
4. Populate `[REDACTED]` values in `.env.docker-compose` file
5. Start containers:
   ```shell
   docker compose up --build
   ```
