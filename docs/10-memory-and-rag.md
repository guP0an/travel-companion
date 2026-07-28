# 10 · 用户记忆与 RAG 设计

> 状态：已定方案，尚未实现  
> 最近更新：2026-07-14  
> 目标：让丸玩从“一次性生成器”进化为会复用用户偏好、历史反馈和可靠知识的旅行管家。

## 1. 决策

丸玩需要检索增强，但分两层建设：

1. **用户记忆检索**：现在做，直接形成“越用越懂你”。
2. **公共旅行知识库 RAG**：真实用户验证后再做，不在当前内测前扩大范围。

第一版不引入向量数据库。先用 Supabase 的结构化字段、标签、目的地、同行人和时间做可解释检索；当单个用户积累大量记忆或开始导入长文档时，再启用 `pgvector` 和 embedding。

## 2. RAG 在丸玩中的位置

```text
用户当前请求
  → 提取目的地、同行人、预算、节奏和日期
  → 检索当前用户的稳定偏好、明确反馈和相关历史
  → 查询天气、灾害预警、地图和用户票据等事实
  → 去重、排序、裁剪成有限上下文
  → DeepSeek 判断与组织
  → 输出结构化行程和来源
  → 保存用户修改/反馈，形成新的记忆候选
```

优先级固定为：

```text
当前官方预警 / 用户确认票据
  > 实时工具事实
  > 用户本次明确要求
  > 用户主动保存的长期偏好
  > 从历史行为推断的偏好
  > 公共知识片段
  > 模型自身推断
```

任何历史记忆都不能覆盖用户本次明确要求或当前事实。

## 3. 什么进入记忆

记忆应该是一条可验证、可撤销的“原子事实”，不是整份历史行程。

适合保存：

- “用户带父母时不接受早于 09:00 出发。”
- “用户不喜欢需要长时间排队的网红店。”
- “用户更偏好公交和步行，不主动推荐租车。”
- “普通旅行餐饮预算通常为每人每天 150 元左右。”
- “用户明确踩雷某景点，原因是商业化过重。”

不适合直接保存：

- 一整份模型生成的行程；
- 没有被用户采用的推荐；
- 一次偶然操作就推断出的长期喜好；
- 姓名、手机号、证件号、订单号等非必要个人信息；
- 已经过期的天气、价格和营业状态。

## 4. 数据模型

### 4.1 扩展用户偏好

```sql
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;
```

建议结构：

```json
{
  "pace": "leisurely",
  "budgetTier": "moderate",
  "transport": ["walk", "public_transit"],
  "foodLikes": ["本地小店"],
  "foodAvoids": ["排队网红店"],
  "accessibility": [],
  "defaultCompanions": "couple"
}
```

### 4.2 项目反馈

```sql
create table public.item_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  itinerary_id uuid references public.itineraries(id) on delete set null,
  item_name text not null,
  destination text default '',
  feedback_type text not null check (
    feedback_type in ('like', 'dislike', 'rushed', 'expensive', 'crowded', 'not_interested')
  ),
  note text default '',
  created_at timestamptz default now()
);
```

### 4.3 原子记忆

```sql
create table public.user_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  content text not null,
  destination text default '',
  companion text default '',
  tags text[] default '{}',
  confidence numeric not null default 0.5,
  source_type text not null,
  source_id text default '',
  status text not null default 'active',
  last_used_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

三张表全部启用 RLS：`auth.uid() = user_id`；`profiles` 继续以 `auth.uid() = id` 隔离。

## 5. 第一版检索

生成前构造检索条件：

```text
destination + companions + pace + budget + travelerTags + current note
```

检索顺序：

1. 读取 `profiles.preferences` 中用户主动设置的稳定偏好。
2. 读取目的地或同行人匹配的明确反馈。
3. 读取最近使用且仍有效的 `user_memories`。
4. 读取少量相关历史行程，只提取用户实际修改或采用过的特征。
5. 去重后最多选择 5–8 条，控制上下文长度。

第一版排序分数：

```text
35% 明确程度：主动设置 > 明确反馈 > 行为推断
25% 目的地和同行人匹配
20% 时间新鲜度
20% 历史采用/重复次数
```

行为推断的 `confidence` 必须低于用户主动设置；连续多次出现后才提升。

## 6. Prompt 注入格式

检索结果不直接混进用户原话，使用独立上下文块：

```text
【用户本次明确要求】
...

【已确认票据与实时事实】
...

【用户主动保存的稳定偏好】
- [preference] 喜欢溜达节奏

【历史反馈，仅供个性化参考】
- [feedback, confidence=0.8] 不喜欢排队网红店

规则：本次要求与实时事实优先；历史推断冲突时忽略，不得向用户宣称未确认的偏好。
```

模型输出继续经过 `assertItinerary` 校验，RAG 不改变行程 JSON 契约。

## 7. 何时使用向量检索

满足任一条件再启用 Supabase `pgvector`：

- 单个用户活跃记忆超过约 100 条；
- 开始导入游记、攻略或长点评；
- 结构化标签无法覆盖“想找和上次那种安静小城类似的地方”等语义需求。

向量阶段建议给 `user_memories` 增加 `embedding vector(...)`，采用混合排序：

```text
45% 语义相似度
25% 明确反馈权重
20% 时间新鲜度
10% 目的地/同行人标签匹配
```

不要只按向量相似度返回；始终先按 `user_id`、状态、有效期和敏感类型过滤。

## 8. 公共旅行知识库边界

适合进入知识库：

- 有来源的城市文化、游览规则、亲子和无障碍信息；
- 相对稳定的交通使用说明；
- 经过编辑审核的主题玩法；
- 来源、发布日期和有效期明确的官方资料。

不进入知识库：

- 当前天气和灾害预警；
- 实时营业状态、航班、高铁、门票和价格；
- 用户票据；
- 来源不明的抓取攻略；
- 不能确认授权的图文内容。

这些内容继续使用实时 API、用户确认事实或官方页面，不用旧向量片段替代。

## 9. 用户控制与隐私

用户必须能够：

- 查看“丸玩记住了什么”；
- 修改或删除单条记忆；
- 关闭长期记忆；
- 明确区分主动偏好与模型推断；
- 删除账号时同步删除全部记忆和 embedding。

不得从票据或照片中生成身份、联系方式、证件、订单等长期记忆。

## 10. 评测

上线前准备至少 20 组固定案例，衡量：

- **检索命中率**：相关偏好是否进入上下文；
- **冲突率**：旧记忆是否错误覆盖本次要求；
- **采用率**：用户是否保留个性化推荐；
- **修改率**：是否减少“太赶、太贵、不喜欢”的修改；
- **隐私正确率**：跨用户数据泄露必须为 0；
- **成本与时延**：检索后 prompt 增量和生成耗时。

## 11. 实施顺序

1. 增加 `profiles.preferences` 和偏好编辑入口。
2. 给行程项目增加喜欢、不喜欢、太赶、太贵等反馈。
3. 增加 `user_memories`，先只写入用户明确偏好和反馈摘要。
4. 在 `api/ai.ts` 生成前执行结构化检索并注入上下文。
5. 增加“丸玩记住了什么”管理页。
6. 完成 RLS、跨用户隔离和固定案例评测。
7. 数据量达到阈值后再引入 `pgvector`。

第一阶段完成标准：同一用户第二次规划时，丸玩能正确复用稳定偏好，并允许用户看见、修改和删除这些记忆。
