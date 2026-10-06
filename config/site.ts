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
  /** UPPERCASE short label for chips, date cards, admin ("SUPER CHEESE") */
  shortName: string;
  /** Title-case name for sentences, WhatsApp text, summaries ("Super Cheese") */
  displayName: string;
  /** Text set in the licensed script font on the burger page hero (see public/fonts/README.md) */
  scriptTitle: string;
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
  // siteDescription is derived below (after the object) so it follows dailyLimit.

  // ── Inventory & booking rules ────────────────────────────────
  dailyLimit: DAILY_LIMIT,
  /** Max burgers one customer can reserve per burger per date. */
  maximumQuantityPerCustomer: 2,
  /** Shown near the price and the reserve button. Edit to match how you take payment. */
  paymentNote: "Nothing is charged online. You pay at Amor Fati when you collect.",
  /** Mandatory no-show consent — shown as a required checkbox before every reservation. */
  noShowConsent: {
    label: "I understand that by reserving this burger, I agree to pay for it even if I don't show up.",
    note: "Because we prepare these burgers in strictly limited quantities, a reservation means we prepare one specifically for you. No-shows can result in food waste, so we kindly ask you to reserve only if you are certain you can make it.",
    error: "Please tick the box to confirm you understand our reservation policy.",
  },
  consentLine:
    "By reserving, you agree that Amor Fati may contact you regarding this reservation and future Amor Fati updates.",
  /** "Limited" label + urgent copy kicks in when remaining is BELOW this. */
  limitedThreshold: 10,
  /** Extra-urgent copy ("THE DROP IS ALMOST GONE") when remaining is BELOW this. */
  almostGoneThreshold: 5,

  /** Leave null for the automatic rolling window. First bookable date, "YYYY-MM-DD" (India time). */
  bookingStartDate: null as string | null,
  /** Last bookable date, "YYYY-MM-DD". null = bookingStartDate + bookingDaysAhead. */
  bookingEndDate: null as string | null,
  /**
   * How many calendar dates are reservable, counting today.
   * 3 = TODAY, TOMORROW, DAY AFTER TOMORROW. Rolls over at 12:00 AM India time (Asia/Kolkata).
   */
  bookingDaysAhead: 3,
  /**
   * Today's burgers stop being reservable after this time (24h, India time) —
   * 30 min before closing so nobody reserves a burger the cafe can no longer serve.
   * Today's date card stays visible, marked CLOSED. null = reservable until midnight.
   */
  todayBookingCutoff: "22:00" as string | null,

  /** Teaser marquee at the very bottom of every page. Keep the ❤️ at the end. */
  teaserMessage:
    "WE ARE COMING UP WITH SOMETHING BIG….. THAT’S GONNA CHANGE THE CAFE CULTURE IN TIRUPATI. STAY TUNED ❤️",

  // ── Contact / location ───────────────────────────────────────
  // TODO: confirm the street address / map link below.
  phoneNumber: "+91 63090 29156", // how it's displayed
  phoneTel: "+916309029156", // used in tel: links (full international number)
  /** WhatsApp number, digits only with country code, e.g. "919876543210". Blank = generic share link. */
  whatsappNumber: "",
  instagramURL: "https://www.instagram.com/cafe.amorfati/",
  instagramHandle: "@cafe.amorfati",
  location: {
    line1: "Amor Fati Cafe",
    line2: "Tirupati, Andhra Pradesh",
    /** Single source of truth for opening hours — every page reads these. */
    hours: "12:30 PM – 10:30 PM",
    /** 24h, for structured data (schema.org). Keep in sync with `hours`. */
    opens: "12:30",
    closes: "22:30",
    mapUrl: "https://maps.google.com/?q=Amor+Fati+Cafe+Tirupati",
  },

  // ── Burgers ──────────────────────────────────────────────────
  burgers: {
    cheese: {
      key: "cheese",
      path: "/super-cheese",
      shortName: "SUPER CHEESE",
      displayName: "Super Cheese",
      scriptTitle: "Super Cheese",
      name: "SUPER CHEESE BURGER",
      price: 329, // ← single source of truth for the Super Cheese price
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
      displayName: "Nashville",
      scriptTitle: "The Nashville Drop",
      name: "NASHVILLE FRIED CHICKEN BURGER",
      price: 299, // ← single source of truth for the Nashville price
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

/** Derived text that must follow the config above. */
export const siteDescription =
  `Only ${siteConfig.dailyLimit} ${siteConfig.burgers.cheese.displayName} Burgers and ${siteConfig.dailyLimit} ${siteConfig.burgers.nashville.displayName} Fried Chicken Burgers available daily at ${siteConfig.cafeName}, ${siteConfig.city}. Reserve yours before you arrive.`;

/** Total for a reservation, in rupees. `unitPrice` = price snapshotted at booking time (falls back to current config). */
export function reservationTotal(burger: BurgerKey, quantity: number, unitPrice?: number | null): number {
  return (unitPrice ?? siteConfig.burgers[burger].price) * quantity;
}
