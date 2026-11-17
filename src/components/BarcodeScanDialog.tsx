import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealType: string;
}

interface Product {
  name: string;
  brand?: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fats?: number;
}

export function BarcodeScanDialog({ open, onOpenChange, mealType }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [logging, setLogging] = useState(false);

  const reset = () => {
    setBarcode("");
    setProduct(null);
    setLoading(false);
  };

  const lookup = async () => {
    const code = barcode.trim();
    if (!/^\d{6,14}$/.test(code)) {
      toast.error("Enter a valid barcode (6-14 digits)");
      return;
    }
    setLoading(true);
    setProduct(null);
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
      const data = await res.json();
      if (data.status !== 1 || !data.product) {
        toast.error("Product not found in database");
        return;
      }
      const p = data.product;
      const nutriments = p.nutriments || {};
      const calories = Math.round(nutriments["energy-kcal_serving"] || nutriments["energy-kcal_100g"] || 0);
      if (!calories) {
        toast.error("No nutrition data available for this product");
        return;
      }
      setProduct({
        name: p.product_name || p.generic_name || "Unknown product",
        brand: p.brands,
        calories,
        protein: nutriments.proteins_serving || nutriments.proteins_100g,
        carbs: nutriments.carbohydrates_serving || nutriments.carbohydrates_100g,
        fats: nutriments.fat_serving || nutriments.fat_100g,
      });
    } catch (e: any) {
      toast.error("Lookup failed: " + (e.message || "network error"));
    } finally {
      setLoading(false);
    }
  };

  const logFood = async () => {
    if (!product || !user) return;
    setLogging(true);
    try {
      const { error } = await supabase.from("food_logs").insert({
        user_id: user.id,
        food_name: product.name,
        brand: product.brand || null,
        calories: product.calories,
        protein: product.protein ? Math.round(product.protein) : null,
        carbs: product.carbs ? Math.round(product.carbs) : null,
        fats: product.fats ? Math.round(product.fats) : null,
        meal_type: mealType,
        logged_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(`Logged ${product.name}!`);
      queryClient.invalidateQueries({ queryKey: ["today-food-logs"] });
      queryClient.invalidateQueries({ queryKey: ["recent-foods"] });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to log");
    } finally {
      setLogging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan or enter a barcode</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
            <QrCode className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Enter the barcode digits from the package. Powered by Open Food Facts.
            </p>
          </div>

          <div className="flex space-x-2">
            <Input
              placeholder="e.g. 3017620422003"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              onKeyDown={(e) => { if (e.key === "Enter") lookup(); }}
            />
            <Button onClick={lookup} disabled={loading || !barcode}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Look up"}
            </Button>
          </div>

          {product && (
            <div className="p-4 bg-muted/30 rounded-xl space-y-1">
              <p className="font-semibold text-foreground">{product.name}</p>
              {product.brand && <p className="text-xs text-muted-foreground">{product.brand}</p>}
              <p className="text-sm text-muted-foreground">{product.calories} cal per serving</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={logFood} disabled={!product || logging}>
            {logging ? "Logging..." : `Log to ${mealType}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
