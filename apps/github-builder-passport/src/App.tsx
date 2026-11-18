import { useEffect, useMemo, useRef, useState } from "react";
import {
  BnbZkIdClient,
  BnbZkIdProveError,
  type ProveSuccessResult
} from "@primuslabs/bnb-zkid-sdk";
import {
  makePassportUrl,
  readGithubAttestedProfile,
  readPassportFromUrl,
  type GithubAttestedProfile,
  type PrimusAttestedResult,
  type ShareablePassport
} from "./verification";

const DEFAULT_TEST_APP_ID =
  "0x36013DD48B0C1FBFE8906C0AF0CE521DDA69186AB6E6B5017DBF9691F9CF8E5C";
const APP_ID = import.meta.env.VITE_PRIMUS_APP_ID?.trim() || DEFAULT_TEST_APP_ID;
const PRIMUS_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/primus/oeiomhmbaapihbilkfkhmlajkeegnjhe";

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

type GithubProperty = {
  providerId: string;
  providerLabel: string;
  identityPropertyId: string;
  description: string;
};

type ProgressStatus =
  | "idle"
  | "initializing"
  | "data_verifying"
  | "proof_generating"
  | "on_chain_attested"
  | "failed";

type SharedVerification = "checking" | "verified" | "failed";

function getEthereum(): EthereumProvider | undefined {
  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

function formatError(error: unknown): string {
  if (error instanceof BnbZkIdProveError) {
    return error.message + (error.code ? " (code " + error.code + ")" : "");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function discoverGithubProperties(providers: Awaited<ReturnType<BnbZkIdClient["init"]>>["providers"]): GithubProperty[] {
  const rows: GithubProperty[] = [];
  for (const provider of providers) {
    const providerLabel =
      provider.description?.trim() || provider.id;
    const isGithubProvider =
      provider.id.toLowerCase().includes("github") ||
      providerLabel.toLowerCase().includes("github");
    if (!isGithubProvider) continue;

    for (const property of provider.properties) {
      const id = property.id.trim();
      if (!id) continue;
      rows.push({
        providerId: provider.id,
        providerLabel,
        identityPropertyId: id,
        description: property.description?.trim() || id
      });
    }
  }
  return rows;
}

function statusLabel(status: ProgressStatus): string {
  const labels: Record<ProgressStatus, string> = {
    idle: "Ready to verify",
    initializing: "Connecting to Primus",
    data_verifying: "Verifying GitHub data with zkTLS",
    proof_generating: "Generating the ZK proof",
    on_chain_attested: "Primus proof attested",
    failed: "Verification failed"
  };
  return labels[status];
}

function shortAddress(value?: string): string {
  if (!value) return "Not disclosed";
  return value.slice(0, 6) + "…" + value.slice(-4);
}

function SharedPassportView({ passport }: { passport: ShareablePassport }) {
  const [verificationState, setVerificationState] = useState<SharedVerification>("checking");
  const [verificationMessage, setVerificationMessage] = useState(
    "Checking the proof reference with Primus. Keep the Primus extension enabled."
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const client = new BnbZkIdClient();
        await client.init({ appId: APP_ID });
        const result = await client.queryProofResult({
          proofRequestId: passport.proofRequestId
        });

        if (result.status !== "on_chain_attested") {
          throw new Error("Primus does not currently report this proof as on-chain attested.");
        }
        if (
          result.providerId !== passport.providerId ||
          result.identityPropertyId !== passport.identityPropertyId
        ) {
          throw new Error("The shared provider or identity property does not match the Primus proof result.");
        }
        if (
          passport.walletAddress &&
          result.walletAddress.toLowerCase() !== passport.walletAddress.toLowerCase()
        ) {
          throw new Error("The disclosed wallet address does not match the Primus proof result.");
        }

        if (passport.profile) {
          const registryProfile = await readGithubAttestedProfile(result);
          if (
            registryProfile.accountEarliestYear !== passport.profile.accountEarliestYear ||
            registryProfile.contributionsLastYear !== passport.profile.contributionsLastYear ||
            registryProfile.registryTimestamp !== passport.profile.registryTimestamp ||
            registryProfile.registry.toLowerCase() !== passport.profile.registry.toLowerCase() ||
            registryProfile.chainId !== passport.profile.chainId
          ) {
            throw new Error("The shared profile fields do not match the current Primus registry payload.");
          }
        }

        if (!cancelled) {
          setVerificationState("verified");
          setVerificationMessage("Primus confirmed the proof reference and the shared credential fields.");
        }
      } catch (verificationError) {
        if (!cancelled) {
          setVerificationState("failed");
          setVerificationMessage(formatError(verificationError));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [passport]);

  const sealText =
    verificationState === "verified"
      ? "VERIFIED BY PRIMUS"
      : verificationState === "checking"
        ? "CHECKING PRIMUS PROOF"
        : "NOT VERIFIED";

  return (
    <main className="page-shell share-shell">
      <header className="topbar">
        <a className="brand" href={window.location.pathname}>
          <span className="brand-mark">P</span>
          <span>PRIMUS <b>BUILDER ID</b></span>
        </a>
        <span className="network-pill"><i /> Primus proof lookup</span>
      </header>
      <section className="passport-card public-passport">
        <div className="passport-orbit">✳</div>
        <p className="eyebrow">VERIFIABLE DEVELOPER IDENTITY</p>
        <h1>GitHub Builder<br /><span>Passport</span></h1>
        <div className={"verified-seal " + verificationState}>
          <span>{verificationState === "verified" ? "✓" : verificationState === "checking" ? "…" : "!"}</span>
          <b>{sealText}</b>
        </div>
        <div className={"passport-check-alert " + verificationState}>{verificationMessage}</div>
        <div className="credential-list">
          <div className="credential-row">
            <div><span className="credential-icon">GH</span></div>
            <div className="credential-copy">
              <b>GitHub identity property</b>
              <small>{passport.identityPropertyId}</small>
            </div>
            {verificationState === "verified" ? <span className="verified-tag">VERIFIED</span> : <span className="pending-tag">PENDING</span>}
          </div>
          {passport.profile ? (
            <>
              <div className="credential-row">
                <div><span className="credential-icon">◷</span></div>
                <div className="credential-copy">
                  <b>Account earliest year</b>
                  <small>Included from the Primus registry payload</small>
                </div>
                <strong className="credential-value">{passport.profile.accountEarliestYear}</strong>
              </div>
              <div className="credential-row">
                <div><span className="credential-icon">↗</span></div>
                <div className="credential-copy">
                  <b>Contributions in last year</b>
                  <small>Included from the Primus registry payload</small>
                </div>
                <strong className="credential-value">{passport.profile.contributionsLastYear}</strong>
              </div>
            </>
          ) : (
            <p className="muted-note">This passport contains the Primus proof reference. No decoded profile figures were included.</p>
          )}
        </div>
        <div className="passport-meta">
          <div><small>PROOF REQUEST</small><b>{passport.proofRequestId}</b></div>
          <div><small>WALLET</small><b>{shortAddress(passport.walletAddress)}</b></div>
          <div><small>ISSUER</small><b>{passport.issuer}</b></div>
        </div>
        <p className="fine-print">The verification badge appears only after this page checks the proof reference with Primus. Keep the Primus extension enabled to verify a shared passport.</p>
      </section>
      <p className="share-footer">Powered by Primus zkTLS · BNB ZKID</p>
    </main>
  );
}

export default function App() {
  const clientRef = useRef<BnbZkIdClient | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [properties, setProperties] = useState<GithubProperty[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<ProgressStatus>("idle");
  const [proof, setProof] = useState<ProveSuccessResult | null>(null);
  const [profile, setProfile] = useState<GithubAttestedProfile | null>(null);
  const [profileWarning, setProfileWarning] = useState("");
  const [error, setError] = useState("");
  const [includeProfile, setIncludeProfile] = useState(true);
  const [includeWallet, setIncludeWallet] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [sharedPassport, setSharedPassport] = useState<ShareablePassport | null>(null);

  const selectedProperty = useMemo(
    () => properties.find((item) => item.identityPropertyId === selectedPropertyId),
    [properties, selectedPropertyId]
  );

  useEffect(() => {
    const fromUrl = readPassportFromUrl();
    if (fromUrl) setSharedPassport(fromUrl);
  }, []);

  async function connectWallet() {
    setError("");
    const ethereum = getEthereum();
    if (!ethereum) {
      setError("MetaMask was not detected. Install MetaMask or use a browser with an injected EVM wallet.");
      return;
    }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !accounts[0]) {
        throw new Error("Your wallet did not return an account.");
      }
      setWalletAddress(accounts[0]);
    } catch (walletError) {
      setError(formatError(walletError));
    }
  }

  async function loadGithubProperties() {
    setError("");
    setShareMessage("");
    setLoadingProperties(true);
    try {
      const client = new BnbZkIdClient();
      clientRef.current = client;
      const initialized = await client.init({ appId: APP_ID });
      const rows = discoverGithubProperties(initialized.providers);
      if (rows.length === 0) {
        throw new Error("Primus did not return an enabled GitHub identity property for this App ID. No fallback or guessed property will be used.");
      }
      setProperties(rows);
      setSelectedPropertyId((current) =>
        rows.some((row) => row.identityPropertyId === current)
          ? current
          : rows[0].identityPropertyId
      );
    } catch (loadError) {
      setProperties([]);
      setSelectedPropertyId("");
      setError(formatError(loadError));
    } finally {
      setLoadingProperties(false);
    }
  }

  async function runPrimusProof() {
    if (!walletAddress) {
      setError("Connect your EVM wallet before starting the Primus proof.");
      return;
    }
    if (!selectedProperty) {
      setError("Load the live Primus GitHub properties and select one first.");
      return;
    }

    setError("");
    setProfileWarning("");
    setShareMessage("");
    setProof(null);
    setProfile(null);
    setRunning(true);
    setStatus("initializing");

    try {
      const client = clientRef.current || new BnbZkIdClient();
      clientRef.current = client;

      const initialized = await client.init({ appId: APP_ID });
      const liveRows = discoverGithubProperties(initialized.providers);
      const liveSelection = liveRows.find(
        (row) => row.identityPropertyId === selectedProperty.identityPropertyId
      );
      if (!liveSelection) {
        throw new Error("The selected GitHub property is no longer enabled in Primus Gateway configuration. Reload properties and try again.");
      }

      const result = await client.prove(
        {
          clientRequestId: "github-builder-passport-" + Date.now(),
          userAddress: walletAddress,
          identityPropertyId: liveSelection.identityPropertyId
        },
        {
          onProgress(event) {
            setStatus(event.status as ProgressStatus);
          }
        }
      );

      if (result.status !== "on_chain_attested") {
        throw new Error("Primus did not return an on-chain attested result. No passport was created.");
      }

      setProof(result);
      setStatus("on_chain_attested");

      try {
        const attestedProfile = await readGithubAttestedProfile(result);
        setProfile(attestedProfile);
      } catch (readError) {
        setProfileWarning(
          "Primus attested the selected GitHub property, but this app could not decode its registry payload: " +
          formatError(readError)
        );
      }
    } catch (proofError) {
      setStatus("failed");
      setProof(null);
      setProfile(null);
      setError(formatError(proofError));
    } finally {
      setRunning(false);
    }
  }

  async function sharePassport() {
    if (!proof || proof.status !== "on_chain_attested") return;
    if (!proof.proofRequestId) {
      setError("Primus did not return a proof request ID. This result cannot be independently checked by a recipient, so a shareable passport was not created.");
      return;
    }

    const passport: ShareablePassport = {
      version: 1,
      issuer: "Primus BNB ZKID",
      title: "GitHub Builder Passport",
      status: "on_chain_attested",
      issuedAt: new Date().toISOString(),
      providerId: proof.providerId,
      identityPropertyId: proof.identityPropertyId,
      proofRequestId: proof.proofRequestId,
      ...(includeWallet ? { walletAddress: proof.walletAddress } : {}),
      ...(includeProfile && profile ? { profile } : {})
    };

    try {
      await navigator.clipboard.writeText(makePassportUrl(passport));
      setShareMessage("Passport link copied. Recipients must check the proof with Primus before relying on its claims.");
    } catch {
      setError("Clipboard access failed. Open this application over HTTPS and try again.");
    }
  }

  if (sharedPassport) {
    return <SharedPassportView passport={sharedPassport} />;
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>PRIMUS <b>BUILDER ID</b></span>
        </a>
        <span className="network-pill"><i /> ZK ID · GitHub</span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> BUILDER IDENTITY, PROVEN</p>
          <h1>Your work speaks.<br /><span>Proof makes it portable.</span></h1>
          <p className="hero-subtitle">
            Create a verifiable GitHub Builder Passport. GitHub credentials only appear as verified after Primus completes its zkTLS and BNB ZKID proof flow.
          </p>
          <div className="hero-points">
            <span><b>✓</b> Primus proof only</span>
            <span><b>✓</b> Selective sharing</span>
            <span><b>✓</b> On-chain reference</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-ring art-ring-one" />
          <div className="art-ring art-ring-two" />
          <div className="art-card">
            <span className="art-spark">✳</span>
            <span className="art-card-label">BUILDER PASSPORT</span>
            <div className="art-avatar">GH</div>
            <div className="art-lines"><i /><i /><i /></div>
            <div className="art-proof"><span>✓</span> PRIMUS VERIFIED</div>
          </div>
          <span className="float-chip chip-one">zkTLS</span>
          <span className="float-chip chip-two">ZK ID</span>
        </div>
      </section>

      <section className="workspace">
        <div className="section-heading">
          <div><p className="eyebrow">START HERE</p><h2>Build your passport</h2></div>
          <span className="step-count">01 / 03</span>
        </div>

        <div className="flow-grid">
          <article className="panel setup-panel">
            <div className="panel-top">
              <span className="panel-icon">01</span>
              <div><h3>Connect your identity</h3><p>Connect a wallet address for the BNB ZKID proof request.</p></div>
            </div>
            {walletAddress ? (
              <div className="connected-wallet">
                <span className="online-dot" />
                <div><b>Wallet connected</b><small>{shortAddress(walletAddress)}</small></div>
                <button className="text-button" onClick={() => setWalletAddress("")}>Disconnect</button>
              </div>
            ) : (
              <button className="button button-secondary full-button" onClick={connectWallet}>Connect MetaMask <span>↗</span></button>
            )}
            <div className="hint-box">No seed phrase or private key is requested. The wallet address is used as the identity reference for Primus.</div>
          </article>

          <article className="panel setup-panel">
            <div className="panel-top">
              <span className="panel-icon">02</span>
              <div><h3>Load Primus properties</h3><p>Read the live GitHub identity properties enabled for this app.</p></div>
            </div>
            <button className="button button-secondary full-button" onClick={loadGithubProperties} disabled={loadingProperties}>
              {loadingProperties ? <><span className="spinner" /> Loading properties</> : "Discover GitHub properties"}
            </button>
            {properties.length > 0 ? (
              <div className="property-selector">
                <label htmlFor="property">Primus GitHub property</label>
                <select id="property" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)}>
                  {properties.map((property) => (
                    <option key={property.identityPropertyId} value={property.identityPropertyId}>
                      {property.description}
                    </option>
                  ))}
                </select>
                <small>Source: live Primus Gateway configuration</small>
              </div>
            ) : (
              <div className="hint-box">The GitHub option will appear here only when the Primus App ID exposes it.</div>
            )}
          </article>
        </div>

        <article className="panel prove-panel">
          <div className="prove-head">
            <div className="panel-top">
              <span className="panel-icon panel-icon-bright">03</span>
              <div><h3>Generate your Primus proof</h3><p>Sign in to GitHub in this browser, enable the Primus extension, then run the proof.</p></div>
            </div>
            <a className="extension-link" href={PRIMUS_EXTENSION_URL} target="_blank" rel="noreferrer">Primus extension ↗</a>
          </div>
          <div className="proof-warning">
            <span>i</span>
            <p>GitHub login happens on GitHub's own page through the Primus extension. Never enter your GitHub password, cookies or access token into this app.</p>
          </div>
          <button className="button button-primary full-button" onClick={runPrimusProof} disabled={running || !walletAddress || !selectedProperty}>
            {running ? <><span className="spinner spinner-dark" /> Verifying with Primus</> : "Verify GitHub with Primus"}
            {!running && <span>→</span>}
          </button>
          <div className="status-block">
            <div className="status-top"><span className="status-indicator" data-status={status} /> <b>{statusLabel(status)}</b>{running && <span className="status-live">LIVE</span>}</div>
            <div className="progress-track"><i data-status={status} /></div>
            <div className="status-steps">
              <span className={["initializing","data_verifying","proof_generating","on_chain_attested"].includes(status) ? "active" : ""}>Initialize</span>
              <span className={["data_verifying","proof_generating","on_chain_attested"].includes(status) ? "active" : ""}>zkTLS verify</span>
              <span className={["proof_generating","on_chain_attested"].includes(status) ? "active" : ""}>ZK proof</span>
              <span className={status === "on_chain_attested" ? "active" : ""}>Attested</span>
            </div>
          </div>
        </article>

        {error && <div className="alert alert-error"><b>Could not continue</b><span>{error}</span></div>}

        {proof && proof.status === "on_chain_attested" && (
          <section className="result-section">
            <div className="section-heading">
              <div><p className="eyebrow">PROOF COMPLETE</p><h2>Your verified credential</h2></div>
              <span className="verified-tag large-tag">✓ PRIMUS ATTESTED</span>
            </div>
            <article className="panel result-panel">
              <div className="result-summary">
                <div className="result-icon">✓</div>
                <div><h3>GitHub identity proof</h3><p>Primus returned on-chain attestation for this property.</p></div>
              </div>
              <div className="result-data">
                <div><small>PROPERTY</small><b>{proof.identityPropertyId}</b></div>
                <div><small>PROVIDER</small><b>{proof.providerId}</b></div>
                <div><small>PROOF REQUEST</small><b>{proof.proofRequestId || "Not returned"}</b></div>
                <div><small>WALLET</small><b>{shortAddress(proof.walletAddress)}</b></div>
              </div>
              {profile ? (
                <div className="decoded-profile">
                  <p className="eyebrow">DECODED FROM PRIMUS REGISTRY PAYLOAD</p>
                  <div className="profile-stats">
                    <div><small>ACCOUNT EARLIEST YEAR</small><strong>{profile.accountEarliestYear}</strong></div>
                    <div><small>CONTRIBUTIONS · LAST YEAR</small><strong>{profile.contributionsLastYear}</strong></div>
                  </div>
                  <small className="registry-note">BNB Smart Chain testnet · registry timestamp {profile.registryTimestamp}</small>
                </div>
              ) : (
                <div className="hint-box">{profileWarning || "The Primus proof is attested. Profile values have not been decoded."}</div>
              )}
              <div className="share-controls">
                <p className="eyebrow">SELECTIVE SHARING</p>
                <label className="check-row"><input type="checkbox" checked={includeProfile} onChange={(event) => setIncludeProfile(event.target.checked)} disabled={!profile} /><span><b>Include decoded GitHub profile fields</b><small>Account year and last-year contribution figure</small></span></label>
                <label className="check-row"><input type="checkbox" checked={includeWallet} onChange={(event) => setIncludeWallet(event.target.checked)} /><span><b>Include wallet address</b><small>Off by default; wallet addresses may be publicly linkable</small></span></label>
                <button className="button button-primary full-button" onClick={sharePassport} disabled={!proof.proofRequestId}>Copy shareable Builder Passport <span>↗</span></button>
                {!proof.proofRequestId && <p className="share-warning">Primus did not return a proof reference, so independent sharing is disabled.</p>}
                {shareMessage && <p className="share-success">{shareMessage}</p>}
              </div>
            </article>
          </section>
        )}
      </section>

      <footer className="footer">
        <div className="brand"><span className="brand-mark">P</span><span>PRIMUS <b>BUILDER ID</b></span></div>
        <p>Proof first. Reputation second.</p>
        <small>Development build · BNB ZKID demo registry</small>
      </footer>
    </main>
  );
}