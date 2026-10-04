/**
 * ════════════════════════════════════════════════════════════════
 *  AMOR FATI — SINGLE SOURCE OF TRUTH
 *  Everything you'll want to edit lives in this file:
 *  prices, daily limit, dates, copy, ingredients, contact details.
 * ════════════════════════════════════════════════════════════════
 */

export type BurgerKey = "cheese" | "nashville";

export interface Ingredient {
  name: string;
  /** Replace the placeholder text with the real description. */
  description: string;
}

export interface BurgerConfig {
  key: BurgerKey;
  /** URL path of the burger page */
  path: string;
  /** Short label used on buttons / chips */
  shortName: string;
  /** Full product name */
  name: string;
  /** Price in rupees. Change it here and it changes everywhere. */
  price: number;
  /** Per-burger daily cap. Defaults to site-wide dailyLimit. */
  dailyLimit: number;
  tagline: string;
  heroTitle: string;
  heroHeadline: [string, string] | [string];
  description: string;
  cardBlurb: string;
  cta: { view: string; claim: string; reserve: string };
  scarcityLine: string;
  /** Heading of the booking section */
  bookingTitle: string;
  ingredientsTitle: string;
  ingredients: Ingredient[];
  /**
   * Optional real photography. Drop a file in /public (e.g. /burgers/cheese.webp)
   * and set the path here — it replaces the built-in illustration everywhere.
   */
  photo?: string;
  /** Alt text used for the burger visual */
  alt: string;
}

const DAILY_LIMIT = 30; // ← 30 burgers → 40 burgers: change this one number.

