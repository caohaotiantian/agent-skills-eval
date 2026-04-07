# GitCode PR 规范模板

## 标准的 PR 描述格式

参考 PR: https://gitcode.com/mindspore/akg/pull/1748

```markdown
# PR 描述：[简短标题]

**What type of PR is this?**
> /kind feature
> /kind bug
> /kind task
> /kind refactor
> /kind documentation

**What does this PR do / why do we need it**:

[详细描述这个 PR 要解决的问题，以及为什么需要这个修改]

**Which issue(s) this PR fixes**:
Fixes #<issue_number>

**Special notes for your reviewers**:

[给审查者的特别说明]
```

## 必需的 PR 元素

### 1. PR 类型标注 (必需)

使用 `/kind` 标签明确标注 PR 类型：

- `/kind bug` - Bug 修复
- `/kind feature` - 新功能
- `/kind task` - 任务型修改
- `/kind refactor` - 代码重构
- `/kind documentation` - 文档更新
- `/kind enhancement` - 功能增强

### 2. 问题描述 (必需)

清晰说明：
- 这个 PR 解决什么问题
- 为什么需要这个修改
- 背景和上下文

### 3. 解决方案 (建议)

说明：
- 如何解决问题
- 实现思路
- 技术方案

### 4. 修改内容列表 (建议)

用列表形式列出主要修改：
- 修改点 1
- 修改点 2
- 修改点 3

### 5. 测试说明 (建议)

包含：
- 如何测试这个修改
- 测试覆盖范围
- 验证步骤

### 6. 影响范围 (建议)

说明：
- 这个修改会影响哪些模块
- 是否有破坏性变更
- 需要注意的事项

## 代码质量要求

### 命名规范
- 变量名清晰、有意义
- 遵循项目现有命名约定
- 避免缩写和单字母变量（除循环变量外）

### 代码风格
- 遵循项目代码风格
- 适当的代码缩进和格式化
- 合理的代码分行

### 注释
- 复杂逻辑需要注释
- 公共 API 需要文档注释
- 避免无用的注释

### 错误处理
- 适当的异常处理
- 错误信息清晰
- 边界情况考虑

## 示例 PR 描述

```markdown
# PR 描述：NPUVector 多维向量化与 Transpose 支持

**What type of PR is this?**
> /kind feature

**What does this PR do / why do we need it**:

扩展 `NPUVectorVectorize` pass 支持多维（N-D）向量化，并新增 `npuvector.transpose` OP，
用于自动处理 load/store 的转置访问模式（如 `load a[j,i]`、`store out[j,i]`）。

在 1-D 基础上支持嵌套循环的 N-D 向量化（如 `for i {vector=32} for j {vector=64}` → `!npuvector<32x64xf32>`），
并自动检测索引顺序与 canonical 不一致时插入 transpose，避免冗余转置。

**主要改动**：
- 新增 `npuvector.transpose` 算子
- 重构 `VectorizationContext` 为多维感知
- 新增 `collectVectorizationStrategy`、`vectorizeLoopMultiDim`、`analyzeIndexPermutation`
- 1-D transpose 路径：`detectTransposeLoops` + phantom dim
- 新增 ArithToHIVM 中 transpose lowering

**Which issue(s) this PR fixes**:
Fixes #123

**Special notes for your reviewers**:
- 已知限制：多维 elementwise 不支持内部 reduction（需扩展）
- 测试用例覆盖：静态/动态、2D/3D、scf.if 等场景
```

## 评分标准

### ⭐⭐⭐⭐⭐ (5/5) - Excellent
- 所有必需项完整
- 描述清晰、详细
- 代码质量高
- 有完整的测试说明

### ⭐⭐⭐⭐ (4/5) - Good
- 大部分必需项完整
- 描述较清晰
- 代码质量良好
- 有基本的测试说明

### ⭐⭐⭐ (3/5) - Acceptable
- 基本必需项完整
- 描述基本清晰
- 代码质量可接受
- 测试说明不够详细

### ⭐⭐ (2/5) - Needs Improvement
- 缺少一些必需项
- 描述不够清晰
- 代码质量需要改进
- 缺少测试说明

### ⭐ (1/5) - Requires Changes
- 缺少关键必需项
- 描述不清晰或缺失
- 代码质量较差
- 没有测试说明
