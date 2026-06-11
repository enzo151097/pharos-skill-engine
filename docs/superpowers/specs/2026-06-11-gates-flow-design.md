# Đặc tả Thiết kế: Trình diễn Luồng và Điểm mạnh của 6 Cổng Bảo mật (PES Gates)

Tài liệu này mô tả thiết kế chi tiết để tối ưu hóa Trang chủ (Landing Page) và Trang Demo (Sandbox) của Pharos Execution Shield (PES). Mục tiêu là thể hiện trực quan luồng giao dịch đi qua 6 cổng bảo mật và làm nổi bật điểm mạnh (Unique Strengths) của từng cổng: `ProtocolRegistry`, `SafeApprove`, `TxPreview`, `BatchCompose`, `GasOracle`, và `RevertDiagnose`.

## 1. Mục tiêu và Tiêu chí Thành công
- **Trang chủ:**
  - Có sơ đồ luồng giao dịch chạy ngang tương tác (Interactive Step-by-Step Flow Chart) gồm 6 cổng.
  - Khi click vào từng cổng, hiển thị chi tiết so sánh Rủi ro (Problem) vs Sức mạnh (Solution/Strength) tương ứng.
  - Lưới 6 thẻ cổng bảo mật (Grid Cards) hiển thị rõ Vấn đề, Giải pháp, và thông tin địa chỉ Smart Contract để chứng minh tính thực tế.
- **Trang Demo (Sandbox):**
  - Giao diện Pipeline Scanner hiển thị đầy đủ 6 bước thay vì 4 bước như trước.
  - Sửa lỗi JS ở hàm `resetScanner()` và liên kết chính xác các bước trong DOM.
  - Cập nhật 6 preset kịch bản an toàn tự động điền input và mô phỏng chi tiết các cổng bảo mật tương ứng trong console log để ban giám khảo thấy rõ điểm mạnh của dự án.

## 2. Chi tiết Thiết kế Giao diện & Trải nghiệm (UI/UX)

### 2.1. Sơ đồ Luồng động trên Trang chủ (Interactive Flow Chart)
- Thiết kế một container dạng hàng ngang (`.interactive-pipeline`) chứa 6 nút tròn đại diện cho 6 cổng:
  1. **Registry** (Protocol Registry Verification)
  2. **Approve** (Safe ERC-20 Approval Adjustment)
  3. **Preview** (Dry-run TxPreview Simulation)
  4. **Batch** (Atomic BatchCompose Multicall)
  5. **Oracle** (Dynamic Gas Estimation)
  6. **Diagnose** (RevertDiagnose Error Decrypter)
- Giữa các nút tròn là đường nối chạy động mô phỏng luồng giao dịch (`.connector-line`).
- Phía dưới sơ đồ là một khung hiển thị nội dung động (`#flow-detail-card`) hiển thị:
  - **Tên Cổng & Icon:** ví dụ: `SafeApprove (Cổng Phê Duyệt An Toàn)`
  - **Rủi ro khi thiếu Shield (Danger/Problem):** Mô tả nguy cơ bị hack/mất tiền nếu không dùng cổng.
  - **Sức mạnh của Cổng (PES Strength):** Mô tả cách thức hoạt động tối ưu của cổng để bảo vệ Agent.
  - **Thành phần On-Chain:** Chỉ ra hợp đồng kiểm thử chịu trách nhiệm (ví dụ: `ProtocolRegistry.sol`).

### 2.2. Lưới thẻ cổng bảo mật (6 Core Execution Gates Grid)
- Cập nhật CSS để lưới thẻ có hiệu ứng hover glassmorphism chuyển màu cam-neon.
- Mỗi thẻ sẽ được chia dòng rõ ràng:
  - *Vấn đề (Vulnerability)*: Đánh dấu đỏ.
  - *Sức mạnh (Gate Strength)*: Đánh dấu xanh lá.
  - *Hợp đồng on-chain*: Font monospace kèm link explorer của Pharos Atlantic Testnet.

### 2.3. Pipeline Scanner 6 bước trong Sandbox Demo
- Thay đổi cấu trúc HTML trong `#demoPage` để có đủ 6 `.step` với các ID tương ứng:
  - `#step-registry`
  - `#step-approve`
  - `#step-preview`
  - `#step-batch`
  - `#step-oracle`
  - `#step-diagnose`
- Cập nhật logic Javascript trong `js/app.js` để tìm và lưu trữ cả 6 DOM Node này.
- Sửa hàm `resetScanner()` để xóa bỏ tất cả class cũ và đặt lại trạng thái ban đầu của cả 6 bước.

### 2.4. Logic 6 Kịch bản Preset trong Sandbox
Khi thay đổi lựa chọn trong thẻ `<select id="sandbox-scenario">`, Javascript sẽ tự động điền các trường dữ liệu thích hợp và chạy giả lập chi tiết:

1. **Kịch bản 1: Registry Gate (Chặn Phishing)**
   - *Target:* `0x1111111254fb6c44bac0bed2854e76f90643097d` (Địa chỉ ví phishing giả mạo)
   - *Calldata:* `0x`
   - *Value:* `0`
   - *Flow mô phỏng:* Quét bước 1 (Registry) -> Nhận diện Blacklisted -> Đánh dấu bước 1 thất bại (failed/đỏ) -> Dừng quét lập tức -> Hiện khiên đỏ (BLOCKED).
   - *Console Output:* Ghi rõ ngăn chặn thành công vụ tấn công rút tiền, bảo toàn tài sản của Agent.

