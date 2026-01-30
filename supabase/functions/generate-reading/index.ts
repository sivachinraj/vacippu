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

const lengthInstructions: Record<string, string> = {
  short: "Write 3-4 simple sentences (about 30-50 words). This is for early readers/beginners.",
  medium: "Write 5-7 sentences (about 60-100 words). This is for intermediate readers.",
  long: "Write 8-12 sentences (about 120-180 words). This is for advanced readers.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, language, length }: GenerateReadingRequest = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const languageDisplay = languageNames[language] || language;
    const lengthInstruction = lengthInstructions[length] || lengthInstructions.medium;

    const systemPrompt = `You are an educational content creator specializing in creating reading passages for language learners. 
Your task is to create engaging, age-appropriate reading content that helps learners practice reading in ${languageDisplay}.

Important guidelines:
- Write ONLY in ${languageDisplay} (not in English unless English is selected)
- Use simple, clear vocabulary appropriate for learners
- Include descriptive content about the topic
- Make the text educational and interesting
- Use natural sentence structures for the language
- For Indian languages, use proper script (Tamil script for Tamil, Devanagari for Hindi, etc.)`;

    const userPrompt = `Create a reading passage about "${topic}" in ${languageDisplay}.

${lengthInstruction}

Also provide:
1. A suitable title for the reading (in ${languageDisplay})
2. 3-5 key vocabulary words from the passage that should be highlighted (in ${languageDisplay})

Format your response as JSON with this structure:
{
  "title": "Title in the selected language",
  "content": "The reading passage text with natural paragraphs",
  "keywords": ["word1", "word2", "word3"]
}

IMPORTANT: Respond ONLY with valid JSON, no additional text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please check your account." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content received from AI");
    }

    // Parse the JSON response from AI
    let parsedContent;
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      parsedContent = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse AI response");
    }

    return new Response(JSON.stringify(parsedContent), {
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
