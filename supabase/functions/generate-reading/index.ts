import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateReadingRequest {
  topic: string;
  language: string;
  length: "short" | "medium" | "long";
  contentType?: "reading" | "moral_story" | "fable";
}

const languageNames: Record<string, string> = {
  tamil: "Tamil (தமிழ்)",
  hindi: "Hindi (हिंदी)",
  english: "English",
  telugu: "Telugu (తెలుగు)",
  kannada: "Kannada (ಕನ್ನಡ)",
  malayalam: "Malayalam (മലയാളം)",
  bengali: "Bengali (বাংলা)",
  marathi: "Marathi (मराठी)",
  gujarati: "Gujarati (ગુજરાતી)",
  punjabi: "Punjabi (ਪੰਜਾਬੀ)",
};

const lengthInstructions: Record<string, Record<string, string>> = {
  reading: {
    veryshort: "Write exactly 2 simple sentences (about 12-20 words total). Very brief, for beginners.",
    short: "Write 2-4 simple sentences (about 20-35 words). Quick and easy to read.",
    medium: "Write 5-7 sentences (about 60-100 words). This is for intermediate readers.",
    long: "Write 8-12 sentences (about 120-180 words). This is for advanced readers.",
  },
  moral_story: {
    veryshort: "Write a tiny story of exactly 2 sentences (about 12-20 words) with a quick moral.",
    short: "Write a very short story of 2-4 sentences (about 20-35 words) with a clear moral.",
    medium: "Write a short story of 6-8 sentences (about 80-120 words) with a clear moral at the end.",
    long: "Write a story of 10-15 sentences (about 150-220 words) with a clear moral at the end.",
  },
  fable: {
    veryshort: "Write a tiny fable of exactly 2 sentences (about 12-20 words) with animal characters and a moral.",
    short: "Write a brief fable of 2-4 sentences (about 20-35 words) with animal characters and a moral.",
    medium: "Write a fable of 6-8 sentences (about 80-120 words) with animal characters and a moral.",
    long: "Write a fable of 10-15 sentences (about 150-220 words) with animal characters and a moral.",
  },
};

const contentTypePrompts: Record<string, string> = {
  reading: "educational reading passage",
  moral_story: "short moral story with a clear lesson at the end",
  fable: "traditional fable in the style of Aesop's fables with animal characters who talk and act like humans",
};

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status === 429 && attempt < maxRetries - 1) {
      const waitTime = Math.pow(2, attempt + 1) * 1000;
      console.log(`Rate limited, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, waitTime));
      continue;
    }
    return response;
  }
  throw new Error("Max retries exceeded");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, language, length, contentType = "reading" }: GenerateReadingRequest = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const languageDisplay = languageNames[language] || language;
    const lengthInstruction = lengthInstructions[contentType]?.[length] || lengthInstructions.reading.medium;
    const contentDescription = contentTypePrompts[contentType] || contentTypePrompts.reading;

    const systemPrompt = `You are an educational content creator specializing in creating ${contentDescription}s for language learners. 
Your task is to create engaging, age-appropriate ${contentDescription} content that helps learners practice reading in ${languageDisplay}.

Important guidelines:
- Write ONLY in ${languageDisplay} (not in English unless English is selected)
- Use simple, clear vocabulary appropriate for learners
${contentType === "fable" ? "- Use animal characters who speak and act like humans to teach the moral\n- Include dialogue between characters" : ""}
${contentType === "moral_story" ? "- Build a simple narrative arc with beginning, middle, and end\n- End with a clear moral lesson" : ""}
${contentType === "reading" ? "- Include descriptive content about the topic" : ""}
- Make the text educational and interesting
- Use natural sentence structures for the language
- For Indian languages, use proper script (Tamil script for Tamil, Devanagari for Hindi, etc.)`;

    const uniqueSeed = `[Unique seed: ${crypto.randomUUID()}]`;

    const userPrompt = `Create a ${contentDescription} about "${topic}" in ${languageDisplay}.

${lengthInstruction}

IMPORTANT: Generate a completely unique and original piece every time. Do not repeat patterns, phrases, or structures from previous outputs. Be creative with vocabulary, sentence structure, and narrative approach. ${uniqueSeed}

Also provide:
1. A suitable title for the ${contentType === "reading" ? "reading" : "story"} (in ${languageDisplay})
2. 3-5 key vocabulary words from the passage that should be highlighted (in ${languageDisplay})
${contentType !== "reading" ? `3. The moral of the story in one sentence (in ${languageDisplay})` : ""}

Format your response as JSON with this structure:
{
  "title": "Title in the selected language",
  "content": "The ${contentType === "reading" ? "reading passage" : "story"} text with natural paragraphs${contentType !== "reading" ? ". End with the moral." : ""}",
  "keywords": ["word1", "word2", "word3"]${contentType !== "reading" ? ',\n  "moral": "The moral lesson in one sentence"' : ""}
}

IMPORTANT: Respond ONLY with valid JSON, no additional text.`;

    // Generate text content
    const textResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!textResponse.ok) {
      if (textResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (textResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please check your account." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await textResponse.text();
      console.error("AI gateway error:", textResponse.status, errorText);
      throw new Error(`AI gateway error: ${textResponse.status}`);
    }

    const textData = await textResponse.json();
    const textContent = textData.choices?.[0]?.message?.content;

    if (!textContent) {
      throw new Error("No content received from AI");
    }

    // Parse the JSON response from AI
    let parsedContent;
    try {
      const cleanContent = textContent.replace(/```json\n?|\n?```/g, "").trim();
      parsedContent = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", textContent);
      throw new Error("Failed to parse AI response");
    }

    // Generate illustration image
    let imageBase64 = null;
    try {
      const imagePromptByType: Record<string, string> = {
        reading: `Create a colorful, child-friendly educational illustration about "${topic}". Style: simple, cute, cartoon-like, suitable for children's educational materials. No text in the image. Bright, cheerful colors.`,
        moral_story: `Create a colorful, child-friendly illustration for a moral story about "${topic}". Style: warm, inviting, storybook illustration with expressive characters. No text in the image. Bright, cheerful colors.`,
        fable: `Create a colorful, child-friendly illustration for a fable about "${topic}" featuring cute animal characters. Style: classic storybook, anthropomorphic animals in a natural setting. No text in the image. Bright, cheerful colors.`,
      };
      const imagePrompt = imagePromptByType[contentType] || imagePromptByType.reading;
      
      const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [
            { role: "user", content: imagePrompt }
          ],
          modalities: ["image", "text"],
        }),
      });

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        const generatedImage = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (generatedImage) {
          imageBase64 = generatedImage;
          console.log("Image generated successfully");
        }
      } else {
        console.error("Image generation failed:", imageResponse.status);
      }
    } catch (imageError) {
      console.error("Error generating image:", imageError);
      // Continue without image - it's optional
    }

    return new Response(JSON.stringify({
      ...parsedContent,
      image: imageBase64,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-reading function:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
