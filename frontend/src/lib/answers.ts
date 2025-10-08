export async function askAnswer(query: string): Promise<string> {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  const res = await fetch(`${base}/api/answers/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error("Answering API error");
  const data = (await res.json()) as { text: string };
  return data.text;
}





