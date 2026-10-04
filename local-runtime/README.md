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

## Runtime config v1

MissionTemplate dùng `core.local_python` có thể truyền:

```json
{
  "executionTimeoutSeconds": 300
}
```

Giới hạn hợp lệ hiện tại: 1–3600 giây.
