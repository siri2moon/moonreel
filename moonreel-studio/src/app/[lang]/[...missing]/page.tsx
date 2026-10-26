import { notFound } from "next/navigation";

// Every URL is rewritten into app/[lang], so unknown paths land here and render the localized 404.
export default function Missing() {
  notFound();
}
