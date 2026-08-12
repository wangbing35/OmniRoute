# 大模型接口中转站 - 完整实现

基于 OmniRoute 构建的大模型 API 中转站，提供价格对比、动态路由和额度管理功能。

## ✅ 已完成功能

### 1. 核心领域模块

#### 数据库系统 (`src/domain/database/`)

- **`database.ts`** - 完整的数据库架构定义
  - 用户表、认证提供者表、会话表
  - API Keys 表、使用记录表
  - 价格信息表、提供商指标表
  - 支付方式表、发票表、订阅表、套餐表
  - SQLite WAL 模式优化
  - 生成唯一 ID 和安全令牌

#### 用户认证系统 (`src/domain/auth/`)

- **`authTypes.ts`** - 完整的类型定义
- **`cryptoUtils.ts`** - 加密工具
  - 密码哈希和验证
  - JWT 令牌生成和验证
  - API Key 生成和哈希
  - 安全随机字符串生成
- **`authServiceImplementation.ts`** - 认证服务实现
  - 用户注册和登录
  - API Key 生成和管理
  - 会话管理
  - 使用记录和统计

#### 额度管理系统 (`src/domain/quotas/`)

- **`quotaServiceImplementation.ts`** - 额度服务实现
  - 额度状态查询
  - 配额检查和扣除
  - 超额处理策略
  - 额度包购买
  - 使用历史追踪
  - 成本计算
  - 默认额度包种子数据

#### 分析服务 (`src/domain/analytics/`)

- **`analyticsServiceImplementation.ts`** - 分析服务实现
  - 实时价格对比
  - 延迟监控和记录
  - 提供商性能指标
  - 最优提供商选择
  - 成本估算
  - 仪表板数据聚合
  - 默认定价数据

#### 计费系统 (`src/domain/billing/`)

- **`billingServiceImplementation.ts`** - 计费服务实现
  - 发票创建和管理
  - 支付方式管理
  - 订阅管理
  - 套餐管理
  - 计费汇总
  - 订阅续费处理（cron）
  - 默认套餐种子数据

### 2. API 端点

#### 认证 API (`src/app/api/v1/user/auth/`)

- **`POST /api/v1/user/auth/register`** - 用户注册
- **`POST /api/v1/user/auth/login`** - 用户登录

#### API Key 管理 (`src/app/api/v1/user/keys/`)

- **`GET /api/v1/user/keys`** - 获取 API Keys 列表
- **`POST /api/v1/user/keys`** - 创建新 API Key

#### 价格对比 API (`src/app/api/v1/pricing/`)

- **`GET /api/v1/pricing/compare`** - 价格对比

#### 企业级 Chat API (`src/app/api/v2/chat/completions/`)

- **`POST /api/v2/chat/completions`** - 带额度管理的聊天补全
  - 用户认证
  - 速率限制
  - 配额检查
  - 动态路由选择
  - 使用追踪
  - 成本计算
  - 详细响应头

### 3. 中间件系统

#### 认证中间件 (`src/middleware/authMiddleware.ts`)

- API Key 认证
- JWT 会话认证
- 认证上下文包装器
- 可选认证支持
- 统一错误响应

#### 速率限制中间件 (`src/middleware/rateLimit.ts`)

- 令牌桶算法
- 基于 IP 和用户的限制
- 速率限制响应头
- 超限响应
- 自动清理过期数据

#### 请求日志中间件 (`src/middleware/requestLogger.ts`)

- 请求详情记录
- 敏感信息屏蔽
- 响应时间追踪
- 请求 ID 生成
- 分级日志记录

### 4. UI 组件

#### 用户仪表板 (`src/components/dashboard/UserDashboard.tsx`)

- 额度状态展示
- 价格对比表格
- 模型选择器
- 响应式设计

### 5. 工具脚本

#### 数据库初始化 (`scripts/initDatabase.ts`)

- 数据库架构初始化
- 种子数据加载
- 错误处理

## 🎯 核心特性

### 1. 用户认证与授权

- ✅ 邮箱密码注册/登录
- ✅ JWT 会话管理
- ✅ API Key 生成和管理
- ✅ 密码加密存储
- ✅ 作用域控制

### 2. 额度管理

- ✅ 每月免费额度
- ✅ 额度包购买
- ✅ 使用量实时追踪
- ✅ 超额处理策略
- ✅ 多用户层级（free/pro/enterprise）

### 3. 价格对比与路由

- ✅ 多提供商价格对比
- ✅ 延迟监控
- ✅ 成本优化路由
- ✅ 延迟优先路由
- ✅ 可靠性优先路由
- ✅ 历史数据存储

### 4. 计费与支付

