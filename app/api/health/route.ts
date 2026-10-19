// Vérifie que l'application répond et qu'elle joint Supabase : `curl localhost:3000/api/health`.
export async function GET() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  let supabase: "ok" | "injoignable" = "injoignable";
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey },
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) supabase = "ok";
  } catch {
    // reste « injoignable »
  }

  return Response.json(
    { app: "ok", supabase },
    { status: supabase === "ok" ? 200 : 503 },
  );
}
