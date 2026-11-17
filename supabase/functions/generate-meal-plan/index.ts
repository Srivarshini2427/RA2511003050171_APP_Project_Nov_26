// Generate a weekly meal plan using Lovable AI Gateway
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mode, dietaryPreferences, allergies, calorieTarget, mealName } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI gateway not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = "";
    let userPrompt = "";
    let toolDef: any;

    const prefs = `Dietary preferences: ${(dietaryPreferences || []).join(", ") || "none"}. Allergies: ${(allergies || []).join(", ") || "none"}. Daily calorie target: ${calorieTarget || 2200}.`;

    if (mode === "week") {
      systemPrompt = "You are a nutritionist. Generate a 7-day meal plan with breakfast, lunch, and dinner for each day.";
      userPrompt = `Generate a varied, healthy 7-day meal plan. ${prefs}`;
      toolDef = {
        type: "function",
        function: {
          name: "save_meal_plan",
          parameters: {
            type: "object",
            properties: {
              meals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    day_of_week: { type: "string", enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
                    meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
                    meal_name: { type: "string" },
                    calories: { type: "number" },
                    prep_time: { type: "number", description: "Prep time in minutes" },
                  },
                  required: ["day_of_week", "meal_type", "meal_name", "calories", "prep_time"],
                },
              },
            },
            required: ["meals"],
          },
        },
      };
    } else if (mode === "swap") {
      systemPrompt = "You are a nutritionist. Suggest a single replacement meal.";
      userPrompt = `Suggest one alternative meal to replace "${mealName}". ${prefs}`;
      toolDef = {
        type: "function",
        function: {
          name: "suggest_meal",
          parameters: {
            type: "object",
            properties: {
              meal_name: { type: "string" },
              calories: { type: "number" },
              prep_time: { type: "number" },
            },
            required: ["meal_name", "calories", "prep_time"],
          },
        },
      };
    } else {
      systemPrompt = "You are a nutritionist. Suggest 5 healthy recipe ideas.";
      userPrompt = `Suggest 5 varied recipe ideas. ${prefs}`;
      toolDef = {
        type: "function",
        function: {
          name: "suggest_recipes",
          parameters: {
            type: "object",
            properties: {
              recipes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    calories: { type: "number" },
                    prep_time: { type: "number" },
                    tags: { type: "array", items: { type: "string" } },
                  },
                  required: ["name", "calories", "prep_time", "tags"],
                },
              },
            },
            required: ["recipes"],
          },
        },
      };
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [toolDef],
        tool_choice: { type: "function", function: { name: toolDef.function.name } },
      }),
    });

    if (response.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (response.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI request failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "No response from AI" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
