import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const languageNames: Record<string, string> = {
  tamil: "Tamil", hindi: "Hindi", english: "English", telugu: "Telugu",
  kannada: "Kannada", malayalam: "Malayalam", bengali: "Bengali",
  marathi: "Marathi", gujarati: "Gujarati", punjabi: "Punjabi",
};

const imageStyleByType: Record<string, string> = {
  reading: "colorful educational children's book illustration, bright cheerful scene",
  moral_story: "warm storybook illustration, expressive characters with emotions, soft golden lighting",
  fable: "classic fable illustration, anthropomorphic animals in lush natural setting, expressive faces",
};

const sentenceCounts: Record<string, Record<string, number>> = {
  reading:     { veryshort: 2, short: 4, medium: 6, long: 10 },
  moral_story: { veryshort: 3, short: 5, medium: 7, long: 12 },
  fable:       { veryshort: 3, short: 5, medium: 7, long: 12 },
};

async function callGroq(messages: {role: string, content: string}[], max_tokens = 4096): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.75,
      max_tokens,
    }),
  });
  if (!response.ok) throw new Error(`Groq error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function parseJSON(raw: string): Record<string, unknown> {
  const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found");
  return JSON.parse(match[0]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { topic, language = "tamil", length = "medium", contentType = "reading" } = req.body;
    const languageDisplay = languageNames[language] || language;
    const imageStyle = imageStyleByType[contentType] ?? imageStyleByType.reading;
    const numSentences = sentenceCounts[contentType]?.[length] ?? 6;

    const scriptNote = language === "tamil" ? "Tamil script (தமிழ்)"
      : language === "hindi" || language === "marathi" ? "Devanagari script"
      : language === "telugu" ? "Telugu script"
      : language === "kannada" ? "Kannada script"
      : language === "malayalam" ? "Malayalam script"
      : language === "bengali" ? "Bengali script"
      : language === "gujarati" ? "Gujarati script"
      : language === "punjabi" ? "Gurmukhi script"
      : "correct native script";

    // ── SYSTEM PROMPT ──────────────────────────────────────────────────────────
    const systemPrompt = `You are one of the world's finest children's authors, with deep knowledge of ${languageDisplay} literature, culture, and storytelling traditions.

YOUR WRITING PHILOSOPHY:
Every story you write has SOUL. You understand that a great children's story is not a list of observations or random events — it is a journey of the heart. A child must FEEL something when they read your story: curiosity, warmth, surprise, or a quiet understanding of life.

THE DIFFERENCE BETWEEN BAD AND GOOD WRITING:

BAD (what you must NEVER do):
"Kannan saw a banana tree. Its leaves were green. Bananas were hanging. A monkey ate a banana."
This is dead writing. It describes objects like a camera. There is no character, no feeling, no reason to care. It is a list of facts, not a story.

GOOD (what you must ALWAYS do):
"Kannan had been saving his only coin for three whole days, dreaming of buying a banana from the market. But when he finally reached the tree, he found a hungry little monkey staring at the last fruit with desperate eyes — and in that moment, Kannan understood what truly mattered."
This has: a CHARACTER with a DESIRE, an OBSTACLE, an EMOTIONAL MOMENT, and a RESOLUTION that means something.

THE FOUR PILLARS OF EVERY STORY YOU WRITE:

1. CHARACTER WITH DESIRE
   - Your main character must WANT something specific
   - The reader must understand WHY they want it
   - The desire must connect directly to the topic

2. OBSTACLE OR TENSION
   - Something must stand between the character and what they want
   - This creates forward momentum — the reader wants to know what happens
   - Even a very short story needs this tension

3. EMOTIONAL CORE
   - Every story must make the reader FEEL something
   - Use sensory details: what does it smell like, sound like, feel like?
   - Show emotions through actions and reactions, not just statements

4. MEANINGFUL RESOLUTION
   - The ending must feel EARNED, not random
   - For moral stories: the moral must come from what HAPPENED, not be stated separately
   - The last sentence should leave the reader with a warm, complete feeling

LANGUAGE RULES for ${languageDisplay}:
- Write ENTIRELY in ${scriptNote}
- Use natural, everyday ${languageDisplay} — the language a grandmother would use with a grandchild
- NO English words, NO Sanskrit loanwords unless they are genuinely common in spoken ${languageDisplay}
- Vary sentence length: mix short, punchy sentences with longer flowing ones
- Use dialogue when appropriate — it brings characters to life
- Use at least ONE sensory detail (taste, smell, sound, texture, sight beyond just color)`;

    // ── USER PROMPT ────────────────────────────────────────────────────────────
    const contentSpecific = contentType === "moral_story"
      ? `STORY TYPE: Children's Moral Story
- The moral must be DEMONSTRATED through the events of the story, not stated as a separate lesson at the end
- The character must EXPERIENCE something that teaches them — they don't just hear advice
- The moral should feel like a natural discovery, something the reader figures out alongside the character
- A moral story that just says "நீதி: கஷ்டப்பட வேண்டும்" at the end without the story earning it is a FAILURE`

      : contentType === "fable"
      ? `STORY TYPE: Fable with Talking Animals
- Each animal must have a DISTINCT PERSONALITY that drives the plot (not just "clever fox, lazy bear")
- Include at least ONE line of natural dialogue in ${languageDisplay}
- The animals' personalities must directly cause the conflict and resolution
- The moral must emerge from what the animals DO, not what they say about themselves`

      : `STORY TYPE: Educational Reading Passage
- The passage must tell a STORY or describe a PROCESS with a clear beginning and end
- Include one specific, surprising, or delightful fact about "${topic}" that children won't already know
- Use a vivid comparison or metaphor that makes the topic concrete and imaginable for a child`;

    const userPrompt = `Write a children's ${contentType === "reading" ? "reading passage" : contentType === "moral_story" ? "moral story" : "fable"} about the topic: "${topic}"

${contentSpecific}

SENTENCE COUNT: Write exactly ${numSentences} sentences. Not more, not less.

BEFORE YOU WRITE, answer these questions in your head (do NOT include these in the output):
1. What does my main character WANT? (related to "${topic}")
2. What OBSTACLE stands in their way?
3. What EMOTIONAL MOMENT will the reader feel?
4. How does it END in a way that feels complete and meaningful?

QUALITY CHECK — your story FAILS if:
✗ Any sentence could be removed without affecting the story
✗ The story reads like a description or list of events
✗ There is no emotional moment or turning point
✗ The topic "${topic}" disappears from any sentence
✗ The moral (if applicable) is not earned by what happened in the story
✗ You use English words or unnecessary Sanskrit loanwords in ${languageDisplay}

Your story SUCCEEDS if:
✓ A child reading it would feel something (surprise, warmth, sadness, joy)
✓ Every sentence pulls the reader to the next one
✓ The topic "${topic}" is the heartbeat of every sentence
✓ The ending feels satisfying and complete
✓ The language sounds natural and beautiful in ${languageDisplay}

Return ONLY this exact JSON, no markdown, no extra text:
{
  "title": "a specific, evocative title in ${languageDisplay} that hints at the emotional heart of the story",
  "content": "the complete ${numSentences}-sentence story written entirely in ${languageDisplay} using ${scriptNote}",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  ${contentType !== "reading" ? `"moral": "one sentence in ${languageDisplay} that captures what the story shows — written as a natural insight, not a command",` : ""}
  "image_prompt": "A ${imageStyle} depicting the single most emotional moment of this story: [describe the exact scene with character name, their expression, what they are doing, the specific setting with colours and atmosphere], children's book art style, no text, no words, no letters"
}`;

    const raw = await callGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    let parsedContent: Record<string, unknown>;
    try {
      parsedContent = parseJSON(raw);
    } catch {
      console.error("Failed to parse response:", raw);
      throw new Error("Failed to generate story");
    }

    const imagePrompt = (parsedContent.image_prompt as string)
      ?? `A ${imageStyle} about ${topic}, cute cartoon style, vibrant colors, no text`;

    return res.status(200).json({ ...parsedContent, image_prompt: imagePrompt });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
