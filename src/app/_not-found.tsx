import { T } from "@/lib/i18n/provider";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="workspace">
      <main className="app-main">
        <div className="page-title">
          <h1>
            <T>{"Page not found"}</T>
          </h1>
          <p>
            <T>{"The page you're looking for doesn't exist or has been moved."}</T>
          </p>
        </div>
        <div className="inline">
          <Link className="button" href="/">
            <T>{"Go home"}</T>
          </Link>
        </div>
      </main>
    </div>
  );
}