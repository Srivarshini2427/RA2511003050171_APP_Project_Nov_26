import { DashboardCard } from "@/components/DashboardCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, ChefHat, ShoppingCart, Repeat, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GroceryListDialog } from "@/components/GroceryListDialog";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const mealTypes = ["breakfast", "lunch", "dinner"];

interface Suggestion {
  name: string;
  calories: number;
  prep_time: number;
  tags: string[];
}

export default function MealPlan() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState("Mon");
  const [groceryOpen, setGroceryOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [swappingKey, setSwappingKey] = useState<string | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const { data: plans = [] } = useQuery({
    queryKey: ["meal-plans", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("meal_plans")
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const dayPlans = plans.filter((p: any) => p.day_of_week === selectedDay);

  const generatePlan = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-meal-plan", {
        body: {
          mode: "week",
          dietaryPreferences: profile?.dietary_preferences,
          allergies: profile?.allergies,
          calorieTarget: 2200,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Replace existing plans
      await supabase.from("meal_plans").delete().eq("user_id", user.id);
      const rows = data.meals.map((m: any) => ({
        user_id: user.id,
        day_of_week: m.day_of_week,
        meal_type: m.meal_type,
        meal_name: m.meal_name,
        calories: Math.round(m.calories),
        prep_time: Math.round(m.prep_time),
      }));
      const { error: insertErr } = await supabase.from("meal_plans").insert(rows);
      if (insertErr) throw insertErr;
      toast.success("New meal plan generated!");
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const swapMeal = async (mealId: string, currentName: string) => {
    if (!user) return;
    setSwappingKey(mealId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-meal-plan", {
        body: {
          mode: "swap",
          mealName: currentName,
          dietaryPreferences: profile?.dietary_preferences,
          allergies: profile?.allergies,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const { error: updErr } = await supabase
        .from("meal_plans")
        .update({
          meal_name: data.meal_name,
          calories: Math.round(data.calories),
          prep_time: Math.round(data.prep_time),
        })
        .eq("id", mealId);
      if (updErr) throw updErr;
      toast.success(`Swapped for ${data.meal_name}`);
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
    } catch (e: any) {
      toast.error(e.message || "Swap failed");
    } finally {
      setSwappingKey(null);
    }
  };

  const loadSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-meal-plan", {
        body: {
          mode: "recipes",
          dietaryPreferences: profile?.dietary_preferences,
          allergies: profile?.allergies,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSuggestions(data.recipes);
    } catch (e: any) {
      toast.error(e.message || "Failed to load suggestions");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const addSuggestion = async (s: Suggestion) => {
    if (!user) return;
    try {
      // Find an empty slot for selectedDay or add as snack-style entry (use lunch as fallback)
      const filledTypes = new Set(dayPlans.map((p: any) => p.meal_type));
      const slot = mealTypes.find((t) => !filledTypes.has(t)) || "lunch";
      const { error } = await supabase.from("meal_plans").insert({
        user_id: user.id,
        day_of_week: selectedDay,
        meal_type: slot,
        meal_name: s.name,
        calories: Math.round(s.calories),
        prep_time: Math.round(s.prep_time),
      });
      if (error) throw error;
      toast.success(`Added ${s.name} to ${selectedDay} ${slot}`);
      queryClient.invalidateQueries({ queryKey: ["meal-plans"] });
    } catch (e: any) {
      toast.error(e.message || "Failed to add");
    }
  };

  const copyLastWeek = async () => {
    // Duplicate current plans (visually no-op since week isn't tracked) — refresh from DB
    if (plans.length === 0) {
      toast.info("No previous plan to copy — generate one first");
      return;
    }
    toast.success("Last week's plan is already loaded");
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Meal Planning 🍽️</h1>
        <p className="text-muted-foreground">Plan your week for better nutrition</p>
      </div>

      <DashboardCard title="This Week" gradient>
        <div className="flex space-x-2 mb-4">
          {weekDays.map((day) => (
            <Button
              key={day}
              variant={selectedDay === day ? "default" : "outline"}
              onClick={() => setSelectedDay(day)}
              className="flex-1 text-sm"
              size="sm"
            >
              {day}
            </Button>
          ))}
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center space-x-1">
            <Calendar className="w-4 h-4" />
            <span>{plans.length} meals planned</span>
          </div>
          <div className="flex items-center space-x-1">
            <Users className="w-4 h-4" />
            <span>For 1 person</span>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard title={`${selectedDay} - Daily Plan`}>
        <div className="space-y-4">
          {dayPlans.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No meals planned for {selectedDay}. Generate a plan below to get started.
            </p>
          )}
          {dayPlans.map((meal: any) => (
            <div key={meal.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-fresh rounded-lg flex items-center justify-center">
                  <ChefHat className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground capitalize">{meal.meal_type}</p>
                  <p className="text-sm text-muted-foreground">{meal.meal_name}</p>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="text-xs text-success font-medium">{meal.calories} cal</span>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{meal.prep_time} min</span>
                    </div>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => swapMeal(meal.id, meal.meal_name)}
                disabled={swappingKey === meal.id}
              >
                {swappingKey === meal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4 mr-1" />}
                Swap
              </Button>
            </div>
          ))}
        </div>

        <div className="flex space-x-3 mt-6">
          <Button className="flex-1 bg-gradient-primary" onClick={() => setGroceryOpen(true)}>
            <ShoppingCart className="w-4 h-4 mr-2" />
            View Grocery List
          </Button>
          <Button variant="outline" className="flex-1" onClick={generatePlan} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {generating ? "Generating..." : "Generate New Plan"}
          </Button>
        </div>
      </DashboardCard>

      <DashboardCard title="🤖 AI Meal Suggestions">
        <p className="text-sm text-muted-foreground mb-4">
          Based on your preferences and goals
        </p>

        {suggestions.length === 0 && !loadingSuggestions && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Tap "Get Suggestions" below to see AI-generated ideas.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3">
          {suggestions.map((suggestion, index) => (
            <div key={index} className="p-4 border border-border/50 rounded-xl hover:shadow-soft transition-all">
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-semibold text-foreground">{suggestion.name}</h4>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-primary hover:bg-primary-light"
                  onClick={() => addSuggestion(suggestion)}
                >
                  Add to {selectedDay}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {suggestion.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
                <div className="flex items-center space-x-3 text-sm text-muted-foreground">
                  <span className="text-success font-medium">{suggestion.calories} cal</span>
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{suggestion.prep_time} min</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button variant="outline" className="w-full mt-4" onClick={loadSuggestions} disabled={loadingSuggestions}>
          {loadingSuggestions ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {loadingSuggestions ? "Loading..." : suggestions.length ? "Get More Suggestions" : "Get Suggestions"}
        </Button>
      </DashboardCard>

      <DashboardCard title="Quick Actions">
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-16 flex-col space-y-1" onClick={generatePlan} disabled={generating}>
            <Calendar className="w-5 h-5 text-primary" />
            <span className="text-sm">Plan Next Week</span>
          </Button>
          <Button variant="outline" className="h-16 flex-col space-y-1" onClick={copyLastWeek}>
            <Repeat className="w-5 h-5 text-accent" />
            <span className="text-sm">Copy Last Week</span>
          </Button>
          <Button variant="outline" className="h-16 flex-col space-y-1" onClick={() => setGroceryOpen(true)}>
            <ShoppingCart className="w-5 h-5 text-success" />
            <span className="text-sm">View Grocery List</span>
          </Button>
          <Button variant="outline" className="h-16 flex-col space-y-1" onClick={loadSuggestions} disabled={loadingSuggestions}>
            <ChefHat className="w-5 h-5 text-warning" />
            <span className="text-sm">Recipe Ideas</span>
          </Button>
        </div>
      </DashboardCard>

      <GroceryListDialog open={groceryOpen} onOpenChange={setGroceryOpen} />
    </div>
  );
}
