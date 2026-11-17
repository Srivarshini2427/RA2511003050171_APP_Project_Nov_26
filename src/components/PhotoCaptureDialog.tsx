import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealType: string;
}

interface Identified {
  food_name: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  confidence: string;
}

export function PhotoCaptureDialog({ open, onOpenChange, mealType }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<Identified | null>(null);
  const [logging, setLogging] = useState(false);

  const reset = () => {
    setPreview(null);
    setResult(null);
    setAnalyzing(false);
    setLogging(false);
  };

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setPreview(base64);
      setResult(null);
      setAnalyzing(true);
      try {
        const { data, error } = await supabase.functions.invoke("analyze-food-photo", {
          body: { imageBase64: base64 },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setResult(data);
      } catch (e: any) {
        toast.error(e.message || "Failed to identify food");
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const logFood = async () => {
    if (!result || !user) return;
    setLogging(true);
    try {
      const { error } = await supabase.from("food_logs").insert({
        user_id: user.id,
        food_name: result.food_name,
        calories: Math.round(result.calories),
        protein: result.protein || null,
        carbs: result.carbs || null,
        fats: result.fats || null,
        meal_type: mealType,
        logged_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(`Logged ${result.food_name}!`);
      queryClient.invalidateQueries({ queryKey: ["today-food-logs"] });
      queryClient.invalidateQueries({ queryKey: ["recent-foods"] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to log food");
    } finally {
      setLogging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take or upload a food photo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {preview ? (
            <img src={preview} alt="Food preview" className="w-full h-48 object-cover rounded-xl" />
          ) : (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
              <Camera className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Take a photo or upload an image</p>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />

          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" /> Choose Photo
          </Button>

          {analyzing && (
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> AI is identifying your food...
            </div>
          )}

          {result && (
            <div className="p-4 bg-muted/30 rounded-xl space-y-1">
              <p className="font-semibold text-foreground">{result.food_name}</p>
              <p className="text-sm text-muted-foreground">~{Math.round(result.calories)} cal · confidence: {result.confidence}</p>
              {(result.protein || result.carbs || result.fats) && (
                <p className="text-xs text-muted-foreground">
                  P {Math.round(result.protein || 0)}g · C {Math.round(result.carbs || 0)}g · F {Math.round(result.fats || 0)}g
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={logFood} disabled={!result || logging}>
            {logging ? "Logging..." : `Log to ${mealType}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
