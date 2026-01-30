import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";

interface GeneratorFormProps {
  onGenerate: (topic: string, language: string, length: string) => Promise<void>;
  isLoading: boolean;
}

const languages = [
  { value: "tamil", label: "Tamil (தமிழ்)" },
  { value: "hindi", label: "Hindi (हिंदी)" },
  { value: "english", label: "English" },
  { value: "telugu", label: "Telugu (తెలుగు)" },
  { value: "kannada", label: "Kannada (ಕನ್ನಡ)" },
  { value: "malayalam", label: "Malayalam (മലയാളം)" },
  { value: "bengali", label: "Bengali (বাংলা)" },
  { value: "marathi", label: "Marathi (मराठी)" },
  { value: "gujarati", label: "Gujarati (ગુજરાતી)" },
  { value: "punjabi", label: "Punjabi (ਪੰਜਾਬੀ)" },
];

const lengths = [
  { value: "short", label: "Short (3-4 sentences)" },
  { value: "medium", label: "Medium (5-7 sentences)" },
  { value: "long", label: "Long (8-12 sentences)" },
];

export default function GeneratorForm({ onGenerate, isLoading }: GeneratorFormProps) {
  const [topic, setTopic] = useState("");
  const [language, setLanguage] = useState("tamil");
  const [length, setLength] = useState("medium");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    await onGenerate(topic, language, length);
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      onSubmit={handleSubmit}
      className="space-y-6 bg-card p-6 rounded-xl shadow-lg border-2"
    >
      <div className="space-y-2">
        <Label htmlFor="topic" className="text-base font-semibold">
          Topic / Subject
        </Label>
        <Input
          id="topic"
          placeholder="e.g., Banana Tree, Mango, Elephant, My School..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="text-lg h-12"
          required
        />
        <p className="text-sm text-muted-foreground">
          Enter any topic you want to create a reading about
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="language" className="text-base font-semibold">
            Language
          </Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="language" className="h-12">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="length" className="text-base font-semibold">
            Reading Length
          </Label>
          <Select value={length} onValueChange={setLength}>
            <SelectTrigger id="length" className="h-12">
              <SelectValue placeholder="Select length" />
            </SelectTrigger>
            <SelectContent>
              {lengths.map((len) => (
                <SelectItem key={len.value} value={len.value}>
                  {len.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isLoading || !topic.trim()}
        className="w-full h-12 text-lg btn-gradient gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Generating Reading...
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" />
            Generate Reading
          </>
        )}
      </Button>
    </motion.form>
  );
}
