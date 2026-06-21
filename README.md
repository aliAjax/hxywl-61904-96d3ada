# hxywl-61904 弹射星球

H5 物理弹射闯关小游戏，玩家拖动小球调整角度和力度，松手后弹射出去收集星星并到达终点。包含多个关卡、弹射次数限制、星级评价、重玩按钮和关卡选择页。碰撞、反弹和障碍物有清楚反馈，支持手机横屏和竖屏。

## 技术栈

React + Vite + TypeScript

## 本地运行

```bash
npm install
npm run dev
```

开发端口：61904

## 可用脚本

### 开发与构建

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（端口 61904） |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建结果（端口 61904） |

### 质量检查

| 命令 | 说明 |
|------|------|
| `npm run type-check` | TypeScript 类型检查（无输出文件） |
| `npm run test` | 运行单元测试 |
| `npm run build-check` | 构建检查（验证能否正常构建） |
| `npm run lint` | ESLint 代码质量检查（警告级别） |
| `npm run quality` | **完整质量门禁**：类型检查 + 测试 + 构建检查 |

## 质量验证流程

提交代码前建议运行完整质量门禁：

```bash
npm run quality
```

该命令依次执行以下检查，全部通过才算成功：

1. **类型检查** (`type-check`)：验证 TypeScript 类型正确性
2. **单元测试** (`test`)：运行所有测试用例
3. **构建检查** (`build-check`)：验证项目能否正常构建

## 测试覆盖范围

测试套件覆盖以下核心模块：

### 1. 关卡数据
- 星级计算规则（`checkStarRuleAchieved`、`calculateEarnedStars`）
- 关卡数据规范化（`normalizeLevel`、`normalizeObstacleDef`）
- 关卡数据校验（`validateLevel`）
- 全部 13 个内置关卡的有效性校验

### 2. 挑战码
- 基础格式校验（空值、前缀、编码格式）
- 字段完整性校验（名称、出生点、终点、星星、障碍、星级规则）
- 越界数据处理（clamp 与警告）
- 编解码往返一致性

### 3. 数据存储
- 进度更新与解锁逻辑
- 数据加载与保存
- 默认数据有效性

### 4. 物理引擎
- 状态初始化与重置
- 发射速度计算
- 物理更新（重力、摩擦、边界反弹）
- 星星收集与终点检测
- 失败判定
- 轨迹预测

## 项目结构

```
src/
├── Game.tsx              # 游戏主组件
├── physics.ts            # 物理引擎核心
├── levels.ts             # 关卡数据与校验
├── challengeCode.ts      # 挑战码编解码
├── dataStore.ts          # 本地数据存储
├── gameEngine.ts         # 游戏引擎逻辑
├── canvasRenderer.ts     # Canvas 渲染器
├── inputController.ts    # 输入控制器
├── useDataStore.ts       # 数据存储 Hook
├── useGameViewport.ts    # 视口适配 Hook
└── ...                   # 其他组件和工具

tests/
├── index.test.ts         # 测试主文件
├── runner.ts             # 自定义测试运行器
└── polyfills.ts          # Node 环境 polyfill
```
