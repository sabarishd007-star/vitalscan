import type { SkinAnalysisResult } from "./skinEngine";

export interface Product { name: string; benefit: string; targetIssue: string; }
export interface RoutineStep { order: number; step: string; product: string; why: string; }
export interface IssueGuide { issue: string; severity: "Mild" | "Moderate" | "Severe"; description: string; causes: string[]; howToFix: string[]; avoid: string[]; ingredients: string[]; timeToImprove: string; }
export interface LifestyleTip { icon: string; tip: string; detail: string; }
export interface SkinRecommendations { morningRoutine: RoutineStep[]; nightRoutine: RoutineStep[]; products: Product[]; issueGuides: IssueGuide[]; lifestyleTips: LifestyleTip[]; keyIngredients: { ingredient: string; benefit: string; for: string }[]; }

const baseIngredients = [
  { ingredient: "Niacinamide (4–10%)", benefit: "Helps regulate oil, support the barrier, and improve uneven tone.", for: "Oily, combination, and uneven-looking skin" },
  { ingredient: "Hyaluronic Acid + Glycerin", benefit: "Draws water into the outer skin layer to support hydration.", for: "Dehydrated or dry skin" },
  { ingredient: "Ceramides", benefit: "Support the moisture barrier and reduce the feeling of dryness.", for: "Dry or sensitive skin" },
  { ingredient: "Vitamin C", benefit: "Provides antioxidant support and helps improve the appearance of dark spots.", for: "Dullness and pigmentation" },
  { ingredient: "Salicylic Acid (0.5–2%)", benefit: "Exfoliates inside pores to help with blackheads and breakouts.", for: "Oily and acne-prone skin" },
  { ingredient: "Azelaic Acid (10%)", benefit: "Helps calm visible redness and improve post-blemish marks.", for: "Redness, acne marks, and uneven tone" },
  { ingredient: "Retinol (0.1–0.3%)", benefit: "Supports cell turnover and smoother-looking texture when introduced slowly.", for: "Texture, blemishes, and pigmentation" },
  { ingredient: "Caffeine", benefit: "May temporarily improve the appearance of under-eye puffiness.", for: "Puffy-looking under-eyes" },
];

function severity(value: number): "Mild" | "Moderate" | "Severe" { return value >= 7 ? "Severe" : value >= 5 ? "Moderate" : "Mild"; }
function step(order: number, name: string, product: string, why: string): RoutineStep { return { order, step: name, product, why }; }

function routines(result: SkinAnalysisResult) {
  const cleanser = result.oiliness > 5 ? "Gentle foaming cleanser with salicylic acid" : result.dryness > 5 ? "Low-pH hydrating cleanser with glycerin" : "Fragrance-free gentle cleanser";
  const serum = result.pigmentation > 4 ? "Vitamin C serum" : result.oiliness > 5 ? "Niacinamide 4–10% serum" : "Hyaluronic acid and panthenol serum";
  const moisturizer = result.dryness > 5 ? "Ceramide-rich moisturizer" : result.oiliness > 5 ? "Oil-free gel moisturizer with humectants" : "Lightweight glycerin and ceramide moisturizer";
  return {
    morningRoutine: [step(1, "Cleanse", cleanser, "Removes overnight buildup without over-stripping the skin."), step(2, "Targeted serum", serum, "Addresses your most visible skin priority."), step(3, "Moisturize", moisturizer, "Helps maintain comfort and support the skin barrier."), step(4, "Sunscreen", "Broad-spectrum SPF 50+ sunscreen", "Apply generously every morning and reapply when exposed to daylight.")],
    nightRoutine: [step(1, "Cleanse", cleanser, "Removes sunscreen, makeup, and daily buildup."), step(2, "Treatment", result.acneLevel > 4 ? "Salicylic acid 0.5–2% leave-on treatment" : result.texture > 4 ? "Lactic acid 5% exfoliant, 2–3 nights weekly" : "Niacinamide 4–10% serum", "Use one active treatment at a time and reduce frequency if irritation occurs."), step(3, "Retinoid night", "Retinol 0.1–0.3%, starting 2 nights weekly", "Use only at night; avoid using it in the same routine as exfoliating acids."), step(4, "Moisturize", moisturizer, "Seals in hydration and supports overnight recovery.")],
  };
}

