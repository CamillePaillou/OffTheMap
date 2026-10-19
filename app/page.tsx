import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Off the Map</h1>
      <nav className="flex flex-col gap-3 text-lg">
        <Link href="/demande" className="underline underline-offset-4">
          Faire une demande de voyage
        </Link>
        <Link href="/conseiller" className="underline underline-offset-4">
          Espace conseiller
        </Link>
      </nav>
    </main>
  );
}
