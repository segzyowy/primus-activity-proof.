# Activity Proof — experimental Primus integration

A separate app, not a replacement for Balance Lab. Uses the user-provided Binance volume template ad7d29c8-d820-495a-8bf1-02b8f236a1ae and requests spotVolume30d > 100 using Primus Network SDK 0.1.11.

## Deploy through GitHub + Netlify
Create a NEW repository. Upload the contents of this folder to its root, including package.json and netlify.toml. Import that repository into a NEW Netlify project. Base directory blank; build command npm run build; publish directory dist; Node 22. This is different from the old plain-static app. Do not drag the source folder into Netlify Drop: it requires a build. Locally: npm install, then npm run dev; for production npm run build and deploy dist.

## Test
Use a desktop extension-enabled browser, the official Primus extension, a Binance account you are authorized to use, and a wallet on Base Sepolia (84532). Test ETH is needed for gas and task fees. No real funds or trading are necessary just to test. Never submit credentials to this app. The SDK performs the official interactive authentication flow.

The app uses init -> submitTask -> attest -> verifyAndPollTaskResult as documented. Task submission requires a wallet transaction. Conditional output is explicitly requested; no plaintext fallback is implemented. Full HTTP response collection is disabled.

## Verification and privacy boundaries
This prototype reads contract task results using the SDK, then checks task ID, recipient, source URL, requested condition, session nonce and timestamp. It fails closed for unrecognized structures. It deliberately does NOT decide eligibility until the actual template output schema has been observed and validated. A false predicate can still produce an attestation; task completion is not eligibility.

The template was supplied by the user; its live compatibility, field currency and output encoding are not independently confirmed. The generated app has not been npm-built or end-to-end tested in this workspace. A strict check can reject a legitimate response with a different encoding; inspect safely rather than removing checks.

This is attestor/contract-based verification via the SDK, not a standalone verifier of the underlying zkTLS computations. Public blockchain transactions and attestations can expose wallet, condition and metadata. Do not claim anonymity or guaranteed confidential output before inspecting actual behavior. No server secrets are used, and no raw credentials are collected by the app. Results stay in memory until downloaded; no analytics or local persistence added. Blockchain effects cannot be deleted by closing this page.

Existing-task retry only polls; it does not restart an interrupted attestation. If an attestation fails after task submission, consult the official task/refund documentation rather than repeatedly paying. Do not use this prototype for real access control, rewards, or financial decisions. Production needs independently enforced policies, replay protection, output schema validation and a dependency/security review.

Sources:
https://docs.primuslabs.xyz/build/for-dapp/example/
https://github.com/primus-labs/zktls-demo/tree/main/network-sdk-example
https://www.npmjs.com/package/@primuslabs/network-js-sdk
