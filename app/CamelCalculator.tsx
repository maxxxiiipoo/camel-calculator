"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { track } from "@vercel/analytics";
import { LOCAL_MODEL, MARKET_CONFIG, UPLOAD_LIMITS, VISUAL_RUBRIC, type VisualCategory, type VisualObservation } from "../lib/config";
import { herdEconomics, nonlinearFit, scoreObservation } from "../lib/scoring";

type Stage = "landing" | "consent" | "upload" | "analyzing" | "reveal" | "result";
type Motion = "full" | "reduced" | "off";
type Photo = { id: string; url: string; dataUrl: string; rotation: number; zoom: number };
type ObserverPhase = "idle" | "downloading" | "loading" | "analyzing";

const labels: Record<VisualCategory, string> = { face: "Face & harmony", body: "Body proportions", hair: "Hair", style: "Style", coherence: "Visual coherence" };
const money = (value: number, currency: "USD" | "SAR") => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
const describeTrait = (value: string) => value === "not_visible" || value === "unknown"
  ? "Not visible"
  : value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
const describeMatch = (value: string, preferred: string) => {
  if (value === "not_visible" || value === "unknown") return "Not visible";
  const fit = nonlinearFit(value, preferred);
  return fit >= 0.9 ? "Strong preference match" : fit >= 0.6 ? "Partial preference match" : "Different from configured preference";
};

function Camel({ className = "", gold = false }: { className?: string; gold?: boolean }) {
  return <span className={`camel ${gold ? "gold" : ""} ${className}`} aria-hidden="true"><i className="camel-neck" /><i className="camel-head" /><i className="camel-ear" /><i className="camel-body" /><i className="hump one" /><i className="hump two" /><i className="leg a" /><i className="leg b" /><i className="leg c" /><i className="leg d" /><i className="tail" /></span>;
}

function DesertScene() {
  return <div className="desert-scene" aria-hidden="true"><div className="sun" /><div className="cloud c1" /><div className="cloud c2" /><div className="stars">✦ · ✧ · ✦ · ✧</div><div className="dune back" /><div className="dune front" /><div className="caravan"><Camel /><Camel className="delay1" /><Camel className="delay2" /></div></div>;
}

async function sanitizeImage(file: File, rotation = 0, zoom = 1) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sig = (file.type === "image/jpeg" && header[0] === 0xff && header[1] === 0xd8) ||
    (file.type === "image/png" && header[0] === 137 && header[1] === 80) ||
    (file.type === "image/webp" && String.fromCharCode(...header.slice(0, 4)) === "RIFF");
  if (!UPLOAD_LIMITS.acceptedMimeTypes.includes(file.type as never) || !sig || file.size > UPLOAD_LIMITS.maxBytes) throw new Error("Use a genuine JPEG, PNG, or WebP under 8 MB.");
  const bitmap = await createImageBitmap(file);
  if (bitmap.width > UPLOAD_LIMITS.maxDimension || bitmap.height > UPLOAD_LIMITS.maxDimension) throw new Error("That image is too large. Maximum dimensions are 4096 × 4096.");
  const max = 1440;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const swap = Math.abs(rotation % 180) === 90;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((swap ? bitmap.height : bitmap.width) * scale);
  canvas.height = Math.round((swap ? bitmap.width : bitmap.height) * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f3dfb3"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180); ctx.scale(zoom, zoom);
  ctx.drawImage(bitmap, -bitmap.width * scale / 2, -bitmap.height * scale / 2, bitmap.width * scale, bitmap.height * scale);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.86);
}

function sanitizedDataUrlToFile(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:image/jpeg;base64,")) {
    throw new Error("The prepared photograph is invalid. Remove it and upload it again.");
  }
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new File([bytes], "sanitized.jpg", { type: "image/jpeg" });
}

