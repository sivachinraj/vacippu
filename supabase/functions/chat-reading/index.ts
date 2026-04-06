import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAIWithRetry(url: string, headers: Record<string, string>, body: any, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (response.status === 429 && attempt < maxRetries - 1) {
      const waitTime = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
      console.log(`Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`);
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
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiHeaders = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    };

    const systemPrompt = `You are a helpful reading content assistant for a multilingual reading generator app. Your job is to help users create the perfect reading passage, moral story, or fable.

When the user describes what they want — even briefly — generate the content immediately. Do NOT ask clarifying questions if the user has given enough info (a topic + language is enough). Only ask if something critical is missing (like language).

If the user mentions wanting an image, note the image subject in a separate field called "imagePrompt".

When generating content, return it as JSON with this exact structure:
{
  "title": "Title in the requested language",
  "content": "The full reading/story text with natural paragraphs",
  "keywords": ["word1", "word2", "word3"],
  "language": "language_code",
  "contentType": "reading|moral_story|fable",
  "imagePrompt": "A description of the illustration to generate, e.g. 'a cute monkey eating a banana in a jungle'"
}

Language codes: tamil, hindi, english, telugu, kannada, malayalam, bengali, marathi, gujarati, punjabi.

Guidelines:
- Write in the language the user requests (Tamil script for Tamil, Devanagari for Hindi, etc.)
- If the user doesn't specify a language, default to English
- Use simple, educational vocabulary
- For moral stories, end with a clear moral lesson
- For fables, use animal characters who talk and act like humans
- Be creative and unique every time
- If the user is just chatting or asking questions (not requesting a reading), respond normally as text WITHOUT JSON
- Only output JSON when you're generating actual reading content
- Always include 3-5 key vocabulary words as keywords
- Make content age-appropriate and educational
- ALWAYS include imagePrompt — infer a good illustration from the story topic/characters even if the user didn't ask for one
- Be action-oriented: generate the reading on the first message if the user provides a topic

IMPORTANT: Respond ONLY with valid JSON when generating a reading. No markdown, no extra text around it.`;

    const textResponse = await callAIWithRetry(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      aiHeaders,
      {
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }
    );

    if (!textResponse.ok) {
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

    const data = await textResponse.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error("No content received from AI");

    // Try to detect if the response contains a reading (JSON)
    let reading = null;
    try {
      const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
      if (cleanContent.startsWith("{")) {
        const parsed = JSON.parse(cleanContent);
        if (parsed.title && parsed.content && parsed.keywords) {
          reading = parsed;
        }
      }
    } catch {
      // Not JSON — it's a chat message
    }

    // If we got a reading, generate an illustration image
    let imageBase64 = null;
    if (reading) {
      try {
        const imagePrompt = reading.imagePrompt ||
          `Create a colorful, child-friendly illustration about "${reading.title}". Style: cute, cartoon-like, suitable for children's educational materials. No text. Bright, cheerful colors.`;

        console.log("Generating image with prompt:", imagePrompt);

        // Wait a moment to avoid rate limiting from the text call
        await new Promise((r) => setTimeout(r, 1500));

        const imageResponse = await callAIWithRetry(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          aiHeaders,
          {
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content: imagePrompt }],
            modalities: ["image", "text"],
          }
        );

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          const generatedImage = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
          if (generatedImage) {
            imageBase64 = generatedImage;
            console.log("Image generated successfully for chat reading");
          }
        } else {
          console.error("Image generation failed:", imageResponse.status);
        }
      } catch (imageError) {
        console.error("Error generating image:", imageError);
        // Continue without image
      }

      // Remove imagePrompt from the reading object sent to client
      delete reading.imagePrompt;
    }

    return new Response(JSON.stringify({
      message: reading ? null : content,
      reading: reading ? { ...reading, image: imageBase64 } : null,
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
