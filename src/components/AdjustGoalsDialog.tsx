import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTarget: number;
}

export function AdjustGoalsDialog({ open, onOpenChange, currentTarget }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [calorieTarget, setCalorieTarget] = useState(currentTarget);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCalorieTarget(currentTarget); }, [currentTarget, open]);

  const save = async () => {
    if (!user) return;
    if (calorieTarget < 800 || calorieTarget > 8000) {
      toast.error("Calorie target must be between 800 and 8000");
      return;
    }
    setSaving(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: existing } = await supabase
        .from("progress_data")
        .select("id")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle();

      if (existing) {
        await supabase.from("progress_data").update({ calories_target: calorieTarget }).eq("id", existing.id);
      } else {
        await supabase.from("progress_data").insert({
          user_id: user.id,
          date: today,
          calories_consumed: 0,
          calories_target: calorieTarget,
        });
      }
      toast.success("Goals updated!");
      queryClient.invalidateQueries({ queryKey: ["today-progress"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust your daily goals</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Daily Calorie Target</Label>
            <Input
              type="number"
              value={calorieTarget}
              onChange={(e) => setCalorieTarget(parseInt(e.target.value) || 0)}
              min={800}
              max={8000}
            />
            <p className="text-xs text-muted-foreground mt-1">Recommended: 1,800–2,500 cal/day for adults</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
