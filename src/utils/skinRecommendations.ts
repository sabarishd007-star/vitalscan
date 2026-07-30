import type { SkinAnalysisResult } from "./skinEngine";

export interface Product {
  name: string;
  benefit: string;
  targetIssue: string;
}

export interface RoutineStep {
  order: number;
  step: string;
  product: string;
  why: string;
}

export interface IssueGuide {
  issue: string;
  severity: "Mild" | "Moderate" | "Severe";
  description: string;
  causes: string[];
  howToFix: string[];
  avoid: string[];
  ingredients: string[];
  timeToImprove: string;
}

export interface LifestyleTip {
  icon: string;
  tip: string;
  detail: string;
}

export interface SkinRecommendations {
  morningRoutine: RoutineStep[];
  nightRoutine: RoutineStep[];
  products: Product[];
  issueGuides: IssueGuide[];
  lifestyleTips: LifestyleTip[];
  keyIngredients: { ingredient: string; benefit: string; for: string }[];
}

const baseIngredients = [
  { ingredient: "Niacinamide (4–10%)", benefit: "Helps regulate sebum, supports the skin barrier, and fades uneven tone.", for: "Oily, combination, and pigmented skin" },
  { ingredient: "Hyaluronic Acid + Glycerin", benefit: "Draws moisture into the skin layers to instantly restore hydration.", for: "Dehydrated or dry skin" },
  { ingredient: "Ceramides", benefit: "Restructures and seals the skin moisture barrier to stop flakiness.", for: "Dry or sensitive skin" },
  { ingredient: "Vitamin C (L-Ascorbic Acid)", benefit: "Brightens dull skin, provides antioxidant defense, and fades dark spots.", for: "Dullness, tanning, and pigmentation" },
  { ingredient: "Salicylic Acid (BHA 1–2%)", benefit: "Penetrates deep inside pores to dissolve oil and clear blackheads/breakouts.", for: "Acne, blackheads, and oily skin" },
  { ingredient: "Azelaic Acid (10%)", benefit: "Calms inflammatory redness, rosacea, and targets hyperpigmentation.", for: "Redness, melasma, and acne marks" },
  { ingredient: "Retinol (0.1–0.3%)", benefit: "Accelerates cellular turnover, boosting collagen and smoothing fine lines.", for: "Ageing, fine lines, texture, and scars" },
  { ingredient: "Centella Asiatica (Cica)", benefit: "Soothes irritated, sunburned, or compromised skin instantly.", for: "Sensitive skin and sunburn" },
  { ingredient: "Caffeine (3-5%)", benefit: "Vasoconstrictor that reduces the appearance of fluid retention and dark shadows.", for: "Under-eye puffiness and dark circles" },
];

function severity(value: number): "Mild" | "Moderate" | "Severe" {
  if (value >= 7.0) return "Severe";
  if (value >= 4.5) return "Moderate";
  return "Mild";
}

function step(order: number, name: string, product: string, why: string): RoutineStep {
  return { order, step: name, product, why };
}

