/**
 * Quota Management Component
 * Displays quota status, usage, and transaction history
 */

"use client";

import React, { useState, useEffect } from "react";

interface QuotaStatus {
  userId: string;
  tier: string;
  free: { remaining: number; total: number };
  purchased: { remaining: number; total: number };
  total: { remaining: number; total: number };
  resetDate: string;
  usagePercentage: number;
  isOverQuota: boolean;
}

interface Transaction {
  id: string;
  amount: number;
  balanceAfter: number;
  type: "purchase" | "usage" | "reset" | "adjustment";
  description: string;
  createdAt: string;
}

export function QuotaManagement() {
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch quota status
      const quotaResponse = await fetch("/api/v1/quota/status");
      const quotaData = await quotaResponse.json();

      if (quotaData.success) {
        setQuotaStatus(quotaData.quota);
      }

      // Fetch transactions
      const transactionsResponse = await fetch("/api/v1/quota/transactions?limit=10");
      const transactionsData = await transactionsResponse.json();

      if (transactionsData.success) {
        setTransactions(transactionsData.transactions);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatTokens = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `${(amount / 1000).toFixed(1)}K`;
    }
    return amount.toLocaleString();
  };

  const getTransactionTypeLabel = (type: string) => {
    const labels = {
      purchase: "充值",
      usage: "使用",
      reset: "重置",
      adjustment: "调整",
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getTransactionTypeColor = (type: string) => {
    const colors = {
      purchase: "text-green-600",
      usage: "text-red-600",
      reset: "text-blue-600",
      adjustment: "text-yellow-600",
    };
    return colors[type as keyof typeof colors] || "text-gray-600";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quota Overview */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">额度概览</h2>

        {quotaStatus && (
          <div className="space-y-4">
            {/* Free Quota */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">免费额度</span>
                <span className="text-sm text-gray-600">
                  {formatTokens(quotaStatus.free.remaining)} /{" "}
                  {formatTokens(quotaStatus.free.total)} tokens
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${(quotaStatus.free.remaining / quotaStatus.free.total) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Purchased Quota */}
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">已购买额度</span>
                <span className="text-sm text-gray-600">
                  {formatTokens(quotaStatus.purchased.remaining)} /{" "}
                  {formatTokens(quotaStatus.purchased.total)} tokens
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{
                    width: `${(quotaStatus.purchased.remaining / quotaStatus.purchased.total) * 100}%`,
                  }}
                />
              </div>
            </div>

            {/* Total Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {formatTokens(quotaStatus.total.remaining)}
                </div>
                <div className="text-sm text-gray-500">剩余额度</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{quotaStatus.usagePercentage.toFixed(1)}%</div>
                <div className="text-sm text-gray-500">已使用</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {new Date(quotaStatus.resetDate).toLocaleDateString()}
                </div>
                <div className="text-sm text-gray-500">重置日期</div>
              </div>
            </div>

            {quotaStatus.isOverQuota && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded">
                额度已用完，请充值以继续使用
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">最近交易</h2>

        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    类型
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    描述
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    变化
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    余额
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded ${getTransactionTypeColor(tx.type)}`}
                      >
                        {getTransactionTypeLabel(tx.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{tx.description}</td>
                    <td
                      className={`px-4 py-3 text-right text-sm font-medium ${tx.amount >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {tx.amount >= 0 ? "+" : ""}
                      {formatTokens(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      {formatTokens(tx.balanceAfter)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">暂无交易记录</div>
        )}
      </div>

      {/* Recharge Button */}
      <div className="text-center">
        <a
          href="/dashboard/quota/recharge"
          className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          立即充值
        </a>
      </div>
    </div>
  );
}