2. **Kịch bản 2: SafeApprove Gate (Chặn Infinite Approve)**
   - *Target:* `0x2c692A2291ad46D034bAbF4a5ACF287341B7797a` (MockTarget)
   - *Calldata:* `0x095d1a220000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff` (approve spender with uint_max)
   - *Value:* `0`
   - *Flow mô phỏng:* Cổng 1 (Registry) thành công -> Cổng 2 (Approve) phát hiện `uint_max` -> Báo động vàng/cam và tự động chuyển đổi calldata thành Approve chính xác số lượng thực tế cần dùng -> Các bước còn lại thành công -> Hiện khiên xanh (SECURE).
   - *Console Output:* Nêu bật cơ chế tự sửa đổi payload để giảm thiểu rủi ro thất thoát token cho Agent.

3. **Kịch bản 3: TxPreview Gate (Dry-Run Giao dịch)**
   - *Target:* `0x2c692A2291ad46D034bAbF4a5ACF287341B7797a`
   - *Calldata:* `0xa9059cbb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000064` (transfer 100 tokens)
   - *Value:* `0`
   - *Flow mô phỏng:* Bước 1 (Registry), Bước 2 (Approve) thành công -> Bước 3 (Preview) chạy cuộc gọi static call -> Dự đoán trước thay đổi số dư tài khoản của ví Agent -> Các bước tiếp theo thành công -> Hiện khiên xanh (SECURE).
   - *Console Output:* In ra bảng giả lập thay đổi tài sản (State changes) cụ thể giúp Agent biết trước kết quả trước khi tốn phí gas.

4. **Kịch bản 4: BatchCompose Gate (Gộp lệnh nguyên tử)**
   - *Target:* `0xe0C047cBCBDB0e4b5Ca5544faec06A1eED247014` (ExecutionEngine Core)
   - *Calldata:* `0xbatch_compose_multicall_data...` (Mô phỏng Approve + Swap + Stake)
   - *Value:* `0`
   - *Flow mô phỏng:* Lần lượt quét qua các bước, tại bước 4 (Batch) sáng lên -> Phát hiện hành vi thực hiện chuỗi lệnh -> Tự động đóng gói thành giao dịch multicall nguyên tử để tiết kiệm gas và chống frontrunning -> Kết thúc thành công -> Hiện khiên xanh (SECURE).
   - *Console Output:* Chứng minh sự tiện lợi và an toàn tuyệt đối khi Agent thực hiện nhiều hành động cùng lúc.

5. **Kịch bản 5: GasOracle Gate (Vượt nghẽn gas mạng)**
   - *Target:* `0x2c692A2291ad46D034bAbF4a5ACF287341B7797a`
   - *Calldata:* `0x`
   - *Value:* `0.1`
   - *Flow mô phỏng:* Các bước trước thành công -> Đến bước 5 (Oracle) sáng lên -> Giả lập mạng bị nghẽn (congested) -> Tự động truy vấn dynamic fee EIP-1559 và cộng thêm 20% margin -> Thành công -> Hiện khiên xanh (SECURE).
   - *Console Output:* Hiển thị chi tiết thông số Gas (Base Fee, Priority Fee, Limit) tối ưu giúp giao dịch đóng block nhanh nhất.

6. **Kịch bản 6: RevertDiagnose Gate (Giải mã lỗi DEX Slippage)**
   - *Target:* `0x2c692A2291ad46D034bAbF4a5ACF287341B7797a`
   - *Calldata:* `0xslippage_swap_calldata...`
   - *Value:* `0`
   - *Flow mô phỏng:* Bước 1, 2 thành công -> Bước 3 (Preview) phát hiện lỗi revert khi chạy giả lập -> Bước 6 (Diagnose) lập tức kích hoạt, bắt lấy mã revert hex lỗi trượt giá và dịch thành ngôn ngữ tự nhiên đề xuất Agent cách khắc phục -> Dừng quét -> Hiện khiên đỏ (BLOCKED).
   - *Console Output:* In ra chi tiết lý do lỗi trượt giá Uniswap/DEX và khuyên sửa cấu hình để giao dịch thành công.

## 3. Kế hoạch Hiện thực hóa (Implementation Plan)
- **Bước 1:** Cập nhật file `index.html` để tích hợp giao diện sơ đồ chạy ngang tương tác trên Landing Page và 6 bước Pipeline Scanner trong Sandbox Demo.
- **Bước 2:** Cập nhật file `css/style.css` để định hình thiết kế của sơ đồ luồng chạy ngang (interactive flowchart), grid card mới, căn chỉnh khoảng cách bước scanner và các màu sắc neon phản hồi.
- **Bước 3:** Viết lại logic trong `js/app.js` cho các preset kịch bản, các bước scanner quét tuần tự và log chi tiết điểm mạnh của từng cổng bảo mật tương ứng vào console.
- **Bước 4:** Kiểm tra cục bộ và khởi chạy thử nghiệm để đảm bảo không lỗi cú pháp hoặc giao diện.