export default function CamelCalculator() {
  const [stage, setStage] = useState<Stage>("landing");
  const [motion, setMotion] = useState<Motion>(() =>
    typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full",
  );
  const [consents, setConsents] = useState([false, false, false, false, false, false]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState(0);
  const [observerPhase, setObserverPhase] = useState<ObserverPhase>("idle");
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [downloadTotal, setDownloadTotal] = useState(LOCAL_MODEL.estimatedDownloadBytes);
  const [backend, setBackend] = useState<"webgpu" | "wasm">("wasm");
  const [modelCached, setModelCached] = useState(false);
  const [metrics, setMetrics] = useState<{ analysisMs: number; backend: string } | null>(null);
  const [error, setError] = useState("");
  const [observation, setObservation] = useState<VisualObservation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const backendRef = useRef<"webgpu" | "wasm">("wasm");
  const preparedRef = useRef<string[]>([]);
  const progressRef = useRef(new Map<string, { loaded: number; total: number }>());
  const trackedResultRef = useRef<string | null>(null);
  const result = useMemo(() => observation ? scoreObservation(observation) : null, [observation]);
  const economics = result ? herdEconomics(result.camels) : null;
  const analyticsConsent = consents[5];

  useEffect(() => { document.documentElement.dataset.motion = motion; }, [motion]);
  useEffect(() => () => workerRef.current?.terminate(), []);
  useEffect(() => {
    if (!analyticsConsent || !result || stage !== "result") return;
    const resultKey = `${result.camels}:${result.tier.title}:${photos.length}`;
    if (trackedResultRef.current === resultKey) return;
    trackedResultRef.current = resultKey;
    const band = (value: number | null) => value == null ? "not_visible" : `${Math.floor(value / 10) * 10}-${Math.floor(value / 10) * 10 + 9}`;
    track("camel_result", {
      camel_band: `${Math.floor(result.camels / 10) * 10}-${Math.floor(result.camels / 10) * 10 + 9}`,
      tier: result.tier.title,
      face_score_band: band(result.categoryScores.face),
      body_score_band: band(result.categoryScores.body),
      photo_count: photos.length,
      observer_backend: metrics?.backend ?? backend,
    });
  }, [analyticsConsent, backend, metrics?.backend, photos.length, result, stage]);
  useEffect(() => {
    if (stage === "upload" && "caches" in window) {
      caches.has("transformers-cache").then(setModelCached);
    }
  }, [stage]);

  function createObserverWorker() {
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./local-observer.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === "phase") setObserverPhase(message.phase);
      if (message.type === "progress") {
        const item = message.event;
        if (item.status === "progress" && typeof item.loaded === "number") {
          progressRef.current.set(item.file ?? crypto.randomUUID(), { loaded: item.loaded, total: item.total ?? 0 });
          const values = [...progressRef.current.values()];
          setDownloadedBytes(values.reduce((sum, value) => sum + value.loaded, 0));
          const total = values.reduce((sum, value) => sum + value.total, 0);
          if (total > 0) setDownloadTotal(total);
        }
      }
      if (message.type === "ready") {
        backendRef.current = message.backend;
        setBackend(message.backend);
        setModelCached(true);
        worker.postMessage({ type: "analyze", images: preparedRef.current });
      }
      if (message.type === "photo") setStatus(message.index);
      if (message.type === "retry") setStatus(message.index);
      if (message.type === "complete") {
        const value = message.observation as VisualObservation;
        setMetrics(message.metrics);
        if (!value.evidence.appropriate || value.evidence.adultConfidence < VISUAL_RUBRIC.minimumAdultConfidence) {
          setError("The photo appears to contain no person or explicit content. No score was produced. Try a different appropriate photo.");
          setStage("upload");
          return;
        }
        setObservation(value);
        setStage(motion === "off" ? "result" : "reveal");
      }
      if (message.type === "cache-status") setModelCached(Boolean(message.cached));
      if (message.type === "cache-cleared") setModelCached(false);
      if (message.type === "error") {
        if (backendRef.current === "webgpu") {
          backendRef.current = "wasm";
          setBackend("wasm");
          setObserverPhase("loading");
          createObserverWorker().postMessage({ type: "load", device: "wasm" });
          return;
        }
        setError(message.message || "Local analysis failed. Try again or use a clearer photograph.");
        setStage("upload");
      }
    };
    worker.onerror = () => {
      setError("This device could not start the private local observer.");
      setStage("upload");
    };
    return worker;
  }

  async function addFiles(files: FileList | File[]) {
    setError("");
    const selected = Array.from(files).slice(0, UPLOAD_LIMITS.maxFiles - photos.length);
    try {
      const added = await Promise.all(selected.map(async (file) => {
        const dataUrl = await sanitizeImage(file);
        return { id: crypto.randomUUID(), url: dataUrl, dataUrl, rotation: 0, zoom: 1 };
      }));
      setPhotos((existing) => [...existing, ...added]);
    } catch (e) { setError(e instanceof Error ? e.message : "That photograph could not be prepared."); }
  }
  function removePhoto(id: string) { setPhotos((items) => items.filter((p) => p.id !== id)); }
  async function rotatePhoto(photo: Photo) {
    const file = sanitizedDataUrlToFile(photo.dataUrl);
    const rotation = (photo.rotation + 90) % 360; const dataUrl = await sanitizeImage(file, 90);
    setPhotos((items) => items.map((p) => p.id === photo.id ? { ...p, rotation, dataUrl, url: dataUrl } : p));
  }
  function deletePhotos() {
    workerRef.current?.postMessage({ type: "cancel" });
    preparedRef.current = [];
    setPhotos([]); setObservation(null); setError(""); setStage("upload");
  }
  function restart() {
    preparedRef.current = [];
    setPhotos([]); setObservation(null); setError(""); setName(""); setConsents([false, false, false, false, false, false]); trackedResultRef.current = null; setStage("landing");
  }

  async function analyze() {
    setStage("analyzing"); setStatus(0); setError(""); setObserverPhase("downloading");
    setDownloadedBytes(0); progressRef.current.clear();
    try {
      preparedRef.current = await Promise.all(photos.map(async (photo) => {
        const file = sanitizedDataUrlToFile(photo.dataUrl);
        return sanitizeImage(file, 0, photo.zoom);
      }));
      const capability = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> }; deviceMemory?: number };
      const canWebGpu = Boolean(capability.gpu && (capability.deviceMemory == null || capability.deviceMemory >= 4));
      const selectedBackend = canWebGpu ? "webgpu" : "wasm";
      backendRef.current = selectedBackend;
      setBackend(selectedBackend);
      createObserverWorker().postMessage({ type: "load", device: selectedBackend });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed."); setStage("upload");
    }
  }
  function cancelAnalysis() {
    workerRef.current?.postMessage({ type: "cancel" });
    workerRef.current?.terminate();
    workerRef.current = null;
    setError("Local analysis was cancelled. Partially downloaded files may remain cached.");
    setStage("upload");
  }
  function removeDownloadedModel() {
    const worker = workerRef.current ?? createObserverWorker();
    worker.postMessage({ type: "clear-cache" });
  }
  function downloadCard() {
    if (!result) return;
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 630;
    const ctx = canvas.getContext("2d")!; const grad = ctx.createLinearGradient(0, 0, 1200, 630);
    grad.addColorStop(0, "#101a38"); grad.addColorStop(1, "#8d3f2f"); ctx.fillStyle = grad; ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = "#e7b95f"; ctx.font = "700 28px Georgia"; ctx.fillText("CAMEL CALCULATOR · VISUAL EDITION", 65, 75);
    ctx.fillStyle = "#fff8e8"; ctx.font = "700 44px Georgia"; ctx.fillText(name || "MYSTERIOUS TRAVELER", 65, 150);
    ctx.font = "700 190px Georgia"; ctx.fillText(String(result.camels), 60, 375); ctx.font = "700 34px Georgia"; ctx.fillText("FICTIONAL WORKING CAMELS", 420, 275);
    ctx.fillStyle = "#e7b95f"; ctx.font = "italic 42px Georgia"; ctx.fillText(result.tier.title, 420, 335);
    ctx.fillStyle = "#fff8e8"; ctx.font = "22px Arial"; ctx.fillText(`Analysis confidence: ${Math.round(result.confidence * 100)}%`, 420, 390);
    ctx.font = "18px Arial"; ctx.fillText("FICTIONAL ENTERTAINMENT FOR CONSENTING ADULTS · PHOTO NOT INCLUDED", 65, 585);
    const a = document.createElement("a"); a.download = "camel-calculator-result.png"; a.href = canvas.toDataURL("image/png"); a.click();
  }

  return <main>
    {analyticsConsent && <Analytics />}
    <div className="settings"><select aria-label="Motion preference" value={motion} onChange={(e) => setMotion(e.target.value as Motion)}><option value="full">Full motion</option><option value="reduced">Reduced motion</option><option value="off">Motion off</option></select></div>
    {(stage === "landing" || stage === "consent") && <DesertScene />}
    {stage === "landing" && <section className="hero"><span className="eyebrow">THE INTERNET’S LEAST NECESSARY VISUAL ANALYSIS</span><h1>Camel<br /><em>Calculator</em></h1><p className="lead">Upload one to three appropriate photos. The caravan observes visible traits. Your private rubric counts the fictional camels.</p><button className="primary stampede" onClick={() => setStage("consent")}>Upload & Calculate <span>→</span></button><p className="micro">Adults only · no face recognition · no permanent photo storage · zero science</p></section>}

    {stage === "consent" && <section className="panel compact consent-photo"><span className="eyebrow">PHOTO RIGHTS CHECKPOINT</span><h2>Adults. Permission. Appropriate photos.</h2><p>Only upload photos of adults who are in on the joke.</p>
      {[
        "Every person shown is at least 18 years old.",
        "I am the person shown or have that person’s permission.",
        "The image is not intimate, explicit, private, or deceptive.",
        "The result is fictional entertainment.",
        "I understand that a person’s real worth cannot be calculated.",
        "I agree to anonymous usage and result-band analytics. Page activity, photo count, broad score bands, and the fictional result tier may be recorded to improve Camel Calculator. Photos, filenames, nickname, and raw visual observations are never included.",
      ].map((copy, i) => <label className="check" key={copy}><input type="checkbox" checked={consents[i]} onChange={(e) => setConsents((c) => c.map((v, x) => x === i ? e.target.checked : v))} /><span><strong>{copy}</strong></span></label>)}
      <button className="primary" disabled={!consents.every(Boolean)} onClick={() => setStage("upload")}>Choose photographs →</button>
    </section>}

    {stage === "upload" && <section className="upload-page"><header><span className="eyebrow">VISUAL EVIDENCE · 1–3 PHOTOS</span><h1>Give the caravan<br /><em>a clear view.</em></h1><p>A face photo is best. A front or three-quarter full-body photo improves coverage. A third angle is optional—more photos never add points.</p></header>
      <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}>
        <Camel /><strong>{photos.length ? "Add another angle" : "Drop photographs into the desert"}</strong><span>or tap to choose from your device</span><small>JPEG, PNG, WebP · 8 MB each · up to 4096 px</small>
        <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>
      <aside className="privacy-note"><strong>☾ Private local analysis: your photo never leaves this device.</strong><p>Photos are re-encoded to strip metadata and analyzed inside a Web Worker. No image is sent to Camel Calculator, Vercel, an inference API, analytics, or a database. The first analysis downloads the open-source observer once (about {Math.round(LOCAL_MODEL.estimatedDownloadBytes / 1024 / 1024)} MB) and caches it in this browser.</p></aside>
      {photos.length > 0 && <div className="photo-grid">{photos.map((photo, i) => <article className="photo-card" key={photo.id}><div className="photo-frame"><img src={photo.url} alt={`Selected photograph ${i + 1}`} style={{ transform: `scale(${photo.zoom})` }} /></div><div><strong>VIEW {i + 1}</strong><button onClick={() => rotatePhoto(photo)}>↻ Rotate</button><label>Crop <input aria-label={`Crop photo ${i + 1}`} type="range" min="1" max="1.6" step=".1" value={photo.zoom} onChange={(e) => setPhotos((items) => items.map((p) => p.id === photo.id ? { ...p, zoom: Number(e.target.value) } : p))} /></label><button onClick={() => removePhoto(photo.id)}>Remove</button></div></article>)}</div>}
      {error && <div className="error" role="alert">{error}</div>}
      <label className="field nickname"><span>Nickname <em>optional</em></span><input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="The Oasis Enigma" /></label>
      <div className="model-facts"><span><strong>{LOCAL_MODEL.id.split("/")[1]}</strong> · q4 · {LOCAL_MODEL.license}</span><small>{modelCached ? "Observer cached for repeat visits." : `First-run download: approximately ${Math.round(LOCAL_MODEL.estimatedDownloadBytes / 1024 / 1024)} MB.`}</small>{modelCached && <button className="text-button danger" onClick={removeDownloadedModel}>Remove downloaded model</button>}</div>
      <div className="actions"><button className="text-button danger" disabled={!photos.length} onClick={deletePhotos}>Delete my photos</button><button className="primary" disabled={!photos.length} onClick={analyze}>Analyze {photos.length || ""} photo{photos.length === 1 ? "" : "s"} locally →</button></div>
    </section>}

    {stage === "analyzing" && <section className="analysis-stage"><div className="analysis-camels"><div className="inspector"><span className="spectacles">◉ ◉</span><Camel /><i>CLIPBOARD</i></div><div className="rope-camel"><Camel /><span>〰 〰</span></div></div><div className="floating-photos">{photos.map((p) => <img key={p.id} src={p.url} alt="" />)}</div><div className="road-sign">{observerPhase === "downloading" ? "Downloading observer" : observerPhase === "loading" ? "Loading observer" : `Analyzing photo ${status + 1} of ${photos.length}`}</div>{observerPhase === "downloading" && <><div className="analysis-progress" aria-label={`${Math.round(downloadedBytes / Math.max(downloadTotal, 1) * 100)}% downloaded`}><i style={{ width: `${Math.min(100, downloadedBytes / Math.max(downloadTotal, 1) * 100)}%` }} /></div><strong>{Math.round(downloadedBytes / 1024 / 1024)} / {Math.round(downloadTotal / 1024 / 1024)} MB</strong><small>Downloaded once and cached by your browser.</small></>}<p>Using {backend === "webgpu" ? "WebGPU acceleration" : "WebAssembly fallback"}. Observation and deterministic scoring remain separate.</p><button className="secondary" onClick={cancelAnalysis}>Cancel</button></section>}

    {stage === "reveal" && result && <section className="reveal"><div className="sandstorm" /><p>THE HERD HAS BEEN CALCULATED</p><div className="rolling-count">{result.camels}</div><Camel className="hero-camel" gold={result.camels >= 180} /><div className="reveal-herd">{Array.from({ length: Math.min(12, Math.ceil(result.camels / 15)) }).map((_, i) => <Camel key={i} gold={result.camels >= 180 && i === 5} />)}</div><button className="primary reveal-button" onClick={() => setStage("result")}>See the desert ledger →</button></section>}

    {stage === "result" && result && observation && economics && <section className="result"><div className="result-hero"><span className="eyebrow">VISIBLE-APPEARANCE ENTERTAINMENT RESULT</span><p>{name || "This mysterious traveler"} scored</p><div className="big-number">{result.camels}</div><h1>fictional working camels</h1><h2>{result.tier.title}</h2><p className="result-message">People are not property. This is a subjective visual joke, not a real valuation.</p><Camel className="result-camel" gold={result.camels >= 180} /></div>
      <div className="split-ledgers">
        <article><span className="card-label">FACE-ONLY LEDGER</span>{result.faceCamels == null ? <><strong className="unseen">Not visible</strong><p>No face penalty. The final herd was reweighted to the visible categories.</p></> : <><strong>{result.faceCamels}<small> camels</small></strong><p>A separate estimate from the visible face—not a share of the final herd.</p></>}{[
          ["Facial symmetry", observation.face.apparentSymmetry.value, VISUAL_RUBRIC.preferences.apparentSymmetry],
          ["Feature balance", observation.face.featureBalance.value, VISUAL_RUBRIC.preferences.featureBalance],
          ["Expression", observation.face.expression.value, VISUAL_RUBRIC.preferences.expression],
          ["Eye presentation", observation.face.eyeAppearance.value, VISUAL_RUBRIC.preferences.eyeAppearance],
          ["Hair presentation", observation.hair.presentation.value, "prominent"],
        ].map(([label, value, preferred]) => <div key={label}><span>{label}<small>{describeTrait(value)}</small></span><b>{describeMatch(value, preferred)}</b></div>)}</article>
        <article><span className="card-label">BODY-ONLY LEDGER</span>{result.bodyCamels == null ? <><strong className="unseen">Not visible</strong><p>No body penalty. The final herd was reweighted to the visible categories.</p></> : <><strong>{result.bodyCamels}<small> camels</small></strong><p>A separate estimate from visible proportions—not a share of the final herd.</p></>}{[
          ["Build", observation.physique.build.value, VISUAL_RUBRIC.preferences.build],
          ["Waist definition", observation.physique.waistDefinition.value, VISUAL_RUBRIC.preferences.waistDefinition],
          ["Chest prominence", observation.physique.chestProminence.value, VISUAL_RUBRIC.preferences.chestProminence],
          ["Hip prominence", observation.physique.hipProminence.value, VISUAL_RUBRIC.preferences.hipProminence],
          ["Glute prominence", observation.physique.gluteProminence.value, VISUAL_RUBRIC.preferences.gluteProminence],
          ["Proportional balance", observation.physique.proportionalBalance.value, VISUAL_RUBRIC.preferences.proportionalBalance],
          ["Posture", observation.physique.posture.value, VISUAL_RUBRIC.preferences.posture],
        ].map(([label, value, preferred]) => <div key={label}><span>{label}<small>{describeTrait(value)}</small></span><b>{describeMatch(value, preferred)}</b></div>)}</article>
      </div>
      <div className="result-grid"><article className="score-card"><span className="card-label">COMBINED VISIBLE TRAIT BREAKDOWN</span><h3>How the final herd was built</h3>{(Object.keys(labels) as VisualCategory[]).map((key) => <div className="bar" key={key}><div><span>{labels[key]}</span><strong>{result.categoryScores[key] == null ? "Not visible" : Math.round(result.categoryScores[key]!)}</strong></div><i><b style={{ width: `${result.categoryScores[key] ?? 0}%` }} /></i></div>)}<div className="confidence"><strong>Analysis confidence</strong><span>{Math.round(result.confidence * 100)}% · {result.confidence >= .8 ? "High" : "Moderate"}</span></div>{result.missingTraits.length > 0 && <p className="missing"><strong>Could not assess:</strong> {result.missingTraits.join(", ")}</p>}<details><summary>Why this result?</summary><p>The face-led rubric emphasizes visible facial harmony, feature balance, eye presentation, smile, hair presentation, grooming, and overall proportions. Hair color is descriptive only and never adds or removes points. Missing categories are removed and the remaining weights are redistributed. The final conversion uses a steep nonlinear curve: ordinary scores produce modest herds, while 100-plus camels are reserved for stronger profiles. Evidence confidence affects the score, while photo quality itself is never treated as attractiveness.</p></details></article>
      <article className="economics"><span className="card-label">IMAGINARY HERD ECONOMICS</span><h3>Ordinary working dromedaries</h3>{[["Low", economics.low, economics.lowSar],["Reference", economics.reference, economics.referenceSar],["High", economics.high, economics.highSar]].map(([l,u,s]) => <div className="money-row" key={String(l)}><span>{l} estimate</span><strong>{money(Number(u),"USD")}<small>{money(Number(s),"SAR")}</small></strong></div>)}<p className="market-note">{MARKET_CONFIG.market} · {MARKET_CONFIG.assumptionVersion}. Illustrative only. Racing, breeding, festival, and prize-winning camels may fall far outside this ordinary working-camel range.</p></article></div>
      {metrics && <p className="local-metrics">Local observer: {metrics.backend.toUpperCase()} · analysis {(metrics.analysisMs / 1000).toFixed(1)}s · images never left this device</p>}
      <div className="result-actions"><button className="secondary" onClick={downloadCard}>↓ Download privacy-safe card</button><button className="text-button danger" onClick={deletePhotos}>Delete my photos</button><button className="text-button" onClick={restart}>Start over</button></div>
    </section>}
    <footer><strong>Camel Calculator</strong><p>Fictional entertainment for consenting adults. Private local analysis; photos never leave the device. No face recognition. No claims about health, fertility, personality, ethnicity, intelligence, maternal ability, or childbirth.</p></footer>
  </main>;
}
