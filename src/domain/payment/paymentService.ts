/**
 * Payment Service
 * Handles payment processing with Alipay and WeChat Pay
 */

import { createHash, createHmac, randomBytes } from "crypto";

export interface PaymentOrder {
  id: string;
  orderNumber: string;
  userId: string;
  packageId: string;
  amountCents: number;
  currency: string;
  tokens: number;
  status: "pending" | "paid" | "failed" | "cancelled" | "expired";
  paymentMethod: "alipay" | "wechat";
  paymentProviderOrderId?: string;
  createdAt: Date;
  paidAt?: Date;
  expiredAt?: Date;
}

export interface PaymentRequest {
  userId: string;
  packageId: string;
  paymentMethod: "alipay" | "wechat";
}

export interface PaymentResponse {
  success: boolean;
  orderId: string;
  orderNumber: string;
  paymentParams?: {
    qrCode?: string;
    payUrl?: string;
    orderId?: string;
    [key: string]: any;
  };
  error?: string;
}

export interface CallbackVerification {
  valid: boolean;
  orderId?: string;
  providerTransactionId?: string;
  amount?: number;
  error?: string;
}

export class PaymentService {
  private alipayConfig: {
    appId: string;
    privateKey: string;
    publicKey: string;
    gatewayUrl: string;
    notifyUrl: string;
  };

  private wechatConfig: {
    appId: string;
    mchId: string;
    apiV3Key: string;
    notifyUrl: string;
  };

  constructor() {
    // Load configuration from environment variables
    this.alipayConfig = {
      appId: process.env.ALIPAY_APP_ID || "",
      privateKey: process.env.ALIPAY_PRIVATE_KEY || "",
      publicKey: process.env.ALIPAY_PUBLIC_KEY || "",
      gatewayUrl: process.env.ALIPAY_GATEWAY_URL || "https://openapi.alipay.com/gateway.do",
      notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
    };

    this.wechatConfig = {
      appId: process.env.WECHAT_APP_ID || "",
      mchId: process.env.WECHAT_MCH_ID || "",
      apiV3Key: process.env.WECHAT_API_V3_KEY || "",
      notifyUrl: process.env.WECHAT_NOTIFY_URL || "",
    };
  }

  /**
   * Create a payment order and return payment parameters
   */
  async createPaymentOrder(
    request: PaymentRequest,
    orderData: {
      orderId: string;
      orderNumber: string;
      amountCents: number;
      tokens: number;
      expiredAt: Date;
    }
  ): Promise<PaymentResponse> {
    try {
      if (request.paymentMethod === "alipay") {
        return await this.createAlipayOrder(request, orderData);
      } else if (request.paymentMethod === "wechat") {
        return await this.createWechatOrder(request, orderData);
      }

      return {
        success: false,
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        error: "Unsupported payment method",
      };
    } catch (error) {
      console.error("Payment order creation error:", error);
      return {
        success: false,
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        error: error instanceof Error ? error.message : "Failed to create payment order",
      };
    }
  }

  /**
   * Create Alipay payment order (QR code mode)
   */
  private async createAlipayOrder(
    request: PaymentRequest,
    orderData: {
      orderId: string;
      orderNumber: string;
      amountCents: number;
      tokens: number;
      expiredAt: Date;
    }
  ): Promise<PaymentResponse> {
    if (!this.alipayConfig.appId || !this.alipayConfig.privateKey) {
      return {
        success: false,
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        error: "Alipay not configured",
      };
    }

    // Build Alipay request parameters
    const bizContent = JSON.stringify({
      out_trade_no: orderData.orderNumber,
      total_amount: (orderData.amountCents / 100).toFixed(2),
      subject: `额度充值 ${orderData.tokens} tokens`,
      timeout_express: "30m",
    });

    const params = {
      app_id: this.alipayConfig.appId,
      method: "alipay.trade.precreate",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date()
        .toISOString()
        .replace(/T/, " ")
        .replace(/\.\d+Z/, ""),
      version: "1.0",
      notify_url: this.alipayConfig.notifyUrl,
      biz_content: bizContent,
    };

    // Sign request
    const sign = this.generateAlipaySign(params);
    const signedParams = { ...params, sign };

    try {
      // In production, make actual API call to Alipay
      // const response = await axios.post(this.alipayConfig.gatewayUrl, null, { params: signedParams });

      // For now, simulate response
      const simulatedResponse = {
        alipay_trade_precreate_response: {
          code: "10000",
          msg: "Success",
          out_trade_no: orderData.orderNumber,
          qr_code: `https://qr.alipay.com/example/${orderData.orderNumber}`,
        },
      };

      const responseData = simulatedResponse.alipay_trade_precreate_response;

      if (responseData.code === "10000") {
        return {
          success: true,
          orderId: orderData.orderId,
          orderNumber: orderData.orderNumber,
          paymentParams: {
            qrCode: responseData.qr_code,
            orderId: responseData.out_trade_no,
          },
        };
      }

      return {
        success: false,
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        error: responseData.msg || "Alipay order creation failed",
      };
    } catch (error) {
      console.error("Alipay API error:", error);
      return {
        success: false,
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        error: "Failed to connect to Alipay",
      };
    }
  }

