import type { VercelRequest, VercelResponse } from "@vercel/node";

const COMFY_URL = "https://ellen-stress-promo-current.trycloudflare.com";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { imagePrompt } = req.body;

  try {
    const workflow = {
      "3": { class_type: "KSampler", inputs: { cfg: 7.5, denoise: 1, latent_image: ["5", 0], model: ["4", 0], negative: ["7", 0], positive: ["6", 0], sampler_name: "dpmpp_2m", scheduler: "karras", seed: Math.floor(Math.random() * 1000000000), steps: 25 } },
      "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "dreamshaper_8.safetensors" } },
      "5": { class_type: "EmptyLatentImage", inputs: { batch_size: 1, height: 512, width: 512 } },
      "6": { class_type: "CLIPTextEncode", inputs: { clip: ["4", 1], text: `${imagePrompt}, children's book illustration, cute cartoon style, vibrant colors, no text` } },
      "7": { class_type: "CLIPTextEncode", inputs: { clip: ["4", 1], text: "text, words, watermark, nsfw, ugly, blurry, bad anatomy, realistic photo" } },
      "8": { class_type: "VAEDecode", inputs: { samples: ["3", 0], vae: ["4", 2] } },
      "9": { class_type: "SaveImage", inputs: { filename_prefix: "vacippu", images: ["8", 0] } },
    };

    const queueRes = await fetch(`${COMFY_URL}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow }) });
    if (!queueRes.ok) return res.status(500).json({ error: "ComfyUI queue failed" });

    const { prompt_id } = await queueRes.json();

    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const historyRes = await fetch(`${COMFY_URL}/history/${prompt_id}`);
      if (!historyRes.ok) continue;
      const history = await historyRes.json();
      const job = history[prompt_id];
      if (!job) continue;
      const outputs = job.outputs?.["9"]?.images;
      if (!outputs?.length) continue;
      const imgRes = await fetch(`${COMFY_URL}/view?filename=${outputs[0].filename}&subfolder=${outputs[0].subfolder}&type=${outputs[0].type}`);
      if (!imgRes.ok) return res.status(500).json({ error: "Image fetch failed" });
      const bytes = new Uint8Array(await imgRes.arrayBuffer());
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return res.status(200).json({ image: `data:image/png;base64,${btoa(binary)}` });
    }
    return res.status(500).json({ error: "Timed out" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
