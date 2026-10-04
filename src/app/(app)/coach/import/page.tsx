import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportForm } from "@/components/ImportForm";
import { requireSession } from "@/lib/session";

export default async function ImportPage() {
  const s = await requireSession();
  if (s.profile.role !== "coach") redirect("/");
  return (
    <>
      <div className="stack gap-6">
        <Link href="/coach" className="small strong">
          ← Кабинет помощника
        </Link>
        <h1 className="display">Добавить книгу</h1>
        <p className="lead">
          Только оригиналы, свободные от авторских прав или под открытой лицензией. Текст хранится целиком и читается прямо здесь; библиотека сама посчитает, сколько
          слов уже знакомо.
        </p>
      </div>
      <ImportForm />
    </>
  );
}
