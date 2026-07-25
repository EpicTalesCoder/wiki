# MCP Server (Model Context Protocol)

Tài liệu này mô tả **MCP server** đi kèm, cho phép một instance **n8n** (hoặc bất kỳ MCP client nào) quản lý nội dung tài liệu từ xa: liệt kê, đọc, tạo, sửa và xoá các trang/chuyên mục.

MCP server tái sử dụng toàn bộ các helper trong `src/lib/admin-utils.ts` (cùng logic với các API route nội bộ), nên mọi thao tác đều nhất quán với trình quản trị.

## Cài đặt

```bash
cd docs
pnpm install
```

Gói cần thiết: `@modelcontextprotocol/sdk` và `zod` (đã được khai báo trong `package.json`).

## Chạy server

### Chế độ HTTP (khuyên dùng cho n8n từ xa)

```bash
MCP_PORT=3100 MCP_HOST=0.0.0.0 MCP_TOKEN=your-secret bun run src/mcp/run-http.ts
```

Hoặc dùng script:

```bash
pnpm run mcp
```

Khi khởi động, server sẽ in ra dòng `MCP server listening on http://<host>:<port>/mcp`.

### Chế độ stdio (cho n8n cục bộ)

```bash
bun run src/mcp/run-http.ts --stdio
```

n8n có thể chạy trực tiếp tiến trình này qua stdio mà không cần HTTP.

## Cấu hình trong n8n

1. Thêm node **MCP Client**.
2. **Connection type**: `Streamable HTTP`.
3. **URL**: `http://<server-ip>:3100/mcp`.
4. **Header**:
   ```
   Authorization: Bearer your-secret
   ```
5. Sau khi kết nối, các tool bên dưới sẽ hiện ra để dùng trong workflow.

> Lưu ý: nếu n8n chạy trên máy khác, `<server-ip>` phải có thể truy cập được từ n8n. Nếu n8n chạy cùng máy, có thể dùng stdio thay cho HTTP.

## Danh sách tool

| Tool | Tham số | Mô tả |
| --- | --- | --- |
| `list_sections` | — | Liệt kê mọi chuyên mục cùng các trang bên trong. |
| `list_pages` | `section?` (label hoặc key) | Liệt kê trang. Lọc theo chuyên mục khi có `section`. Trả về `path` (content-relative) để dùng cho `read_page`/`update_page`. |
| `read_page` | `path` | Đọc `title`, `description` và nội dung Markdown của trang. |
| `create_page` | `section`, `title`, `description?`, `content?` | Tạo trang mới trong một chuyên mục. Trả về `slug` và `path`. |
| `update_page` | `path`, `title?`, `description?`, `content?` | Cập nhật trang. Bỏ qua `content` để giữ nguyên nội dung cũ. |
| `delete_page` | `section`, `slug` | Xoá trang khỏi chuyên mục. |
| `create_section` | `label`, `type?` (`autogenerate`/`manual`), `directory?` | Tạo chuyên mục mới (mặc định `autogenerate`). |
| `delete_section` | `label` | Xoá chuyên mục theo nhãn (hoặc key). |
| `reload` | — | Yêu cầu Astro dev server build lại để áp dụng thay đổi. |

`path` luôn là đường dẫn tương đối trong thư mục nội dung, ví dụ `getting-started.mdx` hoặc `guides/intro.mdx`.

## Bảo mật

Server **ghi file xuống ổ đĩa** và có thể **kích hoạt rebuild** của dev server, nên:

- **Luôn đặt `MCP_TOKEN`** khi truy cập từ xa. Không có token, server sẽ chạy không xác thực và in cảnh báo khi khởi động.
- Giới hạn mạng/`MCP_HOST` sao cho chỉ n8n (hoặc client đáng tin) có thể truy cập.

## Sau khi chỉnh sửa

Các thao tác `create_page`, `delete_page`, `create_section`, `delete_section`, `update_page` ghi trực tiếp lên file nhưng **không tự rebuild**. Để các thay đổi hiển thị trên site, hãy gọi tool `reload` sau khi chỉnh sửa (hoặc để trình quản trị nội bộ tự reload). `reload` sẽ chạm `content.config.ts` và `astro.config.mjs` để Astro nhận nội dung mới.