export function generateRecommendations(result: SkinAnalysisResult): SkinRecommendations {
  // ─── 1. Determine Dynamic Products based on priority ───
  const products: Product[] = [
    { name: "Broad-Spectrum Mineral SPF 50+", benefit: "Blocks UV rays to prevent sun damage and pigmentation from darkening.", targetIssue: "Sun Protection" }
  ];

  if (result.acneLevel > 4 || result.blackheads > 4) {
    products.push({
      name: "Salicylic Acid 2% Exfoliating Liquid",
      benefit: "Unclogs pore walls and prevents micro-comedones from forming.",
      targetIssue: "Acne & Blackheads"
    });
  }

  if (result.oiliness > 5.5) {
    products.push({
      name: "Niacinamide 10% + Zinc 1% Serum",
      benefit: "Regulates sebum production and minimizes appearance of enlarged pores.",
      targetIssue: "Oil Control & Pores"
    });
  }

  if (result.dryness > 5.5 || result.dehydration > 5.5) {
    products.push({
      name: "Ceramide NP + Hyaluronic Acid Cream",
      benefit: "Fortifies the outer lipid layer to lock in deep hydration.",
      targetIssue: "Dryness & Dehydration"
    });
  }

  if (result.pigmentation > 4.5 || result.melasma > 4) {
    products.push({
      name: "Tranexamic Acid 3% + Vitamin C Serum",
      benefit: "Blocks melanin synthesis pathways to fade stubborn dark patches and melasma.",
      targetIssue: "Hyperpigmentation"
    });
  }

  if (result.redness > 5.0 || result.sunburn > 4.0) {
    products.push({
      name: "Centella Asiatica (Cica) Soothing Gel-Cream",
      benefit: "Cools skin temperature, reduces redness, and repairs compromised skin barrier.",
      targetIssue: "Sensitivity & Redness"
    });
  }

  if (result.darkCircles > 5.0 || result.puffiness > 4.5) {
    products.push({
      name: "Caffeine 5% + EGCG Eye Serum",
      benefit: "Fades dark pigments and drains lymphatic fluid under the eyes.",
      targetIssue: "Under-eye Care"
    });
  }

  if (result.aging > 4.5 || result.texture > 5.0) {
    products.push({
      name: "Retinol 0.2% in Squalane Serum",
      benefit: "Stimulates collagen synthesis to smooth fine lines and refine uneven texture.",
      targetIssue: "Ageing & Texture"
    });
  }

  // ─── 2. Formulate AM/PM Routines ───
  // Cleanser choice
  let cleanser = "Gentle Hydrating Cleanser (Glycerin/Ceramides)";
  if (result.oiliness > 6.0 || result.acneLevel > 5.0) {
    cleanser = "Salicylic Acid (BHA) Clarifying Foaming Cleanser";
  } else if (result.redness > 5.5 || result.sunburn > 4.5) {
    cleanser = "Ultra-Calming Creamy Cleanser (Fragrance-Free)";
  }

  // Morning Serum
  let amSerum = "Hyaluronic Acid Hydrating Serum";
  if (result.pigmentation > 4.5 || result.tanning > 4.5 || result.dullness > 5.0) {
    amSerum = "Vitamin C (L-Ascorbic Acid) 15% Serum";
  } else if (result.oiliness > 5.5) {
    amSerum = "Niacinamide 10% Serum";
  } else if (result.redness > 5.0) {
    amSerum = "Azelaic Acid 10% Suspension";
  }

  // Moisturizer
  let moisturizer = "Daily Lightweight Gel-Moisturizer";
  if (result.dryness > 6.0) {
    moisturizer = "Rich Barrier-Repair Cream with Ceramides & Shea Butter";
  } else if (result.oiliness > 6.5) {
    moisturizer = "Oil-Free Mattifying Hydrator";
  } else if (result.redness > 5.0 || result.sunburn > 4.0) {
    moisturizer = "Soothing Panthenol & Centella Gel-Cream";
  }

  // Night Treatment Active
  let pmTreatment = "Niacinamide Barrier Serum";
  let pmTreatmentWhy = "Supports skin barrier restoration overnight.";
  if (result.acneLevel > 4.5) {
    pmTreatment = "Salicylic Acid 2% Treatment (2-3x weekly)";
    pmTreatmentWhy = "Exfoliates pore linings to clear breakouts and prevent blemishes.";
  } else if (result.aging > 4.0 || result.acneScars > 4.0 || result.texture > 5.0) {
    pmTreatment = "Retinol 0.2% Serum (start 2x weekly)";
    pmTreatmentWhy = "Boosts skin cell renewal to fade scars, smooth wrinkles, and improve texture.";
  } else if (result.melasma > 4.0 || result.pigmentation > 5.5) {
    pmTreatment = "Azelaic Acid 10% + Kojic Acid Cream";
    pmTreatmentWhy = "Reduces hyperactive pigment production during overnight cellular cycle.";
  } else if (result.dryness > 5.5 || result.dehydration > 5.5) {
    pmTreatment = "Squalane Facial Oil (layer under moisturizer)";
    pmTreatmentWhy = "Prevents trans-epidermal water loss while you sleep.";
  }

  const morningRoutine = [
    step(1, "Cleanse", cleanser, "Removes sweat and sebum buildup without stripping the skin's lipid barrier."),
    step(2, "Prevent & Brighten", amSerum, "Addresses skin tone, dullness, or sebum regulation with active antioxidants."),
    step(3, "Moisturize", moisturizer, "Maintains healthy hydration levels and seals the skin surface."),
    step(4, "Sun Protection", "Broad-Spectrum Mineral SPF 50+", "CRITICAL: Prevents UV damage from worsening acne marks, pigmentation, and skin aging.")
  ];

  const nightRoutine = [
    step(1, "Double Cleanse", cleanser, "Thoroughly removes sweat, debris, and sunscreen residue accumulated during the day."),
    step(2, "Targeted Night Active", pmTreatment, pmTreatmentWhy),
    step(3, "Moisturize", moisturizer, "Facilitates overnight skin repair and hydration replenishment."),
  ];

  // Under-eye step if needed
  if (result.darkCircles > 4.5 || result.puffiness > 4.5) {
    nightRoutine.push(step(4, "Eye Care", "Caffeine & Peptide Eye Cream", "Reduces fluid retention and dark circles around the thin orbital skin. Apply gently using ring finger."));
  }

  // ─── 3. Formulate Detailed Cure Guides ───
  const issueGuides: IssueGuide[] = [];

  if (result.acneLevel >= 4.0) {
    issueGuides.push({
      issue: "Acne & Breakouts",
      severity: severity(result.acneLevel),
      description: "Inflammatory breakouts, pustules, and clogged pores triggered by sebum excess and bacteria.",
      causes: ["Hyperactive oil glands", "Build-up of dead skin cells", "Hormonal shifts or stress"],
      howToFix: [
        "Wash with Salicylic Acid cleanser twice daily.",
        "Apply Benzoyl Peroxide spot treatment on active blemishes.",
        "Stick to non-comedogenic (pore-safe) moisturizers."
      ],
      avoid: ["Popping or squeezing pimples (leads to permanent scarring)", "Harsh physical scrubs", "Over-washing which prompts reactive oil secretion"],
      ingredients: ["Salicylic Acid (BHA)", "Benzoyl Peroxide", "Niacinamide"],
      timeToImprove: "4–6 weeks of consistent use"
    });
  }

  if (result.blackheads >= 4.0) {
    issueGuides.push({
      issue: "Blackheads & Whiteheads",
      severity: severity(result.blackheads),
      description: "Non-inflammatory clogged pores (comedones) oxidising on contact with air (blackheads) or remaining closed (whiteheads).",
      causes: ["Excess sebum in T-zone", "Pore lining cell buildup", "Heavy cosmetic products"],
      howToFix: [
        "Incorporate a 2% BHA liquid exfoliant 3 times a week.",
        "Use a weekly kaolin clay mask on the T-zone.",
        "Use double cleansing in the evening to dissolve sebum."
      ],
      avoid: ["Nose strips (can rupture facial capillaries)", "Heavy comedogenic makeup and oils"],
      ingredients: ["Salicylic Acid", "Clay (Kaolin/Bentonite)", "Retinol"],
      timeToImprove: "3–5 weeks"
    });
  }

  if (result.dryness >= 4.5 || result.dehydration >= 4.5) {
    issueGuides.push({
      issue: "Dryness & Dehydration",
      severity: severity(Math.max(result.dryness, result.dehydration)),
      description: "Skin lacking natural oils (dryness) or water content (dehydration), leading to tightness and flakiness.",
      causes: ["Weakened moisture barrier", "Dry climates or indoor heating", "Cleansers with harsh sulfates"],
      howToFix: [
        "Apply Hyaluronic Acid serum to damp skin immediately after cleansing.",
        "Seal moisture using a thick barrier cream containing Ceramides.",
        "Drink at least 2.5L of water daily."
      ],
      avoid: ["Washing face with hot water", "Products with denatured alcohol or strong fragrance", "Skipping moisturizer when oily"],
      ingredients: ["Ceramides", "Hyaluronic Acid", "Glycerin", "Squalane"],
      timeToImprove: "1–2 weeks"
    });
  }

  if (result.redness >= 4.5 || result.sunburn >= 4.0) {
    issueGuides.push({
      issue: "Redness & Skin Sensitivity",
      severity: severity(Math.max(result.redness, result.sunburn)),
      description: "Compromised skin barrier resulting in visible dilated blood vessels, flushing, and burning sensations.",
      causes: ["Overuse of exfoliating acids", "Sunburn or weather changes", "Allergic reaction to fragrances/preservatives"],
      howToFix: [
        "Strip routine down to basic cleanser, soothing barrier cream, and SPF.",
        "Use Centella Asiatica or Panthenol products to reduce skin inflammation.",
        "Apply cool compresses to soothe hot, flushed areas."
      ],
      avoid: ["Retinoids, AHAs, and vitamin C until skin is fully healed", "Essential oils and alcohol-based toners"],
      ingredients: ["Centella Asiatica", "Panthenol (Vitamin B5)", "Allantoin", "Colloidal Oatmeal"],
      timeToImprove: "3–7 days (barrier repair can take up to 28 days)"
    });
  }

  if (result.pigmentation >= 4.5 || result.melasma >= 4.0 || result.tanning >= 4.5) {
    issueGuides.push({
      issue: "Pigmentation & Sun Damage",
      severity: severity(Math.max(result.pigmentation, result.melasma, result.tanning)),
      description: "Excess melanin deposits appearing as dark spots, patchy melasma, or generalized sun tanning.",
      causes: ["UV radiation exposure", "Post-inflammatory hyperpigmentation (PIH) from acne", "Hormonal triggers (melasma)"],
      howToFix: [
        "Apply a mineral sunscreen SPF 50+ every single morning without fail.",
        "Integrate Tyrosinase inhibitors (Vitamin C, Alpha Arbutin, or Azelaic Acid).",
        "Wear wide-brimmed hats when outdoors."
      ],
      avoid: ["Skipping sunscreen on cloudy days or indoors", "Picking at scabs or active acne"],
      ingredients: ["Vitamin C", "Alpha Arbutin", "Azelaic Acid", "Tranexamic Acid"],
      timeToImprove: "8–12 weeks of consistent UV protection"
    });
  }

  if (result.aging >= 4.0) {
    issueGuides.push({
      issue: "Ageing & Fine Lines",
      severity: severity(result.aging),
      description: "Decreased skin elasticity and collagen breakdown leading to visible wrinkles and creases, especially around forehead and eyes.",
      causes: ["Natural depletion of collagen & elastin", "UV damage (photoageing)", "Repetitive facial expressions"],
      howToFix: [
        "Introduce a Retinoid at night to stimulate cellular renewal.",
        "Incorporate Peptides to support skin firmness.",
        "Keep skin highly hydrated to plump out fine lines."
      ],
      avoid: ["Skipping sunscreen (UV rays account for 80% of premature skin aging)", "Dehydration and smoking"],
      ingredients: ["Retinol / Retinoids", "Peptides", "Hyaluronic Acid", "Coenzyme Q10"],
      timeToImprove: "12–24 weeks (structural collagen takes time to rebuild)"
    });
  }

  if (result.poreVisibility >= 5.0 || result.texture >= 5.0) {
    issueGuides.push({
      issue: "Enlarged Pores & Texture",
      severity: severity(Math.max(result.poreVisibility, result.texture)),
      description: "Rough skin surface texture and dilated pores, usually caused by excess oil flow stretching the pore walls.",
      causes: ["Excess sebum production", "Loss of skin elasticity surrounding the pore", "Dead skin buildup"],
      howToFix: [
        "Use Niacinamide daily to contract pore walls by regulating oil output.",
        "Incorporate a weekly clay mask and bi-weekly chemical exfoliation (AHA/BHA).",
        "Keep skin hydrated so skin swells slightly, hiding pores."
      ],
      avoid: ["Heavy, occlusive oil-based cosmetics", "Aggressive squeezing of pores"],
      ingredients: ["Niacinamide", "Salicylic Acid (BHA)", "Glycolic Acid (AHA)"],
      timeToImprove: "4–8 weeks"
    });
  }

  // ─── 4. Lifestyle Tips ───
  const lifestyleTips: LifestyleTip[] = [
    { icon: "☀️", tip: "Apply SPF 50+ Daily", detail: "Apply two finger lengths of sunscreen every morning. UV rays degrade skin collagen and darken spots even through windows." },
    { icon: "💧", tip: "Double-Cleanse in the Evening", detail: "Use an oil-based cleanser followed by a water-based cleanser to lift heavy sunscreens, makeup, and dissolved sebum." },
    { icon: "🛏️", tip: "Change Pillowcases 2x Weekly", detail: "Dirty pillowcases transfer accumulated skin oils, hair products, and dust back to your face, promoting acne." },
    { icon: "🥗", tip: "Antioxidant & Hydration Diet", detail: "Eat foods rich in Vitamin C, E, and Omega-3 fatty acids, and aim for 2.5 liters of water daily to support skin hydration from within." }
  ];

  if (result.redness > 5.0 || result.sunburn > 4.0) {
    lifestyleTips.push({ icon: "🧊", tip: "Avoid Hot Water", detail: "Wash your face with lukewarm or cool water. Hot water strips natural lipids and aggravates redness/rosacea." });
  }

  if (result.darkCircles > 5.0 || result.puffiness > 4.5) {
    lifestyleTips.push({ icon: "😴", tip: "Elevate Head While Sleeping", detail: "Use an extra pillow to keep your head slightly elevated. This prevents lymphatic fluid from pooling under your eyes overnight." });
  }

  return {
    morningRoutine,
    nightRoutine,
    products,
    issueGuides,
    lifestyleTips,
    keyIngredients: baseIngredients
  };
}