export const siteConfig = {
  brandName: "AMOR FATI",
  cafeName: "Amor Fati Cafe",
  city: "Tirupati",
  siteTitle: "Amor Fati Limited Burger Drop | Tirupati",
  siteDescription:
    "Only 30 Super Cheese Burgers and 30 Nashville Fried Chicken Burgers available daily at Amor Fati Cafe, Tirupati. Reserve yours before you arrive.",

  // ── Inventory & booking rules ────────────────────────────────
  dailyLimit: DAILY_LIMIT,
  /** Max burgers one customer can reserve per burger per date. */
  maximumQuantityPerCustomer: 2,
  /** Shown near the price and the reserve button. Edit to match how you take payment. */
  paymentNote: "Reserve online. Pay at Amor Fati when you collect.",
  consentLine:
    "By reserving, you agree that Amor Fati may contact you regarding this reservation and future Amor Fati updates.",
  /** "Limited" label + urgent copy kicks in when remaining is BELOW this. */
  limitedThreshold: 10,
  /** Extra-urgent copy ("THE DROP IS ALMOST GONE") when remaining is BELOW this. */
  almostGoneThreshold: 5,

  /** First bookable date, "YYYY-MM-DD". null = today (India time). */
  bookingStartDate: null as string | null,
  /** Last bookable date, "YYYY-MM-DD". null = bookingStartDate + bookingDaysAhead. */
  bookingEndDate: null as string | null,
  bookingDaysAhead: 14,
  /**
   * Today's burgers stop being reservable after this time (24h, India time),
   * e.g. when the cafe closes. null = reservable all day.
   */
  todayBookingCutoff: "21:30" as string | null,

  // ── Contact / location ───────────────────────────────────────
  // TODO: replace the placeholders below with real details.
  phoneNumber: "+91 00000 00000",
  /** WhatsApp number, digits only with country code, e.g. "919876543210". Blank = generic share link. */
  whatsappNumber: "",
  instagramURL: "https://instagram.com/amorfaticafe",
  instagramHandle: "@amorfaticafe",
  location: {
    line1: "Amor Fati Cafe",
    line2: "Tirupati, Andhra Pradesh",
    hours: "Open daily · 10:00 AM – 10:00 PM",
    mapUrl: "https://maps.google.com/?q=Amor+Fati+Cafe+Tirupati",
  },

  // ── Burgers ──────────────────────────────────────────────────
  burgers: {
    cheese: {
      key: "cheese",
      path: "/super-cheese",
      shortName: "SUPER CHEESE",
      name: "SUPER CHEESE BURGER",
      price: 299, // ← TODO: real price
      dailyLimit: DAILY_LIMIT,
      tagline: "THE CHEESIEST DROP IN TOWN.",
      heroTitle: "SUPER CHEESE",
      heroHeadline: ["MORE CHEESE.", "LESS COMPROMISE."],
      description:
        "A stacked, unapologetically indulgent cheese burger. Molten layers, a proper sear and a sauce you'll think about later.",
      cardBlurb: "A premium, cheese-first burger. Molten, stacked, unapologetic.",
      cta: {
        view: "VIEW SUPER CHEESE",
        claim: "CLAIM SUPER CHEESE",
        reserve: "RESERVE MY BURGER",
      },
      scarcityLine: "WHEN THEY'RE GONE, THEY'RE GONE.",
      bookingTitle: "CLAIM YOURS",
      ingredientsTitle: "WHAT'S INSIDE",
      // TODO: replace descriptions with the real recipe notes.
      ingredients: [
        { name: "THE BUN", description: "Soft, toasted brioche-style bun. Placeholder — replace with your bun details." },
        { name: "THE PATTY", description: "Thick, seared patty with a proper crust. Placeholder — replace with patty details." },
        { name: "THE CHEESE", description: "Layers of melted cheese, in generous excess. Placeholder — name your cheeses here." },
        { name: "THE SAUCE", description: "House cheese sauce, made in small batches. Placeholder — describe the sauce." },
        { name: "THE EXTRAS", description: "Pickles, onions and finishing touches. Placeholder — list the rest." },
      ],
      alt: "Illustration of the Amor Fati Super Cheese Burger: two seared patties under melting yellow cheese",
    },
    nashville: {
      key: "nashville",
      path: "/nashville",
      shortName: "NASHVILLE",
      name: "NASHVILLE FRIED CHICKEN BURGER",
      price: 329, // ← TODO: real price
      dailyLimit: DAILY_LIMIT,
      tagline: "TURN UP THE HEAT.",
      heroTitle: "THE NASHVILLE DROP",
      heroHeadline: ["CRISPY. HOT.", "ADDICTIVE."],
      description:
        "A Nashville-inspired fried chicken burger built around a thick, crispy fried chicken fillet, bold heat and serious crunch.",
      cardBlurb: "Crispy Nashville fried chicken. Bold heat. Serious crunch.",
      cta: {
        view: "VIEW NASHVILLE",
        claim: "CLAIM NASHVILLE",
        reserve: "RESERVE MY NASHVILLE",
      },
      scarcityLine: "WHEN THEY'RE GONE, THEY'RE GONE.",
      bookingTitle: "RESERVE YOURS",
      ingredientsTitle: "BUILT FOR THE CRAVING",
      ingredients: [
        { name: "CRISPY FRIED CHICKEN", description: "A thick, juicy fillet with a shattering crust. Placeholder — replace with your marinade and fry details." },
        { name: "PICKLES", description: "Cool, sharp, crunchy — the counterpoint to the heat. Placeholder." },
        { name: "LETTUCE", description: "Fresh, crisp lettuce for contrast. Placeholder." },
        { name: "MAYO", description: "Cool creamy mayo to take the edge off. Placeholder." },
        { name: "NASHVILLE HOT SAUCE", description: "The signature heat. Placeholder — describe your spice level." },
        { name: "SOFT ROASTED BUN", description: "Soft, roasted bun that holds it all together. Placeholder." },
      ],
      alt: "Illustration of the Amor Fati Nashville Fried Chicken Burger: crispy chicken fillet glazed in hot red sauce",
    },
  } satisfies Record<BurgerKey, BurgerConfig>,
} as const;

export const BURGER_KEYS = Object.keys(siteConfig.burgers) as BurgerKey[];

export function getBurger(key: BurgerKey): BurgerConfig {
  return siteConfig.burgers[key];
}

export function isBurgerKey(v: unknown): v is BurgerKey {
  return typeof v === "string" && (BURGER_KEYS as string[]).includes(v);
}

export function formatPrice(price: number): string {
  return `₹${price.toLocaleString("en-IN")}`;
}
