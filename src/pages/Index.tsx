import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import GeneratorForm from "@/components/GeneratorForm";
import ReadingCard from "@/components/ReadingCard";
import { BookOpen, Sparkles, Download, Save } from "lucide-react";

interface GeneratedReading {
  title: string;
  content: string;
  keywords: string[];
}

interface GenerationMeta {
  topic: string;
  language: string;
  length: string;
}

export default function Index() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedReading, setGeneratedReading] = useState<GeneratedReading | null>(null);
  const [generationMeta, setGenerationMeta] = useState<GenerationMeta | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  const handleGenerate = async (topic: string, language: string, length: string) => {
    setIsGenerating(true);
    setGeneratedReading(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-reading`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ topic, language, length }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate reading");
      }

      const data = await response.json();
      setGeneratedReading(data);
      setGenerationMeta({ topic, language, length });

      toast({
        title: "Reading Generated!",
        description: "Your reading passage is ready.",
      });
    } catch (error: any) {
      toast({
        title: "Generation Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!user || !generatedReading || !generationMeta) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to save readings.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase.from("saved_readings").insert({
        user_id: user.id,
        title: generatedReading.title,
        content: generatedReading.content,
        language: generationMeta.language,
        topic: generationMeta.topic,
        length: generationMeta.length,
      });

      if (error) throw error;

      toast({
        title: "Reading Saved!",
        description: "Your reading has been saved to your library.",
      });
    } catch (error: any) {
      toast({
        title: "Save Failed",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="hero-gradient py-12 md:py-20">
          <div className="container text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6">
                <Sparkles className="h-4 w-4" />
                <span className="font-medium">AI-Powered Reading Generator</span>
              </div>

              <h1 className="text-4xl md:text-6xl font-extrabold mb-4">
                Create <span className="text-primary">Beautiful Readings</span>
                <br />
                in Multiple Languages
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
                Generate educational reading passages in Tamil, Hindi, English, and more.
                Perfect for language learners and teachers.
              </p>

              <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span>10+ Languages</span>
                </div>
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-primary" />
                  <span>Download as Image</span>
                </div>
                <div className="flex items-center gap-2">
                  <Save className="h-4 w-4 text-primary" />
                  <span>Save to Library</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Generator Section */}
        <section className="py-12 md:py-16">
          <div className="container max-w-4xl">
            <div className="grid gap-8 lg:grid-cols-[1fr,1.2fr]">
              <div>
                <GeneratorForm onGenerate={handleGenerate} isLoading={isGenerating} />
              </div>

              <div>
                {generatedReading ? (
                  <ReadingCard
                    title={generatedReading.title}
                    content={generatedReading.content}
                    keywords={generatedReading.keywords}
                    language={generationMeta?.language || "tamil"}
                    onSave={handleSave}
                    isSaving={isSaving}
                    showSaveButton={!!user}
                  />
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full min-h-[400px] flex items-center justify-center bg-muted/50 rounded-xl border-2 border-dashed"
                  >
                    <div className="text-center text-muted-foreground p-8">
                      <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Your reading will appear here</p>
                      <p className="text-sm">Enter a topic and click Generate</p>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-6 border-t">
        <div className="container text-center text-sm text-muted-foreground">
          <p>Tamil Reading Generator • Created with ❤️ for language learners</p>
        </div>
      </footer>
    </div>
  );
}