  /**
   * Create WeChat Pay order (Native mode)
   */
  private async createWechatOrder(
    request: PaymentRequest,
    orderData: {
      orderId: string;
      orderNumber: string;
      amountCents: number;
      tokens: number;
      expiredAt: Date;
    }
  ): Promise<PaymentResponse> {
    if (!this.wechatConfig.appId || !this.wechatConfig.mchId || !this.wechatConfig.apiV3Key) {
      return {
        success: false,
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        error: "WeChat Pay not configured",
      };
    }

    try {
      const description = `额度充值 ${orderData.tokens} tokens`;
      const orderId = this.generateWechatOrderId(orderData.orderNumber);

      const requestBody = {
        appid: this.wechatConfig.appId,
        mchid: this.wechatConfig.mchId,
        description: description,
        out_trade_no: orderId,
        notify_url: this.wechatConfig.notifyUrl,
        amount: {
          total: orderData.amountCents,
          currency: "CNY",
        },
        time_expire: orderData.expiredAt.toISOString(),
      };

      // Generate signature
      const signature = this.generateWechatSign(requestBody);
      const signedRequest = { ...requestBody, signature };

      // In production, make actual API call to WeChat Pay
      // const response = await axios.post(
      //   "https://api.mch.weixin.qq.com/v3/pay/transactions/native",
      //   signedRequest,
      //   { headers: { Authorization: `WECHATPAY2-SHA256-RSA2048 ${signature}` } }
      // );

      // For now, simulate response
      const simulatedResponse = {
        code_url: `weixin://wxpay/bizpayurl?pr=${orderId}`,
      };

      return {
        success: true,
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        paymentParams: {
          qrCode: simulatedResponse.code_url,
          orderId: orderId,
        },
      };
    } catch (error) {
      console.error("WeChat Pay API error:", error);
      return {
        success: false,
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        error: "Failed to connect to WeChat Pay",
      };
    }
  }

  /**
   * Verify Alipay callback signature
   */
  verifyAlipayCallback(params: Record<string, any>): CallbackVerification {
    try {
      const sign = params.sign;
      const signType = params.sign_type;

      // Remove sign and sign_type from params for verification
      const { sign: _, sign_type: __, ...paramsToVerify } = params;

      // Generate expected signature
      const expectedSign = this.generateAlipaySign(paramsToVerify);

      if (sign !== expectedSign) {
        return {
          valid: false,
          error: "Invalid signature",
        };
      }

      // Extract order details
      const outTradeNo = params.out_trade_no;
      const tradeNo = params.trade_no;
      const totalAmount = params.total_amount;

      return {
        valid: true,
        orderId: outTradeNo,
        providerTransactionId: tradeNo,
        amount: Math.round(parseFloat(totalAmount) * 100), // Convert to cents
      };
    } catch (error) {
      console.error("Alipay callback verification error:", error);
      return {
        valid: false,
        error: "Verification failed",
      };
    }
  }

  /**
   * Verify WeChat Pay callback signature
   */
  verifyWechatCallback(headers: Headers, body: string): CallbackVerification {
    try {
      const timestamp = headers.get("Wechatpay-Timestamp");
      const nonce = headers.get("Wechatpay-Nonce");
      const signature = headers.get("Wechatpay-Signature");
      const serial = headers.get("Wechatpay-Serial");

      if (!timestamp || !nonce || !signature) {
        return {
          valid: false,
          error: "Missing required headers",
        };
      }

      // Build signature string
      const signatureStr = `${timestamp}\n${nonce}\n${body}\n`;

      // Verify signature using API v3 key
      const expectedSignature = createHmac("sha256", this.wechatConfig.apiV3Key)
        .update(signatureStr)
        .digest("base64");

      if (signature !== expectedSignature) {
        return {
          valid: false,
          error: "Invalid signature",
        };
      }

      // Parse callback body
      const callbackData = JSON.parse(body);
      const resource = callbackData.resource;

      // Decrypt ciphertext if needed
      // const decryptedData = this.decryptWechatResource(resource.ciphertext, resource.associated_data, resource.nonce);

      const orderId = resource.out_trade_no;
      const transactionId = resource.transaction_id;
      const amount = resource.amount?.total;

      return {
        valid: true,
        orderId,
        providerTransactionId: transactionId,
        amount,
      };
    } catch (error) {
      console.error("WeChat callback verification error:", error);
      return {
        valid: false,
        error: "Verification failed",
      };
    }
  }

  /**
   * Generate Alipay RSA signature
   */
  private generateAlipaySign(params: Record<string, any>): string {
    // For production, use actual RSA signing
    // This is a simplified placeholder
    const sortedKeys = Object.keys(params).sort();
    const signStr = sortedKeys.map((key) => `${key}=${params[key]}`).join("&");

    // Placeholder: in production use RSA-SHA256 with private key
    return createHash("md5")
      .update(signStr + this.alipayConfig.privateKey)
      .digest("hex");
  }

  /**
   * Generate WeChat Pay signature
   */
  private generateWechatSign(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params).sort();
    const signStr = sortedKeys.map((key) => `${key}=${params[key]}`).join("&");

    return createHash("sha256")
      .update(signStr + "&key=" + this.wechatConfig.apiV3Key)
      .digest("hex");
  }

  /**
   * Generate WeChat Pay order ID format
   */
  private generateWechatOrderId(orderNumber: string): string {
    // WeChat Pay requires specific format
    return `WX${orderNumber}`;
  }

  /**
   * Check if payment service is configured
   */
  isConfigured(): boolean {
    return !!(
      this.alipayConfig.appId &&
      this.alipayConfig.privateKey &&
      this.wechatConfig.appId &&
      this.wechatConfig.mchId
    );
  }

  /**
   * Get configuration status for display
   */
  getConfigStatus(): {
    alipay: boolean;
    wechat: boolean;
  } {
    return {
      alipay: !!(this.alipayConfig.appId && this.alipayConfig.privateKey),
      wechat: !!(this.wechatConfig.appId && this.wechatConfig.mchId && this.wechatConfig.apiV3Key),
    };
  }
}

// Singleton instance
export const paymentService = new PaymentService();
