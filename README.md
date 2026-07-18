# 花不完不许走

一款微信小程序游戏：扮演富豪助理，通过转盘随机抽取全球亿万富翁，然后根据品味喜好置办奢侈品，目标是花光预算。支持普通消费、限时消费和好友对战三种模式。

## 技术栈

- **前端**：微信小程序原生框架（WXML + WXSS + JS），rpx 响应式适配
- **后端**：腾讯云 CloudBase 云开发（云函数 + 云数据库 + 云存储）
- **主题色**：深蓝 `#0a1129` + 金色 `#d4af37`
- **脚本工具**：Node.js ESM（`@cloudbase/node-sdk`）

## 项目结构

```
spend-it-all/
├── miniprogram/                    # 小程序前端
│   ├── app.js                      # 全局入口（云开发初始化、openid 登录）
│   ├── app.json                    # 页面路由 & 窗口配置
│   ├── app.wxss                    # 全局样式
│   ├── pages/
│   │   ├── index/                  # 首页 - 8 扇区转盘抽取富豪
│   │   ├── shop-normal/            # 商城 - 按品味推荐商品，购物车实时结算
│   │   ├── bill/                   # 账单 - 消费明细、星级评分、勋章
│   │   ├── challenge/              # 对战入口 - 创建/加入房间
│   │   ├── room-wait/              # 房间等待 - 房主视角（轮询、开始挑战）
│   │   ├── room-ready/             # 房间准备 - 非房主视角（等待房主开始）
│   │   ├── result/                 # 对战结果 - 排行榜 & 胜负判定
│   │   ├── profile/                # 个人中心 - 历史账单、档案编辑
│   │   └── feedback/               # 留言板
│   └── utils/
│       ├── cloud.js                # 云函数调用封装（15 个 API）
│       └── format.js               # 金额格式化 / 日期 / 名称截取
├── cloudfunctions/                 # CloudBase 云函数（15 个）
│   ├── login/                      # 获取 openid
│   ├── getBillionaire/             # 富豪列表
│   ├── getProducts/                # 商品推荐（按富豪品味标签匹配）
│   ├── saveBill/                   # 保存账单（自动递增期数）
│   ├── getBills/                   # 账单列表
│   ├── deleteBill/                 # 删除账单（软删除）
│   ├── clearBills/                 # 清空账单
│   ├── createRoom/                 # 创建对战房间（BTL-xxxx）
│   ├── joinRoom/                   # 加入对战房间
│   ├── startRoom/                  # 发起挑战
│   ├── getRoom/                    # 查询房间状态
│   ├── submitRoomResult/           # 提交消费结果 & 判定胜负
│   ├── saveProfile/                # 保存用户档案
│   ├── getProfile/                 # 获取用户档案
│   └── feedback/                   # 留言板（提交 / 列表）
├── scripts/                        # 数据同步 & 工具脚本
│   ├── syncBillionaires.mjs        # 富豪数据同步（Forbes/Wikipedia → CloudBase）
│   ├── backfillImages.mjs          # 商品 AI 图片补全（Pollinations.ai）
│   ├── .env.example                # 环境变量模板
│   └── .env                        # 实际环境变量（已 gitignore）
├── screenshots/                    # 截图预览
├── project.config.json             # 微信开发者工具配置
└── README.md
```

## 核心玩法

### 游戏流程

```
转盘抽富豪 → 进入商城 → 按品味购商品 → 提交结算 → 星级评分解锁勋章
```

### 三种模式

| 模式 | 说明 | 特色 |
|------|------|------|
| **普通消费** | 自由购物，目标花光预算 | 无时间限制 |
| **限时消费** | 30 秒倒计时自动结算 | 时间压力 |
| **好友对战** | 最多 3 人同台竞技 | 花费最高者获胜 |

### 关键机制

- **品味匹配**：每个富豪有专属 `matchTags`，商城自动推荐匹配商品；不匹配的商品无法购买（点击会震动 + 嘲讽提示）
- **智能商品推荐**：9:1 比例混合匹配 / 不匹配商品，随机打乱展示
- **星级评价**：根据预算消耗精确度给出 1-5 星评分
- **征服勋章**：花光 100% 预算触发礼花动画 + 勋章

