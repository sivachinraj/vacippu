import { useRef, useCallback } from "react";
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
  const letters = decorativeLetters[language] || decorativeLetters.tamil;

  const highlightKeywords = (text: string, forDownload = false) => {
    let result = text;
    keywords.forEach((keyword) => {
      const regex = new RegExp(`(${keyword})`, "gi");
      if (forDownload) {
        // Use inline styles for download (html-to-image doesn't support CSS gradients on text)
        result = result.replace(regex, `<span style="color: #e63946; font-weight: 800;">$1</span>`);
      } else {
        result = result.replace(regex, `<span class="reading-text-highlight">$1</span>`);
      }
    });
    return result;
  };

  const handleDownload = useCallback(async () => {
    // Create a temporary container for download
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "0";
    container.style.top = "0";
    container.style.zIndex = "-9999";
    container.style.opacity = "1";
    container.style.pointerEvents = "none";
    
    // Build the download card HTML with inline styles (no CSS gradients on text)
    container.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #e63946 0%, #f4a261 25%, #e9c46a 50%, #2a9d8f 75%, #3a86ff 100%);
        padding: 14px;
        border-radius: 20px;
        box-shadow: 0 8px 32px rgba(230, 57, 70, 0.4);
        position: relative;
        overflow: hidden;
        width: 500px;
      ">
        <!-- Decorative letters -->
        <div style="position: absolute; top: 4px; left: 0; right: 0; display: flex; justify-content: space-around; padding: 0 32px;">
          ${letters.slice(0, 3).map(l => `<span style="font-family: 'Noto Sans Tamil', sans-serif; font-size: 1.5rem; font-weight: 700; color: #b8860b; text-shadow: 1px 1px 0 rgba(255,255,255,0.8);">${l}</span>`).join('')}
        </div>
        <div style="position: absolute; bottom: 4px; left: 0; right: 0; display: flex; justify-content: space-around; padding: 0 32px;">
          ${letters.slice(3, 6).map(l => `<span style="font-family: 'Noto Sans Tamil', sans-serif; font-size: 1.5rem; font-weight: 700; color: #b8860b; text-shadow: 1px 1px 0 rgba(255,255,255,0.8);">${l}</span>`).join('')}
        </div>
        <div style="position: absolute; left: 4px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: space-around; padding: 32px 0;">
          ${letters.slice(6, 9).map(l => `<span style="font-family: 'Noto Sans Tamil', sans-serif; font-size: 1.5rem; font-weight: 700; color: #b8860b; text-shadow: 1px 1px 0 rgba(255,255,255,0.8);">${l}</span>`).join('')}
        </div>
        <div style="position: absolute; right: 4px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: space-around; padding: 32px 0;">
          ${letters.slice(9, 12).map(l => `<span style="font-family: 'Noto Sans Tamil', sans-serif; font-size: 1.5rem; font-weight: 700; color: #b8860b; text-shadow: 1px 1px 0 rgba(255,255,255,0.8);">${l}</span>`).join('')}
        </div>
        
        <!-- Inner content -->
        <div style="
          background: linear-gradient(180deg, #fefae0 0%, #f5f0dc 100%);
          border-radius: 12px;
          padding: 28px;
          position: relative;
          z-index: 10;
        ">
          <h2 style="
            font-family: 'Noto Sans Tamil', sans-serif;
            font-size: 1.5rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 16px;
            color: #7b2d8e;
          ">${title}</h2>
          
          ${image ? `
            <div style="display: flex; justify-content: center; margin-bottom: 16px;">
              <img 
                src="${image}" 
                alt="${title}"
                style="max-width: 100%; height: auto; max-height: 192px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); object-fit: contain;"
                crossorigin="anonymous"
              />
            </div>
          ` : ''}
          
          <div style="
            font-family: 'Noto Sans Tamil', sans-serif;
            font-size: 1.125rem;
            line-height: 1.8;
            color: #3d1f47;
          ">${highlightKeywords(content, true)}</div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Wait for image to load if present
    if (image) {
      const imgElement = container.querySelector('img');
      if (imgElement) {
        await new Promise<void>((resolve) => {
          if (imgElement.complete) {
            resolve();
          } else {
            imgElement.onload = () => resolve();
            imgElement.onerror = () => resolve();
          }
        });
      }
    }

    try {
      const dataUrl = await toPng(container.firstElementChild as HTMLElement, {
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
    } finally {
      document.body.removeChild(container);
    }
  }, [title, content, keywords, image, letters]);

  return (
    <div className="space-y-4">
      <motion.div
        ref={cardRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="reading-card-border relative overflow-hidden"
      >
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

          {keywords.length > 0 && (
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
      </motion.div>

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
