import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a helpful reading content assistant for a multilingual reading generator app. Your job is to help users create the perfect reading passage, moral story, or fable.

When the user describes what they want, generate the content and return it as JSON with this exact structure:
{
  "title": "Title in the requested language",
  "content": "The full reading/story text with natural paragraphs",
  "keywords": ["word1", "word2", "word3"],
  "language": "language_code",
  "contentType": "reading|moral_story|fable"
}

Language codes: tamil, hindi, english, telugu, kannada, malayalam, bengali, marathi, gujarati, punjabi.

Guidelines:
- Write in the language the user requests (Tamil script for Tamil, Devanagari for Hindi, etc.)
- If the user doesn't specify a language, ask them
- Use simple, educational vocabulary
- For moral stories, end with a clear moral lesson
- For fables, use animal characters who talk and act like humans
- Be creative and unique every time
- If the user is just chatting or asking questions (not requesting a reading), respond normally as text WITHOUT JSON
- Only output JSON when you're generating actual reading content
- Always include 3-5 key vocabulary words as keywords
- Make content age-appropriate and educational

When chatting, be friendly and help the user refine their idea. Ask clarifying questions about:
- What language they want
- What topic/theme interests them
- How long they want it
- What type (reading, moral story, fable)
- Any specific characters, settings, or morals they want included`;

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
          ...messages,
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

    if (!content) throw new Error("No content received from AI");

    // Try to detect if the response contains a reading (JSON)
    let reading = null;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      // Check if it looks like JSON
      if (cleanContent.startsWith("{")) {
        const parsed = JSON.parse(cleanContent);
        if (parsed.title && parsed.content && parsed.keywords) {
          reading = parsed;
        }
      }
    } catch {
      // Not JSON, that's fine - it's a chat message
    }

    return new Response(JSON.stringify({
      message: reading ? null : content,
      reading,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in chat-reading function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
