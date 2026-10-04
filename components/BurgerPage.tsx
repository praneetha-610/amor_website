import Link from "next/link";
import { formatPrice, getBurger, siteConfig, type BurgerKey } from "@/config/site";
import { getPublicAvailabilitySafe } from "@/lib/inventory";
import { BurgerArt } from "./BurgerArt";
import { BookingFlow } from "./booking/BookingFlow";
import { LiveInventory } from "./InventoryMeter";
import { Reveal } from "./Reveal";

/**
 * One structure, two identities: the theme-* class on the root swaps the whole
 * palette/type treatment (see styles/burger.css). All copy comes from config/site.ts.
 */
export async function BurgerPage({ burger }: { burger: BurgerKey }) {
  const cfg = getBurger(burger);
  const other = getBurger(burger === "cheese" ? "nashville" : "cheese");
  const availability = await getPublicAvailabilitySafe();
  const index = burger === "cheese" ? "01" : "02";

  return (
    <div className={`bp theme-${burger}`}>
      {/* HERO */}
      <section className="bp-hero" aria-labelledby="bp-title">
        <div className="wrap bp-hero__grid">
          <div className="bp-hero__copy">
            <p className="bp-kicker">BURGER {index} · {cfg.tagline}</p>
            <h1 id="bp-title" className="bp-title">{cfg.heroTitle}</h1>
            <p className="bp-headline">
              {cfg.heroHeadline.map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </p>
            <p className="bp-desc">{cfg.description}</p>
            <div className="bp-hero__ctas">
              <a href="#claim" className="btn btn--accent btn--lg">
                {cfg.bookingTitle} <span aria-hidden className="arrow">→</span>
              </a>
              <span className="bp-price">{formatPrice(cfg.price)}</span>
            </div>
          </div>
          <div className="bp-hero__visual">
            <div className="bp-hero__disc" aria-hidden />
            <BurgerArt burger={burger} className="bp-hero__burger" priority />
          </div>
        </div>
      </section>

      {/* LIMITED DROP + live inventory */}
      <section className="bp-section bp-drop" aria-labelledby="drop-title">
        <div className="wrap bp-drop__grid">
          <Reveal>
            <p className="eyebrow">LIMITED DROP</p>
            <h2 id="drop-title" className="display-lg">{cfg.dailyLimit} BURGERS<br />/ DAY</h2>
            <p className="lede">{cfg.scarcityLine}</p>
          </Reveal>
          <Reveal delay={120}>
            <LiveInventory burger={burger} initial={availability} />
          </Reveal>
        </div>
      </section>

      {/* INGREDIENTS (edit in config/site.ts) */}
      <section className="bp-section bp-ingredients" aria-labelledby="ing-title">
        <div className="wrap">
          <Reveal>
            <h2 id="ing-title" className="display-lg">{cfg.ingredientsTitle}</h2>
          </Reveal>
        </div>
        <ul className="ing-rail" aria-label="Ingredients">
          {cfg.ingredients.map((ing, i) => (
            <Reveal as="li" key={ing.name} delay={i * 70} className="ing">
              <span className="ing__n">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="ing__name">{ing.name}</h3>
              <p className="ing__desc">{ing.description}</p>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* PRICE */}
      <section className="bp-section bp-price-section" aria-labelledby="price-title">
        <div className="wrap bp-price-section__inner">
          <Reveal>
            <h2 id="price-title" className="eyebrow">PRICE</h2>
            <p className="bp-price-big">{formatPrice(cfg.price)}</p>
            <p className="lede">{siteConfig.paymentNote}</p>
          </Reveal>
        </div>
      </section>

      {/* BOOKING */}
      <section id="claim" className="bp-section bp-claim" aria-labelledby="claim-title">
        <div className="wrap bp-claim__inner">
          <header className="bp-claim__head">
            <h2 id="claim-title" className="display-xl">{cfg.bookingTitle}</h2>
            <p className="bp-claim__sub">Only {cfg.dailyLimit} are made each day.</p>
          </header>
          <BookingFlow fixedBurger={burger} initial={availability} />
        </div>
      </section>

      {/* Cross-sell */}
      <section className="bp-other">
        <div className="wrap bp-other__inner">
          <p className="eyebrow">ALSO DROPPING</p>
          <Link href={other.path} className="bp-other__link">
            {other.name} <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
