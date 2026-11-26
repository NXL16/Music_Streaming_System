"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import styles from "@/components/wallet/wallet.module.css";
import { formatCoins, formatVnd } from "@/lib/wallet/payment";
import {
  getWalletTransactionHistory,
  type PaymentOrder,
  type WalletTransactionKind,
} from "@/lib/wallet/wallet.api";

const PAGE_SIZE = 20;

const FILTER_OPTIONS: { kind: WalletTransactionKind; label: string }[] = [
  { kind: "ALL", label: "All" },
  { kind: "DEPOSIT", label: "Deposits" },
  { kind: "WITHDRAWAL", label: "Withdrawals" },
];

const STATUS_META: Record<
  PaymentOrder["status"],
  { label: string; icon: typeof CheckCircle2 }
> = {
  SUCCESS: { label: "Success", icon: CheckCircle2 },
  PENDING: { label: "Pending", icon: Clock },
  PROCESSING: { label: "Processing", icon: Clock },
  FAILED: { label: "Failed", icon: XCircle },
};

function formatProvider(provider: string) {
  if (provider === "MOMO") return "MoMo";
  if (provider === "NFBANK") return "NFBank";
  return provider;
}

function formatDateTime(timestampMs: number) {
  if (!timestampMs) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestampMs));
}

export default function WalletHistoryPage() {
  const [kind, setKind] = useState<WalletTransactionKind>("ALL");
  const [items, setItems] = useState<PaymentOrder[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${kind}:${reloadKey}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();

    getWalletTransactionHistory(
      { kind, limit: PAGE_SIZE, offset: 0 },
      controller.signal,
    )
      .then((data) => {
        setItems(data.items);
        setHasMore(data.hasMore);
        setError("");
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error("[wallet] history", err);
        setError("Could not load transaction history.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedKey(requestKey);
      });

    return () => controller.abort();
  }, [kind, requestKey]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const data = await getWalletTransactionHistory({
        kind,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((prev) => [...prev, ...data.items]);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error("[wallet] history load more", err);
      setError("Could not load more transactions.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, items.length, kind, loadingMore]);

  return (
    <section className={styles.historySection} aria-label="Transaction history">
      <div
        className={styles.historyFilters}
        role="group"
        aria-label="Filter transactions"
      >
        {FILTER_OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className={styles.historyFilter}
            aria-pressed={kind === option.kind}
            onClick={() => setKind(option.kind)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {error && !loading && (
        <div role="alert" className={styles.error}>
          <p>{error}</p>
          <button
            type="button"
            className={styles.historyLoadMore}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.historyTable} aria-label="Loading transactions">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className={styles.historySkeletonRow}>
              <div className="flex items-center">
                <div
                  className={styles.historySkeletonBar}
                  style={{ width: 16, height: 16, borderRadius: 4 }}
                />
              </div>
              <div
                className={styles.historySkeletonBar}
                style={{ width: 140 }}
              />
              <div
                className={styles.historySkeletonBar}
                style={{ width: 78 }}
              />
              <div
                className={styles.historySkeletonBar}
                style={{ width: 92 }}
              />
              <div
                className={styles.historySkeletonBar}
                style={{ width: 64 }}
              />
              <div
                className={styles.historySkeletonBar}
                style={{ width: 68 }}
              />
              <div
                className={styles.historySkeletonBar}
                style={{ width: 100 }}
              />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={styles.historyEmpty}>No transactions yet.</div>
      ) : (
        <>
          <div className={styles.historyTable} role="table">
            <div className={styles.historyHeader} role="row">
              <div className={styles.historyHeaderCell} role="columnheader">
                Type
              </div>
              <div className={styles.historyHeaderCell} role="columnheader">
                Order ID
              </div>
              <div className={styles.historyHeaderCell} role="columnheader">
                Coins
              </div>
              <div className={styles.historyHeaderCell} role="columnheader">
                Amount
              </div>
              <div className={styles.historyHeaderCell} role="columnheader">
                Method
              </div>
              <div className={styles.historyHeaderCell} role="columnheader">
                Status
              </div>
              <div className={styles.historyHeaderCell} role="columnheader">
                Time
              </div>
            </div>

            {items.map((item) => {
              const isDeposit = item.kind === "DEPOSIT";
              const isSuccess = item.status === "SUCCESS";
              const statusMeta = STATUS_META[item.status] ?? {
                label: item.status,
                icon: Clock,
              };
              const StatusIcon = statusMeta.icon;
              const statusClassName = isSuccess
                ? `${styles.historyStatus} ${styles.historyStatusSuccess}`
                : styles.historyStatus;
              const coinPrefix = isSuccess ? (isDeposit ? "+" : "-") : "";

              return (
                <div
                  key={`${item.kind}:${item.orderId}`}
                  className={`${styles.historyRow} ${
                    isSuccess ? "" : styles.historyRowMuted
                  }`}
                  role="row"
                >
                  <div
                    className={styles.historyPrimary}
                    role="cell"
                    title={isDeposit ? "Deposit" : "Withdrawal"}
                  >
                    <span
                      className={styles.historyIcon}
                      aria-label={isDeposit ? "Deposit" : "Withdrawal"}
                    >
                      {isDeposit ? (
                        <ArrowDownLeft size={16} />
                      ) : (
                        <ArrowUpRight size={16} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className={styles.historyTitle}>
                        <span>{isDeposit ? "Deposit" : "Withdrawal"}</span>
                        <span className={styles.historyMobileMethod}>
                          · {formatProvider(item.provider)}
                        </span>
                      </div>
                      <div className={styles.historyMobileMeta}>
                        <span className={statusClassName}>
                          <StatusIcon size={13} aria-hidden="true" />
                          {statusMeta.label}
                        </span>
                        {item.createdAt ? (
                          <span>· {formatDateTime(item.createdAt)}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div
                    className={styles.historyOrderId}
                    role="cell"
                    title={item.orderId}
                  >
                    {item.orderId}
                  </div>

                  <div className={styles.historyAmountCell} role="cell">
                    <span
                      className={`${styles.historyCoins} ${
                        isSuccess ? "" : styles.historyCoinsMuted
                      }`}
                    >
                      {coinPrefix}
                      {formatCoins(item.coinAmount)}
                    </span>
                    <span className={styles.historyMobileVnd}>
                      {formatVnd(item.amountVnd)}
                    </span>
                  </div>

                  <div className={styles.historyVndCell} role="cell">
                    {formatVnd(item.amountVnd)}
                  </div>

                  <div className={styles.historyMethodCell} role="cell">
                    {formatProvider(item.provider)}
                  </div>

                  <div className={styles.historyStatusCell} role="cell">
                    <span className={statusClassName}>
                      <StatusIcon size={14} aria-hidden="true" />
                      {statusMeta.label}
                    </span>
                  </div>

                  <div className={styles.historyTimeCell} role="cell">
                    {item.createdAt ? formatDateTime(item.createdAt) : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <button
              type="button"
              className={styles.historyLoadMore}
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
