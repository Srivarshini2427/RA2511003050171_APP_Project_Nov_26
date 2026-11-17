import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ShoppingCart } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GroceryListDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();

  const { data: meals = [], isLoading } = useQuery({
    queryKey: ["meal-plans-grocery", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase.from("meal_plans").select("meal_name, meal_type, day_of_week").eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user && open,
  });

  // Derive a simple grocery list by extracting unique meal names as recipes to shop for
  const items = Array.from(new Set(meals.map((m: any) => m.meal_name))).sort();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(items.join("\n"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center"><ShoppingCart className="w-5 h-5 mr-2" /> Your Grocery List</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">No meals planned yet. Generate a meal plan to build your list.</p>
          )}
          {items.map((name) => (
            <label key={name} className="flex items-center space-x-3 p-3 bg-muted/30 rounded-xl">
              <input type="checkbox" className="w-4 h-4" />
              <span className="text-foreground">{name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={copyToClipboard} disabled={!items.length}>Copy List</Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
