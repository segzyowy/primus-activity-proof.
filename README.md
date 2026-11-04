# Activity Proof — submission candidate v0.2.0

Independent experimental Primus Network SDK integration. Not production-ready, not an official Primus app, and not proof of wallet balance.

## Scope
Binance 30-day spot volume template `ad7d29c8-d820-495a-8bf1-02b8f236a1ae`. Fixed condition `spotVolume30d > 100`. Denomination must be confirmed; do not label it USD yet. Base Sepolia only (84532).

## Changes
- Separate wallet connection/network switch from paid task submission.
- Friendly unmet-requirement state for SDK 00104 based on support clarification; never represented as a verified negative proof.
- Tab-session task metadata recovery and duplicate-submission guard. No raw attestations persisted by app code. Multiple tabs/closed tabs are not protected; check wallet transactions.
- Read-only existing-result polling, diagnostic details, explicit reset confirmation.
- Contract results fetched via SDK and locally checked for source, task, recipient, condition, nonce, and freshness. These are binding checks, not an independent cryptographic verifier. Eligibility remains undecided pending validation of the real condition-result schema.

## Deployment
Upload ALL files from this directory to the root of the existing GitHub repository. Include `verification.js` and tests. Netlify: base empty, command `npm run build`, publish `dist`, Node 22. Keep existing project and domain. Do not upload source through Netlify Drop; it needs a build.

Locally: `npm install`, `npm test`, `npm run build`. This workspace did not execute Node tests or the Vite build; these must pass in a Node environment. No lockfile supplied; generate and commit one in your development environment if needed.

## Testing checklist
- Connect without submitting a transaction; verify Base Sepolia.
- Reject connection and task transaction; ensure no false success.
- With authorized Binance account, unmet condition should show requirement-not-met, not eligible and no successful proof.
- Reload the same tab: recorded attempt blocks a new task; poll only if a task ID exists.
- Successful attestation must still pass contract retrieval and local binding checks. Real successful return schema and disclosure review remain outstanding. Do not trade just to test.
- Do not automatically grant rewards or access.

## Privacy and fees
Only log in at Binance through the official Primus flow. Never enter passwords, cookies, keys, or seeds into this app. Testnet transactions may use fees. Metadata and onchain records can identify the wallet. Requesting conditional output does not guarantee anonymity or absence of disclosure. Exported raw bundles require private review; never post credentials or raw bundles publicly.

## References
https://docs.primuslabs.xyz/build/for-dapp/example/
https://docs.primuslabs.xyz/build/misc/attestation-structure/
https://docs.primuslabs.xyz/build/misc/error-code/
