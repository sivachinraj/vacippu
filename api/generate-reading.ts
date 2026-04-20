import type { VercelRequest, VercelResponse } from "@vercel/node";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
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
  moral_story: { veryshort: 3, short: 5, medium: 8, long: 14 },
  fable:       { veryshort: 3, short: 5, medium: 8, long: 14 },
};

function parseJSON(raw: string): Record<string, unknown> {
  const clean = raw.replace(/```json\n?|\n?```/g, "").trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found");
  return JSON.parse(match[0]);
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GEMINI_QUOTA:${err}`);
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callGroqFallback(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.75,
      max_tokens: 2048,
    }),
  });
  if (!response.ok) throw new Error(`Groq error: ${await response.text()}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callLLM(sys: string, usr: string): Promise<{ text: string; provider: string }> {
  try {
    const text = await callGemini(sys, usr);
    return { text, provider: "gemini" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("GEMINI_QUOTA") || msg.includes("429") || msg.includes("quota")) {
      console.warn("Gemini quota hit — falling back to Groq");
      const text = await callGroqFallback(sys, usr);
      return { text, provider: "groq" };
    }
    throw err;
  }
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

    // ── SYSTEM PROMPT ─────────────────────────────────────────────────────────
    const systemPrompt = language === "tamil" ? `நீ உலகின் சிறந்த குழந்தைகள் எழுத்தாளர். தமிழில் மட்டுமே எழுதுகிறாய் — ஒரு கவிஞரின் உள்ளத்துடன், கதைசொல்லியின் ஆற்றலுடன்.

தமிழ் உரைநடை விதிகள் — கட்டாயம்:
- ஆனால், எனினும், அதனால், எனவே, திடீரென்று, அப்போது, அந்த நேரத்தில் — இந்த இணைப்பு சொற்களை தொடர்ந்து பயன்படுத்து
- வினையெச்சங்கள்: சென்று பார்த்தான், ஓடி வந்தாள், எடுத்து கொடுத்தாள், நின்று யோசித்தான்
- வினை-பொருள் ஒத்திசைவு: அவன் சென்றான் / அவள் சென்றாள் / அது சென்றது
- உரையாடல்: "என்ன நடக்கிறது?" என்று கேட்டாள் — இப்படி இயல்பாக சேர்
- புலன் உணர்வுகள்: மணம், சத்தம், தொடுகை, சுவை — வெறும் பார்வை போதாது
- குறுகிய, வலிமையான வாக்கியங்களை நீண்ட, ஓடும் வாக்கியங்களுடன் மாற்றி மாற்றி எழுது
- இரண்டு தொடர்ச்சியான வாக்கியங்கள் ஒரே சொல்லில் தொடங்கக்கூடாது
- ஆங்கில சொற்கள் வேண்டாம்; வழக்கு தமிழ் மட்டுமே

இறந்த எழுத்து (NEVER):
"கண்ணன் மரத்தைப் பார்த்தான். இலைகள் பச்சையாக இருந்தன. காற்று வீசியது. அவன் சோகமடைந்தான்."
→ புகைப்படம். உணர்வு இல்லை. தொடர்பு இல்லை.

உயிருள்ள எழுத்து (ALWAYS):
"மரத்தின் நிழலில் நின்ற கண்ணனுக்கு, திடீரென்று ஒரு பறவையின் குரல் காதில் விழுந்தது — அது அவன் அம்மாவின் தாலாட்டைப் போல் இனிமையாக இருந்தது; அந்த நொடியில், அவன் மனதில் இருந்த கவலை மெல்ல மெல்ல கரைந்து போனது."
→ ஒரே ஓட்டம். உணர்வு. உவமை. உள்ளமாற்றம்.

Valid JSON மட்டும். Markdown வேண்டாம்.`
    : `You are one of the world's finest children's authors writing natively in ${languageDisplay}.

Use flowing compound sentences with connectors. Include dialogue. Use sensory details beyond sight.
Vary sentence length. Create emotional arcs. Use metaphors.

DEAD (forbidden): Simple disconnected sentences with no emotion.
LIVING (required): Flowing prose with connectors, sensory detail, emotion, metaphor.

Valid JSON only. No markdown.`;

    // ── CONTENT TYPE RULES ────────────────────────────────────────────────────
    const contentSpecific = contentType === "moral_story"
      ? (language === "tamil"
        ? `நீதிக் கதை: நீதி கதை நிகழ்வுகளில் இருந்து இயல்பாக வர வேண்டும். "நீதி:" என்று தனியாக எழுதாதே. இறுதி தருணம் நீதியை உணர வைக்க வேண்டும்.`
        : `Moral Story: The moral must emerge from events naturally. NEVER state "Moral:" separately. The final moment must make the reader feel the moral.`)
      : contentType === "fable"
      ? (language === "tamil"
        ? `நீதிக்கதை: ஒவ்வொரு விலங்கின் குணம் அதன் ஒவ்வொரு முடிவையும் நிர்ணயிக்கட்டும். இயல்பான உரையாடல் சேர். நீதி விலங்குகளின் குணத்திலிருந்து வரட்டும்.`
        : `Fable: Each animal's personality drives every decision. Include natural dialogue. Moral comes from who they ARE.`)
      : (language === "tamil"
        ? `வாசிப்பு பகுதி: கதையாக அல்லது செயல்முறையாக சொல். "${topic}" பற்றி ஒரு ஆச்சரியமான உண்மை சேர். உவமை மூலம் கருத்தை அழகாக சொல்.`
        : `Reading Passage: Tell as a story or process. Include one surprising fact about "${topic}". Use a metaphor to make it beautiful.`);

    // ── USER PROMPT ───────────────────────────────────────────────────────────
    const userPrompt = language === "tamil"
      ? `"${topic}" பற்றி ${numSentences} வாக்கியங்களில் குழந்தைகளுக்கான ${contentType === "reading" ? "வாசிப்பு பகுதி" : contentType === "moral_story" ? "நீதிக் கதை" : "நீதிக்கதை"} எழுது.

${contentSpecific}

எழுதுவதற்கு முன் மனதில் முடிவு செய் (வெளியில் எழுதாதே):
→ என் பாத்திரம் என்ன விரும்புகிறான்/ள்? ("${topic}" உடன் தொடர்புடையதாக)
→ என்ன அவர்களை நிறுத்துகிறது அல்லது ஆச்சரியப்படுத்துகிறது?
→ மிகவும் அழகான காட்சி எது?
→ இறுதி வரியில் பாத்திரம் எப்படி உணர்கிறான்/ள்?

இந்த JSON மட்டும் திரும்ப கொடு:
{
  "title": "தமிழில் கவிதை தலைப்பு — கதையின் உணர்வை குறிப்பிடுவதாக",
  "content": "தமிழில் முழு ${numSentences} வாக்கிய கதை",
  "keywords": ["சொல்1", "சொல்2", "சொல்3", "சொல்4", "சொல்5"],
  ${contentType !== "reading" ? '"moral": "தமிழில் ஒரு அழகான வாக்கியம் — இயல்பான உண்மை",' : ""}
  "image_prompt": "A ${imageStyle} of [exact character name] [precise emotional action from story climax] in [specific setting with colors], no text, no words, no letters"
}`
      : `Write a ${numSentences}-sentence children's ${contentType === "reading" ? "reading passage" : contentType === "moral_story" ? "moral story" : "fable"} about: "${topic}"

${contentSpecific}

Decide silently before writing:
→ What does the character want? (connected to "${topic}")
→ What stops or surprises them?
→ What is the most beautiful image?
→ How does it end warmly?

Return ONLY this JSON:
{
  "title": "poetic specific title in ${languageDisplay}",
  "content": "complete ${numSentences}-sentence story in ${languageDisplay}",
  "keywords": ["word1", "word2", "word3", "word4", "word5"],
  ${contentType !== "reading" ? `"moral": "one beautiful sentence in ${languageDisplay} — natural truth, not a command",` : ""}
  "image_prompt": "A ${imageStyle} of [exact character] [precise emotional action] in [specific setting with colors], no text, no words, no letters"
}`;

    // ── CALL & RETURN ─────────────────────────────────────────────────────────
    const { text: raw, provider } = await callLLM(systemPrompt, userPrompt);
    console.log(`Provider: ${provider}`);

    let parsedContent: Record<string, unknown>;
    try {
      parsedContent = parseJSON(raw);
    } catch {
      console.error("Parse failed:", raw.substring(0, 300));
      throw new Error("Failed to parse story response");
    }

    const imagePrompt = (parsedContent.image_prompt as string)
      ?? `A ${imageStyle} about ${topic}, vibrant colors, no text`;

    return res.status(200).json({
      ...parsedContent,
      image_prompt: imagePrompt,
      _provider: provider,
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
}
