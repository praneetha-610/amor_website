import Link from "next/link";
import type { Metadata } from "next";
import { BURGER_KEYS, formatPrice, getBurger, siteConfig, siteDescription } from "@/config/site";
import { getPublicAvailabilitySafe } from "@/lib/inventory";
import { BurgerArt } from "@/components/BurgerArt";
import { Reveal } from "@/components/Reveal";
import { LiveChip, TodaysDrop } from "@/components/TodaysDrop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: siteConfig.siteTitle },
  description: siteDescription,
};

export default async function LandingPage() {
  const availability = await getPublicAvailabilitySafe();
  const L = siteConfig.dailyLimit;
  const cheese = getBurger("cheese");
  const nashville = getBurger("nashville");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: siteConfig.cafeName,
    address: { "@type": "PostalAddress", addressLocality: siteConfig.city, addressCountry: "IN" },
    sameAs: [siteConfig.instagramURL],
    telephone: siteConfig.phoneTel,
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: siteConfig.location.opens,
      closes: siteConfig.location.closes,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* 1–3 · AMOR FATI / THE NEXT DROP IS HERE / 30 ONLY. EVERY DAY. */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <p className="hero__wordmark">{siteConfig.brandName}</p>
            <h1 id="hero-title" className="hero__title">
              <span className="line"><span>THE NEXT</span></span>
              <span className="line"><span>DROP IS</span></span>
              <span className="line"><span>HERE.</span></span>
            </h1>
            <p className="hero__sub">
              Two burgers.<br />
              {L} of each.<br />
              Every single day.
            </p>
            <p className="hero__support">
              Made in limited quantities. Reserved before you arrive. Served only to those who claimed theirs.
            </p>
            <div className="hero__ctas">
              <Link href="/reserve" className="btn btn--accent btn--lg">
                CLAIM YOUR BURGER <span aria-hidden className="arrow">→</span>
              </Link>
              <Link href="#drops" className="btn btn--outline-light btn--lg">EXPLORE THE DROPS</Link>
            </div>
          </div>

          <div className="hero__visual" aria-hidden={false}>
            <div className="hero__disc hero__disc--yellow" aria-hidden />
            <div className="hero__disc hero__disc--red" aria-hidden />
            <BurgerArt burger="cheese" className="hero__burger hero__burger--a" priority />
            <BurgerArt burger="nashville" className="hero__burger hero__burger--b" priority />
          </div>
        </div>

        <div className="wrap hero__today">
          <TodaysDrop initial={availability} />
        </div>
      </section>

      <div className="marquee" aria-hidden>
        <div className="marquee__track">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i}>{L} ONLY. EVERY DAY. <em>✦</em></span>
          ))}
        </div>
      </div>
      <p className="sr-only">{L} only. Every day. Two burgers. One limited drop.</p>

      {/* 4–5 · SUPER CHEESE vs NASHVILLE · Explore both */}
      <section id="drops" className="section drops" aria-labelledby="drops-title">
        <div className="wrap">
          <Reveal>
            <p className="eyebrow">TWO BURGERS. ONE LIMITED DROP.</p>
            <h2 id="drops-title" className="display-lg">CHOOSE YOUR DROP.</h2>
          </Reveal>

          <div className="drops__grid">
            {BURGER_KEYS.map((k, i) => {
              const b = getBurger(k);
              return (
                <Reveal key={k} delay={i * 120} className="drops__item">
                  <article className={`dcard dcard--${k}`}>
                    <Link href={b.path} className="dcard__link" aria-label={b.cta.view} tabIndex={-1} />
                    <div className="dcard__top">
                      <span className="dcard__num">BURGER 0{i + 1}</span>
                      <LiveChip burger={k} initial={availability} />
                    </div>
                    <BurgerArt burger={k} className="dcard__art" />
                    <h3 className="dcard__name">{b.name}</h3>
                    <p className="dcard__blurb">{b.cardBlurb}</p>
                    <ul className="dcard__facts">
                      <li>Only {b.dailyLimit} available daily</li>
                      <li>{formatPrice(b.price)}</li>
                      <li>Reserve yours</li>
                    </ul>
                    <Link href={b.path} className="btn btn--card btn--lg btn--block">
                      {b.cta.view} <span aria-hidden className="arrow">→</span>
                    </Link>
                  </article>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6 · Why the burgers are limited */}
      <section className="section limited" aria-labelledby="limited-title">
        <div className="wrap limited__grid">
          <Reveal>
            <p className="eyebrow">LIMITED BY DESIGN.</p>
            <h2 id="limited-title" className="limited__sum" aria-label={`${L} plus ${L}`}>
              <span className="limited__a">{L}</span>
              <span className="limited__plus">+</span>
              <span className="limited__b">{L}</span>
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="display-md">{L * 2} BURGERS.<br />EVERY DAY.</p>
            <p className="lede">
              We make only {L} {cheese.displayName} Burgers and {L} {nashville.displayName} Fried Chicken Burgers each day. Once
              they&apos;re gone, they&apos;re gone.
            </p>
          </Reveal>
        </div>
      </section>

      {/* 7 · About Amor Fati */}
      <section id="about" className="section about" aria-labelledby="about-title">
        <div className="wrap about__grid">
          <Reveal>
            <h2 id="about-title" className="display-lg about__title">AMOR<br />FATI</h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="about__story">
              Amor Fati is a modern café built around good food, good design and experiences worth
              remembering.
            </p>
            <p className="lede">
              We don&apos;t believe everything needs to be available all the time.{" "}
              <em className="serif">Some things are better when they&apos;re limited.</em>
            </p>
          </Reveal>
        </div>
      </section>

      {/* 8 · Location */}
      <section id="location" className="section location" aria-labelledby="loc-title">
        <div className="wrap location__grid">
          <Reveal>
            <p className="eyebrow">FIND US</p>
            <h2 id="loc-title" className="display-md">COME HUNGRY.<br />BRING YOUR CONFIRMATION.</h2>
          </Reveal>
          <Reveal delay={120}>
            <address className="location__card">
              <strong>{siteConfig.location.line1}</strong>
              <span>{siteConfig.location.line2}</span>
              <span>Open daily · {siteConfig.location.hours}</span>
              <span className="location__links">
                <a href={`tel:${siteConfig.phoneTel}`}>Call {siteConfig.phoneNumber}</a>
                <a href={siteConfig.location.mapUrl} target="_blank" rel="noopener noreferrer">Open in Maps ↗</a>
                <a href={siteConfig.instagramURL} target="_blank" rel="noopener noreferrer">{siteConfig.instagramHandle} ↗</a>
              </span>
            </address>
          </Reveal>
        </div>
      </section>

      {/* 9 · Final CTA */}
      <section className="final" aria-labelledby="final-title">
        <div className="wrap final__inner">
          <Reveal>
            <p className="eyebrow eyebrow--light">READY TO CLAIM YOURS?</p>
            <h2 id="final-title" className="final__big">
              {L} + {L}<br />THAT&apos;S IT.
            </h2>
            <p className="final__text">Once today&apos;s burgers are claimed, the next drop is tomorrow.</p>
            <div className="final__ctas">
              <Link href="/reserve?burger=cheese" className="btn btn--yellow btn--lg">
                {cheese.cta.claim} <span aria-hidden className="arrow">→</span>
              </Link>
              <Link href="/reserve?burger=nashville" className="btn btn--red btn--lg">
                {nashville.cta.claim} <span aria-hidden className="arrow">→</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
