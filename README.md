# SBT Mint

A Node.js backend application to mint soul-bound tokens (SBTs) on Japan Smart Chain, an Ethereum-compatible blockchain, using ERC-721 compatible Mizuhiki Suite contracts.

It utilizes MultiBaaS platform for blockchain interop.

It serves HTTP API that allows:
* claiming an SBT for given address
* checking SBT state given minting transaction hash

You can check the OpenAPI specs at `openapi-spec.yml`.

It spawns a background process that polls recent blockchain events for the SBT contract. This allows updating pending SBTs state by looking for `Issued` events.

## Considerations

It uses Node.js as it has good library support for Ethereum blockchain interop. Plus learning both Golang and Ethereum would be prohibitively challenging :)

It uses Postgres for state storage, as:
1. Assuming low QPS of SBT issuance (e.g. for KYC), it should be able to sustain the load
2. It is a battle-proven ACID RDBMS
3. It supports free-form queries (unlike some NoSQL datasores like Apache Cassandra). This is very useful in early lifecycle of a service.

If SBT minting transaction was not completed within grace period, then it will be considered failed (e.g. dropped from mempool). "Zombie" transactions that complete after that are not handled, for simplicity of implementation.

The background process could have used transaction receipts instead. Unfortunately, MultiBaas API does not provide event timestamps for them. They could be retrieved from Get Block API, but that would result in extra API calls.

Alternatively, it could poll for latest blocks. I did not find how to get events (emitted in logs?) of a block using MultiBaas Get Block API.

Therefore, I selected events poll approach for simplicity of implementation.

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
4. Populate corresponding `[REDACTED]` values in `.env.docker-compose` file
5. Start containers:
   ```shell
   docker compose up --build
   ```

The service will be bound to local `8080` port by default.

## Using

1. Sign your wallet address string (e.g. `0x0000000000000000000000000000000000000001`) with its private key
2. Send `Claim SBT` API HTTP request:
   ```shell
   YOUR_ADDRESS='0x0000000000000000000000000000000000000001'
   YOUR_ADDRESS_SIGNATURE='0x1a32da8189e96c52b1f9a1fdb8cf81ca369236fc4041f85d23fcd08eaad118e97182b8836ea2813b2c779feca296c4eae21453ef1e5f3f6705cc3845d9c549f31c'
   curl -X POST "localhost:8080/claim?to=${YOUR_ADDRESS}&signature=${YOUR_ADDRESS_SIGNATURE}"
   ```
3. It will respond with SBT minting transaction hash if successful:
   ```json
   {
    "txHash": "0xa447d91aa2a00192e75765ef4a816672981d22dd8871f5dbbd1c592916a19941"
   }
   ```
4. Check your SBT status using that hash:
   ```shell
   TX_HASH="0xa447d91aa2a00192e75765ef4a816672981d22dd8871f5dbbd1c592916a19941"
   curl "localhost:8080/status?txHash=${TX_HASH}"
   ```

## Future Ideas

SBT tracking process should be reworked as currently it will fail under high load due to MultiBaas events API limitations.

If MultiBaas is still used, then webhooks should be used for event delivery, once public IP address is obtained.

If the network is very congested, it could also be a cronjob (e.g. a k8s cronjob, an AWS CloudWatch-triggered Lambda, etc).

For prod usage, exposed APIs should have rate limits (e.g. per IP address, per wallet address, etc.) and authorization.

Claim message to-be-signed can be improved with some dynamic component, instead of just address, as it can be abused if found out.

Instead of Posgres RDBMS, a more scalable storage can be used. For AWS deployment, DynamoDB can be a good choice, as it's reasonably fast, easy to set up and supports indexes for flexible queries. If all queries are well-known, Apache Cassandra can also be used.