function guides(result: SkinAnalysisResult): IssueGuide[] {
  const list: IssueGuide[] = [];
  if (result.acneLevel >= 3) list.push({ issue: "Acne & Breakouts", severity: severity(result.acneLevel), description: "Breakouts can be associated with excess oil, clogged pores, inflammation, and skin irritation.", causes: ["Excess sebum", "Clogged pores", "Irritating or heavy products"], howToFix: ["Cleanse gently twice daily.", "Introduce salicylic acid slowly, two to three times weekly.", "Use a non-comedogenic moisturizer and daily sunscreen."], avoid: ["Picking blemishes", "Harsh scrubs", "Stacking several strong active ingredients"], ingredients: ["Salicylic Acid", "Niacinamide", "Azelaic Acid"], timeToImprove: "Allow 6–8 weeks of consistent care." });
  if (result.dryness >= 3 || result.hydration <= 5) list.push({ issue: "Dryness & Dehydration", severity: severity(Math.max(result.dryness, 10 - result.hydration)), description: "Dry or dehydrated skin can feel tight, flaky, or less comfortable.", causes: ["A weakened moisture barrier", "Harsh cleansing", "Low humidity"], howToFix: ["Use a low-pH gentle cleanser.", "Apply humectants to slightly damp skin.", "Follow with a ceramide-rich moisturizer."], avoid: ["Hot water", "Fragrance-heavy products", "Over-exfoliation"], ingredients: ["Glycerin", "Hyaluronic Acid", "Ceramides"], timeToImprove: "Comfort can improve in 2–4 weeks." });
  if (result.pigmentation >= 3 || result.redness >= 3) list.push({ issue: "Uneven Tone & Redness", severity: severity(Math.max(result.pigmentation, result.redness)), description: "Visible uneven tone and redness need consistent, gentle care and strong sun protection.", causes: ["Sun exposure", "Inflammation", "Post-blemish marks"], howToFix: ["Use broad-spectrum SPF 50+ daily.", "Add niacinamide or azelaic acid gradually.", "Use vitamin C in the morning if tolerated."], avoid: ["Skipping sunscreen", "Aggressive exfoliation", "Unnecessary fragrance"], ingredients: ["Sunscreen", "Niacinamide", "Azelaic Acid", "Vitamin C"], timeToImprove: "Expect gradual change over 8–12 weeks." });
  return list;
}

export function generateRecommendations(result: SkinAnalysisResult): SkinRecommendations {
  const products: Product[] = [{ name: "Broad-spectrum SPF 50+ sunscreen", benefit: "Helps prevent worsening of visible pigmentation and uneven tone.", targetIssue: "Daily UV protection" }];
  if (result.oiliness > 4 || result.acneLevel > 3) products.push({ name: "Salicylic acid 0.5–2% cleanser or leave-on treatment", benefit: "Helps clear pore congestion and reduce the appearance of blemishes.", targetIssue: "Oiliness & breakouts" }, { name: "Niacinamide 4–10% serum", benefit: "Supports oil balance and the skin barrier.", targetIssue: "Oiliness & pores" });
  if (result.dryness > 4 || result.hydration < 6) products.push({ name: "Ceramide and glycerin moisturizer", benefit: "Supports the moisture barrier and longer-lasting hydration.", targetIssue: "Dryness & dehydration" });
  if (result.pigmentation > 3) products.push({ name: "Vitamin C or azelaic acid serum", benefit: "Helps improve the appearance of dark spots and uneven tone.", targetIssue: "Pigmentation" });
  if (result.darkCircles > 3) products.push({ name: "Caffeine eye serum", benefit: "May temporarily reduce the appearance of puffiness.", targetIssue: "Under-eye puffiness" });
  const routine = routines(result);
  return { ...routine, products, issueGuides: guides(result), lifestyleTips: [{ icon: "☀️", tip: "Apply sunscreen every morning", detail: "Use broad-spectrum SPF 50+ as the final morning step and reapply with daylight exposure." }, { icon: "💧", tip: "Keep your routine gentle", detail: "Use lukewarm water and avoid introducing several active ingredients at once." }, { icon: "🛏️", tip: "Change pillowcases regularly", detail: "Fresh pillowcases reduce transfer of oil, hair products, and buildup to your face." }, { icon: "🧴", tip: "Patch test new ingredients", detail: "Test a new product on a small area before applying it to your full face." }], keyIngredients: baseIngredients };
}
