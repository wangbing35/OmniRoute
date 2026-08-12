/**
 * User Dashboard Component
 * Displays user quota, usage statistics, and price comparisons
 */

"use client";

import React, { useState, useEffect } from "react";

interface QuotaStatus {
  freeRemaining: number;
  freeTotal: number;
  purchasedRemaining: number;
  purchasedTotal: number;
  resetDate: string;
  usagePercentage: number;
}

interface PriceComparison {
  model: string;
  providers: Array<{
    provider: string;
    inputPrice: number;
    outputPrice: number;
    avgLatency: number;
    successRate: number;
    isCheapest: boolean;
    isFastest: boolean;
    isMostReliable: boolean;
  }>;
}

export function UserDashboard() {
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [priceComparisons, setPriceComparisons] = useState<PriceComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>("");

  useEffect(() => {
    // Fetch quota status
    fetch("/api/v1/user/quota")
      .then((res) => res.json())
      .then((data) => setQuotaStatus(data.quota))
      .catch(console.error);

    // Fetch price comparisons
    fetch("/api/v1/pricing/compare")
      .then((res) => res.json())
      .then((data) => {
        setPriceComparisons(data.models || []);
        if (data.models?.length > 0) {
          setSelectedModel(data.models[0].model);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selectedComparison = priceComparisons.find((pc) => pc.model === selectedModel);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quota Status Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Your Quota</h2>
        {quotaStatus && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">Free Quota</span>
                <span className="text-sm text-gray-600">
                  {quotaStatus.freeRemaining.toLocaleString()} /{" "}
                  {quotaStatus.freeTotal.toLocaleString()} tokens
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full"
                  style={{
                    width: `${((quotaStatus.freeTotal - quotaStatus.freeRemaining) / quotaStatus.freeTotal) * 100}%`,
                  }}
                />
              </div>
            </div>

            {quotaStatus.purchasedTotal > 0 && (
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Purchased Quota</span>
                  <span className="text-sm text-gray-600">
                    {quotaStatus.purchasedRemaining.toLocaleString()} /{" "}
                    {quotaStatus.purchasedTotal.toLocaleString()} tokens
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{
                      width: `${((quotaStatus.purchasedTotal - quotaStatus.purchasedRemaining) / quotaStatus.purchasedTotal) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="text-sm text-gray-600">
              Resets on {new Date(quotaStatus.resetDate).toLocaleDateString()}
            </div>
          </div>
        )}
      </div>

      {/* Price Comparison Card */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Price Comparison</h2>

        <div className="mb-4">
          <label htmlFor="model-select" className="block text-sm font-medium mb-2">
            Select Model
          </label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
          >
            {priceComparisons.map((pc) => (
              <option key={pc.model} value={pc.model}>
                {pc.model}
              </option>
            ))}
          </select>
        </div>

        {selectedComparison && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Provider
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Input (1M tokens)
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Output (1M tokens)
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Avg Latency
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Success Rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {selectedComparison.providers.map((provider) => (
                  <tr key={provider.provider} className={provider.isCheapest ? "bg-green-50" : ""}>
                    <td className="px-4 py-3">
                      <div className="flex items-center">
                        {provider.provider}
                        {provider.isCheapest && (
                          <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                            Cheapest
                          </span>
                        )}
                        {provider.isFastest && (
                          <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            Fastest
                          </span>
                        )}
                        {provider.isMostReliable && (
                          <span className="ml-2 px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded">
                            Most Reliable
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">${provider.inputPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">${provider.outputPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{provider.avgLatency.toFixed(0)}ms</td>
                    <td className="px-4 py-3 text-right">
                      {(provider.successRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
