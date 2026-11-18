# GitHub Builder Passport

A mobile-friendly GitHub credential passport powered by the official Primus BNB ZKID SDK. A credential is marked verified only when the SDK returns \`on_chain_attested\`.

## Current implementation

- MetaMask wallet address connection (no signing request and no private key handling).
- Primus BNB ZKID SDK initialization.
- Live GitHub provider and identity-property discovery from Primus Gateway configuration.
- Re-checks the selected GitHub property immediately before proving; no guessed property ID is submitted.
- Primus proof progress, failure handling and on-chain attestation reference.
- Optional read of the GitHub identity payload from the published BNB Smart Chain testnet demo registry.
- Shareable passport URL with selective inclusion of decoded fields and an optional wallet address.
- Shared passports query Primus by proof request ID and compare provider/property. If profile fields are shared, recipients also re-read the registry and compare the included values before the page displays a verified badge.

## Run locally

Requirements: Node.js 20+, npm, MetaMask, and the Primus browser extension.

1. Install the Primus extension: https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe
2. Sign in to GitHub in the same browser profile that has the extension enabled.
3. From this directory, run:

    npm install
    npm run dev

4. Open the Vite URL (normally http://localhost:5173).
5. Connect MetaMask, discover live GitHub properties, select one, then run verification.
6. Approve the Primus extension verification flow.

## App ID

The app uses the public example App ID from Primus's own BNB ZKID SDK demo as a development fallback:

\`0x36013DD48B0C1FBFE8906C0AF0CE521DDA69186AB6E6B5017DBF9691F9CF8E5C\`

Set \`VITE_PRIMUS_APP_ID\` in a local \`.env\` file to use an App ID registered for your own project. App IDs are public identifiers; do not place an App Secret, GitHub token, cookie, password or wallet private key in a Vite environment variable.

The live provider list is authoritative. If the configured App ID does not expose a GitHub property, the app stops rather than falling back to a hard-coded property.

## Proof and claim boundaries

- The app does not use GitHub OAuth, the GitHub REST API, scraping, or user-entered GitHub credentials to create verified claims.
- The browser's GitHub session is used only inside the official Primus extension/source-verification flow.
- The app calls \`BnbZkIdClient.init()\` and \`BnbZkIdClient.prove()\` from \`@primuslabs/bnb-zkid-sdk\`.
- A result is eligible for the passport only when the SDK returns \`status: "on_chain_attested"\`.
- The app does not submit a guessed property ID. It discovers available GitHub property IDs from the live provider configuration and rechecks them immediately before proof generation.
- Numeric GitHub profile fields are shown only when the associated registry payload is successfully read and decoded using the GitHub profile schema demonstrated by Primus's official SDK demo.
- If the SDK attests but the app cannot read or decode the registry data, the attestation reference is still shown, but no invented numbers are displayed.
- Shared passport pages call \`queryProofResult()\` and compare the actual Primus result to the shared provider and property. Included profile values are checked against a fresh testnet registry read. A client-side URL payload alone is never treated as proof.
- Shared passport verification requires the Primus extension because the SDK initialization checks for it.
- The share URL is a presentation/transport format, not a standalone cryptographic verifier. Recipients should check the proof reference with Primus before relying on the claims.

## Registry read

The initial decoder follows the public Primus demo's BNB Smart Chain testnet registry example:

- Chain: BNB Smart Chain testnet (chain ID 97)
- Registry: \`0x9569299A8877Bc155232cF5Aa50AF42F9Fc32C7C\`
- GitHub identity property: \`github_account_age\`, mapped to the profile property identifier used in the official demo.

The testnet registry reader is deliberately isolated in \`src/verification.ts\`. Before production, confirm the production chain, registry address, provider/property identifiers and exact payload schema with Primus. Do not relabel testnet registry reads as mainnet verification.

## Commands

    npm run typecheck
    npm run build

## Official references

- BNB ZKID SDK: https://github.com/primus-labs/BNB-ZKID-SDK
- Official BNB ZKID SDK demo: https://github.com/primus-labs/BNB-ZKID-SDK-Demo
- Primus Developer Hub: https://dev.primuslabs.xyz/
- Primus extension: https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe
- Continuum (design inspiration only; not used as a proof source): https://github.com/tomoima525/continuum

## Not included

This is a first functional integration slice, not a production launch. It does not yet mint NFTs, store public profiles on a backend, run a separate custom Merkle/Semaphore circuit, or claim repository ownership/contribution metrics beyond data explicitly contained in the Primus attestation payload.