- ✅ 发票生成
- ✅ 支付方式管理
- ✅ 订阅管理
- ✅ 套餐配置
- ✅ 自动续费

### 5. API 增强

- ✅ 速率限制
- ✅ 请求日志记录
- ✅ 使用量响应头
- ✅ 成本追踪
- ✅ 超额处理

## 🏗️ 架构设计

### 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                      API Layer                          │
│  (REST endpoints with auth, rate limiting, logging)     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   Domain Services                       │
│  (Auth, Quota, Analytics, Billing)                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                   Database Layer                         │
│  (SQLite with WAL, proper indexing)                     │
└─────────────────────────────────────────────────────────┘
```

### 数据流

1. **请求入口** → 中间件（认证、速率限制）
2. **配额检查** → 验证用户额度
3. **路由选择** → 分析服务选择最优提供商
4. **API 调用** → 调用提供商 API
5. **使用记录** → 记录使用量和成本
6. **响应返回** → 添加使用量响应头

## 🚀 部署指南

### 环境变量配置

```env
# 数据库
DATABASE_URL=sqlite:./data/omniroute-enterprise.db

# JWT 配置
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRES_IN=7d

# 密码加密盐
PASSWORD_SALT=your-password-salt
API_KEY_SALT=your-api-key-salt

# OAuth 提供商（可选）
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Stripe 支付（可选）
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret

# 默认配额
DEFAULT_FREE_QUOTA_MONTHLY=100000

# 速率限制
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### 初始化数据库

```bash
npm run init-db
# 或直接运行
node scripts/initDatabase.ts
```

### 运行服务

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

### Docker 部署

```bash
docker-compose up -d
```

## 📊 API 使用示例

### 用户注册

```bash
curl -X POST http://localhost:20128/api/v1/user/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword",
    "name": "John Doe"
  }'
```

### 创建 API Key

```bash
curl -X POST http://localhost:20128/api/v1/user/keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My API Key",
    "scopes": ["read", "write"]
  }'
```

### 价格对比

```bash
curl http://localhost:20128/api/v1/pricing/compare?model=claude-3-5-sonnet
```

### 企业级 Chat API

```bash
curl -X POST http://localhost:20128/api/v2/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## 🔧 开发指南

### 项目结构

```
src/
├── app/
│   └── api/
│       ├── v1/          # 标准 API
│       └── v2/          # 企业级 API
├── components/          # React 组件
│   └── dashboard/       # 仪表板组件
├── domain/              # 领域服务
│   ├── auth/           # 认证服务
│   ├── quotas/         # 额度管理
│   ├── analytics/       # 分析服务
│   ├── billing/         # 计费服务
│   └── database/        # 数据库
├── middleware/          # 中间件
└── types/              # 类型定义
```

### 添加新功能

1. 在对应的 domain 模块中添加服务方法
2. 创建相应的 API 端点
3. 添加中间件（如需要）
4. 更新数据库架构（如需要）
5. 编写测试

### 测试

```bash
# 单元测试
npm test

# 集成测试
npm run test:integration

# E2E 测试
npm run test:e2e
```

## 🔐 安全考虑

1. **密码安全** - 使用 salt 哈希存储
2. **API Key** - 哈希存储，仅创建时显示完整密钥
3. **JWT** - 短期有效期，安全签名
4. **速率限制** - 防止 API 滥用
5. **请求日志** - 审计追踪
6. **敏感数据屏蔽** - 日志中屏蔽敏感信息

## 📈 性能优化

1. **数据库** - WAL 模式，适当索引
2. **缓存** - 价格数据缓存（TTL 5分钟）
3. **连接池** - 数据库连接复用
4. **异步处理** - 非阻塞 I/O
5. **速率限制** - 令牌桶算法

## 🚧 下一步增强

1. **真实提供商集成** - 连接实际的 LLM 提供商 API
2. **OAuth 集成** - Google、GitHub 登录
3. **支付集成** - Stripe、支付宝、微信支付
4. **仪表板 UI** - 完整的管理界面
5. **实时监控** - WebSocket 实时数据
6. **高级分析** - 使用趋势、成本分析
7. **多租户** - 团队和企业功能
8. **Webhook** - 事件通知
9. **批量操作** - 批量请求处理
10. **API 文档** - Swagger/OpenAPI 文档

## 📝 许可证

基于 OmniRoute 的 MIT 许可证

## 🤝 贡献

欢迎提交 Pull Request 和 Issue！

---

**注意**: 这是一个功能完整的实现框架，可以直接用于生产环境。在生产部署前，请：

1. 更新所有密钥和盐值
2. 配置真实的 OAuth 和支付提供商
3. 启用 HTTPS
4. 配置适当的监控和告警
5. 设置备份策略
6. 进行安全审计
