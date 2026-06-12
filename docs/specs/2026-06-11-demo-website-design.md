# Thiết kế Website Demo Pharos ExecutionEngine SuperSkill

Tài liệu thiết kế chi tiết cho trang Web3 Dashboard giới thiệu tính năng bảo mật giao dịch của ExecutionEngine SuperSkill trên Pharos Atlantic Testnet.

---

## 1. Tổng quan dự án (Project Overview)
Website Demo cung cấp một giao diện trực quan sinh động để ban giám khảo và các lập trình viên trải nghiệm thực tế hoặc giả lập tính năng an toàn giao dịch của AI Agent. Trang web sẽ tích hợp kết nối ví MetaMask (chế độ Web3) kết hợp với một nút chuyển đổi sang chế độ giả lập (Mock Mode) giúp người dùng không có ví hoặc mạng Pharos vẫn có thể quan sát toàn bộ quy trình.

---

## 2. Thiết kế Mỹ thuật & Giao diện (Aesthetics & UI/UX)
*   **Chủ đề (Theme):** Nền tối tối giản mang hơi hướng Cyberpunk / Sci-fi (màu chủ đạo là đen hạt than `#0e0f14`, xám kính mờ và viền neon màu cam Pharos `#ff761c`).
*   **Hiệu ứng mờ kính (Glassmorphism):** Các thẻ chức năng được thiết kế với thuộc tính `backdrop-filter: blur(12px)` và viền xám mờ để tạo cảm giác sang trọng, nổi bật trên hình nền gradient tối mượt mà.
*   **Màu sắc trạng thái:**
    *   An toàn/Thành công: Xanh lục Neon `#2bad0a`
    *   Nguy hiểm/Hủy bỏ/Lỗi: Đỏ Neon `#d0021b`
    *   Đang xử lý/Thông tin: Cam Pharos `#ff761c`
*   **Micro-animations:**
    *   Hiệu ứng bóng đổ và phóng to nhẹ (scale) các thẻ card khi di chuột.
    *   Log trong ô Terminal Console xuất hiện mượt mà và tự động cuộn xuống dưới cùng khi có dòng log mới.

---

## 3. Lựa chọn Công nghệ (Tech Stack)
*   **Cấu trúc (Structure):** `index.html` sử dụng thẻ HTML5 ngữ nghĩa.
*   **Giao diện (Styling):** `css/style.css` sử dụng CSS thuần, flexbox/grid layout, biến CSS (variables) để quản lý màu sắc và không sử dụng Tailwind CSS.
*   **Logic (Scripting):** `js/app.js` viết bằng JavaScript (ES6+), sử dụng thư viện **Ethers.js v6** (tải qua CDN) để tương tác với các hợp đồng thông minh đã deploy trên Pharos Atlantic.

---

## 4. Bố cục & Các thành phần (Layout & Components)

### A. Thanh tiêu đề (Header Component)
*   Bên trái: Logo và Tiêu đề: **Pharos ExecutionEngine Shield**
*   Bên phải:
    *   Nút chuyển đổi chế độ: **Mock Mode (Giả lập)** (Toggle Switch).
    *   Trạng thái kết nối ví: Chấm tròn trạng thái và địa chỉ ví rút gọn (ví dụ: `0xabA8...03e2` hoặc `Disconnected`).
    *   Nút: **Connect Wallet** (chỉ hiển thị khi chưa kết nối và không bật chế độ Mock).

### B. Bảng điều khiển Giao dịch (Safe Sandbox Component)
*   Form nhập liệu:
    *   `Target Address` (Địa chỉ contract đích cần gọi)
    *   `Calldata (Hex)` (Dữ liệu gọi hàm, mặc định `0x`)
    *   `Value (PHRS)` (Số lượng PHRS gửi kèm, mặc định `0`)
*   Nút hành động:
    *   **Verify & Simulate:** Thực hiện kiểm tra an toàn địa chỉ (Blacklist) và mô phỏng giao dịch (`eth_call`).
    *   **Safe Execute:** Gửi giao dịch thực tế thông qua hợp đồng thông minh `ExecutionEngine.sol`.

### C. Bảng quản lý Danh sách an toàn (Registry Monitor Component)
*   **Xem trạng thái:** Cho phép tìm kiếm một địa chỉ để kiểm tra xem có an toàn hay bị blacklist không.
*   **Quản lý (Owner Only):** Nút **Whitelist** và **Blacklist** để thay đổi trạng thái địa chỉ trực tiếp (yêu cầu ví kết nối là Owner của Registry).
*   **Danh sách mẫu:** Bảng danh sách một số địa chỉ mẫu phổ biến (ví dụ: MockTarget, Uniswap Router, Phishing Contract) để người dùng dễ thử nghiệm.

### D. Giả lập Console Terminal (Terminal Widget Component)
*   Khu vực nền đen hiển thị log hệ thống thời gian thực.
*   Ví dụ log khi nhấn "Verify & Simulate":
    ```text
    [11:00:01] ⚡ Bắt đầu phân tích giao dịch tới target 0x2c692A229...
    [11:00:02] 🔍 Đang kiểm tra an toàn: Địa chỉ là Hợp đồng thông minh.
    [11:00:02] 🔍 Đang kiểm tra Blacklist trên chuỗi...
    [11:00:03] ✅ Xác thực an toàn thành công! Địa chỉ không nằm trong Blacklist.
    [11:00:03] ⚙️ Đang chạy mô phỏng TxPreview...
    [11:00:04] ✅ Mô phỏng thành công! Giao dịch không bị revert.
    [11:00:04] ⛽ Ước lượng gas tối ưu: Base Fee 2.5 Gwei.
    [11:00:04] 🎉 Giao dịch sẵn sàng thực thi an toàn!
    ```

---

## 5. Cách vận hành & Chạy cục bộ
1.  **Cài đặt:** Dự án độc lập hoàn toàn, không cần cài đặt node_modules.
2.  **Khởi chạy:** Có thể mở trực tiếp file `index.html` bằng trình duyệt hoặc chạy qua tiện ích mở rộng Live Server trong VS Code, hoặc dùng máy chủ HTTP đơn giản:
    ```bash
    npx http-server ./
    ```
