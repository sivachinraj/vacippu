import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import ReadingCard from "@/components/ReadingCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, BookOpen } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SavedReading {
  id: string;
  title: string;
  content: string;
  language: string;
  topic: string;
  length: string;
  created_at: string;
}

export default function MyReadings() {
  const [readings, setReadings] = useState<SavedReading[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReading, setSelectedReading] = useState<SavedReading | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchReadings();
    }
  }, [user]);

  const fetchReadings = async () => {
    try {
      const { data, error } = await supabase
        .from("saved_readings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setReadings(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch readings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("saved_readings").delete().eq("id", id);

      if (error) throw error;

      setReadings((prev) => prev.filter((r) => r.id !== id));
      if (selectedReading?.id === id) {
        setSelectedReading(null);
      }

      toast({
        title: "Reading Deleted",
        description: "The reading has been removed from your library.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete reading",
        variant: "destructive",
      });
    }
  };

  const languageLabels: Record<string, string> = {
    tamil: "Tamil",
    hindi: "Hindi",
    english: "English",
    telugu: "Telugu",
    kannada: "Kannada",
    malayalam: "Malayalam",
    bengali: "Bengali",
    marathi: "Marathi",
    gujarati: "Gujarati",
    punjabi: "Punjabi",
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-2xl font-bold mb-2">Sign in to view your readings</h2>
            <p className="text-muted-foreground mb-4">
              You need to be signed in to access your saved readings.
            </p>
            <Link to="/auth">
              <Button className="btn-gradient">Sign In</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 py-8">
        <div className="container">
          <div className="flex items-center gap-4 mb-8">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">My Readings</h1>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : readings.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <BookOpen className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-bold mb-2">No saved readings yet</h2>
              <p className="text-muted-foreground mb-4">
                Generate and save your first reading to see it here.
              </p>
              <Link to="/">
                <Button className="btn-gradient">Create Reading</Button>
              </Link>
            </motion.div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[1fr,1.5fr]">
              {/* Readings List */}
              <div className="space-y-4">
                {readings.map((reading, index) => (
                  <motion.div
                    key={reading.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedReading?.id === reading.id
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50"
                    }`}
                    onClick={() => setSelectedReading(reading)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold truncate tamil-text">{reading.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {languageLabels[reading.language]} • {reading.topic}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(reading.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Reading?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete this reading from your library.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(reading.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Selected Reading Preview */}
              <div>
                {selectedReading ? (
                  <ReadingCard
                    title={selectedReading.title}
                    content={selectedReading.content}
                    keywords={[]}
                    language={selectedReading.language}
                    showSaveButton={false}
                  />
                ) : (
                  <div className="h-full min-h-[400px] flex items-center justify-center bg-muted/50 rounded-xl border-2 border-dashed">
                    <div className="text-center text-muted-foreground p-8">
                      <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Select a reading to preview</p>
                      <p className="text-sm">Click on any reading from the list</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