## 全局状态（app.globalData）

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `currentBillionaire` | 当前选中的富豪对象 | null |
| `currentMode` | 游戏模式 | `'normal'` |
| `budget` | 当前预算 | 50000000 ($50M) |
| `spent` | 已花费金额 | 0 |
| `roomCode` | 对战房间号 | null |
| `openid` | 用户 openid | null |
| `billResult` | 结算结果（跨页面传递） | null |
| `challengeResult` | 挑战结果（跨页面传递） | null |

## 数据库集合

| 集合 | 用途 | 权限 |
|------|------|------|
| `billionaires` | 富豪数据（100+ 条） | 所有用户可读 |
| `products` | 商品库 | 所有用户可读 |
| `bills` | 消费账单 | 仅创建者可读写 |
| `rooms` | 对战房间 | 可读，仅创建者可写 |
| `profiles` | 用户档案 | 仅创建者可读写 |
| `feedbacks` | 用户留言 | 仅创建者可读写 |

## 脚本工具

### syncBillionaires.mjs

从 Forbes/Wikipedia 同步全球前 100 富豪数据到 CloudBase `billionaires` 集合，包含姓名、国籍、资产、来源公司、品味标签（matchTags）、口头禅等，并自动生成对应商品。

### backfillImages.mjs

扫描 `products` 集合中缺少图片的商品，通过 Pollinations.ai API 生成 AI 产品图并上传到云存储。支持并发控制、断点续传和 dry-run 预览。

### 环境变量

`scripts/.env`（已在 `.gitignore` 中排除）：

```
CLOUDBASE_ENV=your-env-id
CLOUDBASE_SECRET_ID=your-secret-id
CLOUDBASE_SECRET_KEY=your-secret-key
```

## 上线步骤

### 1. 导入项目

微信开发者工具 → 导入项目 → 填入 AppID → 选择项目根目录

### 2. 开通云开发

开发者工具顶部「云开发」→ 新建环境 → 记录环境 ID

### 3. 配置环境 ID

修改 `miniprogram/app.js`：

```js
wx.cloud.init({
  env: 'your-env-id',
  traceUser: true
});
```

### 4. 上传云函数

右键每个云函数目录 →「上传并部署：云端安装依赖」，或右键 `cloudfunctions/` →「同步云函数列表」一键部署全部。

### 5. 创建数据库集合

云开发控制台 → 数据库 → 创建 6 个集合并按上表配置权限。

### 6. 初始化数据

运行脚本同步富豪和商品数据：

```bash
cd scripts
cp .env.example .env  # 填入 CloudBase 密钥
npm install
node syncBillionaires.mjs
```

### 7. 提交审核

微信开发者工具 → 上传 → 微信公众平台 → 版本管理 → 提交审核 → 发布

## 功能清单

| 模块 | 功能 | 状态 |
|------|------|------|
| 富豪选择 | 8 扇区转盘动画 | ✅ |
| 富豪选择 | 富豪简介卡片（头像/资产/标签/格言） | ✅ |
| 普通消费 | 品味匹配商品推荐 | ✅ |
| 普通消费 | 匹配/不匹配商品购买反馈 + 震动 | ✅ |
| 限时消费 | 30s 倒计时自动结算 | ✅ |
| 好友对战 | 创建/加入房间（BTL-xxxx 房间号） | ✅ |
| 好友对战 | 轮询房间状态实时同步 | ✅ |
| 好友对战 | 排行榜 + 胜负判定 | ✅ |
| 账单结算 | 进度圆环 + 星级评分 | ✅ |
| 账单结算 | 礼花/征服/挑战动画 | ✅ |
| 分享 | 微信分享报告（onShareAppMessage） | ✅ |
| 个人中心 | 头像上传 + 档案编辑 | ✅ |
| 个人中心 | 历史账单查看/删除/清空 | ✅ |
| 留言板 | 提交/查看留言 | ✅ |
| 数据同步 | 富豪 & 商品数据脚本同步 | ✅ |

---

v1.0 · 微信小程序第一版 · 2026
