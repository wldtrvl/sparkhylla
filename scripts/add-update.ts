/**
 * Post an entry to «Что нового» (app_updates) — run it after a user-visible change is deployed.
 *
 *   npm run updates:add -- <feature|content|fix> "<title in Russian>" "<text in Russian>" [/in-app/link]
 */
import { admin } from "./lib";

async function main() {
  const [kind, title, body, link] = process.argv.slice(2);
  if (!["feature", "content", "fix"].includes(kind) || !title) {
    console.error('Usage: npm run updates:add -- <feature|content|fix> "<title>" "<text>" [/link]');
    process.exit(1);
  }
  if (link && !link.startsWith("/")) throw new Error("The link is an in-app path, e.g. /library?q=Saki");
  const { data, error } = await admin().from("app_updates").insert({ kind, title, body: body ?? "", link: link ?? null }).select("id,published_at").single();
  if (error) throw error;
  console.log(`Posted #${data.id} at ${data.published_at}: ${title}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
