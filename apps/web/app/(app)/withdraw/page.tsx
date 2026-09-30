"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Landmark,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MusicPageHeading, MusicPageLayout } from "@/components/layout/music-page-layout";
import { getApiErrorMessage } from "@/lib/api/api-error";
import { useWalletBalance } from "@/lib/wallet/use-wallet-balance";
import {
  type BankAccount,
  createNFBankWithdrawal,
  getWithdrawStatus,
  linkBankAccount,
  setWithdrawPin,
  verifyNFBankAccount,
} from "@/lib/wallet/wallet.api";

const PRESET_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000];

function PinBoxInput({
  value,
  onChange,
  disabled = false,
  error = false,
}: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(5, "").split("").slice(0, 5);

  function handleChange(index: number, char: string) {
    if (!/^\d?$/.test(char)) return;
    const newDigits = [...digits];
    newDigits[index] = char;
    const combined = newDigits.join("").trim();
    onChange(combined);

    if (char && index < 4) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 5);
    if (pasted) {
      onChange(pasted);
      const nextIndex = Math.min(pasted.length, 4);
      inputsRef.current[nextIndex]?.focus();
    }
  }

  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length: 5 }).map((_, idx) => {
        const isFilled = Boolean(digits[idx]);
        return (
          <input
            key={idx}
            ref={(el) => {
              inputsRef.current[idx] = el;
            }}
            type="password"
            inputMode="numeric"
            maxLength={1}
            disabled={disabled}
            value={digits[idx] || ""}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onPaste={handlePaste}
            className={`h-12 w-11 text-center text-xl font-bold rounded-xl border transition-all duration-150 outline-none ${
              error
                ? "border-rose-500 bg-rose-500/10 text-rose-500"
                : isFilled
                ? "border-(--keyColor) bg-(--keyColor)/10 text-(--systemPrimary) ring-2 ring-(--keyColor)/20"
                : "border-(--labelDivider) bg-(--systemQuinary)/40 text-(--systemPrimary) focus:border-(--keyColor)"
            }`}
          />
        );
      })}
    </div>
  );
}

