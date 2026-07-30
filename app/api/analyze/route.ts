import { NextResponse } from "next/server";
import { validateImageHeader } from "../../../lib/image";
import { reconcileObservations } from "../../../lib/reconcile";
import { VISUAL_RUBRIC, type VisualObservation } from "../../../lib/config";

export const runtime = "nodejs";
const attempts = new Map<string, { count: number; reset: number }>();

const OBSERVATION_PROMPT = `You are a conservative visual observation component for an adults-only fictional entertainment app.
Observe only clearly visible, non-sensitive appearance characteristics. Never identify a person or infer race, ethnicity, nationality, religion, health, disability, pregnancy, fertility, sexual history, personality, intelligence, gender identity, sexual orientation, or socioeconomic status.
Never guess covered, cropped, blurred, dark, or obstructed traits. Use "not_visible". Use coarse labels only.
First assess whether the image clearly depicts an adult. If adulthood is uncertain, adultConfidence must be below 0.9. Do not estimate an age.
Mark appropriate=false for nudity, explicit sexual content, deceptive imagery, or an apparent minor.
Photo quality affects confidence only, never appearance scoring.
Return JSON only, exactly matching the requested shape. Trait values use: not_visible, low, moderate, prominent, very_prominent, or a short neutral snake_case visible descriptor where relevant. Confidence values are 0 to 1.
Shape:
{"face":{"visibility":TRAIT,"apparentSymmetry":TRAIT,"featureBalance":TRAIT,"expression":TRAIT,"eyeVisibility":TRAIT,"eyeAppearance":TRAIT},"hair":{"color":TRAIT,"length":TRAIT,"texture":TRAIT,"style":TRAIT,"presentation":TRAIT},"physique":{"visibility":TRAIT,"build":TRAIT,"waistDefinition":TRAIT,"chestProminence":TRAIT,"hipProminence":TRAIT,"gluteProminence":TRAIT,"proportionalBalance":TRAIT,"posture":TRAIT},"style":{"clothingPresentation":TRAIT,"grooming":TRAIT,"visualCoordination":TRAIT},"evidence":{"faceCoverage":NUMBER,"bodyCoverage":NUMBER,"obstruction":"not_visible|low|moderate|prominent|very_prominent","lightingAdequacy":"not_visible|low|moderate|prominent|very_prominent","blur":"not_visible|low|moderate|prominent|very_prominent","usableViews":1,"overallConfidence":NUMBER,"missingTraits":[STRING],"adultConfidence":NUMBER,"appropriate":BOOLEAN}}
TRAIT is {"value":STRING,"confidence":NUMBER,"note":STRING}.`;

function decodeDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { mime: match[1], bytes: Buffer.from(match[2], "base64"), dataUrl: value };
}

function validObservation(value: unknown): value is VisualObservation {
  const v = value as VisualObservation;
  return Boolean(v?.face?.visibility && v?.physique?.visibility && v?.hair?.color && v?.style?.grooming && v?.evidence && typeof v.evidence.overallConfidence === "number");
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
    const now = Date.now();
    const current = attempts.get(ip);
    if (current && current.reset > now && current.count >= 8) return NextResponse.json({ error: "Too many caravan consultations. Please try again later." }, { status: 429 });
    attempts.set(ip, current?.reset && current.reset > now ? { ...current, count: current.count + 1 } : { count: 1, reset: now + 60 * 60 * 1000 });

    const body = await request.json() as { images?: string[] };
    if (!body.images?.length || body.images.length > 3) return NextResponse.json({ error: "Upload between one and three photographs." }, { status: 400 });
    const images = body.images.map(decodeDataUrl);
    if (images.some((image) => !image || image.bytes.length > 3_500_000 || !validateImageHeader(image.bytes.subarray(0, 16), image.mime))) {
      return NextResponse.json({ error: "One photograph could not be safely validated." }, { status: 400 });
    }
    const key = process.env.OPENAI_API_KEY;
    if (!key) return NextResponse.json({ error: "The caravan’s visual observer is not configured yet." }, { status: 503 });

    const observations: VisualObservation[] = [];
    for (const image of images) {
      const moderation = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "omni-moderation-latest", input: [{ type: "image_url", image_url: { url: image!.dataUrl } }] }),
      });
      if (!moderation.ok) return NextResponse.json({ error: "The photograph could not be safely reviewed." }, { status: 422 });
      const moderationJson = await moderation.json() as { results?: { flagged: boolean }[] };
      if (moderationJson.results?.[0]?.flagged) return NextResponse.json({ error: "Please use a non-explicit, appropriate photograph of a consenting adult." }, { status: 422 });

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-5.6",
          store: false,
          input: [{ role: "user", content: [{ type: "input_text", text: OBSERVATION_PROMPT }, { type: "input_image", image_url: image!.dataUrl, detail: "high" }] }],
          text: { format: { type: "json_object" } },
        }),
      });
      if (!response.ok) return NextResponse.json({ error: "The caravan could not complete the observation. Please try again." }, { status: 502 });
      const json = await response.json() as { output_text?: string; output?: { content?: { text?: string }[] }[] };
      const text = json.output_text ?? json.output?.flatMap((o) => o.content ?? []).find((c) => c.text)?.text;
      const parsed = text ? JSON.parse(text) : null;
      if (!validObservation(parsed)) return NextResponse.json({ error: "The photograph did not provide a reliable observation." }, { status: 422 });
      observations.push(parsed);
    }
    const observation = reconcileObservations(observations);
    if (!observation.evidence.appropriate || observation.evidence.adultConfidence < VISUAL_RUBRIC.minimumAdultConfidence) {
      return NextResponse.json({ error: "We can’t establish that this is a clearly adult, appropriate photograph. Please use a clear photo of a consenting adult." }, { status: 422 });
    }
    if (observation.evidence.overallConfidence < VISUAL_RUBRIC.minimumAnalysisConfidence) {
      return NextResponse.json({ error: "There isn’t enough visible information for a defensible result. Please add a clearer face or full-body photograph." }, { status: 422 });
    }
    return NextResponse.json({ observation });
  } catch {
    return NextResponse.json({ error: "The desert signal dropped. Your photos were not retained—please try again." }, { status: 500 });
  }
}
