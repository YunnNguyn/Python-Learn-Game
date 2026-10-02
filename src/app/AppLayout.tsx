import { NavLink, Outlet } from "react-router-dom";

function navigationClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? "app-nav__link app-nav__link--active" : "app-nav__link";
}

export function AppLayout() {
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
            <NavLink className={navigationClassName} to="/about">
              Giới thiệu
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-footer">
        <div className="app-footer__inner">
          Không gian học Python cho ML/AI đang được xây dựng từng bước.
        </div>
      </footer>
    </div>
  );
}
