# 大模型接口中转站 - 实现进度

基于 OmniRoute 构建的大模型 API 中转站，提供价格对比、动态路由和额度管理功能。

## ✅ 已完成功能

### 1. 核心领域模块

#### 用户认证系统 (`src/domain/auth/`)

- `authTypes.ts` - 定义用户、API Key、会话、使用记录等核心类型
- `authService.ts` - 认证服务框架，包含：
  - 用户注册/登录
  - API Key 生成和管理
  - 会话管理
  - 使用量记录

#### 额度管理系统 (`src/domain/quotas/`)

- `quotaService.ts` - 额度服务框架，包含：
  - 额度状态查询
  - 配额检查和扣除
  - 额度包购买
  - 使用历史追踪

#### 分析服务 (`src/domain/analytics/`)

- `analyticsService.ts` - 分析服务框架，包含：
  - 价格对比功能
  - 延迟监控
  - 提供商性能指标
  - 最优提供商推荐

#### 计费系统 (`src/domain/billing/`)

- `billingService.ts` - 计费服务框架，包含：
  - 发票生成和管理
  - 支付方式管理
  - 订阅管理
  - 套餐管理

### 2. API 端点

#### 认证 API (`src/app/api/v1/user/auth/`)

- `POST /api/v1/user/auth/register` - 用户注册
- `POST /api/v1/user/auth/login` - 用户登录

#### API Key 管理 (`src/app/api/v1/user/keys/`)

- `GET /api/v1/user/keys` - 获取用户的 API Keys 列表
- `POST /api/v1/user/keys` - 创建新的 API Key

#### 价格对比 API (`src/app/api/v1/pricing/`)

- `GET /api/v1/pricing/compare?model=xxx` - 获取特定模型的价格对比
- `GET /api/v1/pricing/compare` - 获取所有模型的价格对比概览

### 3. 中间件

#### 认证中间件 (`src/middleware/authMiddleware.ts`)

- API Key 认证
- Session 认证
- 认证上下文包装器
- 可选认证支持

### 4. UI 组件

#### 用户仪表板 (`src/components/dashboard/UserDashboard.tsx`)

- 额度状态展示
- 价格对比表格
- 模型选择器
- 响应式设计

## 🚧 下一步实现

### 数据库层

1. 创建 SQLite 数据库架构
2. 实现用户表、API Key 表、使用记录表等
3. 添加数据库迁移脚本

### 认证系统完善

1. 实现密码加密 (bcrypt)
2. 实现 JWT 令牌生成和验证
3. 添加邮箱验证功能
4. 实现 OAuth 登录 (Google, GitHub)

### 额度系统实现

1. 连接真实的价格数据
2. 实现配额扣除逻辑
3. 添加超额处理策略
4. 实现付费额度购买流程

### 分析系统实现

1. 从各提供商获取实时价格
2. 实现延迟监控和记录
3. 添加历史数据存储
4. 实现最优路由算法

### 计费系统实现

1. 集成 Stripe/支付宝/微信支付
2. 实现发票生成逻辑
3. 添加订阅管理功能
4. 实现套餐配置

### API 增强

1. 添加速率限制
2. 实现请求日志记录
3. 添加使用量响应头
4. 实现超额响应

### UI 完善

1. 创建完整的管理后台
2. 添加注册/登录页面
3. 实现套餐购买流程
4. 添加使用统计图表

## 🛠️ 开发指南

### 安装依赖

```bash
npm install
```

### 运行开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 运行测试

```bash
npm test
```

## 📁 项目结构

```
src/
├── app/
│   └── api/
│       └── v1/
│           ├── user/
│           │   ├── auth/
│           │   └── keys/
│           └── pricing/
├── components/
│   └── dashboard/
├── domain/
│   ├── auth/
│   ├── quotas/
│   ├── analytics/
│   └── billing/
└── middleware/
```

## 🔐 环境变量

需要在 `.env` 文件中配置：

```env
# 数据库
DATABASE_URL=sqlite:./data/omniroute.db

# JWT 密钥
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# OAuth 提供商
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# 支付提供商
STRIPE_SECRET_KEY=your-stripe-secret-key
ALIPAY_APP_ID=your-alipay-app-id
WECHAT_APP_ID=your-wechat-app-id

# 默认配额
DEFAULT_FREE_QUOTA_MONTHLY=100000
```

## 📝 注意事项

1. **安全性**: 所有密码需要加密存储，API Key 需要 hash 处理
2. **性能**: 价格和延迟数据需要缓存，避免频繁查询
3. **合规**: 确保遵守各提供商的 ToS
4. **监控**: 添加完善的日志和监控
5. **测试**: 编写完整的单元测试和集成测试

## 🤝 贡献

欢迎提交 Pull Request 和 Issue！

## 📄 许可证

基于 OmniRoute 的 MIT 许可证
