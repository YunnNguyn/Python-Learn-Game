import { NavLink, Outlet, useLocation } from "react-router-dom";

import { StartupFailurePanel } from "./StartupFailurePanel";
import { useApplicationInitialization } from "./services";

function navigationClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? "app-nav__link app-nav__link--active" : "app-nav__link";
}

/**
 * Practice (imported Exercise Packs) has its own services and storage and never
 * depends on the CS116 initialization, so a CS116 startup failure must not hide it.
 */
function isPracticePath(pathname: string): boolean {
  return pathname === "/practice" || pathname.startsWith("/practice/");
}

export function AppLayout() {
  const initialization = useApplicationInitialization();
  const practiceRoute = isPracticePath(useLocation().pathname);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink className="app-brand" to="/" end>
            Học Python cho ML/AI
          </NavLink>

          <nav className="app-nav" aria-label="Điều hướng chính">
            <NavLink className={navigationClassName} to="/" end>
              Trang chủ
            </NavLink>
            <NavLink className={navigationClassName} to="/learn">
              Học
            </NavLink>
            <NavLink className={navigationClassName} to="/practice">
              Luyện tập
            </NavLink>
            <NavLink className={navigationClassName} to="/workshop">
              Xưởng robot
            </NavLink>
            <NavLink className={navigationClassName} to="/about">
              Giới thiệu
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="app-main">
        {practiceRoute ? (
          <Outlet />
        ) : initialization.status === "pending" ? (
          <p role="status" aria-live="polite">
            Đang khởi tạo dữ liệu học tập...
          </p>
        ) : initialization.status === "failed" ? (
          <StartupFailurePanel error={initialization.error} />
        ) : (
          <Outlet />
        )}
      </main>

      <footer className="app-footer">
        <div className="app-footer__inner">
          Không gian học Python cho ML/AI đang được xây dựng từng bước.
        </div>
      </footer>
    </div>
  );
}
