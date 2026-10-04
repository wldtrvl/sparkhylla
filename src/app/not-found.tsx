import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 480, padding: 32, gap: 16 }}>
        <span className="eyebrow">Страница не найдена</span>
        <h1 className="display" style={{ fontSize: 36 }}>
          Такой страницы нет
        </h1>
        <p className="muted">Возможно, книга убрана из библиотеки или ссылка устарела.</p>
        <Link className="btn" href="/">
          На мой стол
        </Link>
      </div>
    </main>
  );
}
