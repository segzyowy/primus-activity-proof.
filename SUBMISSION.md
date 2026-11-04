# Primus Trading Activity Verification — prototype review

Hi Primus team! I’m submitting my independent trading-activity verification prototype for technical review.

Live app: https://primus-activity-proof.netlify.app/
Source: https://github.com/segzyowy/primus-activity-proof

It uses Primus Network SDK on Base Sepolia with Binance template `ad7d29c8-d820-495a-8bf1-02b8f236a1ae` and condition `spotVolume30d > 100`. It is not a wallet balance proof. Field denomination is awaiting confirmation.

The submission update separates connection from task submission, explains unmet requirements, records task recovery metadata within the browser tab, and supports checking an existing task without submitting another.

Testing so far reached SDK error 00104. Support clarified that the requested threshold was unmet. A successful end-to-end attestation has not yet been validated. The app does not treat this error as a verified negative proof or automatically grant eligibility.

I would appreciate review of condition-result interpretation, expected disclosure, and the successful-result verification flow. The implementation uses SDK contract result retrieval plus local binding checks; it is not an independent zkTLS proof verifier.

Please use this submission text only after deploying and testing the updated release. No production readiness or confirmed successful proof generation is claimed.
