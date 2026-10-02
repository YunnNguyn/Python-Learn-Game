import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Lỗi hiển thị ứng dụng.", error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="app-error" role="alert">
          <div className="app-error__panel">
            <p className="eyebrow">Đã xảy ra lỗi</p>
            <h1>Ứng dụng gặp lỗi khi hiển thị.</h1>
            <p>Hãy tải lại trang để thử lại.</p>
            <button
              className="primary-action"
              type="button"
              onClick={() => window.location.reload()}
            >
              Tải lại trang
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
