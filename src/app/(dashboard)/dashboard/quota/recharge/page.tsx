/**
 * Quota Recharge Page
 * User interface for purchasing additional quota
 */

"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";

interface QuotaPackage {
  id: string;
  name: string;
  description?: string;
  tokens: number;
  price: number;
  currency: string;
  popular?: boolean;
}

interface PaymentMethod {
  id: "alipay" | "wechat";
  name: string;
  icon: string;
}

export default function RechargePage() {
  const [packages, setPackages] = useState<QuotaPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<QuotaPackage | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<"alipay" | "wechat">("alipay");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const paymentMethods: PaymentMethod[] = [
    { id: "alipay", name: "支付宝", icon: "💰" },
    { id: "wechat", name: "微信支付", icon: "💬" },
  ];

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    try {
      const response = await fetch("/api/v1/quota/packages");
      const data = await response.json();

      if (data.success) {
        setPackages(data.packages);
      } else {
        setError("Failed to load packages");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedPackage) {
      setError("Please select a package");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/quota/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: selectedPackage.id,
          paymentMethod: selectedPayment,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setOrderResult(data);
      } else {
        setError(data.error || "Purchase failed");
      }
    } catch (err) {
      setError("Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (orderResult) {
    return <PaymentResult result={orderResult} onReset={() => setOrderResult(null)} />;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">充值额度</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Package Selection */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">选择套餐</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                selectedPackage?.id === pkg.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300"
              } ${pkg.popular ? "ring-2 ring-green-400" : ""}`}
              onClick={() => setSelectedPackage(pkg)}
            >
              {pkg.popular && (
                <div className="bg-green-500 text-white text-xs px-2 py-1 rounded inline-block mb-2">
                  热门
                </div>
              )}
              <h3 className="font-semibold text-lg">{pkg.name}</h3>
              <p className="text-gray-600 text-sm mb-2">{pkg.description}</p>
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="text-2xl font-bold">¥{pkg.price}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {(pkg.tokens / 10000).toFixed(0)}万 tokens
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payment Method Selection */}
      {selectedPackage && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">选择支付方式</h2>
          <div className="flex gap-4">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedPayment === method.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300"
                }`}
                onClick={() => setSelectedPayment(method.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{method.icon}</span>
                  <span className="font-medium">{method.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Summary */}
      {selectedPackage && (
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-2">订单摘要</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>套餐:</span>
              <span>{selectedPackage.name}</span>
            </div>
            <div className="flex justify-between">
              <span>额度:</span>
              <span>{(selectedPackage.tokens / 10000).toFixed(0)}万 tokens</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>支付金额:</span>
              <span>¥{selectedPackage.price}</span>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Button */}
      <button
        onClick={handlePurchase}
        disabled={!selectedPackage || creating}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {creating ? "创建订单中..." : "立即支付"}
      </button>
    </div>
  );
}

function PaymentResult({ result, onReset }: { result: any; onReset: () => void }) {
  const [polling, setPolling] = useState(true);
  const [status, setStatus] = useState<"pending" | "paid" | "failed">("pending");

  useEffect(() => {
    if (!result.order || result.order.status !== "pending") {
      // Use requestAnimationFrame to avoid calling setState synchronously in effect
      requestAnimationFrame(() => {
        setPolling(false);
        setStatus(result.order?.status || "pending");
      });
      return;
    }

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/orders/${result.order.id}`);
        const data = await response.json();

        if (data.success && data.order.status !== "pending") {
          setStatus(data.order.status);
          setPolling(false);

          if (data.order.status === "paid") {
            // Refresh quota status
            await fetch("/api/v1/quota/status");
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 3000);

    // Stop polling after 5 minutes
    const timeout = setTimeout(
      () => {
        clearInterval(interval);
        setPolling(false);
      },
      5 * 60 * 1000
    );

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [result]);

  if (status === "paid") {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="text-green-500 text-6xl mb-4">✓</div>
        <h2 className="text-xl font-bold mb-2">支付成功</h2>
        <p className="text-gray-600 mb-4">额度已充值到您的账户</p>
        <button
          onClick={onReset}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
        >
          继续充值
        </button>
      </div>
    );
  }

  if (status === "failed" || !result.payment?.qrCode) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <div className="text-red-500 text-6xl mb-4">✗</div>
        <h2 className="text-xl font-bold mb-2">支付失败</h2>
        <p className="text-gray-600 mb-4">
          {status === "failed" ? "订单已超时或支付失败" : "无法生成支付二维码"}
        </p>
        <button
          onClick={onReset}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
        >
          重新购买
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h2 className="text-xl font-bold mb-4 text-center">扫码支付</h2>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex justify-center mb-4">
          <div className="w-64 h-64 bg-gray-100 flex items-center justify-center relative">
            <Image
              src={result.payment.qrCode}
              alt="Payment QR Code"
              fill
              className="object-contain"
              unoptimized
            />
          </div>
        </div>
        <div className="text-center text-sm text-gray-600 mb-4">
          {polling ? "等待支付中..." : "支付超时，请重新下单"}
        </div>
        <div className="text-center">
          <p className="font-semibold">¥{result.order.amount}</p>
          <p className="text-sm text-gray-500">订单号: {result.order.orderNumber}</p>
        </div>
      </div>
      <button onClick={onReset} className="w-full mt-4 text-gray-600 hover:text-gray-800">
        取消支付
      </button>
    </div>
  );
}
