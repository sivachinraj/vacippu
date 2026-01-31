import { useRef } from "react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Download, Save } from "lucide-react";

interface ReadingCardProps {
  title: string;
  content: string;
  keywords: string[];
  language: string;
  image?: string | null;
  onSave?: () => void;
  isSaving?: boolean;
  showSaveButton?: boolean;
}

const decorativeLetters: Record<string, string[]> = {
  tamil: ["அ", "ஆ", "இ", "ஈ", "உ", "ஊ", "எ", "ஏ", "ஐ", "ஒ", "ஓ", "ஔ"],
  hindi: ["अ", "आ", "इ", "ई", "उ", "ऊ", "ए", "ऐ", "ओ", "औ", "क", "ख"],
  english: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"],
  telugu: ["అ", "ఆ", "ఇ", "ఈ", "ఉ", "ఊ", "ఎ", "ఏ", "ఐ", "ఒ", "ఓ", "ఔ"],
  kannada: ["ಅ", "ಆ", "ಇ", "ಈ", "ಉ", "ಊ", "ಎ", "ಏ", "ಐ", "ಒ", "ಓ", "ಔ"],
  malayalam: ["അ", "ആ", "ഇ", "ഈ", "ഉ", "ഊ", "എ", "ഏ", "ഐ", "ഒ", "ഓ", "ഔ"],
  bengali: ["অ", "আ", "ই", "ঈ", "উ", "ঊ", "এ", "ঐ", "ও", "ঔ", "ক", "খ"],
  marathi: ["अ", "आ", "इ", "ई", "उ", "ऊ", "ए", "ऐ", "ओ", "औ", "क", "ख"],
  gujarati: ["અ", "આ", "ઇ", "ઈ", "ઉ", "ઊ", "એ", "ઐ", "ઓ", "ઔ", "ક", "ખ"],
  punjabi: ["ਅ", "ਆ", "ਇ", "ਈ", "ਉ", "ਊ", "ਏ", "ਐ", "ਓ", "ਔ", "ਕ", "ਖ"],
};

export default function ReadingCard({
  title,
  content,
  keywords,
  language,
  image,
  onSave,
  isSaving,
  showSaveButton = true,
}: ReadingCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const letters = decorativeLetters[language] || decorativeLetters.tamil;

  const highlightKeywords = (text: string) => {
    let result = text;
    keywords.forEach((keyword) => {
      const regex = new RegExp(`(${keyword})`, "gi");
      result = result.replace(regex, `<span class="reading-text-highlight">$1</span>`);
    });
    return result;
  };

  const handleDownload = async () => {
    if (!downloadRef.current) return;

    try {
      const dataUrl = await toPng(downloadRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });

      const link = document.createElement("a");
      link.download = `reading-${title.slice(0, 20)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Error generating image:", error);
    }
  };

  const CardContent = ({ showKeywords = true }: { showKeywords?: boolean }) => (
    <div className="reading-card-border relative overflow-hidden">
      {/* Decorative letters around border */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top */}
        <div className="absolute top-1 left-0 right-0 flex justify-around px-8">
          {letters.slice(0, 3).map((letter, i) => (
            <span key={`top-${i}`} className="decorative-letters">{letter}</span>
          ))}
        </div>
        {/* Bottom */}
        <div className="absolute bottom-1 left-0 right-0 flex justify-around px-8">
          {letters.slice(3, 6).map((letter, i) => (
            <span key={`bottom-${i}`} className="decorative-letters">{letter}</span>
          ))}
        </div>
        {/* Left */}
        <div className="absolute left-1 top-0 bottom-0 flex flex-col justify-around py-8">
          {letters.slice(6, 9).map((letter, i) => (
            <span key={`left-${i}`} className="decorative-letters">{letter}</span>
          ))}
        </div>
        {/* Right */}
        <div className="absolute right-1 top-0 bottom-0 flex flex-col justify-around py-8">
          {letters.slice(9, 12).map((letter, i) => (
            <span key={`right-${i}`} className="decorative-letters">{letter}</span>
          ))}
        </div>
      </div>

      <div className="reading-card-inner relative z-10">
        <h2 className="reading-title text-2xl font-bold mb-4 tamil-text text-center">
          {title}
        </h2>

        {image && (
          <div className="mb-4 flex justify-center">
            <img 
              src={image} 
              alt={title}
              className="max-w-full h-auto max-h-48 rounded-lg shadow-md object-contain"
            />
          </div>
        )}

        <div
          className="reading-content text-lg leading-relaxed tamil-text space-y-4"
          dangerouslySetInnerHTML={{ __html: highlightKeywords(content) }}
        />

        {showKeywords && keywords.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground mb-2">Keywords:</p>
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword, index) => (
                <span
                  key={index}
                  className="keyword-badge px-3 py-1 rounded-full text-sm font-medium tamil-text"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Visible card with keywords */}
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <CardContent showKeywords={true} />
      </motion.div>

      {/* Hidden card for download (without keywords) */}
      <div 
        ref={downloadRef} 
        style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}
      >
        <CardContent showKeywords={false} />
      </div>

      <div className="flex gap-3 justify-center">
        <Button onClick={handleDownload} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Download Image
        </Button>
        {showSaveButton && onSave && (
          <Button onClick={onSave} disabled={isSaving} className="btn-gradient gap-2">
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Reading"}
          </Button>
        )}
      </div>
    </div>
  );
}
