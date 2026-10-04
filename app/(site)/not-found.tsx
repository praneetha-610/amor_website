import Link from "next/link";

export default function NotFound() {
  return (
    <section className="reserve">
      <div className="wrap reserve__inner">
        <p className="eyebrow">404</p>
        <h1 className="display-xl">NOT<br />HERE.</h1>
        <p className="lede">That page doesn&apos;t exist. The burgers do — but not for long.</p>
        <Link href="/" className="btn btn--ink btn--lg">BACK TO AMOR FATI</Link>
      </div>
    </section>
  );
}