export default function WithdrawPage() {
  const { balance, loading: balanceLoading, refreshBalance } = useWalletBalance();

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [isPinSet, setIsPinSet] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  // Step 1: Set PIN
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [settingPin, setSettingPin] = useState(false);

  // Step 2: Link Bank
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showSelectAccountModal, setShowSelectAccountModal] = useState(false);
  const [linkAccountNumber, setLinkAccountNumber] = useState("");
  const [linkAccountName, setLinkAccountName] = useState("");
  const [linkPin, setLinkPin] = useState("");
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);

  // Step 3: Withdraw Main
  const [amountVnd, setAmountVnd] = useState<number | "">(100_000);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [showPinConfirmModal, setShowPinConfirmModal] = useState(false);
  const [withdrawPin, setWithdrawPinState] = useState("");
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchStatus() {
      try {
        setLoadingStatus(true);
        const res = await getWithdrawStatus();
        setIsPinSet(res.isPinSet);
        setBankAccounts(res.bankAccounts || []);
        if (res.bankAccounts && res.bankAccounts.length > 0) {
          setSelectedAccountId(res.bankAccounts[0].id);
        }
      } catch (cause) {
        setError(getApiErrorMessage(cause, "Không thể tải trạng thái rút tiền."));
      } finally {
        setLoadingStatus(false);
      }
    }
    void fetchStatus();
  }, []);

  async function handleSetPin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (pin.length !== 5) {
      setError("Mã PIN rút tiền phải gồm đúng 5 chữ số.");
      return;
    }
    if (pin !== confirmPin) {
      setError("Mã PIN xác nhận không khớp.");
      return;
    }

    setSettingPin(true);
    try {
      await setWithdrawPin(pin);
      toast.success("Thiết lập mã PIN rút tiền thành công!");
      setIsPinSet(true);
      setPin("");
      setConfirmPin("");
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Không thể tạo mã PIN rút tiền."));
    } finally {
      setSettingPin(false);
    }
  }

  async function handleVerifyAccount() {
    setError("");
    setLinkAccountName("");
    if (!/^\d{6,30}$/.test(linkAccountNumber)) {
      setError("Nhập số tài khoản NF Bank hợp lệ (6-30 chữ số).");
      return;
    }
    setVerifyingAccount(true);
    try {
      const res = await verifyNFBankAccount(linkAccountNumber);
      setLinkAccountName(res.accountName);
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Không thể xác thực số tài khoản NF Bank."));
    } finally {
      setVerifyingAccount(false);
    }
  }

  async function handleLinkAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!linkAccountName) {
      setError("Vui lòng xác thực số tài khoản trước.");
      return;
    }
    if (linkPin.length !== 5) {
      setError("Mã PIN rút tiền gồm 5 chữ số.");
      return;
    }

    setLinkingAccount(true);
    try {
      const newAccount = await linkBankAccount({
        accountNumber: linkAccountNumber,
        pin: linkPin,
        bankCode: "NFBANK",
      });
      toast.success("Liên kết tài khoản NF Bank thành công!");
      setBankAccounts((prev) => [newAccount, ...prev]);
      setSelectedAccountId(newAccount.id);
      setShowAddAccountModal(false);
      setShowSelectAccountModal(false);
      setLinkAccountNumber("");
      setLinkAccountName("");
      setLinkPin("");
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Không thể liên kết tài khoản ngân hàng."));
    } finally {
      setLinkingAccount(false);
    }
  }

  async function handleConfirmWithdraw(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(amountVnd);
    setError("");

    if (withdrawPin.length !== 5) {
      setError("Mã PIN rút tiền gồm 5 chữ số.");
      return;
    }
    if (!Number.isInteger(amount) || amount < 10_000 || amount > 10_000_000 || amount % 1_000 !== 0) {
      setError("Số tiền rút phải từ 10.000đ đến 10.000.000đ và chẵn nghìn.");
      return;
    }

    setSubmittingWithdraw(true);
    try {
      const selectedAcc = bankAccounts.find((a) => a.id === selectedAccountId);
      const result = await createNFBankWithdrawal({
        amountVnd: amount,
        pin: withdrawPin,
        bankAccountId: selectedAccountId,
        idempotencyKey,
      });

      await refreshBalance();
      setIdempotencyKey(crypto.randomUUID());
      setShowPinConfirmModal(false);
      setWithdrawPinState("");

      if (result.status === "SUCCESS") {
        toast.success("Rút tiền thành công!", {
          description: `Đã chuyển ${amount.toLocaleString("vi-VN")}đ đến ${selectedAcc?.accountName || "Tài khoản NF Bank"}.`,
        });
      } else if (result.status === "PROCESSING") {
        toast.message("Yêu cầu đang được đối soát", { description: `Mã: ${result.orderId}` });
      } else {
        toast.error("NF Bank từ chối yêu cầu; Coin đã được hoàn lại.");
      }
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Không thể hoàn tất giao dịch rút tiền."));
    } finally {
      setSubmittingWithdraw(false);
    }
  }

  const selectedAccount = bankAccounts.find((a) => a.id === selectedAccountId) || bankAccounts[0];
  const requiredCoins = amountVnd ? Number(amountVnd) / 1000 : 0;
  const currentCoins = balance?.coinBalance ?? 0;
  const isBalanceEnough = currentCoins >= requiredCoins;

  return (
    <MusicPageLayout>
      <MusicPageHeading title="Rút tiền về ngân hàng" />
      <main className="grid max-w-[1000px] gap-8 px-(--bodyGutter) pb-16 pt-2 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
        <div className="space-y-6">
          {loadingStatus ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-(--labelDivider) bg-(--systemQuinary)/10">
              <RefreshCw className="h-6 w-6 animate-spin text-(--keyColor)" />
              <p className="text-xs text-(--systemSecondary)">Đang tải thông tin tài khoản…</p>
            </div>
          ) : !isPinSet ? (
            /* STEP 1: SETUP PIN WIZARD */
            <section className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary)/20 p-7 space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-(--keyColor) bg-(--keyColor)/10 px-3 py-1 rounded-full mb-3">
                  <Lock className="h-3.5 w-3.5" /> Bước 1 / 2: Bảo mật
                </div>
                <h2 className="text-xl font-bold text-(--systemPrimary)">Tạo Mã PIN Rút Tiền (5 Chữ Số)</h2>
                <p className="mt-1 text-xs text-(--systemSecondary)">
                  Tạo mã PIN gồm 5 chữ số để bảo vệ cho các giao dịch rút tiền của bạn.
                </p>
              </div>

              <form onSubmit={(e) => void handleSetPin(e)} className="space-y-6 pt-2">
                <div className="space-y-2 text-center">
                  <label className="block text-xs font-medium text-(--systemSecondary)">
                    Nhập mã PIN 5 chữ số
                  </label>
                  <PinBoxInput value={pin} onChange={setPin} disabled={settingPin} error={Boolean(error)} />
                </div>

                <div className="space-y-2 text-center">
                  <label className="block text-xs font-medium text-(--systemSecondary)">
                    Nhập lại mã PIN để xác nhận
                  </label>
                  <PinBoxInput
                    value={confirmPin}
                    onChange={setConfirmPin}
                    disabled={settingPin}
                    error={Boolean(error)}
                  />
                </div>

                {error && (
                  <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-rose-500">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={settingPin || pin.length !== 5 || confirmPin.length !== 5}
                  className="w-full rounded-full bg-(--keyColor) py-3 text-sm font-semibold text-(--keyColorText) transition hover:bg-(--keyColorBG) disabled:opacity-40"
                >
                  {settingPin ? "Đang xử lý…" : "Tạo Mã PIN"}
                </button>
              </form>
            </section>
          ) : bankAccounts.length === 0 || showAddAccountModal ? (
            /* STEP 2: LINK BANK WIZARD */
            <section className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary)/20 p-7 space-y-6">
              <div className="flex items-center justify-between border-b border-(--labelDivider) pb-4">
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full mb-2">
                    <Landmark className="h-3.5 w-3.5" /> Bước 2 / 2: Tài khoản
                  </div>
                  <h2 className="text-xl font-bold text-(--systemPrimary)">Liên Kết Ngân Hàng NF Bank</h2>
                  <p className="mt-0.5 text-xs text-(--systemSecondary)">
                    Nhập số tài khoản NF Bank để tiền tự động chuyển về ví.
                  </p>
                </div>
                {bankAccounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddAccountModal(false)}
                    className="rounded-full border border-(--labelDivider) px-3 py-1 text-xs font-medium text-(--systemSecondary) hover:text-(--systemPrimary)"
                  >
                    Hủy
                  </button>
                )}
              </div>

              <form onSubmit={(e) => void handleLinkAccount(e)} className="space-y-5">
                <div>
                  <label htmlFor="linkAccount" className="block text-xs font-medium text-(--systemSecondary) mb-1.5">
                    Số tài khoản NF Bank
                  </label>
                  <div className="flex gap-2.5">
                    <input
                      id="linkAccount"
                      inputMode="numeric"
                      value={linkAccountNumber}
                      onChange={(e) => {
                        setLinkAccountNumber(e.target.value.replace(/\D/g, ""));
                        setLinkAccountName("");
                      }}
                      placeholder="Nhập số tài khoản"
                      className="min-w-0 flex-1 rounded-xl border border-(--labelDivider) bg-(--systemQuinary)/40 px-4 py-2.5 text-sm font-medium outline-none focus:border-(--keyColor)"
                    />
                    <button
                      type="button"
                      disabled={verifyingAccount || !linkAccountNumber}
                      onClick={() => void handleVerifyAccount()}
                      className="rounded-xl border border-(--keyColor) px-4 text-xs font-semibold text-(--keyColor) disabled:opacity-40 hover:bg-(--keyColor)/10 transition"
                    >
                      {verifyingAccount ? "Đang tra cứu…" : "Xác thực"}
                    </button>
                  </div>
                  {linkAccountName && (
                    <p className="mt-2 text-xs font-semibold text-emerald-500">
                      Tên chủ tài khoản: {linkAccountName}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-(--systemSecondary) mb-2 text-center">
                    Nhập Mã PIN 5 số để xác nhận
                  </label>
                  <PinBoxInput value={linkPin} onChange={setLinkPin} disabled={linkingAccount} error={Boolean(error)} />
                </div>

                {error && (
                  <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-rose-500">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={linkingAccount || !linkAccountName || linkPin.length !== 5}
                  className="w-full rounded-full bg-(--keyColor) py-3 text-sm font-semibold text-(--keyColorText) transition hover:bg-(--keyColorBG) disabled:opacity-40"
                >
                  {linkingAccount ? "Đang xử lý…" : "Xác Nhận Liên Kết"}
                </button>
              </form>
            </section>
          ) : (
            /* STEP 3: REVOLUT / WISE STYLE CLEAN WITHDRAWAL UI */
            <section className="space-y-6">
              {/* RECIPIENT ACCOUNT ROW CARD */}
              <div className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary)/25 p-4.5 transition hover:bg-(--systemQuinary)/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--keyColor) font-bold text-white text-sm tracking-wide shadow-sm">
                      NFB
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-(--systemPrimary)">
                          {selectedAccount.accountName}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          Đã xác thực
                        </span>
                      </div>
                      <p className="text-xs text-(--systemSecondary) font-mono mt-0.5">
                        NF Bank • •••• {selectedAccount.accountNumber.slice(-4)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSelectAccountModal(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-(--keyColor) hover:underline"
                  >
                    Đổi tài khoản
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* HERO AMOUNT INPUT SECTION */}
              <div className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary)/15 p-6 text-center space-y-5">
                <span className="text-xs font-semibold text-(--systemSecondary) uppercase tracking-wider">
                  Số tiền rút
                </span>

                <div className="flex items-baseline justify-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amountVnd === "" ? "" : amountVnd.toLocaleString("vi-VN")}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setAmountVnd(raw === "" ? "" : Number(raw));
                    }}
                    placeholder="0"
                    className="w-full max-w-[280px] text-center text-4xl sm:text-5xl font-extrabold text-(--systemPrimary) bg-transparent outline-none tracking-tight placeholder:text-(--systemQuaternary)"
                  />
                  <span className="text-xl font-bold text-(--systemSecondary)">VNĐ</span>
                </div>

                <div className="inline-flex items-center justify-center gap-2 rounded-full bg-(--systemQuinary)/50 px-4 py-1.5 text-xs font-medium text-(--systemSecondary)">
                  Sẽ trừ: <span className="font-bold text-(--systemPrimary)">{requiredCoins.toLocaleString()} Coin</span> trong ví
                </div>

                {/* PRESET PILL CHIPS */}
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {PRESET_AMOUNTS.map((preset) => {
                    const active = amountVnd === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAmountVnd(preset)}
                        className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "bg-(--keyColor) text-(--keyColorText) shadow-sm"
                            : "bg-(--systemQuinary)/60 text-(--systemPrimary) hover:bg-(--systemQuinary)"
                        }`}
                      >
                        {(preset / 1000).toLocaleString()}k
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setAmountVnd(currentCoins * 1000)}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                      amountVnd === currentCoins * 1000
                        ? "bg-(--keyColor) text-(--keyColorText)"
                        : "bg-(--systemQuinary)/60 text-(--systemSecondary) hover:text-(--systemPrimary)"
                    }`}
                  >
                    Tối đa
                  </button>
                </div>
              </div>

              {/* WARNINGS & ERRORS */}
              {amountVnd && !isBalanceEnough && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-500 justify-center">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Số dư ví không đủ ({currentCoins.toLocaleString()} Coin).
                </p>
              )}

              {error && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-rose-500 justify-center">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              {/* CLEAN ACTION BUTTON */}
              <button
                type="button"
                disabled={!amountVnd || Number(amountVnd) < 10_000 || !isBalanceEnough}
                onClick={() => {
                  setError("");
                  setShowPinConfirmModal(true);
                }}
                className="w-full rounded-full bg-(--keyColor) py-3.5 text-sm font-bold text-(--keyColorText) shadow-sm transition hover:bg-(--keyColorBG) active:scale-[0.99] disabled:opacity-40"
              >
                Rút {amountVnd ? Number(amountVnd).toLocaleString("vi-VN") : "0"}đ về NF Bank
              </button>
            </section>
          )}
        </div>

        {/* SIDEBAR WALLET SUMMARY */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary)/20 p-5 backdrop-blur-md space-y-4">
            <span className="text-xs font-semibold text-(--systemSecondary) uppercase tracking-wider">Ví của bạn</span>
            
            <div className="flex items-baseline gap-2 border-b border-(--labelDivider) pb-4">
              <span className="text-2xl font-extrabold text-(--systemPrimary)">
                {balanceLoading ? "—" : (balance?.coinBalance ?? 0).toLocaleString()}
              </span>
              <span className="text-xs font-bold text-(--keyColor)">Coin</span>
            </div>

            <div className="space-y-2 text-xs text-(--systemSecondary)">
              <div className="flex justify-between">
                <span>Quy đổi</span>
                <span className="font-semibold text-(--systemPrimary)">1.000đ = 1 Coin</span>
              </div>
              <div className="flex justify-between">
                <span>Phí giao dịch</span>
                <span className="font-semibold text-emerald-500">Miễn phí</span>
              </div>
              <div className="flex justify-between">
                <span>Thời gian</span>
                <span className="font-semibold text-(--systemPrimary)">Tức thì 24/7</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-(--labelDivider) bg-(--systemQuinary)/15 p-4 text-[11px] text-(--systemSecondary) space-y-1.5">
            <p className="font-semibold text-(--systemPrimary) flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Bảo mật ngân hàng chính chủ
            </p>
            <p>Mã PIN 5 số mã hóa SHA256 được xác nhận trước mỗi lần rút.</p>
          </div>
        </aside>

        {/* MODAL SWITCH / SELECT BANK ACCOUNT */}
        {showSelectAccountModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-2xl border border-(--labelDivider) bg-(--background) p-5 text-left shadow-2xl space-y-4 animate-fadeIn"
            >
              <div className="flex items-center justify-between border-b border-(--labelDivider) pb-3">
                <h3 className="text-sm font-bold text-(--systemPrimary)">Tài khoản nhận tiền</h3>
                <button
                  type="button"
                  onClick={() => setShowSelectAccountModal(false)}
                  className="p-1 text-(--systemSecondary) hover:text-(--systemPrimary)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {bankAccounts.map((acc) => {
                  const isSelected = acc.id === selectedAccountId;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setSelectedAccountId(acc.id);
                        setShowSelectAccountModal(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? "border-(--keyColor) bg-(--keyColor)/10 text-(--systemPrimary)"
                          : "border-(--labelDivider) bg-(--systemQuinary)/20 hover:bg-(--systemQuinary)"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--keyColor) text-white font-bold text-xs">
                          NFB
                        </div>
                        <div>
                          <p className="text-xs font-bold">{acc.accountName}</p>
                          <p className="text-[11px] text-(--systemSecondary) font-mono">
                            NF Bank • •••• {acc.accountNumber.slice(-4)}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-(--keyColor)" />}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowSelectAccountModal(false);
                  setShowAddAccountModal(true);
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-(--labelDivider) py-2.5 text-xs font-semibold text-(--keyColor) hover:bg-(--keyColor)/10 transition"
              >
                <Plus className="h-4 w-4" />
                Thêm tài khoản ngân hàng mới
              </button>
            </div>
          </div>
        )}

        {/* PIN CONFIRM MODAL */}
        {showPinConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-sm rounded-2xl border border-(--labelDivider) bg-(--background) p-6 text-center shadow-2xl space-y-5 animate-fadeIn"
            >
              <div>
                <h3 className="text-base font-bold text-(--systemPrimary)">Xác Nhận Rút Tiền</h3>
                <p className="mt-1 text-xs text-(--systemSecondary)">
                  Chuyển <strong className="text-(--systemPrimary)">{Number(amountVnd).toLocaleString("vi-VN")}đ</strong> đến {selectedAccount?.accountName} ({selectedAccount?.accountNumber.slice(-4)})
                </p>
              </div>

              <form onSubmit={(e) => void handleConfirmWithdraw(e)} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-(--systemSecondary)">
                    Nhập mã PIN 5 chữ số
                  </label>
                  <PinBoxInput
                    value={withdrawPin}
                    onChange={setWithdrawPinState}
                    disabled={submittingWithdraw}
                    error={Boolean(error)}
                  />
                </div>

                {error && (
                  <p className="text-xs font-medium text-rose-500">
                    {error}
                  </p>
                )}

                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPinConfirmModal(false);
                      setWithdrawPinState("");
                    }}
                    className="flex-1 rounded-full border border-(--labelDivider) py-2.5 text-xs font-semibold text-(--systemSecondary) hover:bg-(--systemQuinary)"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submittingWithdraw || withdrawPin.length !== 5}
                    className="flex-1 rounded-full bg-(--keyColor) py-2.5 text-xs font-semibold text-(--keyColorText) disabled:opacity-40"
                  >
                    {submittingWithdraw ? "Đang xử lý…" : "Xác nhận"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </MusicPageLayout>
  );
}
