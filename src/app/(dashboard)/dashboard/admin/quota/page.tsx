/**
 * Admin Quota Management Page
 * Admin interface for managing user quotas and orders
 */

"use client";

import React, { useState, useEffect } from "react";

interface UserQuotaData {
  id: string;
  userId: string;
  quota: {
    freeRemaining: number;
    freeTotal: number;
    purchasedRemaining: number;
    purchasedTotal: number;
    totalRemaining: number;
    usagePercentage: number;
  };
  recentTransactions: any[];
}

interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  amount: number;
  tokens: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  paidAt?: string;
}

interface RevenueStats {
  totalOrders: number;
  paidOrders: number;
  totalRevenue: number;
  totalTokensSold: number;
  dailyRevenue: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
}

export default function AdminQuotaPage() {
  const [activeTab, setActiveTab] = useState<"users" | "orders" | "revenue">("users");
  const [searchUserId, setSearchUserId] = useState("");
  const [userQuota, setUserQuota] = useState<UserQuotaData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === "revenue") {
      fetchRevenueStats();
    }
  }, [activeTab]);

  const fetchUserQuota = async () => {
    if (!searchUserId) {
      setError("请输入用户ID");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/admin/quota/users/${searchUserId}`);
      const data = await response.json();

      if (data.success) {
        setUserQuota(data.user);
      } else {
        setError(data.error || "获取用户额度失败");
      }
    } catch (err) {
      setError("连接服务器失败");
    } finally {
      setLoading(false);
    }
  };

  const adjustUserQuota = async (amount: number, reason: string) => {
    if (!searchUserId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/admin/quota/users/${searchUserId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, reason }),
      });

      const data = await response.json();

      if (data.success) {
        // Refresh user quota
        await fetchUserQuota();
        alert("额度调整成功");
      } else {
        setError(data.error || "调整失败");
      }
    } catch (err) {
      setError("连接服务器失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/admin/orders?limit=50");
      const data = await response.json();

      if (data.success) {
        setOrders(data.orders);
      } else {
        setError(data.error || "获取订单失败");
      }
    } catch (err) {
      setError("连接服务器失败");
    } finally {
      setLoading(false);
    }
  };

  const fetchRevenueStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/admin/revenue/stats");
      const data = await response.json();

      if (data.success) {
        setRevenueStats(data.stats);
      } else {
        setError(data.error || "获取统计数据失败");
      }
    } catch (err) {
      setError("连接服务器失败");
    } finally {
      setLoading(false);
    }
  };

  const formatTokens = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
    return amount.toLocaleString();
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
      expired: "bg-gray-100 text-gray-800",
    };
    return colors[status as keyof typeof colors] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">额度管理后台</h1>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 font-medium ${
            activeTab === "users"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          用户额度
        </button>
        <button
          onClick={() => setActiveTab("orders")}
          className={`px-4 py-2 font-medium ${
            activeTab === "orders"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          订单管理
        </button>
        <button
          onClick={() => setActiveTab("revenue")}
          className={`px-4 py-2 font-medium ${
            activeTab === "revenue"
              ? "border-b-2 border-blue-500 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          收入统计
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* User Quota Tab */}
      {activeTab === "users" && !loading && (
        <div className="space-y-6">
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="输入用户ID"
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-md px-4 py-2"
            />
            <button
              onClick={fetchUserQuota}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
            >
              查询
            </button>
          </div>

          {userQuota && (
            <>
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">用户额度信息</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded">
                    <div className="text-2xl font-bold">
                      {formatTokens(userQuota.quota.freeRemaining)}
                    </div>
                    <div className="text-sm text-gray-500">免费剩余</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded">
                    <div className="text-2xl font-bold">
                      {formatTokens(userQuota.quota.purchasedRemaining)}
                    </div>
                    <div className="text-sm text-gray-500">购买剩余</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded">
                    <div className="text-2xl font-bold">
                      {formatTokens(userQuota.quota.totalRemaining)}
                    </div>
                    <div className="text-sm text-gray-500">总剩余</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded">
                    <div className="text-2xl font-bold">
                      {userQuota.quota.usagePercentage.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-500">使用率</div>
                  </div>
                </div>
              </div>

              <QuotaAdjustment onAdjust={adjustUserQuota} />
            </>
          )}
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === "orders" && !loading && (
        <div className="space-y-6">
          <button
            onClick={fetchOrders}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
          >
            刷新订单
          </button>

          {orders.length > 0 ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      订单号
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      用户ID
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      金额
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Tokens
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      状态
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      创建时间
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {order.orderNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{order.userId}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        ¥{order.amount}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {formatTokens(order.tokens)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 text-xs rounded ${getStatusColor(order.status)}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">暂无订单</div>
          )}
        </div>
      )}

      {/* Revenue Tab */}
      {activeTab === "revenue" && revenueStats && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-3xl font-bold">{revenueStats.totalOrders}</div>
              <div className="text-sm text-gray-500">总订单数</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-3xl font-bold">{revenueStats.paidOrders}</div>
              <div className="text-sm text-gray-500">已支付订单</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-3xl font-bold">¥{revenueStats.totalRevenue.toFixed(2)}</div>
              <div className="text-sm text-gray-500">总收入</div>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-3xl font-bold">{formatTokens(revenueStats.totalTokensSold)}</div>
              <div className="text-sm text-gray-500">已售Tokens</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">最近30天收入</h3>
            <div className="space-y-2">
              {revenueStats.dailyRevenue.map((day) => (
                <div key={day.date} className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-gray-600">{day.date}</span>
                  <div className="flex gap-8">
                    <span className="text-sm">{day.orders} 订单</span>
                    <span className="font-medium">¥{day.revenue.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuotaAdjustment({ onAdjust }: { onAdjust: (amount: number, reason: string) => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    const numAmount = parseInt(amount);
    if (isNaN(numAmount)) {
      alert("请输入有效的数量");
      return;
    }

    if (!reason.trim()) {
      alert("请输入调整原因");
      return;
    }

    onAdjust(numAmount, reason);
    setAmount("");
    setReason("");
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">调整额度</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            数量 (正数为增加，负数为减少)
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="例如: 100000"
            className="w-full border border-gray-300 rounded-md px-4 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">调整原因</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如: 补偿额度"
            className="w-full border border-gray-300 rounded-md px-4 py-2"
          />
        </div>
        <button
          onClick={handleSubmit}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
        >
          确认调整
        </button>
      </div>
    </div>
  );
}
