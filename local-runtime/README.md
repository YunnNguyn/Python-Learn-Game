# Python Learn Game — Local Python Runtime

Local service dùng Python thật trên máy để chạy các exercise Data/ML nặng hơn Pyodide.
Service chỉ bind vào loopback (`127.0.0.1`) và không mở ra LAN.

## Chạy trong lúc development

Windows CMD:

```bat
local-runtime\start-runtime.cmd
```

PowerShell:

```powershell
.\local-runtime\start-runtime.ps1
```

Mặc định service nghe ở `http://127.0.0.1:8765`.

## Smoke test

Mở `/dev` trong web app và dùng thẻ **Local Python Runtime**.

Runtime worker chạy learner code trong subprocess riêng. `Stop`/timeout sẽ kết thúc process tree thay vì giết web app hoặc service.

## Workspace

Mỗi Local Python session có workspace do service quản lý:

```text
<runtime-workspace>/<session-id>/
├── main.py
├── data/
└── artifacts/
```

- `main.py`: file duy nhất learner sửa trong exercise.
- `data/`: dataset do MissionTemplate cung cấp.
- `artifacts/`: output learner tạo ra như CSV, PNG, JSON, TXT, PKL/JOBLIB.

Trước mỗi Run/Submit, service dựng lại `data/` từ authored content và xóa `artifacts/`. Vì vậy artifact metadata trả về luôn thuộc lần chạy hiện tại. Dataset filename chỉ được phép là tên file đơn giản; browser không thể truyền arbitrary host source path.

## Runtime config v2

MissionTemplate dùng `core.local_python` có thể truyền:

```json
{
  "executionTimeoutSeconds": 300,
  "workspace": {
    "datasets": [
      {
        "filename": "telemetry.csv",
        "content": "contact_id,distance,threat\ncontact-1,38,1\n",
        "description": "Dataset nhỏ cho bài pandas."
      }
    ]
  }
}
```

Giới hạn hợp lệ hiện tại: 1–3600 giây.

Protocol v2 có thể trả thêm `workspace.datasets` và `workspace.artifacts` trong response. Metadata gồm relative path, byte size và thông tin loại file; binary content không được nhúng vào mọi execution response.

## Package availability

Service không tự chạy `pip install`. Mission pandas như LC-02 yêu cầu pandas đã có trong Local Python environment. Nếu thiếu package, learner nhận lỗi Python bình thường như `ModuleNotFoundError`.

## Security boundary

Workspace/path validation ngăn browser chọn arbitrary dataset source path và giữ dataset/artifact metadata trong session workspace. Đây không phải hardened sandbox: learner code vẫn chạy bằng quyền của OS user hiện tại và một script độc hại vẫn có thể truy cập file mà user đó có quyền đọc/ghi.

Challenge/Exam CSV scoring, package/environment manager và container sandbox là các phase sau.
