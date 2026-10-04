import type { Metadata } from "next";
import { LookupForm } from "@/components/LookupForm";

export const metadata: Metadata = {
  title: "My reservation",
  robots: { index: false, follow: true },
};

export default function MyReservationPage() {
  return (
    <section className="reserve">
      <div className="wrap reserve__inner reserve__inner--narrow">
        <p className="eyebrow">MY RESERVATION</p>
        <h1 className="display-lg">FIND YOURS.</h1>
        <p className="lede">Enter your reservation ID and the mobile number you booked with.</p>
        <LookupForm />
      </div>
    </section>
  );
}
